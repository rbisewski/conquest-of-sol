// Relations between nations (SPEC 2.6.4) after Terra Invicta's Foreign Relations rules
// (SPEC D11, D13): alliances, rivalries, wars, the national policies that start and end
// wars, join or leave federations, or move regions (Demand Territory, Peaceful Unification,
// independence), and War
// Conquest when an army takes a capital: the victors take the regions they claim, and
// whatever is left gets a new government.
//
// Determinism note: only + − × ÷, Math.sqrt/floor/round/min/max and detmath.ts helpers.

import { foreignClaims, hasClaim, inheritClaims, peacefulClaim, takeRegion } from "./claims";
import type { Content } from "./content";
import { addMember, createFederation, federationOf, removeFromFederation, sameFederation } from "./federation";
import { addLog, factionDef, factionState, nationDef, nationState, newId } from "./lookup";
import { armyCommander, armyName, isFullyOccupied, militaryStrength, nationArmies, pruneMilitary } from "./military";
import { ideologicalDistance } from "./missions";
import { consolidationDaysLeft, isConsolidated, isDisabled, seizeExecutive } from "./nation";
import { modifierProduct } from "./research";
import { nextFloat } from "./rng";
import type { GameState, NationState, Policy, WarSide, WarState } from "./state";
import { UNDECIDED } from "./state";
import { capitalRegion, homeCapital, isCapital, isExtant, nationNeighbors, nationRegions, regionDef, regionOwner, transferRegion } from "./territory";

export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function areAllies(state: GameState, a: string, b: string): boolean {
  return state.diplomacy.alliances.includes(pairKey(a, b));
}

export function areRivals(state: GameState, a: string, b: string): boolean {
  return pairKey(a, b) in state.diplomacy.rivalries;
}

export function alliesOf(state: GameState, nationId: string): string[] {
  const out: string[] = [];
  for (const key of state.diplomacy.alliances) {
    const [a, b] = key.split("|") as [string, string];
    if (a === nationId) out.push(b);
    else if (b === nationId) out.push(a);
  }
  return out.sort();
}

export function rivalsOf(state: GameState, nationId: string): string[] {
  const out: string[] = [];
  for (const key of Object.keys(state.diplomacy.rivalries)) {
    const [a, b] = key.split("|") as [string, string];
    if (a === nationId) out.push(b);
    else if (b === nationId) out.push(a);
  }
  return out.sort();
}

export function sideOf(war: WarState, nationId: string): WarSide | null {
  return war.attackers.includes(nationId) ? "attackers" : war.defenders.includes(nationId) ? "defenders" : null;
}

export const otherSide = (side: WarSide): WarSide => (side === "attackers" ? "defenders" : "attackers");

export function warBetween(state: GameState, a: string, b: string): WarState | undefined {
  return state.wars.find((w) => {
    const side = sideOf(w, a);
    return side !== null && w[otherSide(side)].includes(b);
  });
}

export function atWar(state: GameState, a: string, b: string): boolean {
  return a !== b && warBetween(state, a, b) !== undefined;
}

/** Every nation at war with this one, across all its wars. */
export function enemiesOf(state: GameState, nationId: string): Set<string> {
  const out = new Set<string>();
  for (const w of state.wars) {
    const side = sideOf(w, nationId);
    if (side) for (const id of w[otherSide(side)]) out.add(id);
  }
  return out;
}

export function warsOf(state: GameState, nationId: string): WarState[] {
  return state.wars.filter((w) => sideOf(w, nationId) !== null);
}

/** A nation can fight if it has armies or nuclear weapons. */
export function warCapable(state: GameState, nation: NationState): boolean {
  return nation.nukes > 0 || state.armies.some((a) => a.nationId === nation.id);
}

/** The side's leader is its strongest nation; leaders take capitals and answer peace offers. */
export function sideLeader(state: GameState, content: Content, war: WarState, side: WarSide): string {
  let best = war[side][0]!;
  let bestStrength = -Infinity;
  for (const id of war[side]) {
    const strength = militaryStrength(state, content, nationState(state, id));
    if (strength > bestStrength) {
      best = id;
      bestStrength = strength;
    }
  }
  return best;
}

export function warName(content: Content, war: WarState): string {
  return `${nationDef(content, war.attackers[0]!).name}–${nationDef(content, war.defenders[0]!).name} War`;
}

function onCooldown(state: GameState, a: string, b: string): boolean {
  return (state.diplomacy.cooldowns[pairKey(a, b)] ?? 0) > state.dayIndex;
}

/** The day the pair may improve relations again, or null if they are off cooldown. */
export function cooldownUntil(state: GameState, a: string, b: string): number | null {
  return onCooldown(state, a, b) ? state.diplomacy.cooldowns[pairKey(a, b)]! : null;
}

/** A nation allied to the other's breakaway, or to the parent the other broke away from (Terra Invicta). */
function breakawayTie(state: GameState, x: string, y: string): string | null {
  for (const [a, b] of [[x, y], [y, x]] as const) {
    const parent = state.breakaways[b];
    const tie = alliesOf(state, a).find((id) => state.breakaways[id] === b || id === parent);
    if (tie) return tie;
  }
  return null;
}

export function setCooldown(state: GameState, a: string, b: string, days: number): void {
  const key = pairKey(a, b);
  state.diplomacy.cooldowns[key] = Math.max(state.diplomacy.cooldowns[key] ?? 0, state.dayIndex + days);
}

/** Drops expired cooldowns, and chances to punish a defection, so the records don't grow forever. */
export function expireCooldowns(state: GameState): void {
  for (const [key, until] of Object.entries(state.diplomacy.cooldowns)) if (until <= state.dayIndex) delete state.diplomacy.cooldowns[key];
  for (const [id, d] of Object.entries(state.defections)) if (d.until <= state.dayIndex) delete state.defections[id];
}

function hasNavy(state: GameState, nationId: string): boolean {
  return state.armies.some((a) => a.nationId === nationId && a.navy);
}

const isCoastal = (state: GameState, content: Content, nationId: string) => nationRegions(state, content, nationId).some((r) => r.coastal);

/** Whether a war on the target could be fought at all: a shared border, or a navy and two coasts. */
export function accessible(state: GameState, content: Content, from: string, to: string): boolean {
  if (nationNeighbors(state, content, from).includes(to)) return true;
  return hasNavy(state, from) && isCoastal(state, content, from) && isCoastal(state, content, to);
}

/** Small, landlocked nations without navies can't deal with far-off ones. */
function inReach(state: GameState, content: Content, x: string, y: string): boolean {
  const min = content.rules.diplomacy.minControlPoints;
  return (
    nationState(state, x).controlPoints.length > min ||
    nationState(state, y).controlPoints.length > min ||
    nationNeighbors(state, content, x).includes(y) ||
    hasNavy(state, x) ||
    hasNavy(state, y)
  );
}

export function addAlliance(state: GameState, a: string, b: string): void {
  if (!areAllies(state, a, b)) state.diplomacy.alliances.push(pairKey(a, b));
  state.diplomacy.alliances.sort();
}

function removeAlliance(state: GameState, a: string, b: string): void {
  state.diplomacy.alliances = state.diplomacy.alliances.filter((k) => k !== pairKey(a, b));
}

