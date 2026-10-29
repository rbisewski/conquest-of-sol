// Control point missions, following Terra Invicta's current release (SPEC D11, D13).
// Every contested mission adds up attack and defense modifiers; the difference sets the
// odds through Terra Invicta's roll curve. docs/formulas.md lists each modifier.

import type { Content, MissionRules, SpendResource } from "./content";
import { detLn, detPow } from "./detmath";
import { availableMissions, effectiveAttributes, removeCouncilor } from "./councilors";
import { aiPolicy } from "./ai";
import { alliesOf, answerDefection, checkExecutive, enactPolicy } from "./diplomacy";
import { priorityAvailable, weightsForControlPoint } from "./economy";
import { federationOf, removeFromFederation, sameFederation } from "./federation";
import { FormulaBuilder, type Breakdown } from "./formula";
import { addLog, factionDef, factionState, nationDef, nationState } from "./lookup";
import { capitalRegion, isExtant, nationNeighbors, regionDef, regionOwner } from "./territory";
import { overCap } from "./monthly";
import {
  controlPointType,
  type ControlPointType,
  corruption,
  economySize,
  isDefended,
  isDisabled,
  ownsActiveType,
  seizeExecutive,
  unrestTarget,
} from "./nation";
import { missionBonus, modifierProduct, modifierSum, spendSteps } from "./research";
import { nextFloat, nextInt } from "./rng";
import { unrestBreakaway } from "./secession";
import { UNDECIDED, type Councilor, type FactionState, type GameState, type Mission, type NationState } from "./state";

export interface MissionOdds {
  attack: Breakdown;
  defense: Breakdown;
  /** Chance of success, 0–1. */
  chance: number;
}

export type MissionAssessment =
  | { ok: false; reason: string }
  | { ok: true; contested: false }
  | { ok: true; contested: true; odds: MissionOdds };

export type Outcome = "criticalSuccess" | "success" | "failure" | "criticalFailure";

export const MISSION_NAMES: Record<Mission["type"], string> = {
  controlNation: "Control Nation",
  defendInterests: "Defend Interests",
  crackdown: "Crackdown",
  purge: "Purge",
  coup: "Coup d'État",
  publicCampaign: "Public Campaign",
  investigateCouncilor: "Investigate Councilor",
  assassinate: "Assassinate",
  protectTarget: "Protect Target",
  inspire: "Inspire",
  stabilizeNation: "Stabilize Nation",
  increaseUnrest: "Increase Unrest",
  advise: "Advise",
  surveilLocation: "Surveil Location",
  goToGround: "Go To Ground",
  setPolicy: "Set National Policy",
};

/** Every mission type, in display order. */
export const MISSION_TYPES = Object.keys(MISSION_NAMES) as Mission["type"][];

/** Terra Invicta's roll: 50% at even odds, each point of difference worth less than the last. */
export function rollChance(rules: MissionRules, diff: number): number {
  const tail = 0.5 * detPow(rules.rollBase, Math.abs(diff));
  return diff >= 0 ? 1 - tail : tail;
}

/** Critical results are the best and worst tenth of each side of the roll. */
export function rollOutcome(rules: MissionRules, chance: number, roll: number): Outcome {
  if (roll <= chance) return roll < chance / rules.critDivisor ? "criticalSuccess" : "success";
  return roll > 1 - (1 - chance) / rules.critDivisor ? "criticalFailure" : "failure";
}

// ---------------------------------------------------------------------------
// Shared modifiers

function popularSupport(rules: MissionRules, nation: NationState, factionId: string): number {
  return (rules.supportBase + nation.democracy) * (nation.publicOpinion[factionId] ?? 0);
}

/** (Population in millions / scale)^(1/3): about 11 for China, 7 for the USA, 1.7 for 5 million people. */
function populationSize(rules: MissionRules, nation: NationState): number {
  return detPow(Math.max(nation.population, 0) / rules.publicCampaign.populationScale, 1 / 3);
}

function percent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

/** Sum of an attribute across the faction's free councilors, divided by 12. */
function councilStat(state: GameState, content: Content, factionId: string, attr: "administration" | "command"): number {
  const total = factionState(state, factionId).councilors.reduce((sum, c) => sum + (c.detainedPhases > 0 ? 0 : effectiveAttributes(content, c)[attr]), 0);
  return total / content.rules.missions.councilStatDivisor;
}

/** Distance between two factions on the ideology axes, scaled to 0–1. */
export function ideologicalDistance(content: Content, a: string, b: string): number {
  const fa = factionDef(content, a);
  const fb = factionDef(content, b);
  const dx = fa.alienStance - fb.alienStance;
  const dy = fa.means - fb.means;
  return Math.sqrt(dx * dx + dy * dy) / Math.sqrt(72);
}

/** 6 × fraction of the neighbors' CPs held (and not disabled) by the faction. */
function neighborControl(state: GameState, content: Content, nation: NationState, factionId: string): number {
  let held = 0;
  let total = 0;
  for (const id of nationNeighbors(state, content, nation.id)) {
    const n = nationState(state, id);
    n.controlPoints.forEach((cp, i) => {
      total++;
      if (cp.owner === factionId && !isDisabled(state, n, i)) held++;
    });
  }
  return total === 0 ? 0 : (content.rules.missions.neighborWeight * held) / total;
}

/**
 * 6 × fraction of the CPs held (and not disabled) by the faction in the nation's allies that
 * have a bigger GDP or share its federation.
 */
function allyControl(state: GameState, content: Content, nation: NationState, factionId: string): number {
  let held = 0;
  let total = 0;
  for (const id of alliesOf(state, nation.id)) {
    const n = nationState(state, id);
    if (n.gdp <= nation.gdp && !sameFederation(state, nation.id, id)) continue;
    n.controlPoints.forEach((cp, i) => {
      total++;
      if (cp.owner === factionId && !isDisabled(state, n, i)) held++;
    });
  }
  return total === 0 ? 0 : (content.rules.missions.allyWeight * held) / total;
}

/** Share of the nation's IP its CP holders send to Spoils. */
export function spoilsShare(state: GameState, content: Content, nation: NationState): number {
  let share = 0;
  for (const cp of nation.controlPoints) {
    const weights = weightsForControlPoint(state, content, nation.id, cp.owner);
    const total = content.priorities
      .filter((p) => priorityAvailable(state, content, nation, p.id))
      .reduce((sum, p) => sum + Math.max(0, weights[p.id] ?? 0), 0);
    if (total > 0) share += Math.max(0, weights["spoils"] ?? 0) / total;
  }
  return share / nation.controlPoints.length;
}

