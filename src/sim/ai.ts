// Faction AI for the council phase (SPEC 2.15). Each free councilor takes the mission with
// the best expected value, staying inside the faction's control point capacity. Below that,
// the nations' own military AI moves every army that no player commands.

import type { Content, RegionDef, SpendResource } from "./content";
import { alliesOf, checkPolicy, enemiesOf, policyOptions, rivalsOf, sideOf, warCapable, warScore, warsOf } from "./diplomacy";
import { factionDef, factionState, nationState } from "./lookup";
import { armyCommander, nationToRestore, checkAirlift, checkAnnex, checkMove, distanceKm, isFriendlyRegion, isFullyOccupied, mayEnter, militaryStrength, navalFreedom, occupiedShare, startAnnex, startMove } from "./military";
import { assessMission, checkMissionCost, committedResources, ideologicalDistance } from "./missions";
import { controlCap, controlUpkeep } from "./monthly";
import { controlPointCapacityCost, corruption, isDefended, isDisabled } from "./nation";
import type { ArmyState, Councilor, FactionState, GameState, Mission, NationState, Policy } from "./state";
import { capitalRegion, isCapital, isExtant, nationRegions, populationShare, regionDef, regionOwner } from "./territory";

/** How much one control point in this nation is worth to hold. √ keeps giants from dominating. */
function cpValue(nation: NationState): number {
  return Math.sqrt(nation.gdp / nation.controlPoints.length);
}

function chanceOf(state: GameState, content: Content, faction: FactionState, councilor: Councilor, mission: Mission): number | null {
  const a = assessMission(state, content, faction.id, councilor, mission);
  if (!a.ok) return null;
  return a.contested ? a.odds.chance : 1;
}

/** Missions below these odds are not worth a councilor's turn (or the risk of a critical failure). */
const MIN_CHANCE = 0.3;

/** Odds the AI pays to reach on a contested mission, and the share of its spare resources it will put into one. */
const SPEND_TARGET = 0.75;
const SPEND_SHARE = 1 / 3;

/** Resources not yet committed to this phase's missions. */
function spare(content: Content, faction: FactionState, resource: SpendResource): number {
  return faction.resources[resource] - committedResources(content, faction)[resource];
}

/** The smallest spend that lifts the mission to SPEND_TARGET within budget, or 0. */
function chooseSpend(state: GameState, content: Content, faction: FactionState, councilor: Councilor, mission: Mission): number {
  const rule = content.rules.missions.costs[mission.type];
  if (!rule?.spend) return 0;
  const base = chanceOf(state, content, faction, councilor, mission);
  if (base === null || base >= SPEND_TARGET) return 0;
  const budget = spare(content, faction, rule.resource) * SPEND_SHARE;
  for (const step of content.rules.missions.spend.steps) {
    if (step === 0 || step > budget) continue;
    if ((chanceOf(state, content, faction, councilor, { ...mission, spend: step }) ?? 0) >= SPEND_TARGET) return step;
  }
  return 0;
}

/** Drops the least valuable CPs (per point of capacity) until the faction is back under its cap. */
export function abandonOverCap(state: GameState, content: Content, faction: FactionState): void {
  const cap = controlCap(state, content, faction).value;
  let upkeep = controlUpkeep(state, content, faction.id);
  if (upkeep <= cap) return;
  const held: { nation: NationState; index: number; cost: number; score: number }[] = [];
  for (const nation of state.nations) {
    nation.controlPoints.forEach((cp, index) => {
      if (cp.owner !== faction.id || isDisabled(state, nation, index)) return;
      const cost = controlPointCapacityCost(content, nation);
      // Keep executives: they are the hardest CPs to win back.
      const worth = cpValue(nation) * (index === 0 ? 3 : 1);
      held.push({ nation, index, cost, score: worth / cost });
    });
  }
  held.sort((a, b) => a.score - b.score || a.nation.id.localeCompare(b.nation.id) || a.index - b.index);
  for (const h of held) {
    if (upkeep <= cap) break;
    h.nation.controlPoints[h.index]!.owner = null;
    h.nation.controlPoints[h.index]!.defendedUntil = 0;
    upkeep -= h.cost;
  }
}

