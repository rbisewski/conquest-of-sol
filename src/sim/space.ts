// Exploration, hab sites' yields, prospecting probes and boost deliveries (SPEC 2.10.1, decision
// D17; docs/formulas.md, "Space"). Bodies and orbits open to a faction once the global tech named
// by their exploreTech is done. Every site's monthly yield is rolled when the world is made, as in
// Terra Invicta, from its own random sequence so the main one is untouched; a faction learns a
// body's yields by sending a probe from the Earth to prospect it. Boost lifts mass to low Earth
// orbit, ten tons a boost; beyond it the rocket equation multiplies that by e^(Δv / exhaust velocity).

import { dateOfDay, formatLongDate } from "./calendar";
import type { Content, DifficultyId, HabModuleDef, HabOrbitDef, MinedResource, MiningRoll } from "./content";
import { detExp, detPow } from "./detmath";
import type { Check } from "./diplomacy";
import { FormulaBuilder, type Breakdown } from "./formula";
import { missionControlUsed } from "./habs";
import { addLog, factionState } from "./lookup";
import { spaceBody, yearsSinceJ2000 } from "./orbits";
import { activeEffects, modifierProduct } from "./research";
import { nextFloat, seedRng } from "./rng";
import type { FactionState, GameState, Probe, Resources } from "./state";
import { deltaV, offWindowFactor, transferFromEarth, transferTo, type Destination } from "./transfers";

export const MINED_RESOURCES: MinedResource[] = ["water", "volatiles", "metals", "nobleMetals", "fissiles"];

/** Mixed into the game's seed for the sites' own random sequence. */
const SITE_SEED = 0x5173c0de;
/** Terra Invicta's mass at which small bodies stop losing yield, kg. */
const FULL_YIELD_MASS_KG = 5e16;
/** Tons of payload one boost lifts from the Earth's surface to low Earth orbit (Terra Invicta's Boost page). */
const TONS_PER_BOOST = 10;

/** Whether a body is open to probes and habs: its opening tech is done, or it needs none (the Earth). */
export function bodyExplored(state: GameState, content: Content, bodyId: string): boolean {
  const tech = spaceBody(content, bodyId).exploreTech;
  return !tech || state.research.completed.includes(tech);
}

export function orbitExplored(state: GameState, orbit: HabOrbitDef): boolean {
  return !orbit.exploreTech || state.research.completed.includes(orbit.exploreTech);
}

/**
 * A site's rolls for each resource, as Terra Invicta sets them up: a small body's mass and density
 * scale the mean and least yield (water and volatiles by mass alone), and so does the campaign's
 * mining rate, which also widens the steps (rules.difficulty.*.miningRate).
 */
export function siteRolls(content: Content, difficulty: DifficultyId, siteId: string): Record<MinedResource, MiningRoll> {
  const site = content.habSites.find((s) => s.id === siteId)!;
  const profile = content.miningProfiles.find((p) => p.id === site.profile)!;
  const rate = content.rules.difficulty[difficulty].miningRate;
  let light = 1;
  let heavy = 1;
  if (profile.scaleBySize) {
    const body = spaceBody(content, site.body);
    const density = body.densityGcm3!;
    const mass = Math.min(1, body.massKg / FULL_YIELD_MASS_KG);
    const clamp = (v: number) => Math.min(1.25, Math.max(0.75, v));
    light = clamp(mass);
    heavy = clamp(mass * Math.min(1, density / 1.25) * Math.max(1, density / 3));
  }
  const out = {} as Record<MinedResource, MiningRoll>;
  for (const r of MINED_RESOURCES) {
    const roll = profile.resources[r];
    const size = r === "water" || r === "volatiles" ? light : heavy;
    // The game's rule for wider steps at a rate of 200% or more, as the wiki gives it.
    const width = rate < 2 ? roll.width * rate : roll.width * (2 + detPow(rate, 1 - roll.jump));
    out[r] = { mean: roll.mean * size * rate, width, min: roll.min * size * rate, jump: roll.jump };
  }
  return out;
}

/** Every site's monthly yield, rolled from the game's seed (the same for a new game and an upgraded save). */
export function rollSiteYields(content: Content, seed: number, difficulty: DifficultyId): Record<string, Record<MinedResource, number>> {
  const rng = seedRng((seed ^ SITE_SEED) >>> 0);
  const out: Record<string, Record<MinedResource, number>> = {};
  for (const site of content.habSites) {
    const rolls = siteRolls(content, difficulty, site.id);
    const yields = {} as Record<MinedResource, number>;
    for (const r of MINED_RESOURCES) {
      const { mean, width, jump } = rolls[r];
      const min = rolls[r].min > 0 ? rolls[r].min * (0.8 + 0.4 * nextFloat(rng)) : 0;
      // Steps away from the mean: one more each time a jump-chance coin comes up, either way.
      let steps = 0;
      while (nextFloat(rng) < jump) steps++;
      if (nextFloat(rng) < 0.5) steps = -steps;
      let v = mean + steps * width + (nextFloat(rng) - 0.5) * width;
      if (v < min) v = min;
      yields[r] = v < 0.01 ? 0 : Math.round(v * 10000) / 10000;
    }
    // Noble metals never exceed a half or a third of the base metals.
    const cap = yields.metals / (nextFloat(rng) < 0.5 ? 2 : 3);
    if (yields.nobleMetals > cap) yields.nobleMetals = Math.round(cap * 10000) / 10000;
    out[site.id] = yields;
  }
  return out;
}

