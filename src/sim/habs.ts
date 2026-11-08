// Habs (SPEC 2.10.2; docs/formulas.md, "Habs"): bases on hab sites and stations in orbits, after
// Terra Invicta. A hab is founded by sending its core from the Earth with boost; once the core is
// built, modules go into the slots its tier gives (4, 12 or 20), paid in space resources or sent
// up with boost, and are built side by side. A module in a filled slot can be upgraded to the next
// tier of its line for two thirds of its cost and time, and keeps working until the upgrade is
// done. A base's first slot is its mining slot, where its mine works the site. Working modules
// take power, mission control and upkeep, paid each day from the faction's resources (boost
// stands in for missing space resources); running short of either brings malfunctions.

import { dateOfDay, formatLongDate } from "./calendar";
import type { Content, HabModuleDef, MinedResource, ModifierContext, ResearchCategory, ResourceAmounts } from "./content";
import type { Check } from "./diplomacy";
import { FormulaBuilder, type Breakdown } from "./formula";
import { addLog, factionState, newId } from "./lookup";
import { detAtan2 } from "./detmath";
import { spaceBody } from "./orbits";
import { modifierProduct, modifierSum } from "./research";
import { nextFloat, nextInt, weightedPick } from "./rng";
import { checkFoundHab, delivery, foundingCore, MINED_RESOURCES } from "./space";
import { SPACE_RESOURCES, type GameState, type HabModuleState, type HabState, type Resources, type SpaceResource } from "./state";
import { orbitRadius, type Destination } from "./transfers";

/** A base's first slot after the core: only a mine goes there, and a mine goes nowhere else. */
export const MINING_SLOT = 1;

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

/**
 * What a module's cost and mass are multiplied by where a hab is: the body's mining modifier for
 * mines, the square of the distance from the Sun in AU for solar mirrors (larger, to catch the
 * same light), else 1.
 */
export function moduleScale(content: Content, hab: HabState, module: HabModuleDef): number {
  if (module.scalesWithMining) return spaceBody(content, habBodyId(content, hab)).miningModifier ?? 1;
  if (!module.rules?.includes("SolarMirror")) return 1;
  const au = spaceBody(content, systemOf(content, habBodyId(content, hab))).orbit!.a;
  return au * au;
}

export function isBuilt(state: GameState, slot: HabModuleState): boolean {
  return slot.doneDay <= state.dayIndex;
}

/** The hab's tier: its core's. */
export function habTier(content: Content, hab: HabState): 1 | 2 | 3 {
  return habModuleDef(content, hab.modules[0]!.moduleId).tier;
}

/** Modules that take power before the rest, and can't be switched off (Terra Invicta's PowerFirst: farms, barracks, docks, defences…). */
export function takesPowerFirst(module: HabModuleDef): boolean {
  return module.rules?.includes("PowerFirst") ?? false;
}

/** A module still being built, switched off, built but without the power to run, or working. */
export type ModuleStatus = "building" | "off" | "unpowered" | "working";

export interface HabOperation {
  /** Each slot's module's status; null for an empty slot. */
  status: (ModuleStatus | null)[];
  /** Power its generators make (solar by its sunlight and the faction's mirrors), its working modules use, and every module switched on would. */
  made: number;
  used: number;
  wanted: number;
}

/**
 * Which of a hab's modules work. Built generators always do; solar ones make their power × the
 * sunlight, plus the faction's mirrors' bonus × their tier, at most `space.solarMaxMultiple` ×
 * their power. The power goes to the modules that take power first, then to the rest, slot by
 * slot; a module the power left can't run goes without (**inferred** order: Terra Invicta lets
 * its player pick). A mine's power use goes with the body's mining modifier.
 */
