// Habs (SPEC 2.10.2; docs/formulas.md, "Habs"): bases on hab sites and stations in orbits, after
// Terra Invicta. A hab is founded by sending its core from the Earth with boost; once the core is
// built, modules go into the slots its tier gives (4, 12 or 20), paid in space resources or sent
// up with boost, and are built side by side. A module in a filled slot can be upgraded to the next
// tier of its line for two thirds of its cost and time, and keeps working until the upgrade is
// done. Each module's mission control use counts against the faction's mission control.

import { dateOfDay, formatLongDate } from "./calendar";
import type { Content, HabModuleDef, ResourceAmounts } from "./content";
import type { Check } from "./diplomacy";
import type { Breakdown } from "./formula";
import { addLog, factionState, newId } from "./lookup";
import { detAtan2 } from "./detmath";
import { spaceBody } from "./orbits";
import { checkFoundHab, delivery, foundingCore } from "./space";
import type { GameState, HabModuleState, HabState, Resources } from "./state";
import { orbitRadius, type Destination } from "./transfers";

export function habModuleDef(content: Content, id: string): HabModuleDef {
  const def = content.habModules.find((m) => m.id === id);
  if (!def) throw new Error(`Unknown hab module "${id}"`);
  return def;
}

export function habDestination(hab: HabState): Destination {
  return hab.siteId ? { kind: "site", id: hab.siteId } : { kind: "orbit", id: hab.orbitId! };
}

/** The body a hab is on or round (for a Lagrange point's orbit, the smaller body of the pair). */
export function habBodyId(content: Content, hab: HabState): string {
  return hab.siteId ? content.habSites.find((s) => s.id === hab.siteId)!.body : content.orbits.find((o) => o.id === hab.orbitId)!.body;
}

/** The radiation multiplier where a hab is, or 1. */
function habIrradiation(content: Content, hab: HabState): number {
  return (hab.orbitId ? content.orbits.find((o) => o.id === hab.orbitId)!.irradiation : spaceBody(content, habBodyId(content, hab)).irradiation) ?? 1;
}

export function isBuilt(state: GameState, slot: HabModuleState): boolean {
  return slot.doneDay <= state.dayIndex;
}

/** The hab's tier: its core's. */
export function habTier(content: Content, hab: HabState): 1 | 2 | 3 {
  return habModuleDef(content, hab.modules[0]!.moduleId).tier;
}

/** The modules that are built and working. */
export function builtModules(state: GameState, content: Content, hab: HabState): HabModuleDef[] {
  return hab.modules.filter((m): m is HabModuleState => m !== null && isBuilt(state, m)).map((m) => habModuleDef(content, m.moduleId));
}

/** Mission control the hab uses: its modules' (those being built too), the core's most of all. */
export function habMissionControl(content: Content, hab: HabState): number {
  let used = 0;
  for (const m of hab.modules) if (m) used += Math.max(0, -(habModuleDef(content, m.moduleId).missionControl ?? 0));
  return used;
}

/** Mission control the faction's habs use, against the capacity its nations give (resources.missionControl). */
export function missionControlUsed(state: GameState, content: Content, factionId: string): number {
  return state.habs.filter((h) => h.factionId === factionId).reduce((sum, h) => sum + habMissionControl(content, h), 0);
}

/**
 * How long the hab takes to build a module, as a share of its build time: each built module that
 * speeds construction (Construction Module 0.9, Nanofactory 0.75, Nanofacturing Complex 0.6), the
 * fastest first, cuts it by `(1 − m) / i²` for the i-th (Terra Invicta's diminishing returns).
 */
export function constructionFactor(state: GameState, content: Content, hab: HabState): number {
  const speeds = builtModules(state, content, hab)
    .map((m) => m.constructionTime)
    .filter((m): m is number => m !== undefined)
    .sort((a, b) => a - b);
  return speeds.reduce((factor, m, i) => factor * (1 - (1 - m) / ((i + 1) * (i + 1))), 1);
}

/** The heliocentric body of the planetary system a body belongs to (the body itself if it goes round the Sun). */
function systemOf(content: Content, bodyId: string): string {
  let body = spaceBody(content, bodyId);
  while (body.parent && body.parent !== "Sol") body = spaceBody(content, body.parent);
  return body.id;
}

/** The crew of every hab in a planetary system, built modules only. */
export function systemPopulation(state: GameState, content: Content, bodyId: string): number {
  const system = systemOf(content, bodyId);
  return state.habs.filter((h) => systemOf(content, habBodyId(content, h)) === system).reduce((sum, h) => sum + builtModules(state, content, h).reduce((s, m) => s + m.crew, 0), 0);
}