function cpBonus(f: FormulaBuilder, rules: MissionRules, applies: boolean, type: ControlPointType): void {
  if (applies) f.add(`${type} CP`, rules.cpTypeBonus);
}

/** A councilor of any faction, with their faction. */
export function findAnyCouncilor(state: GameState, councilorId: string): { factionId: string; councilor: Councilor } | null {
  for (const f of state.factions) {
    const councilor = f.councilors.find((c) => c.id === councilorId);
    if (councilor) return { factionId: f.id, councilor };
  }
  return null;
}

/** A faction's intel (0–1) on a councilor: full on its own. */
export function intelOn(state: GameState, factionId: string, councilorId: string): number {
  const faction = factionState(state, factionId);
  if (faction.councilors.some((c) => c.id === councilorId)) return 1;
  return faction.intel[councilorId] ?? 0;
}

/** 6 × the share of the nation's CPs a faction holds (Terra Invicta's local control points). */
function localControl(rules: MissionRules, nation: NationState, factionId: string): number {
  return (rules.neighborWeight * nation.controlPoints.filter((cp) => cp.owner === factionId).length) / nation.controlPoints.length;
}

/** Sum of an attribute over the free councilors protecting a target this turn. */
function protection(state: GameState, content: Content, targetId: string, attr: "security" | "command"): number {
  let total = 0;
  for (const id of state.protections[targetId] ?? []) {
    const found = findAnyCouncilor(state, id);
    if (found && found.councilor.detainedPhases === 0) total += effectiveAttributes(content, found.councilor)[attr];
  }
  return total;
}