export function habOperation(state: GameState, content: Content, hab: HabState): HabOperation {
  const light = sunlight(content, hab);
  const mirrors = hab.siteId ? mirrorBonus(state, content, hab) : 0;
  const status: (ModuleStatus | null)[] = hab.modules.map((m) => (m === null ? null : isBuilt(state, m) ? "working" : "building"));
  let made = 0;
  const consumers: { slot: number; need: number; first: boolean }[] = [];
  hab.modules.forEach((m, i) => {
    if (!m || status[i] !== "working") return;
    const def = habModuleDef(content, m.moduleId);
    if (def.power > 0) {
      made += def.rules?.includes("Solar_Power_Variable_Output") ? Math.min(def.power * content.rules.space.solarMaxMultiple, def.power * light + mirrors * def.tier) : def.power;
    } else if (m.off && !takesPowerFirst(def)) status[i] = "off";
    else consumers.push({ slot: i, need: -def.power * (def.scalesWithMining ? moduleScale(content, hab, def) : 1), first: takesPowerFirst(def) });
  });
  consumers.sort((a, b) => Number(b.first) - Number(a.first) || a.slot - b.slot);
  let left = made;
  let wanted = 0;
  for (const c of consumers) {
    wanted += c.need;
    if (c.need <= left + 1e-9) left -= c.need;
    else status[c.slot] = "unpowered";
  }
  return { status, made, used: made - Math.max(0, left), wanted };
}

/**
 * Power each solar module of a base gets per tier from its faction's working solar mirrors
 * (Terra Invicta's): those in orbit round its body; at the L1, L4 or L5 point of its moon and the
 * planet; or at the L1 point of its planet and the Sun, for every base in that planetary system.
 */
function mirrorBonus(state: GameState, content: Content, base: HabState): number {
  const bodyId = habBodyId(content, base);
  let bonus = 0;
  for (const hab of state.habs) {
    if (hab.factionId !== base.factionId || !hab.orbitId) continue;
    const mirrors = hab.modules.flatMap((m, i) => (m && habModuleDef(content, m.moduleId).rules?.includes("SolarMirror") ? [i] : []));
    if (mirrors.length === 0) continue;
    const orbit = content.orbits.find((o) => o.id === hab.orbitId)!;
    const parent = spaceBody(content, orbit.body).parent;
    const reaches = !orbit.lagrange
      ? orbit.body === bodyId
      : parent !== "Sol"
        ? orbit.body === bodyId && [1, 4, 5].includes(orbit.lagrange)
        : orbit.lagrange === 1 && systemOf(content, bodyId) === orbit.body;
    if (!reaches) continue;
    const { status } = habOperation(state, content, hab);
    for (const i of mirrors) if (status[i] === "working") bonus += habModuleDef(content, hab.modules[i]!.moduleId).ruleValue ?? 0;
  }
  return bonus;
}

/** The modules that are working, with their slots. */
export function workingModules(state: GameState, content: Content, hab: HabState): { slot: number; def: HabModuleDef }[] {
  const { status } = habOperation(state, content, hab);
  return hab.modules.flatMap((m, i) => (m && status[i] === "working" ? [{ slot: i, def: habModuleDef(content, m.moduleId) }] : []));
}

/** Mission control the hab uses: its working modules' and those being built, the core's most of all (switched off or without power, a module uses none). */
export function habMissionControl(state: GameState, content: Content, hab: HabState): number {
  const { status } = habOperation(state, content, hab);
  let used = 0;
  hab.modules.forEach((m, i) => {
    if (m && (status[i] === "working" || status[i] === "building")) used += Math.max(0, -(habModuleDef(content, m.moduleId).missionControl ?? 0));
  });
  return used;
}

/**
 * The faction's mine network: its working mines, how many it may work before they cost mission
 * control (the Mission to… techs' and Gold Rush's), what the rest cost, `max(1, ⌊excess² / 2⌋)`,
 * and what one more working mine would add.
 */
export function mineNetwork(state: GameState, content: Content, factionId: string): { active: number; free: number; cost: number; next: number } {
  let active = 0;
  for (const hab of state.habs) {
    if (hab.factionId !== factionId || !hab.siteId) continue;
    const mine = hab.modules[MINING_SLOT];
    if (mine && habModuleDef(content, mine.moduleId).mine && habOperation(state, content, hab).status[MINING_SLOT] === "working") active++;
  }
  const free = modifierSum(state, content, factionId, "MCFreeSpaceMineNetwork");
  const cost = (mines: number) => (mines > free ? Math.max(1, Math.floor(((mines - free) * (mines - free)) / 2)) : 0);
  return { active, free, cost: cost(active), next: cost(active + 1) - cost(active) };
}

/**
 * Mission control the faction's habs and mines use, against the capacity it has
 * (resources.missionControl). Independent Habitats takes 15% off the habs'.
 */