/**
 * Sunlight on a hab's solar panels, as a share of what they get at the Earth's distance in
 * unbroken sun (**inferred**; Terra Invicta lists some locations' figures but not its formula): the
 * inverse square of the planetary system's distance from the Sun, halved on a surface (night),
 * and in orbit cut by the share of each orbit spent in the body's shadow, `asin(R / r) / π`.
 */
export function sunlight(content: Content, hab: HabState): number {
  const bodyId = habBodyId(content, hab);
  const au = spaceBody(content, systemOf(content, bodyId)).orbit!.a;
  const flux = 1 / (au * au);
  if (hab.siteId) return flux / 2;
  const orbit = content.orbits.find((o) => o.id === hab.orbitId)!;
  if (orbit.lagrange) return flux;
  const ratio = (spaceBody(content, bodyId).radiusKm * 1000) / orbitRadius(content, orbit);
  return flux * (1 - detAtan2(ratio, Math.sqrt(1 - ratio * ratio)) / Math.PI);
}

/** A hab's power from its built modules: what they make (solar modules by its sunlight) and what they use. */
export function habPower(state: GameState, content: Content, hab: HabState): { made: number; used: number } {
  const light = sunlight(content, hab);
  let made = 0;
  let used = 0;
  for (const m of builtModules(state, content, hab)) {
    if (m.power > 0) made += m.power * (m.rules?.includes("Solar_Power_Variable_Output") ? light : 1);
    else used -= m.power;
  }
  return { made, used };
}

export function habCrew(state: GameState, content: Content, hab: HabState): number {
  return builtModules(state, content, hab).reduce((sum, m) => sum + m.crew, 0);
}

/** The first rule of a module's placement that the hab breaks, or null (Terra Invicta's special rules about where modules go). */
function placementProblem(state: GameState, content: Content, hab: HabState, module: HabModuleDef): string | null {
  const rules = module.rules ?? [];
  const orbit = hab.orbitId ? content.orbits.find((o) => o.id === hab.orbitId)! : null;
  const bodyId = habBodyId(content, hab);
  if (rules.includes("EarthLEOOnly") && !orbit?.earthLeo) return `${module.name} goes only in low Earth orbit`;
  if (rules.includes("NotInIrradiated") && habIrradiation(content, hab) > 1) return `${module.name} can't be built where there is radiation`;
  if (rules.includes("Requires_GasGiant_Orbit") && !(orbit && !orbit.lagrange && spaceBody(content, bodyId).atmosphere === "massive")) return `${module.name} goes only in orbit round a gas giant`;
  if (rules.includes("Requires_Interface_Orbit") && !orbit?.interface) return `${module.name} goes only in an interface orbit`;
  if (rules.includes("HarvestAntimatter")) {
    if (!orbit?.antimatterUgPerYear) return `${module.name} needs an orbit with natural antimatter`;
    const taken = state.habs.some((h) => h !== hab && h.orbitId === orbit.id && h.modules.some((m) => m && habModuleDef(content, m.moduleId).rules?.includes("HarvestAntimatter")));
    if (taken) return `Another hab already harvests this orbit's antimatter`;
  }
  // The Earth's system counts as inhabited; elsewhere the habs' crews must be there first.
  const earthSystem = systemOf(content, bodyId) === "Earth";
  const population = earthSystem ? Infinity : systemPopulation(state, content, bodyId);
  if (rules.includes("Requires_Inhabited_Body") && population < content.rules.space.inhabitedPopulation) return `${module.name} needs ${content.rules.space.inhabitedPopulation.toLocaleString("en-US")} crew in this planetary system`;
  if (rules.includes("Requires_Colonized_Body") && population < content.rules.space.colonizedPopulation) return `${module.name} needs ${content.rules.space.colonizedPopulation.toLocaleString("en-US")} crew in this planetary system`;
  return null;
}

export interface ModuleOrder {
  /** Paying in space resources: what it costs (radiation adds base metals). */
  resources: ResourceAmounts;
  /** Sending it up with boost instead, or null before the faction has rockets for this hab. */
  boost: Breakdown | null;
  /** Days to build it once its materials are there. */
  buildDays: number;
  /** When it would be built, paid each way. */
  doneDayWithResources: number;
  doneDayWithBoost: number | null;
  upgrade: boolean;
}