/** What a faction that hasn't prospected a site can expect: its rolls' centre, never below the least. */
export function siteEstimate(content: Content, difficulty: DifficultyId, siteId: string): Record<MinedResource, number> {
  const rolls = siteRolls(content, difficulty, siteId);
  return Object.fromEntries(MINED_RESOURCES.map((r) => [r, Math.max(0, rolls[r].mean, rolls[r].min)])) as Record<MinedResource, number>;
}

/** Julian years since J2000 at the game's current minute. */
const nowYears = (state: GameState, content: Content) => yearsSinceJ2000(content.rules.startYear, state.dayIndex, state.minuteOfDay / 1440);

/** Days a probe launched today takes: the Hohmann transfer, longer off its window, times the faction's probe speed. */
export function probeDays(state: GameState, content: Content, factionId: string, bodyId: string): number {
  const transfer = transferFromEarth(content, bodyId, nowYears(state, content))!;
  const offWindow = offWindowFactor(content, transfer, modifierProduct(state, content, factionId, "GenericTransfer_OffDate_PCT"));
  return transfer.transferYears * 365.25 * offWindow * modifierProduct(state, content, factionId, "ProbeTransferTime");
}

export function probeTo(faction: FactionState, bodyId: string): Probe | undefined {
  return faction.probes.find((p) => p.bodyId === bodyId);
}

export function checkLaunchProbe(state: GameState, content: Content, factionId: string, bodyId: string): Check {
  const body = spaceBody(content, bodyId);
  if (!content.habSites.some((s) => s.body === bodyId)) return { ok: false, reason: `${body.name} has no hab sites to prospect` };
  if (!bodyExplored(state, content, bodyId)) return { ok: false, reason: `Needs ${content.techs.find((t) => t.id === body.exploreTech)!.name}` };
  const faction = factionState(state, factionId);
  if (faction.prospected.includes(bodyId)) return { ok: false, reason: `We have already prospected ${body.name}` };
  if (probeTo(faction, bodyId)) return { ok: false, reason: `Our probe is already on its way to ${body.name}` };
  for (const [resource, amount] of Object.entries(content.rules.space.probeCost)) {
    if (faction.resources[resource as keyof Resources] < amount) return { ok: false, reason: `Needs ${amount} ${resource}` };
  }
  return { ok: true };
}

/** The best exhaust velocity (km/s) of the faction's rockets for boost deliveries: 0 before its first rocket project. */
export function exhaustVelocity(state: GameState, content: Content, factionId: string): number {
  let best = 0;
  for (const e of activeEffects(state, content, factionId)) if (e.kind === "exhaustVelocity") best = Math.max(best, e.kps);
  return best;
}

/** The core a hab is founded with: an Outpost Core on a site, a Platform Core in an orbit (the first tier's crewed cores). */
export function foundingCore(content: Content, destination: Destination): HabModuleDef {
  const type = destination.kind === "site" ? "base" : "station";
  return content.habModules.find((m) => m.core && m.tier === 1 && !m.automated && m.type === type)!;
}

export interface Delivery {
  /** km/s from low Earth orbit. */
  deltaV: Breakdown;
  /** Boost to send it from the Earth's surface, or null before the faction has rockets to send it beyond low Earth orbit. */
  boost: Breakdown | null;
  /** Days on the way, launched today. */
  days: number;
  arrivesDay: number;
}

/**
 * Sending a module from the Earth with boost: ten tons a boost to low Earth orbit (more where
 * radiation adds shielding), times e^(Δv / v) beyond it for the faction's best exhaust velocity v;
 * on the way for the transfer, longer off its launch window, times the faction's delivery speed.
 */
export function delivery(state: GameState, content: Content, factionId: string, destination: Destination, module: HabModuleDef): Delivery {
  const dv = deltaV(content, destination);
  const irradiation = destination.kind === "orbit" ? content.orbits.find((o) => o.id === destination.id)!.irradiation : spaceBody(content, content.habSites.find((s) => s.id === destination.id)!.body).irradiation;
  const ve = exhaustVelocity(state, content, factionId);
  let boost: Breakdown | null = null;
  if (dv.value === 0 || ve > 0) {
    const f = new FormulaBuilder().add(`${module.name}: ${module.massTons} t at ${TONS_PER_BOOST} t a boost`, module.massTons / TONS_PER_BOOST);
    if (irradiation) f.mul("Radiation shielding (base metals)", irradiation);
    if (dv.value > 0) f.mul(`Propellant: e^(${dv.value.toFixed(2)} ÷ ${ve} km/s)`, detExp(dv.value / ve));
    boost = f.build();
  }
  const transfer = transferTo(content, destination, nowYears(state, content));
  const offWindow = offWindowFactor(content, transfer, modifierProduct(state, content, factionId, "GenericTransfer_OffDate_PCT"));
  const days = transfer.transferYears * 365.25 * offWindow * modifierProduct(state, content, factionId, "GenericModuleTransferTime");
  return { deltaV: dv, boost, days, arrivesDay: state.dayIndex + Math.ceil(days) };
}