/**
 * Sets this faction's priorities in every nation where it holds CPs: the default
 * nation-building mix plus enough Spoils to keep the elites satisfied, since
 * unsatisfied elites make coups much easier.
 */
function setPriorities(state: GameState, content: Content, faction: FactionState): void {
  const base = content.rules.defaultPriorities;
  const baseTotal = Object.values(base).reduce((a, b) => a + b, 0);
  for (const nation of state.nations) {
    if (!nation.controlPoints.some((cp) => cp.owner === faction.id)) continue;
    const share = corruption(content, nation).value;
    // spoils / (baseTotal + spoils) = share  →  spoils = share × baseTotal / (1 − share)
    const spoils = Math.round(((share * baseTotal) / (1 - share)) * 10) / 10;
    faction.priorityWeights[nation.id] = { ...base, spoils };
  }
}

export function planCouncilPhase(state: GameState, content: Content, faction: FactionState): void {
  abandonOverCap(state, content, faction);
  setPriorities(state, content, faction);
  const cap = controlCap(state, content, faction).value;
  let room = cap - controlUpkeep(state, content, faction.id);
  // Missions already planned this phase, including other factions' (AI factions plan in turn).
  const claimed = new Set<string>();
  for (const other of state.factions) {
    for (const c of other.councilors) {
      const m = c.mission;
      if (m?.type === "crackdown" || m?.type === "purge") claimed.add(`${m.nationId}:${m.cpIndex}`);
    }
  }
  const freeTaken = new Map<string, number>();
  for (const other of state.factions) for (const c of other.councilors) if (c.mission?.type === "controlNation") freeTaken.set(c.mission.nationId, (freeTaken.get(c.mission.nationId) ?? 0) + 1);
  const defended = new Set<string>();
  const campaigned = new Set<string>();
  /** Nations being stabilized or advised, and councilors being targeted, by this faction this phase. */
  const stabilized = new Set<string>();
  const agitated = new Set<string>();
  const advised = new Set<string>();
  const targeted = new Set<string>();
  const policySet = new Set<string>();
  const pro = factionDef(content, faction.id).alienStance > 0;
  /** The best policy worth setting in each nation whose executive we hold, worked out once per phase. */
  const policies = new Map<string, { policy: Policy; weight: number } | null>();
  const policyFor = (nation: NationState) => {
    if (!policies.has(nation.id)) policies.set(nation.id, bestPolicy(state, content, faction, nation));
    return policies.get(nation.id)!;
  };

  for (const councilor of faction.councilors) {
    if (councilor.detainedPhases > 0) continue;
    let best: { mission: Mission; score: number; cost: number } | null = null;
    const consider = (mission: Mission, weight: number, cost: number) => {
      if (!checkMissionCost(state, content, faction, councilor.id, mission).ok) return;
      const chance = chanceOf(state, content, faction, councilor, mission);
      if (chance === null || chance < MIN_CHANCE) return;
      const score = chance * weight;
      if (score > 0 && (!best || score > best.score)) best = { mission, score, cost };
    };

    for (const nation of state.nations) {
      if (!isExtant(nation)) continue;
      const value = cpValue(nation);
      const cost = controlPointCapacityCost(content, nation);
      const free = nation.controlPoints.filter((cp) => cp.owner === null).length - (freeTaken.get(nation.id) ?? 0);
      if (free > 0 && cost <= room) consider({ type: "controlNation", nationId: nation.id }, value, cost);

      nation.controlPoints.forEach((cp, i) => {
        if (!cp.owner || cp.owner === faction.id || claimed.has(`${nation.id}:${i}`)) return;
        // Factions on the other side of the alien question are the natural enemies.
        const enmity = 0.5 + ideologicalDistance(content, faction.id, cp.owner) + (pro !== factionDef(content, cp.owner).alienStance > 0 ? 0.5 : 0);
        if (cost > room) return;
        const purge: Mission = { type: "purge", nationId: nation.id, cpIndex: i };
        consider(purge, value * enmity * 0.9, cost);
        // A crackdown only pays off as the set-up for a purge that is unlikely without it.
        const purgeChance = chanceOf(state, content, faction, councilor, purge) ?? 0;
        if (purgeChance < 0.35 && !isDisabled(state, nation, i)) {
          consider({ type: "crackdown", nationId: nation.id, cpIndex: i }, value * enmity * 0.15, 0);
        }
      });

      // A coup is worth it to break enemy control, not to churn a nation that just had one.
      const recentCoup = nation.lastCoupDay !== null && state.dayIndex - nation.lastCoupDay < 730;
      const enemyCps = nation.controlPoints.filter((cp) => cp.owner && cp.owner !== faction.id).length;
      if (nation.controlPoints[0]!.owner !== faction.id && enemyCps >= 2 && !recentCoup) {
        consider({ type: "coup", nationId: nation.id }, value * 0.3 * enemyCps, cost);
      }

      // The policy itself is picked again when the mission succeeds (aiPolicy).
      if (nation.controlPoints[0]!.owner === faction.id && !policySet.has(nation.id)) {
        const best = policyFor(nation);
        if (best) consider({ type: "setPolicy", nationId: nation.id }, best.weight, 0);
      }

      const mine = nation.controlPoints.filter((cp, i) => cp.owner === faction.id && !isDisabled(state, nation, i)).length;
      const threatened = nation.controlPoints.some((cp) => cp.owner && cp.owner !== faction.id);
      const alreadyDefended = nation.controlPoints.some((cp, i) => cp.owner === faction.id && isDefended(state, nation, i));
      const diCost = content.rules.missions.costs.defendInterests?.fixed ?? 0;
      if (mine >= 2 && threatened && !alreadyDefended && !defended.has(nation.id) && spare(content, faction, "influence") >= diCost + 10) {
        consider({ type: "defendInterests", nationId: nation.id }, value * mine * 0.3, 0);
      }

      // Calm our own restless nations; lend expertise where we hold several CPs.
      if (nation.controlPoints[0]!.owner === faction.id && nation.unrest > 3 && !stabilized.has(nation.id)) {
        consider({ type: "stabilizeNation", nationId: nation.id }, value * 0.25 * (nation.unrest - 3), 0);
      }
      // Stir up unrest where a fallen nation could break away under our flag (not against a
      // government we run ourselves, nor one with armies to crush the breakaway at once), and a
      // little against governments run by factions on the other side of the alien question.
      const exec = nation.controlPoints[0]!.owner;
      if (nation.unrest < 9 && !agitated.has(nation.id) && exec !== faction.id) {
        const armed = state.armies.some((a) => a.nationId === nation.id);
        for (const r of armed ? [] : nationRegions(state, content, nation.id)) {
          if (!isCapital(state, r.id) && nationToRestore(state, content, r.id)) consider({ type: "increaseUnrest", nationId: nation.id, regionId: r.id }, value * 0.6, 0);
        }
        if (exec && exec !== faction.id && pro !== factionDef(content, exec).alienStance > 0) {
          consider({ type: "increaseUnrest", nationId: nation.id, regionId: nation.capitalId! }, value * 0.1, 0);
        }
      }

      const adviseCost = content.rules.missions.costs.advise?.fixed ?? 0;
      if (mine >= 2 && !advised.has(nation.id) && spare(content, faction, "influence") >= adviseCost + 30) {
        consider({ type: "advise", nationId: nation.id }, value * 0.1 * mine, 0);
      }
    }

    // A councilor who knows they've been spotted lies low, less so the busier the council is.
    if (councilor.spottedBy.length > 0) {
      consider({ type: "goToGround", nationId: councilor.locationId, regionId: capitalRegion(state, content, councilor.locationId).id }, 4 * councilor.spottedBy.length, 0);
    }

    // Enemy councilors we have found: learn more about them, then remove the ones on the other side of the alien question.
    for (const other of state.factions) {
      if (other.id === faction.id) continue;
      const enemy = pro !== factionDef(content, other.id).alienStance > 0;
      for (const target of other.councilors) {
        const intel = faction.intel[target.id] ?? 0;
        if (intel < content.rules.missions.intelToLocate || targeted.has(target.id)) continue;
        if (intel < 0.5) consider({ type: "investigateCouncilor", nationId: target.locationId, targetId: target.id }, 6, 0);
        if (enemy) consider({ type: "assassinate", nationId: target.locationId, targetId: target.id }, 12, 0);
      }
    }

    // With nothing better to do, campaign where there are CPs to win or keep, less as our support grows.
    if (!best) {
      for (const nation of state.nations) {
        if (!isExtant(nation)) continue;
        const support = nation.publicOpinion[faction.id] ?? 0;
        const stake = nation.controlPoints.some((cp) => cp.owner === null || cp.owner === faction.id);
        if (stake && !campaigned.has(nation.id) && support < 0.4) {
          consider({ type: "publicCampaign", nationId: nation.id }, cpValue(nation) * (1 - support / 0.4), 0);
        }
      }
    }

    const chosen = best as { mission: Mission; score: number; cost: number } | null;
    if (!chosen) continue;
    const spend = chooseSpend(state, content, faction, councilor, chosen.mission);
    councilor.mission = spend > 0 ? { ...chosen.mission, spend } : chosen.mission;
    room -= chosen.cost;
    const m = chosen.mission;
    if (m.type === "controlNation") freeTaken.set(m.nationId, (freeTaken.get(m.nationId) ?? 0) + 1);
    if (m.type === "crackdown" || m.type === "purge") claimed.add(`${m.nationId}:${m.cpIndex}`);
    if (m.type === "setPolicy") policySet.add(m.nationId);
    if (m.type === "publicCampaign") campaigned.add(m.nationId);
    if (m.type === "stabilizeNation") stabilized.add(m.nationId);
    if (m.type === "increaseUnrest") agitated.add(m.nationId);
    if (m.type === "advise") advised.add(m.nationId);
    if (m.type === "investigateCouncilor" || m.type === "assassinate") targeted.add(m.targetId);
    if (m.type === "defendInterests") defended.add(m.nationId);
  }
  faction.councilDone = true;
}

