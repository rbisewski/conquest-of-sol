// Faction AI in space (SPEC 2.15), run at each council phase for every faction no person plays:
// it prospects the bodies open to it, founds outposts at the best sites it knows, gives each base
// a mine and the power to run it, and fills its stations in low Earth orbit with labs. It keeps a
// reserve of boost, stays inside its mission control and mine limit, and builds nothing it
// couldn't support. Tunables are rules.space.ai; docs/formulas.md ("Space AI").

import type { Content, HabModuleDef, MinedResource } from "./content";
import { factionMonthlyIncome } from "./economy";
import { buildModule, checkBuildModule, factionHabLedger, foundHab, habBodyId, habModuleDef, habOperation, isBuilt, MINING_SLOT, mineNetwork, mineRate, moduleOrder, sunlight, type Payment } from "./habs";
import { spaceBody } from "./orbits";
import { checkFoundHab, checkLaunchProbe, delivery, foundingCore, launchProbe, MINED_RESOURCES, probeDays, siteEstimate } from "./space";
import type { FactionState, GameState, HabState } from "./state";

/** Generators the AI builds, in order of preference where each works. */
const GENERATORS = ["FusionPile", "FissionPile", "SolarCollector"];
/** Mines the AI builds, best first. */
const MINES = ["AutomatedMiningComplex", "OutpostMiningComplex"];
/** Labs the AI puts in its stations in low Earth orbit, best first. */
const LABS = ["SpaceScienceLab", "EnergyLab", "InformationScienceLab", "LifeScienceLab", "MaterialsLab", "MilitaryScienceLab", "SocialScienceLab"];
/** Modules whose projects the AI researches for its space plans (with the rocket projects). */
export const AI_SPACE_MODULES = new Set(["OutpostCore", "PlatformCore", ...MINES, ...GENERATORS, ...LABS]);

/** What a month of these resources is worth to the AI. */
function worth(content: Content, yields: Record<MinedResource, number>): number {
  const value = content.rules.space.ai.resourceValue;
  return MINED_RESOURCES.reduce((sum, r) => sum + yields[r] * value[r], 0);
}

export function planSpace(state: GameState, content: Content, faction: FactionState): void {
  // Room for another outpost and a mine for it: found at the best site it knows, or prospect to find one.
  const mine = known(content, faction, MINES)[0];
  if (mine && state.habs.filter((h) => h.factionId === faction.id && h.siteId).length < mineNetwork(state, content, faction.id).free) {
    const site = bestSite(state, content, faction, mine);
    if (!site) sendProbe(state, content, faction);
    else if (spareBoost(state, content, faction) >= site.cost && affords(state, content, faction, site.draw, site.cost)) foundHab(state, content, faction.id, { kind: "site", id: site.siteId });
  }
  for (const hab of state.habs) if (hab.factionId === faction.id && isBuilt(state, hab.modules[0]!)) buildIn(state, content, faction, hab);
}

/**
 * Boost a month these modules would draw: their boost upkeep, and their space-resource upkeep
 * and their crew's water and volatiles beyond what the yields given cover.
 */
function boostDraw(content: Content, modules: HabModuleDef[], yields: Partial<Record<MinedResource, number>> = {}): number {
  const life = content.rules.space.lifeSupport;
  const need: Record<MinedResource, number> = { water: 0, volatiles: 0, metals: 0, nobleMetals: 0, fissiles: 0 };
  let boost = 0;
  for (const m of modules) {
    boost += m.support.boost ?? 0;
    for (const r of MINED_RESOURCES) need[r] += m.support[r] ?? 0;
    need.water += (m.crew * life.water) / 12;
    need.volatiles += (m.crew * life.volatiles) / 12;
  }
  return MINED_RESOURCES.reduce((sum, r) => sum + Math.max(0, need[r] - (yields[r] ?? 0)), boost);
}

/**
 * Whether the faction can keep paying for its habs after spending `spend` boost now and adding
 * `draw` a month: its boost, with `ai.planMonths` of its boost income less the new draw, still
 * holds its least reserve.
 */
function affords(state: GameState, content: Content, faction: FactionState, draw: number, spend = 0): boolean {
  const ai = content.rules.space.ai;
  const income = factionMonthlyIncome(state, content, faction.id).boost.value;
  return faction.resources.boost - spend + ai.planMonths * (income - draw) >= ai.boostReserve;
}

/**
 * Boost the AI may spend: what it holds above its reserve, which is the larger of
 * `ai.boostReserve` and `ai.reserveMonths` of what its habs draw in boost (their boost upkeep
 * and the space resources they use beyond what they make).
 */
function spareBoost(state: GameState, content: Content, faction: FactionState): number {
  const ai = content.rules.space.ai;
  const ledger = factionHabLedger(state, content, faction.id);
  let draw = ledger.upkeep.boost ?? 0;
  for (const r of MINED_RESOURCES) draw += Math.max(0, (ledger.upkeep[r] ?? 0) - (ledger.income[r] ?? 0));
  return faction.resources.boost - Math.max(ai.boostReserve, ai.reserveMonths * draw);
}

