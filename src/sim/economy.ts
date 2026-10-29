// The national economy (SPEC 2.6.3): investment points, priorities and their effects,
// following Terra Invicta's current release (SPEC D11, D13). Sources and the few inferred
// values are listed in docs/formulas.md.
//
// Determinism note: only + − × ÷, Math.sqrt/floor/round/min/max and detmath.ts helpers.

import type { Content, PriorityDef } from "./content";
import { integrate } from "./claims";
import { environmentCleanup, nationGdpDamage, nuclearTestAerosols, spoilsPollution, temperatureAnomaly, vulnerabilities } from "./climate";
import { advisorBonus, councilIncome } from "./councilors";
import { detPow } from "./detmath";
import { federationEconomyBonus, hasSharedSpaceProgram, sharedOutputs } from "./federation";
import { FormulaBuilder, type Breakdown } from "./formula";
import { addLog, factionState, nationDef } from "./lookup";
import { equipNavy, nationArmies, navyCount, raiseArmy } from "./military";
import { nationRegions } from "./territory";
import { applyPropaganda } from "./missions";
import { controlPointType, gdpPerCapita, isDisabled, ownsActiveType } from "./nation";
import { globalModifierProduct, modifierProduct, priorityBonus } from "./research";
import { pick } from "./rng";
import type { GameState, LaunchSite, NationState } from "./state";

/**
 * Terra Invicta's population scaling: stat changes are given for a nation of 50 million
 * people and are multiplied by (50M / population)^0.35, so big nations change slowly.
 */
export function populationScale(content: Content, nation: NationState): number {
  const p = content.rules.populationScaling;
  return detPow(p.referenceMillions / Math.max(nation.population, 0.001), p.exponent);
}

/**
 * Monthly IP: GDP^0.35 ($B), less 1% per 0.1 unrest above 2 (max 80%), less army and navy
 * upkeep. Armies away from their headquarters cost more.
 */
export function monthlyInvestment(state: GameState, content: Content, nation: NationState): Breakdown {
  const r = content.rules.investment;
  const f = new FormulaBuilder().add(`GDP^${r.gdpExponent}`, detPow(Math.max(nation.gdp, 0), r.gdpExponent));
  const penalty = Math.min(r.maxUnrestPenalty, Math.max(0, (nation.unrest - r.unrestThreshold) * r.unrestPenaltyPerPoint));
  if (penalty > 0) f.mul("Unrest", 1 - penalty);
  const armies = nationArmies(state, nation.id);
  const atHome = armies.filter((a) => !a.move && a.regionId === a.homeRegionId).length;
  if (atHome > 0) f.add("Army upkeep (at home)", -atHome * r.armyUpkeep);
  if (armies.length > atHome) f.add("Army upkeep (deployed)", -(armies.length - atHome) * content.rules.military.deployedArmyUpkeep);
  const navies = navyCount(state, nation.id);
  if (navies > 0) f.add("Navy upkeep", -navies * r.navyUpkeep);
  const advice = advisorBonus(state, nation.id, "administration");
  if (advice > 0) f.mul("Advisors' Administration", 1 + advice / 100);
  return f.build({ min: 0, max: Infinity });
}

/** Whether the nation may invest in a priority right now (Terra Invicta's requirements). */
export function priorityAvailable(state: GameState, content: Content, nation: NationState, id: string): boolean {
  const e = content.rules.priorityEffects;
  switch (id) {
    case "military":
    case "oppression":
      return nation.militaryFounded;
    case "boost":
    case "mission-control":
      return hasSharedSpaceProgram(state, nation);
    case "found-space-program":
      return !nation.spaceProgram;
    case "found-military":
      return !nation.militaryFounded;
    case "build-army": {
      const armies = nationArmies(state, nation.id).length;
      return nation.militaryFounded && nation.population > e.buildArmy.populationBase + e.buildArmy.populationPerArmy * armies && nationRegions(state, content, nation.id).length > armies;
    }
    case "build-navy": {
      const n = e.buildNavy;
      const cps = nation.controlPoints.length;
      const navies = navyCount(state, nation.id);
      const coastal = nationRegions(state, content, nation.id).some((r) => r.coastal);
      const bigEnough = cps >= n.minControlPoints || (cps === n.smallNationControlPoints && gdpPerCapita(nation) >= n.smallNationGdppc && navies === 0);
      return nation.militaryFounded && nationArmies(state, nation.id).length > navies && coastal && bigEnough;
    }
    case "atomic-bomb":
      return !nation.atomicBomb;
    case "nuclear-weapons":
      return nation.atomicBomb;
    default:
      return true;
  }
}