/** The valid policy most worth setting in a nation whose executive the faction holds, if any. */
function bestPolicy(state: GameState, content: Content, faction: FactionState, nation: NationState): { policy: Policy; weight: number } | null {
  let best: { policy: Policy; weight: number } | null = null;
  for (const option of [...warPolicies(state, content, faction, nation), ...claimPolicies(state, content, faction, nation)]) {
    if (option.weight > (best?.weight ?? 0) && checkPolicy(state, content, faction.id, nation.id, option.policy).ok) best = option;
  }
  return best;
}

/** An AI faction's pick once its Set National Policy mission succeeds, or null to set none. */
export function aiPolicy(state: GameState, content: Content, factionId: string, nationId: string): Policy | null {
  return bestPolicy(state, content, factionState(state, factionId), nationState(state, nationId))?.policy ?? null;
}

/**
 * War and peace for a nation whose executive the faction holds: declare war on a rival only
 * with twice the strength of it and its allies (nuclear powers are effectively off limits),
 * and seek peace from a war going badly.
 */
function warPolicies(state: GameState, content: Content, faction: FactionState, nation: NationState): { policy: Policy; weight: number }[] {
  const out: { policy: Policy; weight: number }[] = [];
  const wars = warsOf(state, nation.id);
  for (const war of wars) {
    if (warScore(state, content, war, sideOf(war, nation.id)!) < -0.15 && state.dayIndex - war.startDay > 60) {
      out.push({ policy: { kind: "seekPeace", warId: war.id }, weight: cpValue(nation) * nation.controlPoints.length * 0.5 });
    }
  }
  if (wars.length > 0 || !warCapable(state, nation)) return out;
  const ours = militaryStrength(state, content, nation);
  for (const id of rivalsOf(state, nation.id)) {
    const target = nationState(state, id);
    if (target.controlPoints[0]!.owner === faction.id) continue;
    let theirs = militaryStrength(state, content, target);
    for (const ally of alliesOf(state, id)) {
      const n = nationState(state, ally);
      if (warCapable(state, n)) theirs += militaryStrength(state, content, n);
    }
    if (ours >= 2 * theirs) out.push({ policy: { kind: "declareWar", targetId: id }, weight: cpValue(target) * target.controlPoints.length * 0.3 });
  }
  return out;
}