/** Terra Invicta's attack bonus for intel on the target: +1 at 50%, +3 at 75%, +5 at 100%. */
function intelBonus(intel: number): number {
  return intel >= 1 ? 5 : intel >= 0.75 ? 3 : intel >= 0.5 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Targets

/**
 * The CP a Control Nation mission would take: the free CP furthest from the Executive.
 * The Executive can only be taken last, and only by a faction that already holds a CP
 * there (unless it is the nation's only CP).
 */
export function controlNationTarget(nation: NationState, factionId: string): number | null {
  const cps = nation.controlPoints;
  for (let i = cps.length - 1; i >= 1; i--) if (cps[i]!.owner === null) return i;
  if (cps[0]!.owner !== null) return null;
  return holdsCpForExecutive(nation, factionId) ? 0 : null;
}

/** Only a faction already holding a CP in the nation can take its Executive, unless that is the nation's only CP. */
export function holdsCpForExecutive(nation: NationState, factionId: string): boolean {
  return nation.controlPoints.length === 1 || nation.controlPoints.some((cp) => cp.owner === factionId);
}

// ---------------------------------------------------------------------------
// Assessment

// ---------------------------------------------------------------------------
// Costs (Terra Invicta): a fixed price, or resources spent to improve a contested mission's odds

const RESOURCE_NAMES: Record<SpendResource, string> = { money: "money", influence: "influence", ops: "ops" };

/** What the mission costs as assigned (its fixed price or its spend), or null if it is free. */
export function missionCost(content: Content, mission: Mission): { resource: SpendResource; amount: number } | null {
  const cost = content.rules.missions.costs[mission.type];
  if (!cost) return null;
  const amount = (cost.fixed ?? 0) + (cost.spend ? (mission.spend ?? 0) : 0);
  return amount > 0 ? { resource: cost.resource, amount } : null;
}

/** Attack bonus for resources spent: bonusPerDoubling × log2(1 + spent). Terra Invicta's scales "logarithmically". */
export function spendBonus(content: Content, spent: number): number {
  return spent > 0 ? (content.rules.missions.spend.bonusPerDoubling * detLn(1 + spent)) / detLn(2) : 0;
}

/** Resources committed to the faction's assigned missions, optionally leaving one councilor out. */
export function committedResources(content: Content, faction: FactionState, exceptCouncilorId?: string): Record<SpendResource, number> {
  const out: Record<SpendResource, number> = { money: 0, influence: 0, ops: 0 };
  for (const c of faction.councilors) {
    if (c.id === exceptCouncilorId || !c.mission) continue;
    const cost = missionCost(content, c.mission);
    if (cost) out[cost.resource] += cost.amount;
  }
  return out;
}

/** Whether the faction can pay for this mission on top of its other councilors' missions. */
export function checkMissionCost(state: GameState, content: Content, faction: FactionState, councilorId: string, mission: Mission): { ok: true } | { ok: false; reason: string } {
  const rule = content.rules.missions.costs[mission.type];
  const spend = mission.spend ?? 0;
  if (spend !== 0 && (!rule?.spend || !spendSteps(state, content, faction.id).includes(spend))) return { ok: false, reason: "Invalid amount to spend on this mission" };
  const cost = missionCost(content, mission);
  if (!cost) return { ok: true };
  const available = faction.resources[cost.resource] - committedResources(content, faction, councilorId)[cost.resource];
  return cost.amount <= available ? { ok: true } : { ok: false, reason: `Needs ${cost.amount} ${RESOURCE_NAMES[cost.resource]}` };
}

/**
 * Pays for every assigned mission when the council phase closes. A faction that spent
 * resources after assigning (hiring, buying orgs) drops spends it can no longer afford to
 * the largest step it can, and missions whose fixed price it can't pay are called off.
 */
export function payForMissions(state: GameState, content: Content, faction: FactionState): void {
  const steps = spendSteps(state, content, faction.id);
  for (const c of faction.councilors) {
    const mission = c.mission;
    if (!mission) continue;
    const rule = content.rules.missions.costs[mission.type];
    if (!rule) continue;
    const funds = faction.resources[rule.resource];
    const fixed = rule.fixed ?? 0;
    if (fixed > funds) {
      addLog(state, { factionId: faction.id, kind: "mission", mission: mission.type, tone: "bad", text: `${c.name} called off ${MISSION_NAMES[mission.type]}: not enough ${RESOURCE_NAMES[rule.resource]}.` });
      c.mission = null;
      continue;
    }
    if (rule.spend && (mission.spend ?? 0) > funds - fixed) mission.spend = Math.max(...steps.filter((s) => s <= funds - fixed));
    const cost = missionCost(content, mission);
    if (cost) faction.resources[cost.resource] -= cost.amount;
  }
}

/** Defend Interests' defense for a CP's holder: +10, more with projects. */
function defendValue(state: GameState, content: Content, holder: string): number {
  return content.rules.missions.defendBonus + modifierSum(state, content, holder, "DefendInterestsValue");
}

/** The faction a mission works against, if any: the CP's holder, the target councilor's faction, or the executive's. */
function defendingFaction(state: GameState, mission: Mission): string | null {
  const nation = state.nations.find((n) => n.id === mission.nationId);
  if ("cpIndex" in mission) return nation?.controlPoints[mission.cpIndex]?.owner ?? null;
  if ("targetId" in mission) return findAnyCouncilor(state, mission.targetId)?.factionId ?? null;
  if (mission.type === "coup") return nation?.controlPoints[0]?.owner ?? null;
  return null;
}

/** Adds terms to a breakdown built elsewhere. */
function withTerms(b: Breakdown, terms: { label: string; value: number }[]): Breakdown {
  const extra = terms.filter((t) => t.value !== 0);
  return extra.length === 0 ? b : { value: b.value + extra.reduce((s, t) => s + t.value, 0), terms: [...b.terms, ...extra.map((t) => ({ ...t, op: "add" as const }))] };
}

/** The mission's odds: its own modifiers, project bonuses on each side, and resources spent. */
export function assessMission(state: GameState, content: Content, factionId: string, councilor: Councilor, mission: Mission): MissionAssessment {
  const assessment = assessBase(state, content, factionId, councilor, mission);
  if (!assessment.ok || !assessment.contested) return assessment;
  const rule = content.rules.missions.costs[mission.type];
  const spent = rule?.spend ? (mission.spend ?? 0) : 0;
  const defender = defendingFaction(state, mission);
  const attack = withTerms(assessment.odds.attack, [
    { label: "Projects", value: missionBonus(state, content, factionId, mission.type, "attack") },
    ...(spent > 0 ? [{ label: `Resources spent (${spent} ${RESOURCE_NAMES[rule!.resource]})`, value: spendBonus(content, spent) }] : []),
  ]);
  const defense = withTerms(assessment.odds.defense, [{ label: "Their projects", value: defender ? missionBonus(state, content, defender, mission.type, "defense") : 0 }]);
  return { ...assessment, odds: { attack, defense, chance: rollChance(content.rules.missions, attack.value - defense.value) } };
}

function assessBase(state: GameState, content: Content, factionId: string, councilor: Councilor, mission: Mission): MissionAssessment {
  const rules = content.rules.missions;
  const nation = state.nations.find((n) => n.id === mission.nationId);
  if (!nation) return { ok: false, reason: `Unknown nation "${mission.nationId}"` };
  if (!isExtant(nation)) return { ok: false, reason: `${nationDef(content, nation.id).name} no longer exists` };
  if (councilor.detainedPhases > 0) return { ok: false, reason: "The councilor is detained" };
  if (!availableMissions(content, councilor).has(mission.type)) return { ok: false, reason: `${councilor.name} can't run ${MISSION_NAMES[mission.type]}` };
  const a = effectiveAttributes(content, councilor);

  switch (mission.type) {
    case "controlNation": {
      const target = controlNationTarget(nation, factionId);
      if (target === null) return { ok: false, reason: "No control point here can be taken" };
      // Taking control leans on public opinion more than the other missions do.
      const attack = new FormulaBuilder()
        .add("Persuasion", a.persuasion)
        .add(`Popular support (${percent(nation.publicOpinion[factionId] ?? 0)})`, rules.controlNation.supportWeight * popularSupport(rules, nation, factionId));
      cpBonus(attack, rules, ownsActiveType(state, nation, factionId, "Bureaucracy"), "Bureaucracy");
      const neighbors = neighborControl(state, content, nation, factionId);
      if (neighbors > 0) attack.add("Control points in neighbors", neighbors);
      const allies = allyControl(state, content, nation, factionId);
      if (allies > 0) attack.add("Control in larger allies / federation", allies);
      const defense = new FormulaBuilder().add("Size of national economy", economySize(content, nation));
      return contested(rules, attack.build(), defense.build());
    }

    case "defendInterests": {
      const own = nation.controlPoints.some((cp, i) => cp.owner === factionId && !isDisabled(state, nation, i));
      if (!own) return { ok: false, reason: "We hold no working control point here" };
      return { ok: true, contested: false };
    }

    case "crackdown": {
      const cp = nation.controlPoints[mission.cpIndex];
      if (!cp || !cp.owner || cp.owner === factionId) return { ok: false, reason: "Target an enemy control point" };
      if (isDisabled(state, nation, mission.cpIndex)) return { ok: false, reason: "That control point is already cracked down" };
      const target = cp.owner;
      const attack = new FormulaBuilder()
        .add("Investigation", a.investigation)
        .add(`Popular support (${percent(nation.publicOpinion[factionId] ?? 0)})`, popularSupport(rules, nation, factionId));
      cpBonus(attack, rules, ownsActiveType(state, nation, factionId, "Security Apparatus"), "Security Apparatus");
      const over = overCap(state, content, factionState(state, target));
      if (over > 0) attack.add("Target over control cap", over / rules.overcapDivisor);
      const defense = new FormulaBuilder()
        .add("Target council Administration / 12", councilStat(state, content, target, "administration"))
        .add("Size of national economy", economySize(content, nation))
        .add(`Defender's popular support (${percent(nation.publicOpinion[target] ?? 0)})`, popularSupport(rules, nation, target));
      if (isDefended(state, nation, mission.cpIndex)) defense.add("Defend Interests", defendValue(state, content, target));
      return contested(rules, attack.build(), defense.build());
    }

    case "purge": {
      const cp = nation.controlPoints[mission.cpIndex];
      if (!cp || !cp.owner || cp.owner === factionId) return { ok: false, reason: "Target an enemy control point" };
      const target = cp.owner;
      const isExec = mission.cpIndex === 0;
      if (isExec && !holdsCpForExecutive(nation, factionId)) return { ok: false, reason: "We need a control point here before we can take the Executive" };
      const disabled = isDisabled(state, nation, mission.cpIndex);
      const attack = new FormulaBuilder()
        .add("Espionage", a.espionage)
        .add(`Popular support (${percent(nation.publicOpinion[factionId] ?? 0)})`, popularSupport(rules, nation, factionId));
      const neighbors = neighborControl(state, content, nation, factionId);
      if (neighbors > 0) attack.add("Control points in neighbors", neighbors);
      const allies = allyControl(state, content, nation, factionId);
      if (allies > 0) attack.add("Control in larger allies / federation", allies);
      cpBonus(attack, rules, isExec && ownsActiveType(state, nation, factionId, "Legislature"), "Legislature");
      cpBonus(attack, rules, !isExec && ownsActiveType(state, nation, factionId, "Party"), "Party");
      const over = overCap(state, content, factionState(state, target));
      if (over > 0) attack.add("Target over control cap", over / rules.overcapDivisor);

      const defense = new FormulaBuilder().add("Mission difficulty", rules.purge.difficulty);
      if (!disabled) defense.add("Target council Administration / 12", councilStat(state, content, target, "administration"));
      defense
        .add("Size of national economy", economySize(content, nation))
        .add("Difference in ideology", rules.ideologyWeight * ideologicalDistance(content, target, factionId));
      if (disabled) {
        const others = nation.controlPoints.filter((c, i) => i !== mission.cpIndex && c.owner === target && isDisabled(state, nation, i)).length;
        defense.add("Cracked down", rules.purge.disabledBase + rules.purge.disabledPerExtra * others);
      }
      if (isDefended(state, nation, mission.cpIndex)) defense.add("Defend Interests", defendValue(state, content, target));
      cpBonus(defense, rules, isExec && ownsActiveType(state, nation, target, "Legislature"), "Legislature");
      cpBonus(defense, rules, !isExec && ownsActiveType(state, nation, target, "Party"), "Party");
      defense.add(`Defender's popular support (${percent(nation.publicOpinion[target] ?? 0)})`, popularSupport(rules, nation, target));
      return contested(rules, attack.build(), defense.build());
    }

    case "coup": {
      const exec = nation.controlPoints[0]!.owner;
      if (exec === factionId) return { ok: false, reason: "We already hold the executive" };
      const corrupt = corruption(content, nation).value;
      const spoils = spoilsShare(state, content, nation);
      const attack = new FormulaBuilder()
        .add("Command", a.command)
        .add(`Popular support (${percent(nation.publicOpinion[factionId] ?? 0)})`, popularSupport(rules, nation, factionId))
        .add("National unrest", nation.unrest);
      if (corrupt > spoils) attack.add("Elite dissatisfaction", rules.coup.eliteDissatisfactionWeight * (corrupt - spoils));
      cpBonus(attack, rules, ownsActiveType(state, nation, factionId, "Oligarchs"), "Oligarchs");

      const defense = new FormulaBuilder().add("Mission difficulty", rules.coup.difficulty);
      if (exec) defense.add("Executive's council Command / 12", councilStat(state, content, exec, "command"));
      defense.add("National cohesion", nation.cohesion);
      if (spoils > corrupt) defense.add("Elite satisfaction", rules.coup.eliteSatisfactionWeight * (spoils - corrupt));
      defense.add("Democracy", nation.democracy).add("Size of national economy", economySize(content, nation));
      const defended = nation.controlPoints.filter((_, i) => isDefended(state, nation, i)).length;
      if (defended > 0) defense.add("Defended control points", defended);
      if (exec) {
        cpBonus(defense, rules, ownsActiveType(state, nation, exec, "Oligarchs"), "Oligarchs");
        defense.add(`Executive's popular support (${percent(nation.publicOpinion[exec] ?? 0)})`, popularSupport(rules, nation, exec));
      }
      return contested(rules, attack.build(), defense.build());
    }

    case "publicCampaign": {
      const attack = new FormulaBuilder().add("Persuasion", a.persuasion);
      const defense = new FormulaBuilder().add("Size of population", populationSize(rules, nation));
      return contested(rules, attack.build(), defense.build());
    }

    case "investigateCouncilor":
    case "assassinate": {
      const found = findAnyCouncilor(state, mission.targetId);
      if (!found || found.factionId === factionId) return { ok: false, reason: "Target another faction's councilor" };
      if (state.hidden.includes(mission.targetId)) return { ok: false, reason: "That councilor has gone to ground" };
      const target = found.councilor;
      const intel = intelOn(state, factionId, target.id);
      const where = nationState(state, target.locationId);
      const whereName = nationDef(content, where.id).name;
      const t = effectiveAttributes(content, target);
      if (mission.type === "investigateCouncilor") {
        if (intel < rules.intelToLocate) return { ok: false, reason: "We haven't located that councilor" };
        if (intel >= 1) return { ok: false, reason: "We already know everything about them" };
        const attack = new FormulaBuilder().add("Investigation", a.investigation);
        const ours = localControl(rules, where, factionId);
        if (ours > 0) attack.add(`Our control points in ${whereName}`, ours);
        if (target.detainedPhases > 0) attack.add("Target is detained", 4);
        const defense = new FormulaBuilder().add("Target's Espionage", t.espionage);
        const guards = protection(state, content, target.id, "security");
        if (guards > 0) defense.add("Protectors' Security", guards);
        const theirs = localControl(rules, where, found.factionId);
        if (theirs > 0) defense.add(`Their control points in ${whereName}`, theirs);
        return contested(rules, attack.build(), defense.build());
      }
      if (intel < rules.intelToTarget) return { ok: false, reason: `Needs ${Math.round(rules.intelToTarget * 100)}% intel on the target` };
      const attack = new FormulaBuilder().add("Espionage", a.espionage);
      cpBonus(attack, rules, ownsActiveType(state, where, factionId, "Security Apparatus"), "Security Apparatus");
      if (intelBonus(intel) > 0) attack.add(`Intel on target (${Math.round(intel * 100)}%)`, intelBonus(intel));
      if (target.detainedPhases > 0) attack.add("Target is detained", 4);
      const defense = new FormulaBuilder().add("Mission difficulty", rules.assassinate.difficulty).add("Target's Security", t.security);
      const guards = protection(state, content, target.id, "security");
      if (guards > 0) defense.add("Protectors' Security", guards);
      const theirs = localControl(rules, where, found.factionId);
      if (theirs > 0) defense.add(`Their control points in ${whereName}`, theirs);
      return contested(rules, attack.build(), defense.build());
    }

    case "protectTarget": {
      const target = factionState(state, factionId).councilors.find((c) => c.id === mission.targetId);
      if (!target) return { ok: false, reason: "Protect one of our own councilors" };
      if (target.id === councilor.id) return { ok: false, reason: "A councilor can't protect themselves" };
      return { ok: true, contested: false };
    }

    case "inspire": {
      // Terra Invicta: another of our free councilors; Persuasion and influence spent against 8.
      const target = factionState(state, factionId).councilors.find((c) => c.id === mission.targetId);
      if (!target) return { ok: false, reason: "Inspire one of our own councilors" };
      if (target.id === councilor.id) return { ok: false, reason: "A councilor can't inspire themselves" };
      if (target.detainedPhases > 0) return { ok: false, reason: "That councilor is detained" };
      const attack = new FormulaBuilder().add("Persuasion", a.persuasion);
      const defense = new FormulaBuilder().add("Mission difficulty", rules.inspire.difficulty);
      return contested(rules, attack.build(), defense.build());
    }

    case "stabilizeNation": {
      if (nation.unrest <= 0) return { ok: false, reason: "There's no unrest to calm" };
      const attack = new FormulaBuilder()
        .add("Command", a.command)
        .add(`Popular support (${percent(nation.publicOpinion[factionId] ?? 0)})`, popularSupport(rules, nation, factionId))
        .add("National cohesion", nation.cohesion);
      const defense = new FormulaBuilder().add("Size of population", populationSize(rules, nation));
      return contested(rules, attack.build(), defense.build());
    }

    case "increaseUnrest": {
      // Terra Invicta: Command and popular support against the nation's cohesion, its size and
      // the executive's support. Identity Blocs and Warlords CPs help the agitator.
      const region = content.regions.find((r) => r.id === mission.regionId);
      if (!region || regionOwner(state, region.id) !== mission.nationId) return { ok: false, reason: "Choose a region" };
      if (nation.unrest >= 10) return { ok: false, reason: "Unrest can't rise any further" };
      const attack = new FormulaBuilder()
        .add("Command", a.command)
        .add(`Popular support (${percent(nation.publicOpinion[factionId] ?? 0)})`, popularSupport(rules, nation, factionId));
      cpBonus(attack, rules, ownsActiveType(state, nation, factionId, "Identity Blocs"), "Identity Blocs");
      cpBonus(attack, rules, ownsActiveType(state, nation, factionId, "Warlords"), "Warlords");
      const defense = new FormulaBuilder().add("National cohesion", nation.cohesion).add("Size of population", populationSize(rules, nation));
      const exec = nation.controlPoints[0]!.owner;
      if (exec && exec !== factionId) defense.add(`Executive's popular support (${percent(nation.publicOpinion[exec] ?? 0)})`, popularSupport(rules, nation, exec));
      return contested(rules, attack.build(), defense.build());
    }

    case "surveilLocation":
    case "goToGround": {
      const region = content.regions.find((r) => r.id === mission.regionId);
      if (!region || regionOwner(state, region.id) !== mission.nationId) return { ok: false, reason: "Choose a region" };
      return { ok: true, contested: false };
    }

    case "advise":
      return { ok: true, contested: false };

    case "setPolicy": {
      const check = checkExecutive(state, content, factionId, nation.id);
      return check.ok ? { ok: true, contested: false } : check;
    }
  }
}

function contested(rules: MissionRules, attack: Breakdown, defense: Breakdown): MissionAssessment {
  return { ok: true, contested: true, odds: { attack, defense, chance: rollChance(rules, attack.value - defense.value) } };
}

// ---------------------------------------------------------------------------
// Resolution

/**
 * Shifts public opinion toward (or away from) a faction. Positive strength draws first from
 * the undecided, then from other factions; negative strength sends supporters back to
 * undecided. One point of strength moves rules.propaganda.opinionPerStrength of the population.
 */
export function applyPropaganda(content: Content, nation: NationState, factionId: string, strength: number): void {
  const opinion = nation.publicOpinion;
  const delta = strength * content.rules.propaganda.opinionPerStrength;
  const current = opinion[factionId] ?? 0;
  if (delta < 0) {
    const moved = Math.min(current, -delta);
    opinion[factionId] = current - moved;
    opinion[UNDECIDED] = (opinion[UNDECIDED] ?? 0) + moved;
    return;
  }
  let need = delta;
  const fromUndecided = Math.min(need, opinion[UNDECIDED] ?? 0);
  opinion[UNDECIDED] = (opinion[UNDECIDED] ?? 0) - fromUndecided;
  need -= fromUndecided;
  if (need > 0) {
    const others = content.factions.filter((f) => f.id !== factionId);
    const pool = others.reduce((sum, f) => sum + (opinion[f.id] ?? 0), 0);
    if (pool > 0) {
      const take = Math.min(need, pool);
      for (const f of others) opinion[f.id] = (opinion[f.id] ?? 0) * (1 - take / pool);
      need -= take;
    }
  }
  opinion[factionId] = current + delta - need;
}

const clampStat = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Uniform random value in [lo, hi] from the game RNG. */
function uniform(state: GameState, lo: number, hi: number): number {
  return lo + (hi - lo) * nextFloat(state.rng);
}

export interface Resolution {
  outcome: Outcome | "uncontested" | "invalid";
  chance?: number;
  text: string;
  /** Where the councilor ends up: the mission's region (see missionRegion). */
  regionId: string;
}

/**
 * The region a mission takes the councilor to: its target region, the region of the councilor
 * it targets, the councilor's own region for a mission in the nation they are already in, or
 * else the nation's capital region.
 */
export function missionRegion(state: GameState, content: Content, councilor: Councilor, mission: Mission): string {
  if ("regionId" in mission) return mission.regionId;
  if ("targetId" in mission) {
    const target = findAnyCouncilor(state, mission.targetId);
    if (target) return target.councilor.regionId;
  }
  return councilor.locationId === mission.nationId ? councilor.regionId : capitalRegion(state, content, mission.nationId).id;
}

export function resolveMission(state: GameState, content: Content, factionId: string, councilor: Councilor, mission: Mission): Resolution {
  const rules = content.rules.missions;
  // Missions aimed at a councilor follow them to wherever they are now.
  const target = "targetId" in mission ? findAnyCouncilor(state, mission.targetId) : null;
  if (target) mission.nationId = target.councilor.locationId;
  const regionId = missionRegion(state, content, councilor, mission);
  const nation = nationState(state, mission.nationId);
  const nationName = nationDef(content, nation.id).name;
  const who = `${councilor.name} (${factionDef(content, factionId).name})`;
  const assessment = assessMission(state, content, factionId, councilor, mission);
  if (!assessment.ok) {
    const resolution: Resolution = { outcome: "invalid", regionId, text: `${who} abandoned ${MISSION_NAMES[mission.type]} in ${nationName}: ${assessment.reason}.` };
    addLog(state, { factionId, nationId: nation.id, kind: "mission", mission: mission.type, tone: "bad", text: resolution.text });
    return resolution;
  }

  if (!assessment.contested) {
    let text: string;
    if (mission.type === "setPolicy") {
      // A player picks the policy now, with the clock stopped (choosePolicy); the AI at once.
      if (factionState(state, factionId).isPlayer) {
        state.policyChoices.push({ factionId, nationId: nation.id, councilorId: councilor.id });
        text = `${who} is ready to set the national policy of ${nationName}.`;
      } else {
        const policy = aiPolicy(state, content, factionId, nation.id);
        text = policy ? `${who}: ${enactPolicy(state, content, nation.id, policy)}` : `${who} found no national policy worth setting in ${nationName}.`;
      }
    } else if (mission.type === "protectTarget") {
      (state.protections[mission.targetId] ??= []).push(councilor.id);
      const name = target!.councilor.id === councilor.id ? "themself" : target!.councilor.name;
      text = `${who} is protecting ${name} in ${nationName} until the next council phase.`;
    } else if (mission.type === "surveilLocation") {
      const watchers = (state.surveillance[mission.regionId] ??= []);
      if (!watchers.includes(factionId)) watchers.push(factionId);
      text = `${who} is watching for enemy councilors in and around ${regionDef(content, mission.regionId).name}, ${nationName}, until the next council phase.`;
    } else if (mission.type === "goToGround") {
      text = `${who} went to ground in ${regionDef(content, mission.regionId).name}, ${nationName}.${goToGround(state, content, factionId, councilor)}`;
    } else if (mission.type === "advise") {
      const e = effectiveAttributes(content, councilor);
      (state.advisors[nation.id] ??= []).push({ councilorId: councilor.id, administration: e.administration, command: e.command });
      text = `${who} is advising the government of ${nationName} until the next council phase.`;
    } else {
      defendInterests(state, content, factionId, nation);
      text = `${who} defended our interests in ${nationName}.`;
    }
    councilor.xp += rules[mission.type].xp;
    addLog(state, { factionId, nationId: nation.id, kind: "mission", mission: mission.type, text });
    detectMission(state, content, factionId, councilor, mission, regionId);
    return { outcome: "uncontested", text, regionId };
  }

  const { chance } = assessment.odds;
  const outcome = rollOutcome(rules, chance, nextFloat(state.rng));
  const success = outcome === "success" || outcome === "criticalSuccess";
  const missionRules = rules[mission.type];
  councilor.xp += success ? missionRules.xp : Math.ceil(missionRules.xp / 2);
  const odds = `${Math.round(chance * 100)}%`;
  let text: string;

  switch (mission.type) {
    case "controlNation": {
      if (success) {
        const index = controlNationTarget(nation, factionId)!;
        nation.controlPoints[index]!.owner = factionId;
        text = `${who} took the ${controlPointType(nation, index)} control point in ${nationName}.`;
      } else text = `${who} failed to take control in ${nationName} (${odds}).`;
      break;
    }
    case "crackdown": {
      const cp = nation.controlPoints[mission.cpIndex]!;
      if (success) {
        const months = outcome === "criticalSuccess" ? rules.crackdown.critDisableMonths : rules.crackdown.disableMonths;
        cp.disabledUntil = Math.max(cp.disabledUntil, state.dayIndex) + months * 30;
        cp.defendedUntil = 0;
        text = `${who} cracked down on ${factionDef(content, cp.owner!).name}'s ${controlPointType(nation, mission.cpIndex)} control point in ${nationName}.`;
      } else text = `${who}'s crackdown in ${nationName} failed (${odds}).`;
      break;
    }
    case "purge": {
      const cp = nation.controlPoints[mission.cpIndex]!;
      if (success) {
        const previous = factionDef(content, cp.owner!).name;
        cp.owner = factionId;
        cp.disabledUntil = 0;
        cp.defendedUntil = 0;
        text = `${who} purged ${previous} from the ${controlPointType(nation, mission.cpIndex)} control point in ${nationName}.`;
      } else text = `${who}'s purge in ${nationName} failed (${odds}).`;
      break;
    }
    case "coup": {
      if (success) {
        throwCoup(state, content, nation, factionId, outcome === "criticalSuccess");
        text = `${who} overthrew the government of ${nationName}!`;
      } else text = `${who}'s coup in ${nationName} failed (${odds}).`;
      break;
    }
    case "publicCampaign": {
      if (success) {
        // A critical success reaches twice the audience.
        const before = nation.publicOpinion[factionId] ?? 0;
        const strength = effectiveAttributes(content, councilor).persuasion * modifierProduct(state, content, factionId, "PublicCampaignStrength");
        applyPropaganda(content, nation, factionId, strength * (outcome === "criticalSuccess" ? 2 : 1));
        const gain = (nation.publicOpinion[factionId] ?? 0) - before;
        text = `${who} ran a public campaign in ${nationName}: our support rose ${(gain * 100).toFixed(1)} points to ${percent(nation.publicOpinion[factionId] ?? 0)}.`;
      } else text = `${who}'s public campaign in ${nationName} fell flat (${odds}).`;
      break;
    }
    case "investigateCouncilor": {
      const found = target!;
      const theirs = factionDef(content, found.factionId).name;
      if (success) {
        const r = rules.investigateCouncilor;
        const inv = effectiveAttributes(content, councilor).investigation;
        const gain = outcome === "criticalSuccess" ? 2 * (r.intelBase + r.intelPerInvestigation * inv) : r.intelBase + r.intelPerInvestigation * inv;
        const faction = factionState(state, factionId);
        faction.intel[found.councilor.id] = Math.min(1, (faction.intel[found.councilor.id] ?? 0) + gain);
        noticeSpotting(state, content, factionId, found.councilor);
        text = `${who} investigated ${found.councilor.name} of ${theirs} in ${nationName}: our intel on them is now ${Math.round(faction.intel[found.councilor.id]! * 100)}%.`;
      } else text = `${who}'s investigation of ${found.councilor.name} in ${nationName} turned up nothing (${odds}).`;
      break;
    }
    case "assassinate": {
      const found = target!;
      const theirs = factionDef(content, found.factionId).name;
      if (success) {
        text = `${who} assassinated ${found.councilor.name} of ${theirs} in ${nationName}.`;
        removeCouncilor(state, factionState(state, found.factionId), found.councilor);
        addLog(state, { factionId: found.factionId, nationId: nation.id, kind: "mission", mission: "assassinate", tone: "bad", text: `Our councilor ${found.councilor.name} was assassinated in ${nationName}.` });
      } else text = `${who}'s attempt on ${found.councilor.name}'s life in ${nationName} failed (${odds}).`;
      break;
    }
    case "inspire": {
      const ward = target!.councilor;
      const r = rules.inspire;
      const [lo, hi] = r.loyalty[outcome]!;
      const max = content.rules.attribute.max;
      const min = content.rules.attribute.min;
      ward.attributes.loyalty = clampStat(ward.attributes.loyalty + nextInt(state.rng, lo, hi), min, max);
      const before = ward.apparentLoyalty;
      ward.apparentLoyalty = clampStat(ward.apparentLoyalty + r.apparentLoyalty[outcome]!, min, max);
      const seen = ward.apparentLoyalty - before;
      const effect = seen > 0 ? `Their Loyalty rose by ${seen}.` : seen < 0 ? `Their Loyalty fell by ${-seen}.` : "It's hard to tell how much their Loyalty changed.";
      const lead =
        outcome === "criticalSuccess" ? `${who} greatly fired up ${ward.name}'s enthusiasm for the cause`
        : outcome === "success" ? `${who} fired up ${ward.name}'s enthusiasm for the cause`
        : outcome === "failure" ? `${who} made little impression on ${ward.name}`
        : `${who} made things worse with ${ward.name}`;
      text = `${lead} in ${nationName} (${odds}). ${effect}`;
      break;
    }
    case "stabilizeNation": {
      if (success) {
        // Weaker when unrest is already below half its resting level, as in Terra Invicta.
        const rest = unrestTarget(state, content, nation).value;
        let amount = rules.stabilizeNation.unrestReduction * (outcome === "criticalSuccess" ? 2 : 1);
        if (nation.unrest < rest / 2) amount /= 2;
        const before = nation.unrest;
        nation.unrest = Math.max(0, nation.unrest - amount);
        text = `${who} calmed ${nationName}: unrest fell from ${before.toFixed(1)} to ${nation.unrest.toFixed(1)}.`;
      } else text = `${who} failed to stabilize ${nationName} (${odds}).`;
      break;
    }
    case "increaseUnrest": {
      const region = regionDef(content, mission.regionId);
      if (success) {
        // Weaker when unrest is already above twice its resting level, as in Terra Invicta.
        const rest = unrestTarget(state, content, nation).value;
        let amount = rules.increaseUnrest.unrestIncrease * (outcome === "criticalSuccess" ? 2 : 1);
        if (nation.unrest > rest * 2) amount /= 2;
        const before = nation.unrest;
        nation.unrest = Math.min(10, nation.unrest + amount);
        const raised = (state.unrestRaised[nation.id] ??= {});
        raised[factionId] = (raised[factionId] ?? 0) + 1;
        text = `${who} stirred up ${region.name}, ${nationName}: unrest rose from ${before.toFixed(1)} to ${nation.unrest.toFixed(1)}.`;
        // It may set off a breakaway there (logged on its own).
        unrestBreakaway(state, content, factionId, region.id, outcome === "criticalSuccess");
      } else text = `${who} failed to stir up unrest in ${region.name}, ${nationName} (${odds}).`;
      break;
    }
    case "defendInterests":
    case "protectTarget":
    case "advise":
    case "surveilLocation":
    case "goToGround":
    case "setPolicy":
      text = "";
      break;
  }

  if (outcome === "criticalSuccess" && (mission.type === "controlNation" || mission.type === "purge")) {
    applyPropaganda(content, nation, factionId, rules.critSuccessPropaganda);
    text += " The public took notice.";
  }
  if (outcome === "criticalFailure") text += criticalFailure(state, content, factionId, councilor, mission, nation);
  addLog(state, { factionId, nationId: nation.id, kind: "mission", mission: mission.type, tone: success ? "good" : "bad", text });
  if (target) (state.recentTargets[factionId] ??= []).push(target.councilor.id);
  detectMission(state, content, factionId, councilor, mission, regionId);
  return { outcome, chance, text, regionId };
}

function criticalFailure(state: GameState, content: Content, factionId: string, councilor: Councilor, mission: Mission, nation: NationState): string {
  const rules = content.rules.missions;
  if (mission.type === "coup") {
    const cp = nation.controlPoints[nextInt(state.rng, 0, nation.controlPoints.length - 1)]!;
    if (cp.owner === null) {
      applyPropaganda(content, nation, factionId, rules.coup.critFailPropaganda);
      return " The plot became public, hurting our support.";
    }
    if (cp.owner !== factionId) {
      councilor.detainedPhases = rules.coup.detainPhases;
      return ` ${councilor.name} was detained.`;
    }
    return "";
  }
  if (mission.type === "assassinate") {
    // Terra Invicta: caught unless the target is detained or someone protects the assassin;
    // a Hard Target fights back and kills them.
    const found = findAnyCouncilor(state, mission.targetId);
    if (found?.councilor.traits.includes("hard-target")) {
      removeCouncilor(state, factionState(state, factionId), councilor);
      return ` ${councilor.name} was killed by their target.`;
    }
    if (found && found.councilor.detainedPhases === 0 && (state.protections[councilor.id]?.length ?? 0) === 0) {
      councilor.detainedPhases = rules.assassinate.detainPhases;
      return ` ${councilor.name} was caught and detained.`;
    }
    return "";
  }
  if (mission.type === "investigateCouncilor" || mission.type === "stabilizeNation" || mission.type === "inspire") return "";
  // Propaganda of strength (Persuasion − 11), capped between −1 and −11.
  applyPropaganda(content, nation, factionId, clampStat(effectiveAttributes(content, councilor).persuasion - 11, -11, -1));
  return " The botched operation hurt our public support.";
}

/**
 * Other factions may spot a councilor at work, as in Terra Invicta's detection: each faction's
 * councilors add their Investigation / 6 in the same region, / 12 elsewhere in the nation and
 * / 24 in a neighbouring region, plus its CPs in the nation, and +12 if it is surveilling the
 * region or a neighbour, against the councilor's Espionage. A success gives 10% intel (enough
 * to investigate them), a critical success 25% (enough to target them).
 */
function detectMission(state: GameState, content: Content, factionId: string, councilor: Councilor, mission: Mission, regionId: string): void {
  const rules = content.rules.missions;
  const d = rules.detection;
  const region = regionDef(content, regionId);
  const nation = nationState(state, regionOwner(state, region.id));
  const near = new Set([region.id, ...region.neighbors]);
  // Noisy missions are easier to spot, quiet ones harder.
  const espionage = effectiveAttributes(content, councilor).espionage - (rules.noise[mission.type] ?? 0);
  // A councilor killed on the mission, or gone to ground, leaves nothing to spot.
  if (!factionState(state, factionId).councilors.includes(councilor) || state.hidden.includes(councilor.id)) return;
  for (const faction of state.factions) {
    if (faction.id === factionId) continue;
    let attack = (d.cpWeight * nation.controlPoints.filter((cp) => cp.owner === faction.id).length) / nation.controlPoints.length;
    const watching = Object.entries(state.surveillance).some(([watched, watchers]) => watchers.includes(faction.id) && (near.has(watched)));
    if (watching) attack += rules.surveilLocation.detectionBonus;
    for (const c of faction.councilors) {
      if (c.detainedPhases > 0) continue;
      const weight = c.regionId === region.id ? d.sameRegion : c.locationId === nation.id ? d.sameNation : near.has(c.regionId) ? d.neighborRegion : 0;
      attack += weight * effectiveAttributes(content, c).investigation;
    }
    if (attack <= 0) continue;
    const chance = rollChance(rules, attack - espionage);
    const outcome = rollOutcome(rules, chance, nextFloat(state.rng));
    if (outcome !== "success" && outcome !== "criticalSuccess") continue;
    const intel = outcome === "criticalSuccess" ? d.critIntel : d.intel;
    const before = faction.intel[councilor.id] ?? 0;
    if (before >= intel) continue;
    faction.intel[councilor.id] = intel;
    noticeSpotting(state, content, faction.id, councilor);
    const who = intel >= rules.intelToTarget ? `${councilor.name} of ${factionDef(content, factionId).name}` : "an enemy councilor";
    addLog(state, { factionId: faction.id, nationId: nation.id, kind: "intel", tone: "good", text: `We spotted ${who} at work in ${region.name}, ${nationDef(content, nation.id).name}.` });
  }
}

/**
 * Terra Invicta's detection awareness: a councilor who has been spotted or investigated may
 * notice, rolling their Investigation against the spotting faction's council Espionage / 6.
 */
function noticeSpotting(state: GameState, content: Content, spotterId: string, councilor: Councilor): void {
  if (councilor.spottedBy.includes(spotterId)) return;
  const espionage = factionState(state, spotterId).councilors.reduce((sum, c) => sum + (c.detainedPhases > 0 ? 0 : effectiveAttributes(content, c).espionage), 0);
  const rules = content.rules.missions;
  const chance = rollChance(rules, effectiveAttributes(content, councilor).investigation - espionage / 6);
  if (nextFloat(state.rng) <= chance) councilor.spottedBy.push(spotterId);
}

/**
 * Go To Ground: hidden until the next council phase, and each faction with intel on the
 * councilor loses it with a chance of 50% + 3% × Espionage. They forget who had spotted them.
 */
function goToGround(state: GameState, content: Content, factionId: string, councilor: Councilor): string {
  const r = content.rules.missions.goToGround;
  state.hidden.push(councilor.id);
  councilor.spottedBy = [];
  const chance = r.intelLossBase + r.intelLossPerEspionage * effectiveAttributes(content, councilor).espionage;
  let lost = 0;
  for (const faction of state.factions) {
    if (faction.id === factionId || !faction.intel[councilor.id]) continue;
    if (nextFloat(state.rng) < chance) {
      delete faction.intel[councilor.id];
      lost++;
    }
  }
  return lost > 0 ? ` ${lost} faction${lost > 1 ? "s" : ""} lost track of them.` : "";
}

/**
 * Intel fades: each council phase a faction loses some intel on every councilor it didn't aim a
 * mission at since the last one. Protect Target, Go To Ground and Surveil Location end too.
 */
export function startTurnIntel(state: GameState, content: Content): void {
  const decay = content.rules.missions.intelDecay;
  for (const faction of state.factions) {
    const kept = new Set(state.recentTargets[faction.id] ?? []);
    for (const [id, value] of Object.entries(faction.intel)) {
      if (kept.has(id)) continue;
      if (value - decay <= 0) delete faction.intel[id];
      else faction.intel[id] = value - decay;
    }
  }
  state.recentTargets = {};
  state.hidden = [];
  state.surveillance = {};
}

/** Defend Interests: shares (90 × CPs + 360) days of defense so expiry dates end up as close as possible. */
function defendInterests(state: GameState, content: Content, factionId: string, nation: NationState): void {
  const r = content.rules.missions.defendInterests;
  const mine = nation.controlPoints
    .map((cp, i) => ({ cp, i }))
    .filter(({ cp, i }) => cp.owner === factionId && !isDisabled(state, nation, i));
  let budget = r.daysPerCp * mine.length + r.baseDays;
  for (const { cp } of mine) cp.defendedUntil = Math.max(cp.defendedUntil, state.dayIndex);
  // Water-fill: repeatedly raise the earliest expiries to the next level.
  mine.sort((a, b) => a.cp.defendedUntil - b.cp.defendedUntil || a.i - b.i);
  for (let k = 1; k <= mine.length && budget > 0; k++) {
    const level = mine[k - 1]!.cp.defendedUntil;
    const next = k < mine.length ? mine[k]!.cp.defendedUntil : Infinity;
    const raise = Math.min(next - level, budget / k);
    for (let j = 0; j < k; j++) mine[j]!.cp.defendedUntil += raise;
    budget -= raise * k;
  }
  for (const { cp } of mine) cp.defendedUntil = Math.floor(cp.defendedUntil);
}

/**
 * Terra Invicta's coup: every CP not held by the plotters is emptied; they then take the
 * free CP furthest from the Executive (two on a critical success), and every CP closer to
 * the Executive than an empty one is emptied too. The nation's stats are shaken up and it
 * leaves its federation, whose lead nation may go to war over it (answerDefection).
 */
function throwCoup(state: GameState, content: Content, nation: NationState, factionId: string, critical: boolean): void {
  const cps = nation.controlPoints;
  for (const cp of cps) {
    if (cp.owner !== factionId) {
      cp.owner = null;
      cp.disabledUntil = 0;
      cp.defendedUntil = 0;
    }
  }
  const empty = cps.map((cp, i) => (cp.owner === null ? i : -1)).filter((i) => i >= 0);
  if (empty.length === 1 && critical && cps.length >= 2) {
    cps[0]!.owner = factionId;
    cps[1]!.owner = factionId;
  } else if (empty.length > 0) {
    const first = Math.max(...empty);
    cps[first]!.owner = factionId;
    if (critical && first > 0) cps[first - 1]!.owner = factionId;
  }
  // Empty every CP "to the right of" (closer to the Executive than) an empty CP.
  let lastEmpty = -1;
  cps.forEach((cp, i) => {
    if (cp.owner === null) lastEmpty = Math.max(lastEmpty, i);
  });
  for (let i = 0; i < lastEmpty; i++) cps[i]!.owner = null;

  nation.lastCoupDay = state.dayIndex;
  if (cps[0]!.owner === factionId) seizeExecutive(state, nation);
  nation.democracy = clampStat(nation.democracy + uniform(state, -2, 1), 0, 10);
  nation.unrest = clampStat(nation.unrest + uniform(state, -3, 0), 0, 10);
  nation.cohesion = clampStat(nation.cohesion + uniform(state, -1, 1), 0, 10);
  nation.gdp *= 1 - uniform(state, 0, 0.1);
  const leaderId = federationOf(state, nation.id)?.leaderId;
  const federation = removeFromFederation(state, content, nation.id);
  if (federation) {
    addLog(state, { nationId: nation.id, kind: "diplomacy", text: `After the coup, ${nationDef(content, nation.id).name} left the ${federation.name}.` });
    const answer = answerDefection(state, content, nation.id, leaderId!, federation.name);
    if (answer) addLog(state, { nationId: leaderId, kind: "war", text: answer });
  }
}
