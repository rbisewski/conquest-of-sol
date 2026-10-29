// The daily tick (SPEC 2.5): a day of war, national investment, outputs, growth, unrest
// drift and faction upkeep. Rates are quoted per month (as Terra Invicta shows them) and paid out a day at a
// time, so priority completions and income arrive throughout the month.

import { dateOfDay, daysInMonth } from "./calendar";
import type { Content } from "./content";
import { orderArmies } from "./ai";
import { councilIncome, effectiveAttributes } from "./councilors";
import { expireCooldowns } from "./diplomacy";
import { investNation, payNationOutputs } from "./economy";
import { friendlyArmyHealth, runMilitaryTick } from "./military";
import { hostilePenalties } from "./claims";
import { FormulaBuilder, type Breakdown } from "./formula";
import { nationDef } from "./lookup";
import { controlPointCapacityCost, isDisabled, syncControlPointCount, unrestTarget } from "./nation";
import { modifierSum, runResearchTick } from "./research";
import { checkBreakaways, checkSecessions } from "./secession";
import type { FactionState, GameState, NationState } from "./state";
import { isExtant } from "./territory";

/** The share of a month one day is: 1 / days in the current month. */
export function dayShareOfMonth(state: GameState, content: Content): number {
  const date = dateOfDay(content.rules.startYear, state.dayIndex);
  return 1 / daysInMonth(date.year, date.month);
}

/**
 * A monthly rate as what today's tick pays: every added term × the day's share of the month
 * (multiplying terms stay as they are), for the top bar's per-day figures.
 */
export function perDay(state: GameState, content: Content, monthly: Breakdown): Breakdown {
  const share = dayShareOfMonth(state, content);
  return { ...monthly, value: monthly.value * share, terms: monthly.terms.map((t) => (t.op === "add" ? { ...t, value: t.value * share } : t)) };
}

export function runDailyTick(state: GameState, content: Content): void {
  const share = dayShareOfMonth(state, content);
  // A day of fighting first, then the nations' AI moves the armies no player commands.
  runMilitaryTick(state, content);
  orderArmies(state, content);
  expireCooldowns(state);
  // Nations and factions are always processed in content order, which keeps the tick deterministic.
  const nations = state.nations.filter(isExtant);
  for (const nation of nations) investNation(state, content, nation, share);
  // Mission Control is a capacity, so it is rebuilt from the CPs each faction now holds.
  for (const faction of state.factions) faction.resources.missionControl = 0;
  const armyHealth = friendlyArmyHealth(state, content);
  for (const nation of nations) {
    payNationOutputs(state, content, nation, share);
    growNation(state, content, nation, share, armyHealth);
    syncControlPointCount(content, nation);
  }
  for (const faction of state.factions) settleFaction(state, content, faction, share);
  // Unstable nations may lose regions: to nations that broke away, or to neighbours that claim them.
  checkBreakaways(state, content);
  checkSecessions(state, content);
  runResearchTick(state, content, share);
}

/** Population grows at its real-world rate. GDP per capita is unchanged, so GDP grows with it. */
function growNation(state: GameState, content: Content, nation: NationState, share: number, armyHealth: Map<string, number>): void {
  const factor = 1 + (nationDef(content, nation.id).populationGrowth / 12) * share;
  nation.population *= factor;
  nation.gdp *= factor;
  const target = unrestTarget(state, content, nation, armyHealth).value;
  // Unrest moves a fixed step per month toward its base value, as in Terra Invicta.
  const step = content.rules.unrest.monthlyStep * share;
  nation.unrest += Math.max(-step, Math.min(step, target - nation.unrest));
  // We don't model Terra Invicta's resting cohesion, so its hostile-claim penalty caps cohesion
  // instead: above the cap, cohesion falls at the same monthly pace as unrest moves.
  const cap = 10 - hostilePenalties(state, content, nation).cohesion;
  if (nation.cohesion > cap) nation.cohesion = Math.max(cap, nation.cohesion - step);
}

export function controlledPoints(state: GameState, factionId: string): number {
  let count = 0;
  for (const nation of state.nations) for (const cp of nation.controlPoints) if (cp.owner === factionId) count++;
  return count;
}

/** Control Point Capacity: +1 per point of each cap attribute of the faction's free councilors, plus projects. */
export function controlCap(state: GameState, content: Content, faction: FactionState): Breakdown {
  const f = new FormulaBuilder();
  for (const attr of content.rules.controlPoints.capAttributes) {
    const sum = faction.councilors.reduce((total, c) => total + (c.detainedPhases > 0 ? 0 : effectiveAttributes(content, c)[attr]), 0);
    f.add(`Council ${attr[0]!.toUpperCase()}${attr.slice(1)}`, sum);
  }
  const projects = modifierSum(state, content, faction.id, "ControlPointCapacity");
  if (projects !== 0) f.add("Projects", projects);
  return f.build();
}

/**
 * Capacity used: each held CP costs its share of GDP^0.6 / 2. Disabled CPs cost nothing.
 * Projects that cut control point maintenance take a percentage off (at most 90%).
 */
export function controlUpkeep(state: GameState, content: Content, factionId: string): number {
  let total = 0;
  for (const nation of state.nations) {
    nation.controlPoints.forEach((cp, i) => {
      if (cp.owner === factionId && !isDisabled(state, nation, i)) total += controlPointCapacityCost(content, nation);
    });
  }
  return total * Math.max(0.1, 1 + modifierSum(state, content, factionId, "ControlPointMaintenance") / 100);
}

export function overCap(state: GameState, content: Content, faction: FactionState): number {
  return Math.max(0, controlUpkeep(state, content, faction.id) - controlCap(state, content, faction).value);
}

/** Supporters of the faction worldwide, in billions of people. */
export function worldSupporters(state: GameState, factionId: string): number {
  let total = 0;
  for (const nation of state.nations) total += (nation.population * (nation.publicOpinion[factionId] ?? 0)) / 1000;
  return total;
}

export function monthlyInfluence(state: GameState, content: Content, faction: FactionState): Breakdown {
  const r = content.rules.influence;
  const f = new FormulaBuilder()
    .add("Base", r.base)
    .add("Public support worldwide", worldSupporters(state, faction.id) * r.perBillionSupporters)
    .add("Councilors' traits and orgs", councilIncome(content, faction, "influence"));
  // The AI difficulty modifier scales income only, before costs are taken off (SPEC 2.16).
  const aiBonus = content.rules.difficulty[state.difficulty].aiBonus;
  if (!faction.isPlayer && aiBonus !== 0) f.mul("AI difficulty modifier", 1 + aiBonus);
  // Terra Invicta charges overcap² influence per year (SPEC 2.6.2); spread it over 12 months.
  const over = overCap(state, content, faction);
  if (over > 0) f.add("Over control cap", -(over * over) / 12);
  return f.build();
}

function settleFaction(state: GameState, content: Content, faction: FactionState, share: number): void {
  faction.resources.influence += monthlyInfluence(state, content, faction).value * share;
  // Money and Boost from nations are paid in payNationOutputs; these are the councilors' own.
  for (const key of ["money", "ops", "boost"] as const) faction.resources[key] += councilIncome(content, faction, key) * share;
}