/** The weights a CP's investment follows: its owner's choice, or the nation's default. */
export function weightsForControlPoint(state: GameState, content: Content, nationId: string, owner: string | null): Record<string, number> {
  if (owner) {
    const custom = factionState(state, owner).priorityWeights[nationId];
    if (custom && Object.values(custom).some((w) => w > 0)) return custom;
  }
  return content.rules.defaultPriorities;
}

/**
 * IP per month flowing into each priority. Each CP spends an equal share of the nation's IP
 * by its holder's weights, ignoring priorities the nation can't use, and each priority gets
 * the CP's diversity bonus from the other nation-building priorities it funds.
 */
export function priorityFlows(state: GameState, content: Content, nation: NationState): Record<string, number> {
  const flows: Record<string, number> = {};
  const share = monthlyInvestment(state, content, nation).value / nation.controlPoints.length;
  const available = content.priorities.filter((p) => priorityAvailable(state, content, nation, p.id));
  const federation = federationEconomyBonus(state, content, nation);
  for (const cp of nation.controlPoints) {
    const weights = weightsForControlPoint(state, content, nation.id, cp.owner);
    const pips = (p: PriorityDef) => Math.max(0, weights[p.id] ?? 0);
    const total = available.reduce((sum, p) => sum + pips(p), 0);
    if (total <= 0) continue;
    const diversity = available.reduce((sum, p) => sum + ((p.diversity ?? 0) * pips(p)) / total, 0);
    for (const p of available) {
      if (pips(p) === 0) continue;
      // A priority can't earn a diversity bonus from itself.
      const bonus = diversity - ((p.diversity ?? 0) * pips(p)) / total;
      // Projects make the holder's IP go further in the priorities they improve.
      const projects = cp.owner ? priorityBonus(state, content, cp.owner, p.id) : 0;
      // Federation members invest in their Economy more cheaply.
      const federated = p.id === "economy" ? federation : 0;
      flows[p.id] = (flows[p.id] ?? 0) + ((share * pips(p)) / total) * (1 + bonus + projects + federated);
    }
  }
  return flows;
}

/**
 * GDP per capita (USD) one Economy completion adds: (3 + 0.5 × Government + Education) ×
 * population scale, × the techs' global economy modifiers.
 */
export function economyGdppcGain(state: GameState, content: Content, nation: NationState): number {
  const e = content.rules.priorityEffects.economy;
  const techs = globalModifierProduct(state, content, "Economy_BasePCGDPIncrease");
  return (e.gdppcBase + e.gdppcPerGovernment * nation.democracy + e.gdppcPerEducation * nation.education) * populationScale(content, nation) * techs;
}

/** Expected GDP growth over the next year at the current priorities: Economy completions plus population growth. */
export function annualGdpGrowth(state: GameState, content: Content, nation: NationState): Breakdown {
  const completions = (priorityFlows(state, content, nation)["economy"] ?? 0) * 12;
  const gdppcUsd = gdpPerCapita(nation) * 1000;
  return new FormulaBuilder()
    .add("Economy priority", gdppcUsd > 0 ? (completions * economyGdppcGain(state, content, nation)) / gdppcUsd : 0)
    .add("Population growth", nationDef(content, nation.id).populationGrowth)
    .add("Climate change", -nationGdpDamage(content, temperatureAnomaly(content, state.climate), nation, vulnerabilities(state, content, nation.id).get(nation.id)))
    .build();
}

/** Annual Boost one Boost completion adds at this latitude: 0.4 − |latitude| / 250. */
export function boostPerCompletion(content: Content, lat: number): number {
  const b = content.rules.priorityEffects.boost;
  return b.annualBase - Math.abs(lat) / b.latitudeDivisor;
}

/** Boost is built at the launch complex nearest the equator, or the region nearest it if there is none. */
function launchLatitude(state: GameState, content: Content, nation: NationState): number {
  const regions = nationRegions(state, content, nation.id);
  const sites = regions.filter((r) => nation.launchSites.some((s) => s.regionId === r.id));
  return Math.min(...(sites.length ? sites : regions).map((r) => Math.abs(r.lat)));
}