export function missionControlUsed(state: GameState, content: Content, factionId: string): number {
  const habs = state.habs.filter((h) => h.factionId === factionId).reduce((sum, h) => sum + habMissionControl(state, content, h), 0);
  return habs * modifierProduct(state, content, factionId, "HabMissionControlReduction") + mineNetwork(state, content, factionId).cost;
}

/**
 * How long the hab takes to build a module, as a share of its build time: each built module that
 * speeds construction (Construction Module 0.9, Nanofactory 0.75, Nanofacturing Complex 0.6), the
 * fastest first, cuts it by `(1 − m) / i²` for the i-th (Terra Invicta's diminishing returns).
 */
export function constructionFactor(state: GameState, content: Content, hab: HabState): number {
  const speeds = workingModules(state, content, hab)
    .map((m) => m.def.constructionTime)
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

/** The crew of every hab in a planetary system, working modules only. */
export function systemPopulation(state: GameState, content: Content, bodyId: string): number {
  const system = systemOf(content, bodyId);
  return state.habs.filter((h) => systemOf(content, habBodyId(content, h)) === system).reduce((sum, h) => sum + habCrew(state, content, h), 0);
}

/**
 * Sunlight on a hab's solar panels, as a share of what they get at the Earth's distance in
 * unbroken sun (**inferred**; Terra Invicta lists some locations' figures but not its formula): the
 * inverse square of the planetary system's distance from the Sun, halved on a surface (night),
 * and in orbit cut by the share of each orbit spent in the body's shadow, `asin(R / r) / π`.
 */
export function sunlight(content: Content, hab: HabState): number {
  const bodyId = habBodyId(content, hab);
  const au = spaceBody(content, systemOf(content, bodyId)).orbit!.a / spaceBody(content, "Earth").orbit!.a;
  const flux = 1 / (au * au);
  if (hab.siteId) return flux / 2;
  const orbit = content.orbits.find((o) => o.id === hab.orbitId)!;
  if (orbit.lagrange) return flux;
  const ratio = (spaceBody(content, bodyId).radiusKm * 1000) / orbitRadius(content, orbit);
  return flux * (1 - detAtan2(ratio, Math.sqrt(1 - ratio * ratio)) / Math.PI);
}

export function habCrew(state: GameState, content: Content, hab: HabState): number {
  return workingModules(state, content, hab).reduce((sum, m) => sum + m.def.crew, 0);
}

const MINING_BONUS: Record<MinedResource, ModifierContext> = {
  water: "MiningWaterBonus",
  volatiles: "MiningVolatilesBonus",
  metals: "MiningMetalsBonus",
  nobleMetals: "MiningNoblesBonus",
  fissiles: "MiningFissilesBonus",
};

/**
 * What a mine would yield a month at a site for a faction: the site's yields × the mine's output
 * (1, 1.5 or 2; automated 1.25) × (1 + the faction's mining bonus) × its bonus for each resource.
 */
export function mineRate(state: GameState, content: Content, factionId: string, siteId: string, mine: HabModuleDef): Record<MinedResource, number> {
  const share = (mine.mineOutput ?? 0) * (1 + modifierSum(state, content, factionId, "SpaceMiningBonus"));
  const site = state.siteYields[siteId]!;
  return Object.fromEntries(MINED_RESOURCES.map((r) => [r, site[r] * share * modifierProduct(state, content, factionId, MINING_BONUS[r])])) as Record<MinedResource, number>;
}

/** What a hab's modules earn and cost a month: working modules' income (research too) and its mine's yield; their upkeep and their crew's life support. */
export interface HabLedger {
  income: ResourceAmounts;
  upkeep: ResourceAmounts;
}

/** Whether the faction works a Helium-3 Mine: its heavy fusion modules then take water where they took fissiles. */
export function harvestsHelium3(state: GameState, content: Content, factionId: string): boolean {
  return state.habs.some((h) => h.factionId === factionId && workingModules(state, content, h).some((m) => m.def.rules?.includes("HarvestHelium3")));
}

/** A module's monthly upkeep: fissiles become water for helium-3 fusion modules while the faction harvests helium-3. */
function moduleSupport(module: HabModuleDef, helium3: boolean): ResourceAmounts {
  if (!helium3 || !module.rules?.includes("UsesHelium3") || !module.support.fissiles) return module.support;
  const { fissiles, ...rest } = module.support;
  return { ...rest, water: (rest.water ?? 0) + fissiles };
}

/** A resource unit is ten tons, 10¹³ micrograms: orbits' natural antimatter is in µg a year. */
const MICROGRAMS_PER_UNIT = 1e13;

/**
 * A hab's month: its working modules' income (more with an administration module's efficiency)
 * and upkeep, its mine's yield, the antimatter its trap harvests, and life support for their
 * crew (water and volatiles for those its farms don't feed; money for all but the crew of
 * quarters, residences and civilian complexes).
 */
export function habLedger(state: GameState, content: Content, hab: HabState): HabLedger {
  const income: ResourceAmounts = {};
  const upkeep: ResourceAmounts = {};
  const add = (to: ResourceAmounts, r: keyof ResourceAmounts, v: number) => {
    if (v) to[r] = (to[r] ?? 0) + v;
  };
  const helium3 = harvestsHelium3(state, content, hab.factionId);
  const working = workingModules(state, content, hab);
  const efficiency = 1 + working.reduce((sum, m) => sum + (m.def.rules?.includes("Efficiency") ? (m.def.ruleValue ?? 0) : 0), 0);
  let crew = 0;
  let paidCrew = 0;
  let fed = 0;
  for (const { slot, def } of working) {
    crew += def.crew;
    if (!def.rules?.includes("Stability")) paidCrew += def.crew;
    if (def.rules?.includes("Farm")) fed += def.ruleValue ?? 0;
    for (const [r, v] of Object.entries(moduleSupport(def, helium3)) as [keyof ResourceAmounts, number][]) add(upkeep, r, v);
    for (const [r, v] of Object.entries(def.income) as [keyof ResourceAmounts, number][]) add(income, r, v * efficiency);
    if (def.mine && slot === MINING_SLOT && hab.siteId) for (const [r, v] of Object.entries(mineRate(state, content, hab.factionId, hab.siteId, def))) add(income, r as MinedResource, v * efficiency);
    if (def.rules?.includes("HarvestAntimatter") && hab.orbitId) {
      const natural = content.orbits.find((o) => o.id === hab.orbitId)!.antimatterUgPerYear ?? 0;
      add(income, "antimatter", (natural * (def.ruleValue ?? 0) * efficiency) / 12 / MICROGRAMS_PER_UNIT);
    }
  }
  const life = content.rules.space.lifeSupport;
  const hungry = crew - Math.min(crew, fed);
  add(upkeep, "water", (hungry * life.water) / 12);
  add(upkeep, "volatiles", (hungry * life.volatiles) / 12);
  add(upkeep, "money", (paidCrew * life.money) / 12);
  return { income, upkeep };
}

/** Every hab of the faction's month, summed. */
export function factionHabLedger(state: GameState, content: Content, factionId: string): HabLedger {
  const total: HabLedger = { income: {}, upkeep: {} };
  for (const hab of state.habs) {
    if (hab.factionId !== factionId) continue;
    const l = habLedger(state, content, hab);
    for (const side of ["income", "upkeep"] as const) {
      for (const [r, v] of Object.entries(l[side]) as [keyof ResourceAmounts, number][]) total[side][r] = (total[side][r] ?? 0) + v;
    }
  }
  return total;
}

/** Terra Invicta's priorities that habs' modules in the Earth's low orbits add to, by special rule. */
export const EARTH_ORBIT_PRIORITIES: Record<string, string> = {
  LEOBonusEconomy: "economy",
  LEOBonusWelfare: "welfare",
  LEOBonusEnvironment: "environment",
  LEOBonusKnowledge: "knowledge",
  LEOBonusGovernment: "government",
  LEOBonusUnity: "unity",
  LEOBonusMiltech: "military",
  LEOBonusOppression: "oppression",
  LEOBonusLaunchFacilities: "boost",
  LEOBonusMissionControl: "mission-control",
};

/** What a faction's habs do for it beyond their ledgers (docs/formulas.md, "Habs"). */
export interface HabBonuses {
  /** Research bonus by field, after diminishing returns above 50%. */
  research: Partial<Record<ResearchCategory, number>>;
  /** Project income from modules: the first opens the third project slot, the rest speed projects. */
  projects: number;
  /** Extra share of IP for each priority, from modules in the Earth's low orbits (capped). */
  priorities: Record<string, number>;
  /** Control point capacity from administration modules in the Earth's low orbits. */
  controlPointCapacity: number;
  /** Mission control its modules provide. */
  missionControl: number;
  /** From modules in the Earth's low orbits (capped): strength added to our public campaigns, to spotting enemy councilors, and Miltech to our armies in combat. */
  publicCampaign: number;
  detection: number;
  armyMiltech: number;
}

/** Terra Invicta's diminishing returns on a research bonus above 50%: `0.5 + 0.5 × (b − 0.5) / (b + 1.5)`. */
function diminished(bonus: number): number {
  return bonus <= 0.5 ? bonus : 0.5 + (0.5 * (bonus - 0.5)) / (bonus + 1.5);
}

export function habBonuses(state: GameState, content: Content, factionId: string): HabBonuses {
  const caps = content.rules.space.earthOrbitCaps;
  const out: HabBonuses = { research: {}, projects: 0, priorities: {}, controlPointCapacity: 0, missionControl: 0, publicCampaign: 0, detection: 0, armyMiltech: 0 };
  for (const hab of state.habs) {
    if (hab.factionId !== factionId) continue;
    const earthOrbit = !!hab.orbitId && !!content.orbits.find((o) => o.id === hab.orbitId)!.earthLeo;
    for (const { def } of workingModules(state, content, hab)) {
      for (const [field, v] of Object.entries(def.researchBonuses ?? {}) as [ResearchCategory, number][]) out.research[field] = (out.research[field] ?? 0) + v;
      out.projects += def.projectSlots ?? 0;
      out.missionControl += Math.max(0, def.missionControl ?? 0);
      if (!earthOrbit) continue;
      if (def.controlPointCapacity) out.controlPointCapacity += def.controlPointCapacity;
      for (const rule of def.rules ?? []) {
        const priority = EARTH_ORBIT_PRIORITIES[rule];
        if (priority) out.priorities[priority] = (out.priorities[priority] ?? 0) + (def.ruleValue ?? 0);
        if (rule === "LEOBonusPropagandaStrength") out.publicCampaign += def.ruleValue ?? 0;
        if (rule === "LEOBonusHumanDetection") out.detection += def.tier;
        if (rule === "LEOBonusArmyCombatValue") out.armyMiltech += def.ruleValue ?? 0;
      }
    }
  }
  for (const field of Object.keys(out.research) as ResearchCategory[]) out.research[field] = diminished(out.research[field]!);
  for (const p of Object.keys(out.priorities)) out.priorities[p] = Math.min(caps.priority, out.priorities[p]!);
  out.publicCampaign = Math.min(caps.publicCampaign, out.publicCampaign);
  out.detection = Math.min(caps.detection, out.detection);
  out.armyMiltech = Math.min(caps.armyMiltech, out.armyMiltech);
  return out;
}

/** Each space resource's monthly change from the faction's habs: what its mines and modules make, less their upkeep. */
export function spaceResourceIncome(state: GameState, content: Content, factionId: string): Record<SpaceResource, Breakdown> {
  const ledger = factionHabLedger(state, content, factionId);
  return Object.fromEntries(
    SPACE_RESOURCES.map((r) => {
      const f = new FormulaBuilder();
      if (ledger.income[r]) f.add("Habs' mines and modules", ledger.income[r]);
      if (ledger.upkeep[r]) f.add("Habs' upkeep and life support", -ledger.upkeep[r]);
      return [r, f.build()];
    }),
  ) as Record<SpaceResource, Breakdown>;
}

/** Boost a month that would stand in for the space resources the faction's habs need and it has run out of (for the top bar). */
export function boostForMissingUpkeep(state: GameState, content: Content, factionId: string): number {
  const ledger = factionHabLedger(state, content, factionId);
  const resources = factionState(state, factionId).resources;
  let boost = 0;
  for (const r of SPACE_RESOURCES) {
    const net = (ledger.income[r] ?? 0) - (ledger.upkeep[r] ?? 0);
    if (net < 0 && resources[r] <= 1e-9) boost -= net;
  }
  return boost;
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

/**
 * What building a module in a hab's slot would take, paid in space resources or sent up with
 * boost. A mine's cost and mass are multiplied by the body's mining modifier, before radiation,
 * and a solar mirror's by the square of its distance from the Sun; a helium-3 fusion module takes
 * water for its fissiles while the faction harvests helium-3.
 */
export function moduleOrder(state: GameState, content: Content, factionId: string, hab: HabState, slot: number, moduleId: string): ModuleOrder {
  const module = habModuleDef(content, moduleId);
  const upgrade = hab.modules[slot]?.moduleId === module.upgradesFrom && module.upgradesFrom !== undefined;
  const share = (upgrade ? content.rules.space.upgradeShare : 1) * moduleScale(content, hab, module);
  const irradiation = habIrradiation(content, hab);
  const helium3 = module.rules?.includes("UsesHelium3") && harvestsHelium3(state, content, factionId);
  const resources: ResourceAmounts = {};
  for (const [r, amount] of Object.entries(module.buildCost) as [keyof ResourceAmounts, number][]) {
    const paidIn = helium3 && r === "fissiles" ? "water" : r;
    resources[paidIn] = (resources[paidIn] ?? 0) + amount * share;
  }
  // Radiation adds mass, paid in base metals at ten tons a unit.
  if (irradiation > 1) resources.metals = (resources.metals ?? 0) + (module.massTons * share * (irradiation - 1)) / 10;
  const buildDays = Math.ceil(module.buildDays * (upgrade ? content.rules.space.upgradeShare : 1) * constructionFactor(state, content, hab));
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

/**
 * Whether the faction can build a module in a hab's slot now, paying the way given. A base's
 * mining slot takes only a mine. Nothing is built while the faction uses more mission control
 * than it has, nor anything that would take it over.
 */
export function checkBuildModule(state: GameState, content: Content, factionId: string, habId: string, slot: number, moduleId: string, payWith: Payment): Check {
  const no = (reason: string): Check => ({ ok: false, reason });
  const hab = state.habs.find((h) => h.id === habId);
  if (!hab || hab.factionId !== factionId) return no("Not one of our habs");
  if (!isBuilt(state, hab.modules[0]!)) return no(`${hab.name}'s core is still being built`);
  const module = content.habModules.find((m) => m.id === moduleId);
  if (!module) return no(`Unknown module "${moduleId}"`);
  const faction = factionState(state, factionId);
  if (!faction.research.completed[module.project]) return no(`Needs the ${content.projects.find((p) => p.id === module.project)?.name ?? module.project} project`);
  const mining = hab.siteId !== null && slot === MINING_SLOT;
  if (module.mine && !mining) return no(`${module.name} goes in a base's mining slot`);
  if (!module.mine && mining) return no("Only a mine goes in the mining slot");
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
  const used = missionControlUsed(state, content, factionId);
  const cap = +faction.resources.missionControl.toFixed(1);
  if (used > cap) return no(`We use ${used} mission control of our ${cap}`);
  const more = Math.max(0, -(module.missionControl ?? 0)) - (current ? Math.max(0, -(habModuleDef(content, current.moduleId).missionControl ?? 0)) : 0);
  if (used + more > cap) return no(`Needs ${more} mission control: we use ${used} of our ${cap}`);
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
  else hab.modules[slot] = { ...placed, upgrade: null, off: false };
}

/** Switches a module on or off. Generators and modules that take power first stay on. */
export function checkSetModulePower(state: GameState, content: Content, factionId: string, habId: string, slot: number): Check {
  const hab = state.habs.find((h) => h.id === habId);
  if (!hab || hab.factionId !== factionId) return { ok: false, reason: "Not one of our habs" };
  const m = Number.isInteger(slot) && slot > 0 ? hab.modules[slot] : null;
  if (!m) return { ok: false, reason: slot === 0 ? "The core stays on" : "That slot is empty" };
  const def = habModuleDef(content, m.moduleId);
  if (def.power > 0) return { ok: false, reason: `${def.name} makes power` };
  if (takesPowerFirst(def)) return { ok: false, reason: `${def.name} can't be switched off` };
  return { ok: true };
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
    modules: [{ moduleId: core.id, arrivesDay: sent.arrivesDay, doneDay: sent.arrivesDay + core.buildDays, upgrade: null, off: false }, ...Array<null>(content.rules.space.slotsByTier[0]).fill(null)],
    foundedDay: state.dayIndex,
    unsupplied: false,
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
      modules: start.modules.map((moduleId) => (moduleId ? { moduleId, arrivesDay: state.dayIndex, doneDay: state.dayIndex, upgrade: null, off: false } : null)),
      foundedDay: state.dayIndex,
      unsupplied: false,
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

/** The order upkeep is paid in: the Earth's resources, then the space resources (boost stands in for those). */
const UPKEEP_ORDER: (keyof Resources)[] = ["money", "influence", "ops", "boost", ...SPACE_RESOURCES];

/**
 * A day of the habs' economy for every faction: their income and mines' yield come in, then
 * their upkeep is paid; boost stands in, unit for unit, for space resources the faction has run
 * out of. A hab whose upkeep can't be met is unsupplied. Then malfunctions.
 */
export function runHabEconomy(state: GameState, content: Content, share: number): void {
  for (const faction of state.factions) {
    const habs = state.habs.filter((h) => h.factionId === faction.id);
    if (habs.length === 0) continue;
    const ledgers = habs.map((h) => habLedger(state, content, h));
    const resources = faction.resources;
    const owed: ResourceAmounts = {};
    for (const l of ledgers) {
      // Research goes to the faction's projects and techs (monthlyResearch), not its stock.
      for (const [r, v] of Object.entries(l.income) as [keyof ResourceAmounts, number][]) if (r !== "research") resources[r] += v * share;
      for (const [r, v] of Object.entries(l.upkeep) as [keyof ResourceAmounts, number][]) owed[r] = (owed[r] ?? 0) + v;
    }
    const short = new Set<string>();
    for (const r of UPKEEP_ORDER) {
      let due = (owed[r as keyof ResourceAmounts] ?? 0) * share;
      if (due <= 0) continue;
      const paid = Math.min(due, Math.max(0, resources[r]));
      resources[r] -= paid;
      due -= paid;
      if (due > 1e-12 && (SPACE_RESOURCES as readonly string[]).includes(r)) {
        const boost = Math.min(due, Math.max(0, resources.boost));
        resources.boost -= boost;
        due -= boost;
      }
      if (due > 1e-12) short.add(r);
    }
    habs.forEach((h, i) => (h.unsupplied = Object.keys(ledgers[i]!.upkeep).some((r) => short.has(r))));
    runMalfunctions(state, content, habs, share);
  }
}

/**
 * Terra Invicta's Hab Module Malfunction: while a faction uses more mission control than it has,
 * or a hab goes unsupplied, the hab may lose modules (never its core), more likely the shorter it
 * is (rules.space.accidents, **inferred** odds).
 */
function runMalfunctions(state: GameState, content: Content, habs: HabState[], share: number): void {
  const rules = content.rules.space.accidents;
  const factionId = habs[0]!.factionId;
  const missing = missionControlUsed(state, content, factionId) - factionState(state, factionId).resources.missionControl;
  for (const hab of habs) {
    const chance = Math.max(missing > 0 ? Math.min(1, missing * rules.perMissingMissionControl) : 0, hab.unsupplied ? rules.unsupplied : 0);
    if (chance <= 0 || nextFloat(state.rng) >= chance * share) continue;
    const slots = hab.modules.flatMap((m, i) => (m && i > 0 ? [i] : []));
    let count = rules.modules[weightedPick(state.rng, rules.modules.map((_, i) => i), (i) => rules.weights[i]!)]!;
    const lost: string[] = [];
    while (count-- > 0 && slots.length > 0) {
      const slot = slots.splice(nextInt(state.rng, 0, slots.length - 1), 1)[0]!;
      lost.push(habModuleDef(content, hab.modules[slot]!.moduleId).name);
      hab.modules[slot] = null;
    }
    if (lost.length === 0) continue;
    const why = missing > 0 ? "we use more mission control than we have" : "its upkeep went unpaid";
    addLog(state, { factionId, kind: "space", bodyId: habBodyId(content, hab), tone: "bad", text: `${hab.name}: a malfunction destroyed its ${lost.join(", ")}, as ${why}.` });
  }
}