/** What building a module in a hab's slot would take, paid in space resources or sent up with boost. */
export function moduleOrder(state: GameState, content: Content, factionId: string, hab: HabState, slot: number, moduleId: string): ModuleOrder {
  const module = habModuleDef(content, moduleId);
  const upgrade = hab.modules[slot]?.moduleId === module.upgradesFrom && module.upgradesFrom !== undefined;
  const share = upgrade ? content.rules.space.upgradeShare : 1;
  const irradiation = habIrradiation(content, hab);
  const resources: ResourceAmounts = {};
  for (const [r, amount] of Object.entries(module.buildCost) as [keyof ResourceAmounts, number][]) resources[r] = amount * share;
  // Radiation adds mass, paid in base metals at ten tons a unit.
  if (irradiation > 1) resources.metals = (resources.metals ?? 0) + (module.massTons * share * (irradiation - 1)) / 10;
  const buildDays = Math.ceil(module.buildDays * share * constructionFactor(state, content, hab));
  const sent = delivery(state, content, factionId, habDestination(hab), { ...module, massTons: module.massTons * share });
  return {
    resources,
    boost: sent.boost,
    buildDays,
    doneDayWithResources: state.dayIndex + buildDays,
    doneDayWithBoost: sent.boost ? sent.arrivesDay + buildDays : null,
    upgrade,
  };
}

export type Payment = "resources" | "boost";

/** Whether the faction can build a module in a hab's slot now, paying the way given. */
export function checkBuildModule(state: GameState, content: Content, factionId: string, habId: string, slot: number, moduleId: string, payWith: Payment): Check {
  const no = (reason: string): Check => ({ ok: false, reason });
  const hab = state.habs.find((h) => h.id === habId);
  if (!hab || hab.factionId !== factionId) return no("Not one of our habs");
  if (!isBuilt(state, hab.modules[0]!)) return no(`${hab.name}'s core is still being built`);
  const module = content.habModules.find((m) => m.id === moduleId);
  if (!module) return no(`Unknown module "${moduleId}"`);
  const faction = factionState(state, factionId);
  if (!faction.research.completed[module.project]) return no(`Needs the ${content.projects.find((p) => p.id === module.project)?.name ?? module.project} project`);
  if (module.mine) return no(`${module.name} goes in a base's mining slot`);
  if (!Number.isInteger(slot) || slot < 0 || slot >= hab.modules.length) return no("No such slot");
  const kind = hab.siteId ? "base" : "station";
  if (module.type !== "any" && module.type !== kind) return no(`${module.name} goes only on ${module.type === "base" ? "bases" : "stations"}`);
  if ((slot === 0) !== !!module.core) return no(slot === 0 ? "Only a core goes in the core's place" : "A core goes in the core's place");
  const current = hab.modules[slot];
  if (current) {
    if (module.upgradesFrom !== current.moduleId) return no(`That slot holds ${habModuleDef(content, current.moduleId).name}`);
    if (!isBuilt(state, current) || current.upgrade) return no(`${habModuleDef(content, current.moduleId).name} is still being built`);
  }
  if (module.core) {
    const body = spaceBody(content, habBodyId(content, hab));
    if (module.tier > (body.maxHabTier ?? 0)) return no(`${body.name} can hold habs up to tier ${body.maxHabTier}`);
  } else if (module.tier > habTier(content, hab)) return no(`${module.name} needs a tier ${module.tier} core`);
  if (module.onePerHab) {
    const line = (id: string): string => habModuleDef(content, id).upgradesFrom ? line(habModuleDef(content, id).upgradesFrom!) : id;
    const ours = line(module.id);
    if (hab.modules.some((m, i) => i !== slot && m && (line(m.moduleId) === ours || (m.upgrade && line(m.upgrade.moduleId) === ours)))) return no(`Only one ${module.name} per hab`);
  }
  const problem = placementProblem(state, content, hab, module);
  if (problem) return no(problem);
  const order = moduleOrder(state, content, factionId, hab, slot, moduleId);
  if (payWith === "boost") {
    if (!order.boost) return no("Needs rockets to send it beyond low Earth orbit");
    if (faction.resources.boost < order.boost.value) return no(`Needs ${order.boost.value.toFixed(1)} boost`);
  } else {
    for (const [r, amount] of Object.entries(order.resources) as [keyof Resources, number][]) {
      if (faction.resources[r] < amount - 1e-9) return no(`Needs ${amount.toFixed(2)} ${r}`);
    }
  }
  return { ok: true };
}

export function buildModule(state: GameState, content: Content, factionId: string, habId: string, slot: number, moduleId: string, payWith: Payment): void {
  const hab = state.habs.find((h) => h.id === habId)!;
  const faction = factionState(state, factionId);
  const order = moduleOrder(state, content, factionId, hab, slot, moduleId);
  let arrivesDay = state.dayIndex;
  if (payWith === "boost") {
    faction.resources.boost -= order.boost!.value;
    arrivesDay = order.doneDayWithBoost! - order.buildDays;
  } else {
    for (const [r, amount] of Object.entries(order.resources) as [keyof Resources, number][]) faction.resources[r] -= amount;
  }
  const placed = { moduleId, arrivesDay, doneDay: arrivesDay + order.buildDays };
  if (order.upgrade) hab.modules[slot]!.upgrade = placed;
  else hab.modules[slot] = { ...placed, upgrade: null };
}

