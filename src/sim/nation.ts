// Derived national values (SPEC 2.6). Every function returns a Breakdown (or a plain
// number for internal values) so the UI can show the formula. Control point rules follow
// Terra Invicta's current release (SPEC D11, D13). The economy is in economy.ts.
//
// Determinism note: simulation code only uses + − × ÷, Math.sqrt, Math.floor, Math.round
// and the helpers in detmath.ts. Never use Math.pow, exp, log or trig in src/sim/.

import { hostilePenalties } from "./claims";
import type { Content } from "./content";
import { detPow } from "./detmath";
import { friendlyArmyHealth } from "./military";
import { nationRegions } from "./territory";
import { FormulaBuilder, type Breakdown } from "./formula";
import type { GameState, NationState } from "./state";

/** Terra Invicta: max(1, min(round(GDP^0.18 / 1.09), 6)), GDP in billions. */
export function controlPointCount(content: Content, gdp: number): Breakdown {
  const c = content.rules.controlPoints;
  const raw = detPow(Math.max(gdp, 0), c.gdpExponent) / c.divisor;
  return new FormulaBuilder()
    .add(`GDP^${c.gdpExponent} / ${c.divisor}, rounded`, Math.round(raw))
    .build({ min: c.min, max: c.max });
}

/** Total control point capacity cost of a nation: GDP^0.6 / 2, split evenly between its CPs. */
export function controlPointCapacityCost(content: Content, nation: NationState): number {
  const c = content.rules.controlPoints;
  return detPow(Math.max(nation.gdp, 0), c.capacityExponent) / c.capacityDivisor / nation.controlPoints.length;
}

export function gdpPerCapita(nation: NationState): number {
  // gdp is in billions and population in millions, so the ratio is thousands of USD per person.
  return nation.population > 0 ? nation.gdp / nation.population : 0;
}

/** Size of National Economy mission modifier: (GDP / scaling factor)^(1/3). */
export function economySize(content: Content, nation: NationState): number {
  return detPow(Math.max(nation.gdp, 0) / content.rules.missions.gdpScalingFactor, 1 / 3);
}

/** Share of IP the elites want in Spoils (Terra Invicta's Corruption), 0–1. */
export function corruption(content: Content, nation: NationState): Breakdown {
  const c = content.rules.corruption;
  return new FormulaBuilder()
    .add("Base", c.base)
    .add("Government", -nation.democracy * c.perGovernment)
    .add("Cohesion", -nation.cohesion * c.perCohesion)
    .add("GDP per capita", -((gdpPerCapita(nation) * 1000) / 3000) * c.perGdppc3000)
    .build({ min: c.min, max: 1 });
}

/**
 * Terra Invicta's Base Unrest: 10.5, −1 per $10K GDP per capita, −1 per Cohesion, and
 * −0.5 × health × (10 − Government) / regions^0.65 for each friendly army in the nation.
 */
export function unrestTarget(state: GameState, content: Content, nation: NationState, armyHealth = friendlyArmyHealth(state, content)): Breakdown {
  const u = content.rules.unrest;
  const m = content.rules.military;
  const f = new FormulaBuilder()
    .add("Base", u.base)
    .add("GDP per capita", -(gdpPerCapita(nation) / 10) * u.perGdppc10k)
    .add("Cohesion", -nation.cohesion * u.perCohesion);
  const hostile = hostilePenalties(state, content, nation).unrest;
  if (hostile > 0) f.add("Hostile regions", hostile);
  const armies = armyHealth.get(nation.id) ?? 0;
  if (armies > 0) f.add("Armies", (-m.unrestPerArmy * armies * (10 - nation.democracy)) / detPow(nationRegions(state, content, nation.id).length, m.unrestRegionExponent));
  return f.build({ min: 0, max: 10 });
}

/** Unrest bands from Terra Invicta (SPEC 2.6.1). */
export function unrestBand(unrest: number): string {
  if (unrest < 1.5) return "Peaceful";
  if (unrest < 3) return "Subversion";
  if (unrest < 4.5) return "Strife";
  if (unrest < 6) return "Insurgency";
  if (unrest < 7.5) return "Guerilla War";
  if (unrest < 9) return "Insurrection";
  return "Civil War";
}