/** A probe to the open body whose sites promise the most per day of travel, while few are out. */
function sendProbe(state: GameState, content: Content, faction: FactionState): void {
  const cost = content.rules.space.probeCost.boost ?? 0;
  if (faction.probes.length >= content.rules.space.ai.maxProbesInFlight || spareBoost(state, content, faction) < cost) return;
  let best: { bodyId: string; score: number } | null = null;
  for (const body of content.solarSystem) {
    if (!body.composition || !checkLaunchProbe(state, content, faction.id, body.id).ok) continue;
    const promise = content.habSites.filter((s) => s.body === body.id).reduce((most, s) => Math.max(most, worth(content, siteEstimate(content, state.difficulty, s.id))), 0);
    const score = promise / (1 + probeDays(state, content, faction.id, body.id));
    if (!best || score > best.score) best = { bodyId: body.id, score };
  }
  if (best) launchProbe(state, content, faction.id, best.bodyId);
}

/**
 * The free prospected site worth founding an outpost at, with the boost to send its core and
 * the boost a month the outpost and this mine would draw: the one whose yields, less that draw
 * (at `ai.boostValue` a unit), are worth the most per boost to found, among those worth at least
 * `ai.minSiteValue` a month that the faction could found at (boost aside).
 */
function bestSite(state: GameState, content: Content, faction: FactionState, mine: HabModuleDef): { siteId: string; cost: number; draw: number } | null {
  const ai = content.rules.space.ai;
  let best: { siteId: string; cost: number; draw: number; score: number } | null = null;
  for (const site of content.habSites) {
    if (!faction.prospected.includes(site.body)) continue;
    const destination = { kind: "site", id: site.id } as const;
    const core = foundingCore(content, destination);
    const yields = mineRate(state, content, faction.id, site.id, mine);
    const draw = boostDraw(content, [core, mine], yields);
    const value = worth(content, yields) - ai.boostValue * draw;
    if (value < ai.minSiteValue) continue;
    if (!checkFoundHab(state, content, faction.id, destination, true).ok) continue;
    const sent = delivery(state, content, faction.id, destination, core);
    if (!sent.boost) continue;
    const score = value / sent.boost.value;
    if (!best || score > best.score) best = { siteId: site.id, cost: sent.boost.value, draw, score };
  }
  return best;
}

/** The modules of these ids the faction has the projects for, in the order given. */
function known(content: Content, faction: FactionState, ids: string[]): HabModuleDef[] {
  return ids.map((id) => habModuleDef(content, id)).filter((m) => faction.research.completed[m.project]);
}

/**
 * One order a phase in each hab with nothing under way: a base's mine, after a generator if it
 * lacks the power; a lab for a station in low Earth orbit, after a generator if it lacks the
 * power. Paid in space resources if it can, else with boost it can spare.
 */
function buildIn(state: GameState, content: Content, faction: FactionState, hab: HabState): void {
  if (hab.modules.some((m) => m && (!isBuilt(state, m) || m.upgrade))) return;
  const op = habOperation(state, content, hab);
  const spare = op.made - op.wanted;
  const order = (slot: number, module: HabModuleDef, yields: Partial<Record<MinedResource, number>> = {}): boolean => {
    if (!affords(state, content, faction, boostDraw(content, [module], yields))) return false;
    if (checkBuildModule(state, content, faction.id, hab.id, slot, module.id, "resources").ok) {
      buildModule(state, content, faction.id, hab.id, slot, module.id, "resources");
      return true;
    }
    const boost = moduleOrder(state, content, faction.id, hab, slot, module.id).boost;
    if (!boost || spareBoost(state, content, faction) < boost.value || !checkBuildModule(state, content, faction.id, hab.id, slot, module.id, "boost").ok) return false;
    buildModule(state, content, faction.id, hab.id, slot, module.id, "boost");
    return true;
  };
  const freeSlot = hab.modules.findIndex((m, i) => i > 0 && m === null && !(hab.siteId && i === MINING_SLOT));
  /** Builds a generator if one would run here; true if it did. */
  const power = (): boolean => {
    if (freeSlot < 0) return false;
    const generator = known(content, faction, GENERATORS).find((g) => !g.rules?.includes("Solar_Power_Variable_Output") || sunlight(content, hab) >= content.rules.space.ai.minSunlight);
    return !!generator && order(freeSlot, generator);
  };
  if (hab.siteId) {
    if (hab.modules[MINING_SLOT]) return;
    const mine = known(content, faction, MINES).sort((a, b) => worth(content, mineRate(state, content, faction.id, hab.siteId!, b)) - worth(content, mineRate(state, content, faction.id, hab.siteId!, a)))[0];
    if (!mine) return;
    const need = -mine.power * (spaceBody(content, habBodyId(content, hab)).miningModifier ?? 1);
    if (spare < need) power();
    else order(MINING_SLOT, mine, mineRate(state, content, faction.id, hab.siteId, mine));
    return;
  }
  const orbit = content.orbits.find((o) => o.id === hab.orbitId)!;
  if (!orbit.earthLeo || freeSlot < 0) return;
  // Labs cost money each month: only while the faction's money still grows.
  if (factionMonthlyIncome(state, content, faction.id).money.value < content.rules.space.ai.minMoneyIncome) return;
  const have = new Set(hab.modules.map((m) => m?.moduleId));
  const lab = known(content, faction, LABS).find((l) => !have.has(l.id));
  if (!lab) return;
  if (spare < -lab.power) power();
  else order(freeSlot, lab);
}