/** Removes a module (not the core), and anything being built in its place; nothing is refunded. */
export function checkScrapModule(state: GameState, factionId: string, habId: string, slot: number): Check {
  const hab = state.habs.find((h) => h.id === habId);
  if (!hab || hab.factionId !== factionId) return { ok: false, reason: "Not one of our habs" };
  if (slot === 0) return { ok: false, reason: "The core can't be scrapped" };
  if (!hab.modules[slot]) return { ok: false, reason: "That slot is empty" };
  return { ok: true };
}

/** A name for a new hab: after its site, or its orbit (numbered when the orbit has more). */
function habName(state: GameState, content: Content, destination: Destination): string {
  if (destination.kind === "site") return `${content.habSites.find((s) => s.id === destination.id)!.name} Base`;
  const base = `${content.orbits.find((o) => o.id === destination.id)!.name} Station`;
  const taken = new Set(state.habs.map((h) => h.name));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** Sends a new hab's core from the Earth with boost; it is built where it lands. */
export function foundHab(state: GameState, content: Content, factionId: string, destination: Destination): HabState {
  const faction = factionState(state, factionId);
  const core = foundingCore(content, destination);
  const sent = delivery(state, content, factionId, destination, core);
  faction.resources.boost -= sent.boost!.value;
  const hab: HabState = {
    id: newId(state, "hab"),
    factionId,
    name: habName(state, content, destination),
    siteId: destination.kind === "site" ? destination.id : null,
    orbitId: destination.kind === "orbit" ? destination.id : null,
    modules: [{ moduleId: core.id, arrivesDay: sent.arrivesDay, doneDay: sent.arrivesDay + core.buildDays, upgrade: null }, ...Array<null>(content.rules.space.slotsByTier[0]).fill(null)],
    foundedDay: state.dayIndex,
  };
  state.habs.push(hab);
  const built = formatLongDate(dateOfDay(content.rules.startYear, hab.modules[0]!.doneDay));
  addLog(state, { factionId, kind: "space", bodyId: habBodyId(content, hab), text: `We launched the ${core.name} of ${hab.name}. It will be built by ${built}.` });
  return hab;
}

export function checkFoundHabCommand(state: GameState, content: Content, factionId: string, destination: Destination): Check {
  const known = destination.kind === "site" ? content.habSites.some((s) => s.id === destination.id) : content.orbits.some((o) => o.id === destination.id);
  if (!known) return { ok: false, reason: `Unknown ${destination.kind} "${destination.id}"` };
  return checkFoundHab(state, content, factionId, destination);
}

/** The habs Terra Invicta's factions start with (rules.space.startingHabs: the ISS and Tiangong), built and working. */
export function addStartingHabs(state: GameState, content: Content): void {
  for (const start of content.rules.space.startingHabs) {
    state.habs.push({
      id: newId(state, "hab"),
      factionId: start.faction,
      name: start.name,
      siteId: null,
      orbitId: start.orbit,
      modules: start.modules.map((moduleId) => (moduleId ? { moduleId, arrivesDay: state.dayIndex, doneDay: state.dayIndex, upgrade: null } : null)),
      foundedDay: state.dayIndex,
    });
  }
}

/** Modules and upgrades finished today: upgrades take their module's place (a bigger core opens more slots). */
export function runHabTick(state: GameState, content: Content): void {
  for (const hab of state.habs) {
    hab.modules.forEach((slot, i) => {
      if (!slot) return;
      const bodyId = habBodyId(content, hab);
      if (slot.upgrade && slot.upgrade.doneDay <= state.dayIndex) {
        const from = habModuleDef(content, slot.moduleId).name;
        Object.assign(slot, { moduleId: slot.upgrade.moduleId, arrivesDay: slot.upgrade.arrivesDay, doneDay: slot.upgrade.doneDay, upgrade: null });
        const def = habModuleDef(content, slot.moduleId);
        if (i === 0) {
          const slots = content.rules.space.slotsByTier[def.tier - 1]!;
          while (hab.modules.length < slots + 1) hab.modules.push(null);
        }
        addLog(state, { factionId: hab.factionId, kind: "space", bodyId, tone: "good", text: `${hab.name}: ${from} upgraded to ${def.name}.` });
      } else if (slot.doneDay === state.dayIndex) {
        const def = habModuleDef(content, slot.moduleId);
        addLog(state, { factionId: hab.factionId, kind: "space", bodyId, tone: "good", text: i === 0 ? `${hab.name} is founded: its ${def.name} is built.` : `${hab.name}: ${def.name} built.` });
      }
    });
  }
}