export type ControlPointType =
  | "Executive"
  | "Legislature"
  | "Party"
  | "Oligarchs"
  | "Aristocracy"
  | "Security Apparatus"
  | "Mass Media"
  | "Religion"
  | "National Industries"
  | "Trade Unions"
  | "Corporations"
  | "Bureaucracy"
  | "Regional Authorities"
  | "Identity Blocs"
  | "Warlords"
  | "Knowledge Sector"
  | "Financial Sector"
  | "Agricultural Sector";

/**
 * Control point type by position, from Terra Invicta's table. Index 0 is the Executive;
 * Terra Invicta counts positions from the right, so its "2nd" is our index 1.
 */
export function controlPointType(nation: NationState, index: number): ControlPointType {
  const gov = nation.democracy;
  const edu = nation.education;
  const coh = nation.cohesion;
  switch (index) {
    case 0:
      return "Executive";
    case 1:
      if (gov >= 5) return "Legislature";
      if (edu >= 6) return coh >= 7 ? "Party" : "Oligarchs";
      return "Aristocracy";
    case 2:
      if (gov < 5) return "Security Apparatus";
      return edu >= 7 ? "Mass Media" : "Religion";
    case 3:
      if (gov < 4) return "National Industries";
      if (nation.inequality < 3.5 && gdpPerCapita(nation) > 10 && edu > 7) return "Trade Unions";
      return "Corporations";
    case 4:
      if (coh > 6) return "Bureaucracy";
      if (coh > 3) return "Regional Authorities";
      if (coh > 1 || nation.unrest < 7) return "Identity Blocs";
      return "Warlords";
    default:
      // Defense Sector (rivals) and Extractive Sector (resource regions) need systems we don't have yet.
      if (gov > 9 && edu > 9) return "Knowledge Sector";
      if (gov > 6 && edu > 7) return "Financial Sector";
      return "Agricultural Sector";
  }
}

/** Restarts the executive's consolidation clock in every nation whose executive changed hands. */
export function trackExecutives(state: GameState): void {
  for (const nation of state.nations) {
    const owner = nation.controlPoints[0]?.owner ?? null;
    if (nation.executiveHold.factionId !== owner) nation.executiveHold = { factionId: owner, since: state.dayIndex, seized: false };
  }
}

/** Taking the executive by force (a coup or war) consolidates it at once. */
export function seizeExecutive(state: GameState, nation: NationState): void {
  const owner = nation.controlPoints[0]?.owner ?? null;
  nation.executiveHold = { factionId: owner, since: state.dayIndex, seized: owner !== null };
}

/** Days until the executive's holder consolidates control: 0 once they have. */
export function consolidationDaysLeft(state: GameState, content: Content, nation: NationState): number {
  const hold = nation.executiveHold;
  const owner = nation.controlPoints[0]?.owner ?? null;
  const days = content.rules.diplomacy.consolidationDays;
  if (hold.factionId !== owner) return days;
  return hold.seized ? 0 : Math.max(0, hold.since + days - state.dayIndex);
}

/**
 * Terra Invicta's consolidated executive control: the faction holds the executive CP and
 * either seized the nation by force or has held the executive for rules.diplomacy.consolidationDays.
 */
export function isConsolidated(state: GameState, content: Content, nation: NationState, factionId: string): boolean {
  return nation.controlPoints[0]?.owner === factionId && consolidationDaysLeft(state, content, nation) === 0;
}

export function isDisabled(state: GameState, nation: NationState, index: number): boolean {
  return (nation.controlPoints[index]?.disabledUntil ?? 0) > state.dayIndex;
}

export function isDefended(state: GameState, nation: NationState, index: number): boolean {
  return (nation.controlPoints[index]?.defendedUntil ?? 0) > state.dayIndex;
}

/** True when the faction holds a working (not disabled) CP of this type in the nation. */
export function ownsActiveType(state: GameState, nation: NationState, factionId: string, type: ControlPointType): boolean {
  return nation.controlPoints.some((cp, i) => cp.owner === factionId && !isDisabled(state, nation, i) && controlPointType(nation, i) === type);
}

/**
 * Adds or removes CPs when GDP crosses a threshold. A new CP takes the next free position
 * and goes to the executive's faction; a shrinking nation loses its last position first.
 */
export function syncControlPointCount(content: Content, nation: NationState): void {
  if (nation.capitalId === null) return;
  const wanted = controlPointCount(content, nation.gdp).value;
  const cps = nation.controlPoints;
  while (cps.length < wanted) cps.push({ owner: cps[0]?.owner ?? null, executive: cps.length === 0, disabledUntil: 0, defendedUntil: 0 });
  while (cps.length > wanted) cps.pop();
}