/**
 * Whether the faction can found a hab at a destination with boost from the Earth: the body or
 * orbit is open, the site is free (or the orbit has room for another station), it has the core's
 * project, it has prospected the body (for a base), it has rockets for anything beyond low Earth
 * orbit, room in its mission control for the core, and the boost to send the core.
 */
export function checkFoundHab(state: GameState, content: Content, factionId: string, destination: Destination): Check {
  const faction = factionState(state, factionId);
  const techName = (id: string | undefined) => content.techs.find((t) => t.id === id)?.name ?? id;
  const projectName = (id: string) => content.projects.find((p) => p.id === id)?.name ?? id;
  const site = destination.kind === "site" ? content.habSites.find((s) => s.id === destination.id)! : null;
  if (site) {
    const body = spaceBody(content, site.body);
    if (!bodyExplored(state, content, body.id)) return { ok: false, reason: `Needs ${techName(body.exploreTech)}` };
    const holder = state.habs.find((h) => h.siteId === site.id);
    if (holder) return { ok: false, reason: `${site.name} already holds ${holder.name}` };
  } else {
    const orbit = content.orbits.find((o) => o.id === destination.id)!;
    if (!orbitExplored(state, orbit)) return { ok: false, reason: `Needs ${techName(orbit.exploreTech)}` };
    if (state.habs.filter((h) => h.orbitId === orbit.id).length >= orbit.capacity) return { ok: false, reason: `${orbit.name} holds no more stations` };
  }
  const core = foundingCore(content, destination);
  if (!faction.research.completed[core.project]) return { ok: false, reason: `Needs the ${projectName(core.project)} project` };
  if (site && !faction.prospected.includes(site.body)) return { ok: false, reason: `Prospect ${spaceBody(content, site.body).name} first` };
  const sent = delivery(state, content, factionId, destination, core);
  if (!sent.boost) {
    const rockets = content.projects
      .flatMap((p) => p.effects.flatMap((e) => (e.kind === "exhaustVelocity" ? [{ name: p.name, kps: e.kps }] : [])))
      .sort((a, b) => a.kps - b.kps)[0]!;
    return { ok: false, reason: `Needs ${rockets.name} to send it beyond low Earth orbit` };
  }
  const mc = -(core.missionControl ?? 0);
  const used = missionControlUsed(state, content, factionId);
  if (used + mc > faction.resources.missionControl) return { ok: false, reason: `Needs ${mc} mission control: we use ${used} of our ${+faction.resources.missionControl.toFixed(1)}` };
  if (faction.resources.boost < sent.boost.value) return { ok: false, reason: `Needs ${sent.boost.value.toFixed(1)} boost` };
  return { ok: true };
}

export function launchProbe(state: GameState, content: Content, factionId: string, bodyId: string): void {
  const faction = factionState(state, factionId);
  for (const [resource, amount] of Object.entries(content.rules.space.probeCost)) faction.resources[resource as keyof Resources] -= amount;
  const arrivesDay = state.dayIndex + Math.max(1, Math.ceil(probeDays(state, content, factionId, bodyId)));
  faction.probes.push({ bodyId, launchedDay: state.dayIndex, arrivesDay });
  const arrival = formatLongDate(dateOfDay(content.rules.startYear, arrivesDay));
  addLog(state, { factionId, kind: "space", bodyId, text: `We launched a prospecting probe to ${spaceBody(content, bodyId).name}. It arrives on ${arrival}.` });
}

/** Probes reaching their bodies today prospect them. */
export function runSpaceTick(state: GameState, content: Content): void {
  for (const faction of state.factions) {
    const arrived = faction.probes.filter((p) => p.arrivesDay <= state.dayIndex);
    if (arrived.length === 0) continue;
    faction.probes = faction.probes.filter((p) => p.arrivesDay > state.dayIndex);
    for (const probe of arrived) {
      faction.prospected.push(probe.bodyId);
      const name = spaceBody(content, probe.bodyId).name;
      const sites = content.habSites.filter((s) => s.body === probe.bodyId).length;
      const text = sites === 1 ? `Our probe prospected the hab site on ${name}.` : `Our probe prospected ${name}'s ${sites} hab sites.`;
      addLog(state, { factionId: faction.id, kind: "space", bodyId: probe.bodyId, tone: "good", text });
    }
  }
}