/**
 * Claims for a nation whose executive the faction holds: federate with nations whose
 * government it also runs (a federation is the road to unifying), unify with fellow members
 * it runs outright, and demand claimed regions from nations it has no stake in. A
 * demand needs strength behind it, so only nations with under half the military strength of
 * ours are asked (which also keeps two nations from trading a region back and forth).
 */
function claimPolicies(state: GameState, content: Content, faction: FactionState, nation: NationState): { policy: Policy; weight: number }[] {
  const out: { policy: Policy; weight: number }[] = [];
  const ours = militaryStrength(state, content, nation);
  for (const policy of policyOptions(state, content, nation.id)) {
    if (policy.kind === "unify") {
      if (!checkPolicy(state, content, faction.id, nation.id, policy).ok) continue;
      const target = nationState(state, policy.targetId);
      out.push({ policy, weight: cpValue(target) * target.controlPoints.length * 0.5 });
    } else if (policy.kind === "federate") {
      const target = nationState(state, policy.targetId);
      if (target.controlPoints[0]!.owner !== faction.id) continue;
      if (!checkPolicy(state, content, faction.id, nation.id, policy).ok) continue;
      out.push({ policy, weight: cpValue(target) * target.controlPoints.length * 0.3 });
    } else if (policy.kind === "demandTerritory") {
      const owner = nationState(state, regionOwner(state, policy.regionId));
      if (owner.controlPoints.some((cp) => cp.owner === faction.id)) continue;
      if (militaryStrength(state, content, owner) * 2 > ours) continue;
      if (!checkPolicy(state, content, faction.id, nation.id, policy).ok) continue;
      out.push({ policy, weight: 0.5 * Math.sqrt(owner.gdp * populationShare(state, content, policy.regionId)) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Armies

/** Planning estimate of travel days, without the terrain and unrest slowdowns. */
function routeDays(content: Content, miltech: number, from: RegionDef, to: RegionDef, naval: boolean): number {
  const r = content.rules.military;
  const km = distanceKm(from, to);
  return (naval ? r.navalBaseDays + km / r.navalKmPerDay : km / r.landKmPerDay) * (r.speedMiltech / Math.max(0.5, miltech));
}

/** The first region on the quickest route to any of the targets, or null if none can be reached. */
function firstStep(state: GameState, content: Content, army: ArmyState, targets: Set<string>): string | null {
  if (targets.size === 0) return null;
  const miltech = nationState(state, army.nationId).militaryTech;
  const sails = army.navy && navalFreedom(state, army.nationId);
  const regions = content.regions.filter((r) => r.id === army.regionId || mayEnter(state, content, army, r.id));
  const dist = new Map<string, number>([[army.regionId, 0]]);
  const first = new Map<string, string>();
  const done = new Set<string>();
  // Plain O(V²) Dijkstra in content order, so ties always break the same way.
  for (;;) {
    let current: RegionDef | null = null;
    for (const r of regions) if (!done.has(r.id) && dist.has(r.id) && (!current || dist.get(r.id)! < dist.get(current.id)!)) current = r;
    if (!current) return null;
    if (targets.has(current.id) && current.id !== army.regionId) return first.get(current.id)!;
    done.add(current.id);
    const base = dist.get(current.id)!;
    for (const next of regions) {
      if (done.has(next.id)) continue;
      const land = current.neighbors.includes(next.id);
      if (!land && !(sails && current.coastal && next.coastal)) continue;
      const d = base + routeDays(content, miltech, current, next, !land);
      if (d < (dist.get(next.id) ?? Infinity)) {
        dist.set(next.id, d);
        first.set(next.id, current.id === army.regionId ? next.id : first.get(current.id)!);
      }
    }
  }
}

/**
 * The first of its nation's armies based in the capital guards it. A nation's only army
 * stays home too, unless its nation started a war.
 */
function garrison(state: GameState, army: ArmyState): boolean {
  const armies = state.armies.filter((a) => a.nationId === army.nationId);
  if (armies.find((a) => a.homeRegionId === army.homeRegionId) !== army) return false;
  return armies.length > 1 || !state.wars.some((w) => w.attackers.includes(army.nationId));
}

function moveToward(state: GameState, content: Content, army: ArmyState, targets: Set<string>): void {
  const step = firstStep(state, content, army, targets);
  if (!step) return;
  const check = checkMove(state, content, army, step);
  if (check.ok) startMove(state, army, step, check.days, check.naval);
}

/**
 * Moves every army no player commands. In peacetime armies abroad fly home. At war an
 * army holds while it is fighting or taking a region; badly hurt, it falls back to friendly
 * ground; otherwise it goes to defend its own and its allies' regions, and failing that
 * marches on the nearest enemy capital, taking regions on the way.
 */
export function orderArmies(state: GameState, content: Content): void {
  const enemyArmiesIn = new Map<string, Set<string>>();
  for (const a of state.armies) if (!a.move) enemyArmiesIn.set(a.regionId, (enemyArmiesIn.get(a.regionId) ?? new Set()).add(a.nationId));
  const threatsFor = new Map<string, Set<string>>();

  for (const army of state.armies) {
    if (army.move || army.annex) continue;
    const enemies = enemiesOf(state, army.nationId);
    if (enemies.size === 0 && army.regionId === army.homeRegionId) continue;
    const commander = armyCommander(state, army);
    if (commander && factionState(state, commander).isPlayer) continue;
    if (enemies.size === 0) {
      const check = checkAirlift(state, content, army);
      if (check.ok) startMove(state, army, army.homeRegionId, check.days, true, true);
      continue;
    }
    const region = regionDef(content, army.regionId);
    const here = enemyArmiesIn.get(region.id) ?? new Set();
    if ([...here].some((id) => enemies.has(id))) continue;
    if (enemies.has(regionOwner(state, region.id)) && !isFullyOccupied(state, region.id)) continue;
    // A region taken that the nation claims (or can free) is worth staying to annex.
    if (enemies.has(regionOwner(state, region.id))) {
      const annex = checkAnnex(state, content, army);
      if (annex.ok) {
        startAnnex(state, army, annex.days);
        continue;
      }
    }

    const friendly = isFriendlyRegion(state, content, army.nationId, region.id);
    if (army.health < 0.35) {
      if (friendly && occupiedShare(state, region.id) === 0) continue;
      const safe = content.regions.filter((r) => isFriendlyRegion(state, content, army.nationId, r.id) && occupiedShare(state, r.id) === 0);
      moveToward(state, content, army, new Set(safe.map((r) => r.id)));
      continue;
    }

    let threats = threatsFor.get(army.nationId);
    if (!threats) {
      threats = new Set();
      for (const r of content.regions) {
        if (!isFriendlyRegion(state, content, army.nationId, r.id)) continue;
        const invaded = [...(enemyArmiesIn.get(r.id) ?? [])].some((id) => enemies.has(id));
        if (invaded || Object.keys(state.occupation[r.id] ?? {}).some((id) => enemies.has(id))) threats.add(r.id);
      }
      threatsFor.set(army.nationId, threats);
    }
    if (threats.has(region.id)) continue;
    if (threats.size > 0) {
      moveToward(state, content, army, threats);
      continue;
    }
    // One army stays to guard the capital while the rest go on the attack.
    const capital = capitalRegion(state, content, army.nationId).id;
    if (army.homeRegionId === capital && army.regionId === capital && garrison(state, army)) continue;
    moveToward(state, content, army, new Set([...enemies].map((id) => capitalRegion(state, content, id).id)));
  }
}