export function addRivalry(state: GameState, a: string, b: string): void {
  const key = pairKey(a, b);
  if (!(key in state.diplomacy.rivalries)) state.diplomacy.rivalries[key] = state.dayIndex;
}

export function removeRivalry(state: GameState, a: string, b: string): void {
  delete state.diplomacy.rivalries[pairKey(a, b)];
}

export type Check = { ok: true } | { ok: false; reason: string };
const no = (reason: string): Check => ({ ok: false, reason });
const name = (content: Content, id: string) => nationDef(content, id).name;

/** Whether one nation broke away from the other (in either direction). */
export function breakawayPair(state: GameState, a: string, b: string): boolean {
  return state.breakaways[a] === b || state.breakaways[b] === a;
}

/** The faction must hold the nation's executive CP, and it must be working (Terra Invicta's consolidated executive control). */
export function checkExecutive(state: GameState, content: Content, factionId: string, nationId: string): Check {
  const nation = nationState(state, nationId);
  if (!isExtant(nation)) return no(`${name(content, nationId)} no longer exists`);
  if (nation.controlPoints[0]!.owner !== factionId) return no(`We don't hold the executive of ${name(content, nationId)}`);
  if (isDisabled(state, nation, 0)) return no(`Our executive in ${name(content, nationId)} is cracked down`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Diplomatic actions: paid with influence by the executive, no councilor needed.

export type DiplomaticAction = "proposeAlliance" | "endAlliance" | "declareRivalry" | "proposeEndRivalry" | "punishDefection";

export const DIPLOMATIC_ACTION_NAMES: Record<DiplomaticAction, string> = {
  proposeAlliance: "Propose alliance",
  endAlliance: "End alliance",
  declareRivalry: "Declare rivalry",
  proposeEndRivalry: "Propose ending the rivalry",
  punishDefection: "Declare war for leaving the federation",
};

/** Influence a diplomatic action costs; war on a defector is free, as in Terra Invicta. */
export function diplomacyCost(content: Content, action: DiplomaticAction): number {
  return action === "punishDefection" ? 0 : content.rules.diplomacy.influenceCost;
}

export function checkDiplomacy(state: GameState, content: Content, factionId: string, action: DiplomaticAction, nationId: string, targetId: string): Check {
  const exec = checkExecutive(state, content, factionId, nationId);
  if (!exec.ok) return exec;
  if (nationId === targetId) return no("A nation can't deal with itself");
  if (!state.nations.some((n) => n.id === targetId)) return no(`Unknown nation "${targetId}"`);
  if (!isExtant(nationState(state, targetId))) return no(`${name(content, targetId)} no longer exists`);
  const cost = diplomacyCost(content, action);
  if (factionState(state, factionId).resources.influence < cost) return no(`Needs ${cost} influence`);
  const x = nationId;
  const y = targetId;
  switch (action) {
    case "proposeAlliance":
      if (areAllies(state, x, y)) return no("They are already allies");
      if (atWar(state, x, y)) return no("They are at war");
      if (areRivals(state, x, y)) return no("Rivals can't ally");
      if (onCooldown(state, x, y)) return no("Diplomatic cooldown");
      if (!inReach(state, content, x, y)) return no("Too far apart: needs a border, a navy or a larger nation");
      {
        const tie = breakawayTie(state, x, y);
        if (tie) return no(`An alliance with ${name(content, tie)} stands in the way (a breakaway and its parent)`);
      }
      return { ok: true };
    case "endAlliance":
      if (!areAllies(state, x, y)) return no("They are not allies");
      if (sameFederation(state, x, y)) return no(`Members of the ${federationOf(state, x)!.name} stay allied`);
      return { ok: true };
    case "declareRivalry":
      if (areRivals(state, x, y)) return no("They are already rivals");
      if (areAllies(state, x, y)) return no("Allies can't be rivals");
      if (atWar(state, x, y)) return no("They are at war");
      if (!inReach(state, content, x, y)) return no("Too far apart: needs a border, a navy or a larger nation");
      return { ok: true };
    case "proposeEndRivalry":
      if (!areRivals(state, x, y)) return no("They are not rivals");
      if (breakawayPair(state, x, y)) return no("A breakaway stays its parent's rival until its independence is settled");
      if (atWar(state, x, y)) return no("They are at war: seek peace first");
      if (onCooldown(state, x, y)) return no("Diplomatic cooldown");
      return { ok: true };
    case "punishDefection": {
      const defection = state.defections[y];
      if (!defection || defection.leaderId !== x) return no(`${name(content, y)} didn't leave a federation we lead`);
      return checkWarOnDefector(state, content, x, y);
    }
  }
}

function checkWarOnDefector(state: GameState, content: Content, leader: string, defector: string): Check {
  if (!warCapable(state, nationState(state, leader))) return no(`${name(content, leader)} has no armies or nuclear weapons`);
  if (atWar(state, leader, defector)) return no("Already at war");
  if (!accessible(state, content, leader, defector)) return no(`${name(content, defector)} is out of reach: no border and no navy`);
  return { ok: true };
}

/**
 * A member that left an authoritarian federation (leader's Government under 4) through a
 * coup. Unless the same faction runs both, the lead nation may go to war on it at once,
 * without the cohesion penalty of a new rivalry. AI and uncontrolled leaders decide now: war
 * if they are twice as strong as the defector and its allies outside the federation. A
 * player has `defectionWarDays` to declare it (the free punishDefection action). Returns
 * what happened, for the log, or null.
 */
export function answerDefection(state: GameState, content: Content, defector: string, leaderId: string, federationName: string): string | null {
  const r = content.rules.diplomacy.federation;
  const leader = nationState(state, leaderId);
  if (leaderId === defector || !isExtant(leader) || leader.democracy >= r.vetoGovernment) return null;
  const owner = leader.controlPoints[0]!.owner;
  if (owner !== null && owner === nationState(state, defector).controlPoints[0]!.owner) return null;
  if (owner !== null && factionState(state, owner).isPlayer) {
    state.defections[defector] = { leaderId, federation: federationName, until: state.dayIndex + r.defectionWarDays };
    return `${name(content, leaderId)} may declare war on ${name(content, defector)} for leaving the ${federationName}, within ${r.defectionWarDays} days.`;
  }
  if (!checkWarOnDefector(state, content, leaderId, defector).ok) return null;
  const members = new Set(federationOf(state, leaderId)?.members ?? [leaderId]);
  let theirs = militaryStrength(state, content, nationState(state, defector));
  for (const id of alliesOf(state, defector)) {
    const ally = nationState(state, id);
    if (!members.has(id) && warCapable(state, ally)) theirs += militaryStrength(state, content, ally);
  }
  if (militaryStrength(state, content, leader) < 2 * theirs) return null;
  return punishDefection(state, content, leaderId, defector);
}

/** The leader breaks with the defector (it and its federation) and declares war on it. */
function punishDefection(state: GameState, content: Content, leaderId: string, defector: string): string {
  delete state.defections[defector];
  for (const id of federationOf(state, leaderId)?.members ?? [leaderId]) removeAlliance(state, defector, id);
  // A rivalry dated far enough back that the declaration costs no cohesion.
  state.diplomacy.rivalries[pairKey(leaderId, defector)] = state.dayIndex - content.rules.military.declareWar.earlyRivalryDays;
  return declareWar(state, content, leaderId, defector);
}

/**
 * Whether the target's executive agrees. A faction always agrees with itself; players answer
 * through their own actions (there is no prompt yet), so offers to them are declined. AI
 * factions ally with ideological neighbours; uncontrolled governments with neighbours and
 * bigger nations, and they accept any end to a rivalry.
 */
function agrees(state: GameState, content: Content, action: DiplomaticAction, x: string, y: string): boolean {
  const proposer = nationState(state, x).controlPoints[0]!.owner;
  const decider = nationState(state, y).controlPoints[0]!.owner;
  if (decider !== null && decider === proposer) return true;
  if (decider !== null && factionState(state, decider).isPlayer) return false;
  if (action === "proposeAlliance") {
    if (decider !== null && proposer !== null) return ideologicalDistance(content, decider, proposer) <= 0.5;
    return nationNeighbors(state, content, y).includes(x) || nationState(state, x).controlPoints.length > nationState(state, y).controlPoints.length;
  }
  if (decider === null) return true;
  return militaryStrength(state, content, nationState(state, y)) < 2 * militaryStrength(state, content, nationState(state, x));
}

/** Applies a checked diplomatic action and returns what happened, for the log. */
export function applyDiplomacy(state: GameState, content: Content, factionId: string, action: DiplomaticAction, x: string, y: string): string {
  const d = content.rules.diplomacy;
  // Projects can shorten the cooldowns that follow the faction's diplomacy.
  const pace = modifierProduct(state, content, factionId, "BilateralRelationsCooldownMultiplier");
  factionState(state, factionId).resources.influence -= diplomacyCost(content, action);
  let text: string;
  switch (action) {
    case "proposeAlliance":
      if (agrees(state, content, action, x, y)) {
        addAlliance(state, x, y);
        setCooldown(state, x, y, Math.round(d.cooldownDays * pace));
        text = `${name(content, x)} and ${name(content, y)} are now allies.`;
      } else {
        setCooldown(state, x, y, Math.round(d.rejectedCooldownDays * pace));
        text = `${name(content, y)} turned down an alliance with ${name(content, x)}.`;
      }
      break;
    case "endAlliance":
      removeAlliance(state, x, y);
      setCooldown(state, x, y, Math.round(d.cooldownDays * pace));
      pruneMilitary(state, content);
      text = `${name(content, x)} ended its alliance with ${name(content, y)}.`;
      break;
    case "declareRivalry":
      addRivalry(state, x, y);
      setCooldown(state, x, y, Math.round(d.cooldownDays * pace));
      text = `${name(content, x)} declared ${name(content, y)} a rival.`;
      break;
    case "proposeEndRivalry":
      if (agrees(state, content, action, x, y)) {
        removeRivalry(state, x, y);
        setCooldown(state, x, y, Math.round(d.cooldownDays * pace));
        text = `${name(content, x)} and ${name(content, y)} ended their rivalry.`;
      } else {
        setCooldown(state, x, y, Math.round(d.rejectedCooldownDays * pace));
        text = `${name(content, y)} refused to end its rivalry with ${name(content, x)}.`;
      }
      break;
    case "punishDefection":
      text = punishDefection(state, content, x, y);
      break;
  }
  addLog(state, { factionId, nationId: x, kind: "diplomacy", text });
  return text;
}

// ---------------------------------------------------------------------------
// National policies: set by a councilor's Set National Policy mission.

export function policyLabel(state: GameState, content: Content, nationId: string, policy: Policy): string {
  const war = "warId" in policy ? state.wars.find((w) => w.id === policy.warId) : undefined;
  switch (policy.kind) {
    case "declareWar":
      return `${name(content, nationId)}: declare war on ${name(content, policy.targetId)}`;
    case "joinWar":
      return `${name(content, nationId)}: join ${war ? warName(content, war) : "the war"} (${policy.side})`;
    case "seekPeace":
      return `${name(content, nationId)}: seek peace in ${war ? warName(content, war) : "the war"}`;
    case "demandTerritory":
      return `${name(content, nationId)}: demand ${regionDef(content, policy.regionId).name} from ${name(content, regionOwner(state, policy.regionId))}`;
    case "unify":
      return `${name(content, nationId)}: unify with ${name(content, policy.targetId)}`;
    case "federate": {
      const own = federationOf(state, nationId);
      const theirs = federationOf(state, policy.targetId);
      if (theirs) return `${name(content, nationId)}: apply to join the ${theirs.name}`;
      if (own) return `${name(content, nationId)}: invite ${name(content, policy.targetId)} into the ${own.name}`;
      return `${name(content, nationId)}: found a federation with ${name(content, policy.targetId)}`;
    }
    case "leaveFederation":
      return `${name(content, nationId)}: leave the ${federationOf(state, nationId)?.name ?? "federation"}`;
    case "grantIndependence":
      return `${name(content, nationId)}: grant independence to ${name(content, policy.targetId)}`;
    case "declareIndependence":
      return `${name(content, nationId)}: declare independence from ${state.breakaways[nationId] ? name(content, state.breakaways[nationId]) : "its parent"}`;
    case "disbandArmy": {
      const army = state.armies.find((a) => a.id === policy.armyId);
      return `${name(content, nationId)}: disband the ${army ? armyName(state, content, army) : "army"}`;
    }
    case "disarm":
      return `${name(content, nationId)}: disarm up to ${content.rules.diplomacy.disarmNukes} nuclear weapons`;
  }
}

/** Every policy the nation could set now, valid or not (the UI filters with checkPolicy). */
export function policyOptions(state: GameState, content: Content, nationId: string): Policy[] {
  const out: Policy[] = [];
  for (const id of rivalsOf(state, nationId)) if (!atWar(state, nationId, id)) out.push({ kind: "declareWar", targetId: id });
  for (const war of state.wars) {
    if (sideOf(war, nationId)) out.push({ kind: "seekPeace", warId: war.id });
    else for (const side of ["attackers", "defenders"] as const) out.push({ kind: "joinWar", warId: war.id, side });
  }
  for (const c of foreignClaims(state, content, nationId)) out.push({ kind: "demandTerritory", regionId: c.region });
  for (const n of state.nations) {
    if (n.id === nationId) continue;
    if (isExtant(n) && (hasClaim(state, content, nationId, homeCapital(content, n.id).id) || breakawayPair(state, nationId, n.id))) out.push({ kind: "unify", targetId: n.id });
    const freed = !isExtant(n) && regionOwner(state, homeCapital(content, n.id).id) === nationId;
    if (freed || state.breakaways[n.id] === nationId) out.push({ kind: "grantIndependence", targetId: n.id });
  }
  if (state.breakaways[nationId]) out.push({ kind: "declareIndependence" });
  for (const army of nationArmies(state, nationId)) out.push({ kind: "disbandArmy", armyId: army.id });
  if (nationState(state, nationId).nukes > 0) out.push({ kind: "disarm" });
  // Federation: any nation tied to us, or to our federation, by an alliance.
  const own = federationOf(state, nationId);
  const group = own ? own.members : [nationId];
  const linked = new Set(group.flatMap((id) => alliesOf(state, id)));
  for (const id of linked) {
    if (own?.members.includes(id)) continue;
    const theirs = federationOf(state, id);
    out.push({ kind: "federate", targetId: theirs ? theirs.leaderId : id });
  }
  if (own && own.leaderId !== nationId) out.push({ kind: "leaveFederation" });
  return out.filter((p, i) => p.kind !== "federate" || out.findIndex((q) => q.kind === "federate" && q.targetId === p.targetId) === i);
}

/** Policies that need consolidated executive control of the nation setting them (Terra Invicta). */
const NEEDS_CONSOLIDATION: Policy["kind"][] = ["federate", "leaveFederation", "unify", "grantIndependence", "demandTerritory", "disbandArmy", "disarm"];

/** The nation's executive must be consolidated by whoever holds it. */
function checkConsolidated(state: GameState, content: Content, nationId: string): Check {
  const left = consolidationDaysLeft(state, content, nationState(state, nationId));
  return left === 0 ? { ok: true } : no(`Executive control of ${name(content, nationId)} isn't consolidated yet (${left} more day${left === 1 ? "" : "s"})`);
}

export function checkPolicy(state: GameState, content: Content, factionId: string, nationId: string, policy: Policy): Check {
  const exec = checkExecutive(state, content, factionId, nationId);
  if (!exec.ok) return exec;
  if (NEEDS_CONSOLIDATION.includes(policy.kind)) {
    const consolidated = checkConsolidated(state, content, nationId);
    if (!consolidated.ok) return consolidated;
  }
  const x = nationState(state, nationId);
  switch (policy.kind) {
    case "declareWar": {
      const y = policy.targetId;
      if (!state.nations.some((n) => n.id === y) || y === x.id) return no("Choose another nation");
      if (!isExtant(nationState(state, y))) return no(`${name(content, y)} no longer exists`);
      if (!warCapable(state, x)) return no(`${name(content, x.id)} has no armies or nuclear weapons`);
      if (!areRivals(state, x.id, y)) return no("Only rivals can go to war");
      if (atWar(state, x.id, y)) return no("Already at war");
      const shared = alliesOf(state, x.id).filter((id) => areAllies(state, id, y) && warCapable(state, nationState(state, id)));
      if (shared.length > 0) return no(`${name(content, shared[0]!)} is allied to both`);
      if (!accessible(state, content, x.id, y)) return no(`${name(content, y)} is out of reach: no border and no navy`);
      return { ok: true };
    }
    case "joinWar": {
      const war = state.wars.find((w) => w.id === policy.warId);
      if (!war) return no("That war is over");
      if (sideOf(war, x.id)) return no("Already in this war");
      if (!warCapable(state, x)) return no(`${name(content, x.id)} has no armies or nuclear weapons`);
      if (!war[policy.side].some((id) => areAllies(state, id, x.id))) return no("Needs an ally on that side");
      if (war[otherSide(policy.side)].some((id) => areAllies(state, id, x.id))) return no("Allied to the other side too");
      return { ok: true };
    }
    case "seekPeace": {
      const war = state.wars.find((w) => w.id === policy.warId);
      if (!war) return no("That war is over");
      if (!sideOf(war, x.id)) return no("Not in this war");
      return { ok: true };
    }
    case "demandTerritory": {
      if (!state.regionOwners[policy.regionId]) return no("Choose a region");
      const y = regionOwner(state, policy.regionId);
      const target = nationState(state, y);
      if (y === x.id) return no("The region is already ours");
      if (!hasClaim(state, content, x.id, policy.regionId)) return no(`${name(content, x.id)} has no claim on ${regionDef(content, policy.regionId).name}`);
      if (!peacefulClaim(state, content, x.id, policy.regionId)) return no("The claim is hostile: the region would have to be taken by force");
      if (isCapital(state, policy.regionId)) return no(`${regionDef(content, policy.regionId).name} is the capital of ${name(content, y)}`);
      if (target.controlPoints[0]!.owner !== null && isDisabled(state, target, 0)) return no(`The executive of ${name(content, y)} is cracked down: there is nobody to answer the demand`);
      if (target.controlPoints[0]!.owner !== null) {
        const consolidated = checkConsolidated(state, content, y);
        if (!consolidated.ok) return consolidated;
      }
      if (warsOf(state, y).length > 0) return no(`${name(content, y)} is at war`);
      if (onCooldown(state, x.id, y)) return no("Diplomatic cooldown");
      if (breakawayPair(state, x.id, y)) return no("Their rivalry over the breakaway can't be set aside");
      return { ok: true };
    }
    case "unify": {
      // Both nations' executives must be ours and consolidated.
      const check = checkUnify(state, content, factionId, x.id, policy.targetId);
      if (!check.ok) return check;
      return isConsolidated(state, content, nationState(state, policy.targetId), factionId) ? { ok: true } : checkConsolidated(state, content, policy.targetId);
    }
    case "grantIndependence": {
      const y = nationState(state, policy.targetId);
      if (y.id === x.id) return no("Choose another nation");
      if (state.breakaways[y.id] === x.id) return { ok: true };
      if (isExtant(y)) return no(`${name(content, y.id)} is already independent`);
      const home = homeCapital(content, y.id);
      if (!hasClaim(state, content, y.id, home.id)) return no(`${name(content, y.id)} has no claim on ${home.name}`);
      if (regionOwner(state, home.id) !== x.id) return no(`We don't hold ${home.name}`);
      if (x.capitalId === home.id) return no(`${home.name} is our capital`);
      return { ok: true };
    }
    case "declareIndependence":
      return state.breakaways[x.id] ? { ok: true } : no(`${name(content, x.id)} is not a breakaway`);
    case "disbandArmy": {
      const army = state.armies.find((a) => a.id === policy.armyId);
      if (!army || army.nationId !== x.id) return no(`Choose an army of ${name(content, x.id)}`);
      if (armyCommander(state, army) !== factionId) return no("We don't command that army");
      return { ok: true };
    }
    case "disarm":
      return x.nukes > 0 ? { ok: true } : no(`${name(content, x.id)} has no nuclear weapons`);
    case "federate":
      return checkFederate(state, content, x.id, policy.targetId);
    case "leaveFederation": {
      const federation = federationOf(state, x.id);
      if (!federation) return no(`${name(content, x.id)} is not in a federation`);
      if (federation.leaderId === x.id) return no(`${name(content, x.id)} leads the ${federation.name} and can't leave it`);
      return { ok: true };
    }
  }
}

/** Whether the two could ally, ignoring distance: not at war, not rivals, no cooldown. */
const couldAlly = (state: GameState, a: string, b: string) => !atWar(state, a, b) && !areRivals(state, a, b) && !onCooldown(state, a, b);

/** One side has a claim on a region the other holds. */
function claimLink(state: GameState, content: Content, a: string, b: string): boolean {
  return nationRegions(state, content, b).some((r) => hasClaim(state, content, a, r.id)) || nationRegions(state, content, a).some((r) => hasClaim(state, content, b, r.id));
}

/**
 * Terra Invicta's federation requirements. X may federate with Y when neither is a breakaway,
 * each is either outside any federation or leads its own, and not both are in one. The
 * outsider (X when joining Y's federation, else Y) must be allied, off cooldown, with some
 * member of the other side; at peace and not rivals with all of them, and able to ally with
 * those it isn't allied to; and tied to one of them by a claim either way. A Y that joins
 * must have a faction running its working executive.
 */
function checkFederate(state: GameState, content: Content, x: string, y: string): Check {
  if (x === y || !state.nations.some((n) => n.id === y)) return no("Choose another nation");
  if (!isExtant(nationState(state, y))) return no(`${name(content, y)} no longer exists`);
  if (state.breakaways[x] || state.breakaways[y]) return no("A breakaway can't join a federation");
  const fx = federationOf(state, x);
  const fy = federationOf(state, y);
  if (fx && fx === fy) return no(`Both are already in the ${fx.name}`);
  if (fx && fy) return no(`${name(content, y)} is already in the ${fy.name}`);
  if (fx && fx.leaderId !== x) return no(`Only ${name(content, fx.leaderId)}, which leads the ${fx.name}, can bring in new members`);
  if (fy && fy.leaderId !== y) return no(`Apply to ${name(content, fy.leaderId)}, which leads the ${fy.name}`);
  const [outsider, group] = fy ? [x, fy.members] : [y, fx ? fx.members : [x]];
  if (outsider === y) {
    const target = nationState(state, y);
    if (target.controlPoints[0]!.owner === null || isDisabled(state, target, 0)) return no(`No faction runs the government of ${name(content, y)}`);
    const consolidated = checkConsolidated(state, content, y);
    if (!consolidated.ok) return consolidated;
  }
  const foe = group.find((id) => atWar(state, id, outsider) || areRivals(state, id, outsider));
  if (foe) return no(`${name(content, foe)} and ${name(content, outsider)} are ${atWar(state, foe, outsider) ? "at war" : "rivals"}`);
  if (!group.some((id) => areAllies(state, id, outsider) && !onCooldown(state, id, outsider))) {
    return no(group.length === 1 ? "They must be allies, off diplomatic cooldown" : `${name(content, outsider)} needs an ally in the federation, off diplomatic cooldown`);
  }
  const blocked = group.find((id) => !areAllies(state, id, outsider) && !couldAlly(state, id, outsider));
  if (blocked) return no(`Diplomatic cooldown between ${name(content, blocked)} and ${name(content, outsider)}`);
  if (!group.some((id) => claimLink(state, content, id, outsider))) return no("One side needs a claim on a region of the other");
  return { ok: true };
}

/**
 * Peaceful Unification: absorbing a fellow federation member on whose home capital we have a
 * peaceful claim, when the faction runs its government and holds all its CPs; or settling a breakaway, when
 * the faction holds all the breakaway's CPs (and, setting it in the breakaway, the parent's
 * executive), in which case the parent absorbs the breakaway.
 */
function checkUnify(state: GameState, content: Content, factionId: string, x: string, y: string): Check {
  if (x === y || !state.nations.some((n) => n.id === y)) return no("Choose another nation");
  const target = nationState(state, y);
  if (!isExtant(target)) return no(`${name(content, y)} no longer exists`);
  const ownsAll = (n: NationState) => n.controlPoints.every((cp) => cp.owner === factionId);
  if (state.breakaways[y] === x || state.breakaways[x] === y) {
    if (atWar(state, x, y)) return no("They are at war");
    const breakaway = state.breakaways[y] === x ? target : nationState(state, x);
    if (!ownsAll(breakaway)) return no(`We need every control point of ${name(content, breakaway.id)}`);
    if (state.breakaways[x] === y && target.controlPoints[0]!.owner !== factionId) return no(`We need the executive of ${name(content, y)}`);
    return { ok: true };
  }
  const home = homeCapital(content, y);
  if (!sameFederation(state, x, y)) return no(`${name(content, x)} and ${name(content, y)} must be in the same federation`);
  if (!peacefulClaim(state, content, x, home.id)) return no(`${name(content, x)} needs a peaceful claim on ${home.name}`);
  if (onCooldown(state, x, y)) return no("Diplomatic cooldown");
  const exec = checkExecutive(state, content, factionId, y);
  if (!exec.ok) return exec;
  if (!ownsAll(target)) return no(`We need every control point of ${name(content, y)}`);
  return { ok: true };
}

/** True while a player's Set National Policy waits for its policy; the clock waits for it. */
export function awaitingPolicyChoice(state: GameState): boolean {
  return state.policyChoices.length > 0;
}

/**
 * Settles a player's Set National Policy that succeeded: sets the policy, or with null sets
 * none and refunds the mission's fixed cost, as in Terra Invicta.
 */
export function settlePolicyChoice(state: GameState, content: Content, factionId: string, nationId: string, policy: Policy | null): Check {
  const index = state.policyChoices.findIndex((c) => c.factionId === factionId && c.nationId === nationId);
  if (index < 0) return no(`No national policy to set in ${name(content, nationId)}`);
  if (policy) {
    const check = checkPolicy(state, content, factionId, nationId, policy);
    if (!check.ok) return check;
  }
  const choice = state.policyChoices.splice(index, 1)[0]!;
  const councilor = factionState(state, factionId).councilors.find((c) => c.id === choice.councilorId);
  const who = `${councilor?.name ?? "Our councilor"} (${factionDef(content, factionId).name})`;
  let text: string;
  if (policy) text = `${who}: ${enactPolicy(state, content, nationId, policy)}`;
  else {
    const cost = content.rules.missions.costs.setPolicy;
    const refund = cost?.fixed ?? 0;
    if (cost && refund > 0) factionState(state, factionId).resources[cost.resource] += refund;
    text = `${who} set no national policy in ${name(content, nationId)}${refund > 0 ? `; ${refund} ${cost!.resource} refunded` : ""}.`;
  }
  addLog(state, { factionId, nationId, kind: "mission", mission: "setPolicy", text });
  return { ok: true };
}

/** Sets a checked policy and returns what happened, for the log. */
export function enactPolicy(state: GameState, content: Content, nationId: string, policy: Policy): string {
  switch (policy.kind) {
    case "declareWar":
      return declareWar(state, content, nationId, policy.targetId);
    case "joinWar": {
      const war = state.wars.find((w) => w.id === policy.warId)!;
      joinWar(state, content, war, nationId, policy.side);
      return `${name(content, nationId)} joined the ${warName(content, war)}.`;
    }
    case "seekPeace":
      return seekPeace(state, content, nationId, state.wars.find((w) => w.id === policy.warId)!);
    case "demandTerritory": {
      const y = regionOwner(state, policy.regionId);
      takeRegion(state, content, policy.regionId, nationId);
      removeRivalry(state, nationId, y);
      setCooldown(state, nationId, y, content.rules.claims.demandCooldownDays);
      return `${name(content, y)} handed ${regionDef(content, policy.regionId).name} over to ${name(content, nationId)}.`;
    }
    case "unify": {
      // A breakaway settled from its own side rejoins its parent.
      const [into, absorbed] = state.breakaways[nationId] === policy.targetId ? [policy.targetId, nationId] : [nationId, policy.targetId];
      unify(state, content, into, absorbed);
      return `${name(content, absorbed)} is now part of ${name(content, into)}.`;
    }
    case "grantIndependence":
      return grantIndependence(state, content, nationId, policy.targetId);
    case "federate":
      return federate(state, content, nationId, policy.targetId);
    case "leaveFederation":
      return leaveFederation(state, content, nationId);
    case "declareIndependence": {
      const parent = state.breakaways[nationId]!;
      delete state.breakaways[nationId];
      removeAlliance(state, nationId, parent);
      addRivalry(state, nationId, parent);
      declareWar(state, content, parent, nationId);
      return `${name(content, nationId)} declared its independence from ${name(content, parent)}, which went to war over it!`;
    }
    case "disbandArmy": {
      // Unlike an army destroyed in battle, nothing goes back into the Build Army priority.
      const army = state.armies.find((a) => a.id === policy.armyId)!;
      state.armies.splice(state.armies.indexOf(army), 1);
      return `${name(content, nationId)} disbanded the ${armyName(state, content, army)}.`;
    }
    case "disarm": {
      const nation = nationState(state, nationId);
      nation.nukes = Math.max(0, nation.nukes - content.rules.diplomacy.disarmNukes);
      if (nation.nukes > 0) return `${name(content, nationId)} reduced its nuclear weapons stockpile to ${nation.nukes}.`;
      // Reaching zero also cancels all progress on the Nuclear Weapons priority.
      delete nation.ipProgress["nuclear-weapons"];
      return `${name(content, nationId)} eliminated its nuclear weapons stockpile.`;
    }
  }
}

/**
 * Y's executive answers a federation proposal. A faction always agrees with itself; players
 * answer through their own actions, so proposals to them are declined; AI factions federate
 * with ideological neighbours, and an uncontrolled lead nation takes any qualifying member.
 */
function agreesToFederate(state: GameState, content: Content, x: string, y: string): boolean {
  const proposer = nationState(state, x).controlPoints[0]!.owner;
  const decider = nationState(state, y).controlPoints[0]!.owner;
  if (decider === null) return true;
  if (decider === proposer) return true;
  if (factionState(state, decider).isPlayer) return false;
  return proposer !== null && ideologicalDistance(content, decider, proposer) <= 0.5;
}

/** The outsider joins the federation (a new one if neither was in one) and allies with every member. */
function federate(state: GameState, content: Content, x: string, y: string): string {
  const d = content.rules.diplomacy;
  const proposer = nationState(state, x).controlPoints[0]!.owner;
  const pace = proposer ? modifierProduct(state, content, proposer, "BilateralRelationsCooldownMultiplier") : 1;
  if (!agreesToFederate(state, content, x, y)) {
    setCooldown(state, x, y, Math.round(d.rejectedCooldownDays * pace));
    return `${name(content, y)} turned down a federation with ${name(content, x)}.`;
  }
  const fx = federationOf(state, x);
  const fy = federationOf(state, y);
  const federation = fy ?? fx ?? createFederation(state, content, [x, y]);
  const founded = !fx && !fy;
  const joiner = fy ? x : fx ? y : federation.leaderId === x ? y : x;
  for (const id of federation.members) {
    if (id === joiner) continue;
    addAlliance(state, joiner, id);
    setCooldown(state, joiner, id, Math.round(d.federation.joinCooldownDays * pace));
  }
  addMember(federation, joiner);
  return founded ? `${name(content, x)} and ${name(content, y)} founded the ${federation.name}.` : `${name(content, joiner)} joined the ${federation.name}.`;
}

/**
 * A member leaves; an authoritarian lead nation (Government under 4) vetoes it unless the
 * same faction runs both. The leaver keeps its alliances but loses some GDP.
 */
function leaveFederation(state: GameState, content: Content, x: string): string {
  const d = content.rules.diplomacy;
  const federation = federationOf(state, x)!;
  const leader = nationState(state, federation.leaderId);
  const vetoer = leader.controlPoints[0]!.owner;
  if (leader.democracy < d.federation.vetoGovernment && (vetoer === null || vetoer !== nationState(state, x).controlPoints[0]!.owner)) {
    setCooldown(state, x, leader.id, d.rejectedCooldownDays);
    return `${name(content, leader.id)} would not let ${name(content, x)} leave the ${federation.name}.`;
  }
  removeFromFederation(state, content, x);
  const nation = nationState(state, x);
  nation.gdp *= 1 - d.federation.leaveGdpLoss;
  for (const id of federation.members) setCooldown(state, x, id, d.federation.leaveCooldownDays);
  return `${name(content, x)} left the ${federation.name}.`;
}

/** Half of the absorbed nation's progress on a one-off priority, short of completing it. */
function mergeProgress(content: Content, into: NationState, from: NationState, id: string): void {
  const cost = content.priorities.find((p) => p.id === id)?.cost ?? 0;
  into.ipProgress[id] = Math.min(cost - 1, (into.ipProgress[id] ?? 0) + 0.5 * (from.ipProgress[id] ?? 0));
}

/** Terra Invicta's Peaceful Unification: every region, armies and claims of `absorbed` go to `into`. */
export function unify(state: GameState, content: Content, into: string, absorbed: string): void {
  const x = nationState(state, into);
  const y = nationState(state, absorbed);
  if (x.atomicBomb) x.nukes += y.nukes;
  else if (y.atomicBomb) {
    x.atomicBomb = true;
    x.nukes += y.nukes;
  } else mergeProgress(content, x, y, "atomic-bomb");
  if (y.spaceProgram) x.spaceProgram = true;
  else if (!x.spaceProgram) mergeProgress(content, x, y, "found-space-program");
  if (y.militaryFounded) x.militaryFounded = true;
  else if (!x.militaryFounded) mergeProgress(content, x, y, "found-military");
  const oneOff = new Set(["atomic-bomb", "found-space-program", "found-military"]);
  for (const [id, ip] of Object.entries(y.ipProgress)) if (!oneOff.has(id)) x.ipProgress[id] = (x.ipProgress[id] ?? 0) + 0.5 * ip;
  if (x.democracy < y.democracy - 1) x.unrest = Math.max(x.unrest, Math.min(content.rules.claims.unificationMaxUnrest, x.unrest + (y.democracy - x.democracy) / 2));
  inheritClaims(state, content, absorbed, into);
  // The absorbed nation's armies keep serving, now under the new flag.
  for (const a of state.armies) if (a.nationId === absorbed) a.nationId = into;
  // Breakaways of the absorbed nation become independent (dissolveNation drops the record).
  for (const r of [...nationRegions(state, content, absorbed)]) transferRegion(state, content, r.id, into);
}

/** Recreates a nation in its home capital, or frees a breakaway. */
function grantIndependence(state: GameState, content: Content, x: string, y: string): string {
  if (state.breakaways[y] === x) {
    delete state.breakaways[y];
    return `${name(content, x)} recognised the independence of ${name(content, y)}.`;
  }
  const giver = nationState(state, x);
  const nation = nationState(state, y);
  if (giver.militaryFounded) nation.militaryFounded = true;
  if (giver.spaceProgram) nation.spaceProgram = true;
  const gave = transferRegion(state, content, homeCapital(content, y).id, y);
  const u = (lo: number, hi: number) => lo + (hi - lo) * nextFloat(state.rng);
  if (giver.cohesion < 5) {
    giver.unrest = clamp10(giver.unrest - u(0, 3) * gave);
    nation.unrest = clamp10(nation.unrest - u(0, 3));
  }
  giver.cohesion = clamp10(giver.cohesion + u(0, 2) * gave);
  nation.cohesion = clamp10(nation.cohesion + u(1, 3));
  for (const id of rivalsOf(state, x)) if (id !== y) addRivalry(state, y, id);
  for (const id of alliesOf(state, x)) if (id !== y) addAlliance(state, y, id);
  addAlliance(state, x, y);
  setCooldown(state, x, y, content.rules.claims.independenceCooldownDays);
  return `${name(content, x)} granted independence to ${name(content, y)}.`;
}

const clamp10 = (v: number) => Math.min(10, Math.max(0, v));

/** Terra Invicta's war declaration, with its cohesion swings and allies joining. */
function declareWar(state: GameState, content: Content, x: string, y: string): string {
  const d = content.rules.military.declareWar;
  const attacker = nationState(state, x);
  const defender = nationState(state, y);
  // Declaring soon after a rivalry began divides the attacker's public.
  const since = state.diplomacy.rivalries[pairKey(x, y)] ?? 0;
  const early = state.dayIndex - since < d.earlyRivalryDays;
  if (early) attacker.cohesion = clamp10(attacker.cohesion - d.earlyCohesionPerGovernment * (1 - (state.dayIndex - since) / d.earlyRivalryDays) * attacker.democracy);
  const rallies = (n: NationState) => n.unrest < d.maxUnrest && n.cohesion > d.minCohesion;
  if (!early && warsOf(state, x).length === 0 && rallies(attacker) && (attacker.democracy < d.maxGovernment || defender.democracy < d.maxGovernment)) {
    attacker.cohesion = clamp10(attacker.cohesion + d.attackerCohesion);
  }
  if (rallies(defender)) defender.cohesion = clamp10(defender.cohesion + d.defenderCohesion);

  const war: WarState = { id: newId(state, "w"), attackers: [x], defenders: [y], startDay: state.dayIndex };
  state.wars.push(war);
  const joined: string[] = [];
  // The defender's allies must join; the attacker's join if the same faction runs them.
  for (const id of alliesOf(state, y)) {
    const ally = nationState(state, id);
    if (sideOf(war, id) || !warCapable(state, ally)) continue;
    war.defenders.push(id);
    joined.push(name(content, id));
    if (rallies(ally)) ally.cohesion = clamp10(ally.cohesion + d.allyCohesion);
  }
  const execOf = (id: string) => nationState(state, id).controlPoints[0]!.owner;
  for (const id of alliesOf(state, x)) {
    const ally = nationState(state, id);
    if (sideOf(war, id) || !warCapable(state, ally)) continue;
    if (alliesOf(state, id).some((other) => war.defenders.includes(other))) continue;
    if (execOf(id) === null || execOf(id) !== execOf(x)) continue;
    joinWar(state, content, war, id, "attackers");
    joined.push(name(content, id));
  }
  for (const a of war.attackers) for (const b of war.defenders) setCooldown(state, a, b, content.rules.diplomacy.cooldownDays);
  return `${name(content, x)} declared war on ${name(content, y)}!${joined.length ? ` Joining: ${joined.join(", ")}.` : ""}`;
}

function joinWar(state: GameState, content: Content, war: WarState, nationId: string, side: WarSide): void {
  const nation = nationState(state, nationId);
  if (warsOf(state, nationId).length === 0 && side === "attackers") nation.cohesion = clamp10(nation.cohesion + content.rules.military.declareWar.joinCohesion);
  war[side].push(nationId);
  for (const other of war[otherSide(side)]) setCooldown(state, nationId, other, content.rules.diplomacy.cooldownDays);
}

/**
 * How well a side is doing: the population share of the enemy's regions it occupies, less
 * the share of its own that the enemy occupies. −1 to +1.
 */
export function warScore(state: GameState, content: Content, war: WarState, side: WarSide): number {
  const occupiedBy = (owners: string[], occupiers: string[]) => {
    let total = 0;
    let taken = 0;
    for (const id of owners) {
      for (const r of nationRegions(state, content, id)) {
        total += r.population;
        const shares = state.occupation[r.id] ?? {};
        for (const occ of occupiers) taken += r.population * (shares[occ] ?? 0);
      }
    }
    return total > 0 ? taken / total : 0;
  };
  const ours = war[side];
  const theirs = war[otherSide(side)];
  return occupiedBy(theirs, ours) - occupiedBy(ours, theirs);
}

/**
 * The other side's leader decides. A side that isn't winning, or a war over a year old, is
 * ready for peace. Players answer by seeking peace themselves, so offers to them are declined.
 */
function acceptsPeace(state: GameState, content: Content, war: WarState, asker: string): boolean {
  const side = sideOf(war, asker)!;
  const leader = sideLeader(state, content, war, otherSide(side));
  const decider = nationState(state, leader).controlPoints[0]!.owner;
  if (decider !== null && decider === nationState(state, asker).controlPoints[0]!.owner) return true;
  if (decider !== null && factionState(state, decider).isPlayer) return false;
  return warScore(state, content, war, otherSide(side)) <= 0.1 || state.dayIndex - war.startDay > 365;
}

function seekPeace(state: GameState, content: Content, x: string, war: WarState): string {
  const d = content.rules.diplomacy;
  const side = sideOf(war, x)!;
  const leader = sideLeader(state, content, war, otherSide(side));
  if (!acceptsPeace(state, content, war, x)) {
    setCooldown(state, x, leader, d.rejectedCooldownDays);
    return `${name(content, leader)} rejected ${name(content, x)}'s call for peace.`;
  }
  const leaving = x === sideLeader(state, content, war, side) ? [...war[side]] : [x];
  for (const a of leaving) {
    for (const b of war[otherSide(side)]) {
      addRivalry(state, a, b);
      setCooldown(state, a, b, d.cooldownDays);
    }
  }
  if (leaving.length === war[side].length) {
    state.wars.splice(state.wars.indexOf(war), 1);
    pruneMilitary(state, content);
    return `The ${warName(content, war)} is over: ${name(content, leader)} accepted ${name(content, x)}'s call for peace.`;
  }
  war[side] = war[side].filter((id) => id !== x);
  pruneMilitary(state, content);
  return `${name(content, x)} made peace with ${name(content, leader)} and left the ${warName(content, war)}.`;
}

/** Takes a nation out of every war; wars left with an empty side end. */
function leaveAllWars(state: GameState, nationId: string): void {
  for (const war of [...state.wars]) {
    const side = sideOf(war, nationId);
    if (!side) continue;
    war[side] = war[side].filter((id) => id !== nationId);
    if (war[side].length === 0) state.wars.splice(state.wars.indexOf(war), 1);
  }
}

// ---------------------------------------------------------------------------
// Conquest

/** Every nation whose capital is fully occupied falls (checked after each day of fighting). */
export function resolveConquests(state: GameState, content: Content): void {
  for (const nation of state.nations) {
    if (isExtant(nation) && warsOf(state, nation.id).length > 0 && isFullyOccupied(state, nation.capitalId!)) conquer(state, content, nation);
  }
}

/**
 * Terra Invicta's War Conquest. The alliance that did most to take the capital wins: its
 * leader first, then the others by their part in the occupation (ties to the stronger), each
 * take every region of the fallen nation they claim. If nothing is left, the nation is
 * absorbed by whoever took the capital. Otherwise the leader's executive faction takes every
 * CP of what remains; with no faction there, the faction whose armies in the nation are
 * strongest does, else the CPs are emptied. The fallen nation leaves its wars and joins the
 * victors' alliance.
 */
export function conquer(state: GameState, content: Content, nation: NationState): void {
  const m = content.rules.military.conquest;
  const capital = capitalRegion(state, content, nation.id);
  const shares = state.occupation[capital.id] ?? {};
  let best: { war: WarState; side: WarSide; share: number } | null = null;
  for (const war of warsOf(state, nation.id)) {
    const side = otherSide(sideOf(war, nation.id)!);
    const share = war[side].reduce((sum, id) => sum + (shares[id] ?? 0), 0);
    if (!best || share > best.share) best = { war, side, share };
  }
  if (!best) return;
  const victors = [...best.war[best.side]];
  const lead = sideLeader(state, content, best.war, best.side);
  const strength = new Map(victors.map((id) => [id, militaryStrength(state, content, nationState(state, id))]));
  const formerExecutive = nation.controlPoints[0]!.owner;
  const order = [lead, ...victors.filter((id) => id !== lead).sort((a, b) => (shares[b] ?? 0) - (shares[a] ?? 0) || strength.get(b)! - strength.get(a)! || a.localeCompare(b))];

  // The victors take what they claim, hostile claims included.
  const taken = new Map<string, string[]>();
  let capitalTaker: string | null = null;
  for (const id of order) {
    for (const r of [...nationRegions(state, content, nation.id)]) {
      if (!hasClaim(state, content, id, r.id)) continue;
      if (r.id === capital.id) capitalTaker = id;
      takeRegion(state, content, r.id, id);
      taken.set(id, [...(taken.get(id) ?? []), r.name]);
    }
  }
  const spoils = [...taken].map(([id, names]) => `${name(content, id)} takes ${names.length === 1 ? names[0] : `${names.length} regions`}`).join("; ");
  for (const id of victors) if (state.breakaways[id] === nation.id) delete state.breakaways[id];

  if (!isExtant(nation)) {
    const into = capitalTaker ?? lead;
    inheritClaims(state, content, nation.id, into);
    addLog(state, { nationId: into, kind: "war", text: `${name(content, lead)} took ${capital.name}: ${name(content, nation.id)} has fallen and is no more. ${spoils}.` });
    return;
  }

  let faction = nationState(state, lead).controlPoints[0]!.owner;
  if (faction === null) {
    const enemies = new Set([...enemiesOf(state, nation.id)]);
    const regionIds = new Set(nationRegions(state, content, nation.id).map((r) => r.id));
    const scores = new Map<string, number>();
    for (const army of state.armies) {
      if (!enemies.has(army.nationId) || !regionIds.has(army.regionId) || army.move) continue;
      const commander = armyCommander(state, army);
      if (commander) scores.set(commander, (scores.get(commander) ?? 0) + nationState(state, army.nationId).militaryTech * army.health);
    }
    for (const f of content.factions) if ((scores.get(f.id) ?? 0) > (faction ? scores.get(faction)! : 0)) faction = f.id;
  }

  const regions = nationRegions(state, content, nation.id);
  const occupiedShare = regions.filter((r) => isFullyOccupied(state, r.id)).length / regions.length;
  const leadAllies = alliesOf(state, lead);
  const leadEnemies = [...enemiesOf(state, lead)].filter((id) => id !== nation.id);

  for (const cp of nation.controlPoints) {
    cp.owner = faction;
    cp.disabledUntil = 0;
    cp.defendedUntil = 0;
  }
  seizeExecutive(state, nation);
  leaveAllWars(state, nation.id);
  // A fallen government leaves its federation, as after a coup or revolution.
  const federation = removeFromFederation(state, content, nation.id);
  for (const id of alliesOf(state, nation.id)) if (leadEnemies.includes(id)) removeAlliance(state, nation.id, id);
  for (const id of [...victors, ...leadAllies]) removeRivalry(state, nation.id, id);
  for (const id of victors) if (isExtant(nationState(state, id))) addAlliance(state, nation.id, id);

  // Unrest: less where the occupation was thorough, more for every army still standing.
  // Psyops projects of the new faction calm the takeover; Guerrilla Warfare of the old one doesn't.
  const c = content.rules.claims.conquestUnrest;
  const completed = (f: string | null, id: string) => f !== null && (factionState(state, f).research.completed[id] ?? 0) > 0;
  let unrest = occupiedShare * m.unrestPerOccupiedShare + m.unrestBase + nationArmies(state, nation.id).length;
  if (completed(faction, "Project_Psyops")) unrest -= c.psyops;
  if (completed(faction, "Project_NetworkedPsyops")) unrest -= c.psyops;
  if (completed(formerExecutive, "Project_GuerrillaWarfare")) unrest += c.guerrilla;
  if (unrest > 0) {
    const support = faction
      ? (nation.publicOpinion[faction] ?? 0)
      : Math.max(0, ...Object.entries(nation.publicOpinion).filter(([id]) => id !== UNDECIDED).map(([, s]) => s));
    unrest *= 1 - support;
  }
  if (faction) unrest -= c.perRaised * (state.unrestRaised[nation.id]?.[faction] ?? 0);
  delete state.unrestRaised[nation.id];
  unrest += -1 + 2 * nextFloat(state.rng);
  nation.unrest = clamp10(nation.unrest + unrest);
  nation.cohesion = clamp10(nation.cohesion - m.cohesionLoss * nextFloat(state.rng));
  nation.democracy = clamp10(nation.democracy - m.governmentLoss * nextFloat(state.rng));
  const victor = nationState(state, lead);
  if (nation.democracy >= 5 && victor.democracy < nation.democracy) {
    const [lo, hi] = m.governmentConvergence;
    nation.democracy = clamp10(nation.democracy - (lo + (hi - lo) * nextFloat(state.rng)) * (nation.democracy - victor.democracy));
  }

  // The war is over for this nation: its regions are its own again.
  for (const r of regions) delete state.occupation[r.id];
  pruneMilitary(state, content);
  const who = faction ? factionDef(content, faction).name : "nobody";
  addLog(state, {
    nationId: nation.id,
    factionId: faction ?? undefined,
    kind: "war",
    text: `${name(content, lead)} took ${capital.name}: the government of ${name(content, nation.id)} has fallen, and its control points go to ${who}.${spoils ? ` ${spoils}.` : ""}${federation ? ` It is no longer in the ${federation.name}.` : ""}`,
  });
}