/**
 * Found Space Program builds a launch complex: at a real launch site in the nation if it
 * has one (Starbase in Mexico's data), else in a random region.
 */
function buildLaunchComplex(state: GameState, content: Content, nation: NationState): LaunchSite | null {
  const free = nationRegions(state, content, nation.id).filter((r) => !nation.launchSites.some((s) => s.regionId === r.id));
  if (free.length === 0) return null;
  const real = free.filter((r) => r.launchSite);
  const region = real.length > 0 ? real[0]! : pick(state.rng, free);
  const site = { regionId: region.id, name: region.launchSite ?? `${region.name} Launch Complex` };
  nation.launchSites.push(site);
  return site;
}

/** Spends `share` of a month's IP (1 = a whole month) and applies every completion, in content order. */
export function investNation(state: GameState, content: Content, nation: NationState, share = 1): void {
  const flows = priorityFlows(state, content, nation);
  for (const priority of content.priorities) {
    const flow = (flows[priority.id] ?? 0) * share;
    if (!flow) continue;
    let progress = (nation.ipProgress[priority.id] ?? 0) + flow;
    // Requirements are rechecked each time, e.g. Found Space Program completes only once.
    while (progress >= priority.cost && priorityAvailable(state, content, nation, priority.id)) {
      progress -= priority.cost;
      completePriority(state, content, nation, priority.id);
    }
    nation.ipProgress[priority.id] = progress;
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Inequality runs 1–9; anything past 9 comes off Cohesion and goes onto Unrest instead. */
function addInequality(nation: NationState, amount: number): void {
  const next = nation.inequality + amount;
  if (next > 9) {
    nation.cohesion = Math.max(0, nation.cohesion - (next - 9));
    nation.unrest = Math.min(10, nation.unrest + (next - 9));
  }
  nation.inequality = clamp(next, 1, 9);
}

function knowledgeEffect(content: Content, nation: NationState, scale: number): void {
  const k = content.rules.priorityEffects.knowledge;
  let gain = k.education * scale;
  if (nation.education < k.educationLow) gain *= k.educationLow / nation.education;
  else if (nation.education > k.educationHigh) gain *= k.educationHigh / nation.education;
  nation.education += gain;
  const pull = k.cohesionTowardCenter * scale;
  nation.cohesion += clamp(k.cohesionCenter - nation.cohesion, -pull, pull);
}

/** CPs held per faction, counting only working (not cracked-down) CPs. */
export function workingHolders(state: GameState, nation: NationState): Map<string, number[]> {
  const holders = new Map<string, number[]>();
  nation.controlPoints.forEach((cp, i) => {
    if (cp.owner && !isDisabled(state, nation, i)) holders.set(cp.owner, [...(holders.get(cp.owner) ?? []), i]);
  });
  return holders;
}

/** Effects of one completion of a priority. Sizes are for 50M people unless marked "not scaled". */
/** Government and Unity completions count toward reconciling a region held under a hostile claim. */
function reconcile(state: GameState, content: Content, nation: NationState): void {
  const region = integrate(state, content, nation);
  if (region) addLog(state, { nationId: nation.id, kind: "territory", text: `${region} has made its peace with belonging to ${nationDef(content, nation.id).name}.` });
}

function completePriority(state: GameState, content: Content, nation: NationState, id: string): void {
  const e = content.rules.priorityEffects;
  const s = populationScale(content, nation);
  const cpCount = nation.controlPoints.length;
  switch (id) {
    case "economy": {
      // GDP per capita rises; GDP is in billions and population in millions.
      nation.gdp += (economyGdppcGain(state, content, nation) * nation.population) / 1000;
      addInequality(nation, e.economy.inequality * s);
      break;
    }
    case "welfare":
      addInequality(nation, e.welfare.inequality * s);
      break;
    case "knowledge":
      knowledgeEffect(content, nation, s);
      break;
    case "government":
      if (nation.democracy < 10) nation.democracy = Math.min(10, nation.democracy + e.government.governmentPerEducation * nation.education * s);
      else knowledgeEffect(content, nation, s);
      reconcile(state, content, nation);
      break;
    case "unity": {
      const u = e.unity;
      const gain = Math.max(u.cohesionMin, u.cohesionBase + u.cohesionPerEducation * nation.education + u.cohesionPerGovernment * nation.democracy);
      nation.cohesion = Math.min(10, nation.cohesion + gain * s);
      nation.education = Math.max(1, nation.education + u.education * s);
      // Propaganda for each faction holding CPs: 5 per CP, a Religion CP counting as 4.
      const weightByFaction = new Map<string, number>();
      nation.controlPoints.forEach((cp, i) => {
        if (!cp.owner) return;
        const weight = controlPointType(nation, i) === "Religion" ? u.religionCpWeight : 1;
        weightByFaction.set(cp.owner, (weightByFaction.get(cp.owner) ?? 0) + weight);
      });
      for (const [factionId, weight] of weightByFaction) applyPropaganda(content, nation, factionId, u.propagandaPerCp * weight * s);
      reconcile(state, content, nation);
      break;
    }
    case "military": {
      // Not scaled; nations behind the best catch up faster.
      // Techs raise the highest Miltech any nation can reach.
      const best = Math.max(...state.nations.map((n) => n.militaryTech));
      nation.militaryTech = Math.min(Math.max(nation.militaryTech, state.research.maxMiltech), nation.militaryTech + (e.military.miltech / nation.militaryTech) * best);
      break;
    }
    case "oppression": {
      const o = e.oppression;
      nation.democracy = Math.max(0, nation.democracy + o.government * s);
      const drop = (o.unrestBase + o.unrestPerGovernment * nation.democracy) * o.unrestMultiplier * s;
      nation.unrest = clamp(nation.unrest - drop, 0, 10);
      if (nation.democracy > 5) nation.cohesion = Math.max(0, nation.cohesion + o.cohesionPerGovernmentOver5 * (nation.democracy - 5) * s);
      break;
    }
    case "spoils": {
      const sp = e.spoils;
      spoilsPollution(state, content, nation, vulnerabilities(state, content, nation.id).get(nation.id));
      addInequality(nation, sp.inequality * s);
      nation.democracy = Math.max(0, nation.democracy + sp.government * s);
      // Money (not scaled) goes to the holders of working CPs, by their fraction of the CPs.
      const money = sp.moneyPerMonthlyIp * monthlyInvestment(state, content, nation).value + sp.moneyPerMissingGovernment * (10 - nation.democracy);
      for (const [factionId, held] of workingHolders(state, nation)) {
        const aristocracy = ownsActiveType(state, nation, factionId, "Aristocracy") ? 1 + sp.aristocracyBonus : 1;
        const projects = modifierProduct(state, content, factionId, "SpoilsOutput");
        factionState(state, factionId).resources.money += ((money * held.length) / cpCount) * aristocracy * projects;
      }
      // Every holder loses support (not scaled), working CP or not.
      const counts = new Map<string, number>();
      for (const cp of nation.controlPoints) if (cp.owner) counts.set(cp.owner, (counts.get(cp.owner) ?? 0) + 1);
      for (const [factionId, held] of counts) {
        applyPropaganda(content, nation, factionId, sp.propagandaPerEduGov * (nation.education + nation.democracy) * (held / cpCount));
      }
      break;
    }
    case "funding": {
      const f = e.funding;
      nation.annualFunding = Math.min(nation.gdp * f.capPerGdpBillion, nation.annualFunding + f.annualBase + cpCount);
      break;
    }
    case "boost":
      nation.annualBoost += boostPerCompletion(content, launchLatitude(state, content, nation));
      break;
    case "mission-control":
      nation.missionControl += 1;
      break;
    case "found-space-program":
      nation.spaceProgram = true;
      nation.annualBoost += e.foundSpaceProgram.annualBoost;
      const site = buildLaunchComplex(state, content, nation);
      const where = site ? `, with a launch complex at ${site.name} (${nationRegions(state, content, nation.id).find((r) => r.id === site.regionId)!.name})` : "";
      addLog(state, { kind: "nation", text: `${nationDef(content, nation.id).name} founded a space program${where}.`, nationId: nation.id });
      break;
    case "found-military": {
      const armed = state.nations.filter((n) => n.militaryFounded).map((n) => n.militaryTech);
      nation.militaryFounded = true;
      nation.militaryTech = Math.max(e.foundMilitary.minMiltech, ...armed);
      addLog(state, { kind: "nation", text: `${nationDef(content, nation.id).name} founded a military.`, nationId: nation.id });
      break;
    }
    case "build-army":
      raiseArmy(state, content, nation.id);
      break;
    case "build-navy":
      equipNavy(state, content, nation.id);
      break;
    case "atomic-bomb":
      // Terra Invicta also charges each holder an atrocity; atrocities aren't modelled yet.
      nation.atomicBomb = true;
      nation.nukes += 1;
      nuclearTestAerosols(state, content);
      addLog(state, { kind: "nation", text: `${nationDef(content, nation.id).name} developed an atomic bomb.`, nationId: nation.id });
      break;
    case "nuclear-weapons":
      nation.nukes += 1;
      nuclearTestAerosols(state, content);
      break;
    case "environment":
      environmentCleanup(state, content, nation);
      break;
    default:
    // Content may add priorities before their effects exist; they are no-ops until then.
  }
}

/**
 * Pays `share` of a month of the nation's Funding and Boost (its share of its federation's,
 * if it is in one) to the holders of its working CPs, each CP taking an equal share, and adds
 * each holder's share of its Mission Control. A cracked-down CP's share is lost.
 */
export function payNationOutputs(state: GameState, content: Content, nation: NationState, share = 1): void {
  const cpCount = nation.controlPoints.length;
  const outputs = sharedOutputs(state, content, nation);
  for (const [factionId, held] of workingHolders(state, nation)) {
    const fraction = held.length / cpCount;
    const resources = factionState(state, factionId).resources;
    const financial = ownsActiveType(state, nation, factionId, "Financial Sector") ? 1 + content.rules.priorityEffects.funding.financialSectorBonus : 1;
    resources.money += (outputs.annualFunding / 12) * share * fraction * financial;
    resources.boost += (outputs.annualBoost / 12) * share * fraction;
    resources.missionControl += nation.missionControl * fraction;
  }
}

/**
 * A faction's expected monthly Money, Boost and Ops at current priorities: its Funding and Boost
 * shares, plus the Spoils money its CPs would collect if the Spoils priority keeps its pace.
 * Ops come only from councilors.
 */
export function factionMonthlyIncome(state: GameState, content: Content, factionId: string): { money: Breakdown; boost: Breakdown; ops: Breakdown } {
  const sp = content.rules.priorityEffects.spoils;
  const spoilsCost = content.priorities.find((p) => p.id === "spoils")?.cost ?? 1;
  let funding = 0;
  let spoils = 0;
  let boost = 0;
  for (const nation of state.nations) {
    const held = workingHolders(state, nation).get(factionId);
    if (!held) continue;
    const fraction = held.length / nation.controlPoints.length;
    const financial = ownsActiveType(state, nation, factionId, "Financial Sector") ? 1 + content.rules.priorityEffects.funding.financialSectorBonus : 1;
    const outputs = sharedOutputs(state, content, nation);
    funding += (outputs.annualFunding / 12) * fraction * financial;
    boost += (outputs.annualBoost / 12) * fraction;
    const completions = (priorityFlows(state, content, nation)["spoils"] ?? 0) / spoilsCost;
    if (completions > 0) {
      const perCompletion = sp.moneyPerMonthlyIp * monthlyInvestment(state, content, nation).value + sp.moneyPerMissingGovernment * (10 - nation.democracy);
      const aristocracy = ownsActiveType(state, nation, factionId, "Aristocracy") ? 1 + sp.aristocracyBonus : 1;
      spoils += completions * perCompletion * fraction * aristocracy;
    }
  }
  return {
    money: new FormulaBuilder()
      .add("Funding", funding)
      .add("Spoils (expected)", spoils)
      .add("Councilors' traits and orgs", councilIncome(content, factionState(state, factionId), "money"))
      .build(),
    boost: new FormulaBuilder()
      .add("Nations' Boost", boost)
      .add("Councilors' traits and orgs", councilIncome(content, factionState(state, factionId), "boost"))
      .build(),
    ops: new FormulaBuilder().add("Councilors' traits and orgs", councilIncome(content, factionState(state, factionId), "ops")).build(),
  };
}
