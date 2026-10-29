// Player input reaches the simulation only as commands, so a game can be replayed from
// its seed plus the command log (SPEC 2.3).

import { settleClimateChoice, type ClimateOption } from "./climate";
import { ATTRIBUTES, type Attribute, type Content, type Gender } from "./content";
import { augment, buyOrg, checkAugment, checkBuyOrg, dismissCouncilor, sellOrg } from "./councilors";
import { allFactionsDone, closeCouncilPhase, findCouncilor } from "./council";
import { applyDiplomacy, checkDiplomacy, settlePolicyChoice, type DiplomaticAction } from "./diplomacy";
import { armyCommander, checkAirlift, checkAnnex, checkMove, checkNuclearStrike, launchNuclearStrike, startAnnex, startMove } from "./military";
import { assessMission, checkMissionCost } from "./missions";
import { checkProjectChoice, checkTechChoice } from "./research";
import { factionState } from "./lookup";
import { checkHire, hire } from "./setup";
import type { GameState, Mission, Policy } from "./state";

export type Command =
  | { type: "assignMission"; factionId: string; councilorId: string; mission: Mission | null }
  | { type: "setPriorityWeights"; factionId: string; nationId: string; weights: Record<string, number> }
  | { type: "endCouncilPhase"; factionId: string }
  | { type: "abandonControlPoint"; factionId: string; nationId: string; cpIndex: number }
  /** Sends an army we command to an adjacent region (or a coastal one by sea); null calls a move off. */
  | { type: "moveArmy"; factionId: string; armyId: string; regionId: string | null }
  | { type: "airliftArmy"; factionId: string; armyId: string }
  /** Starts Annex Region with an army we command in a region our side has fully occupied. */
  | { type: "annexRegion"; factionId: string; armyId: string }
  | { type: "diplomacy"; factionId: string; action: DiplomaticAction; nationId: string; targetId: string }
  /** Answers a climate event put to us (state.climateChoices). */
  | { type: "chooseClimateOption"; factionId: string; choiceId: string; option: ClimateOption }
  /** Fires one of a nation's nuclear weapons (we hold its executive) at a region. */
  | { type: "nuclearStrike"; factionId: string; nationId: string; regionId: string }
  /** Picks the policy for a Set National Policy that succeeded, or none (null) for a refund. */
  | { type: "choosePolicy"; factionId: string; nationId: string; policy: Policy | null }
  /** Spends XP to raise one of a councilor's attributes by a point. */
  | { type: "augmentAttribute"; factionId: string; councilorId: string; attribute: Attribute }
  /** Renames a councilor or changes their look; skinTone and hairSeed null keep the face seed's. */
  | {
      type: "customizeCouncilor";
      factionId: string;
      councilorId: string;
      name: string;
      gender: Gender;
      skinTone: number | null;
      portraitSeed: number;
      hairSeed: number | null;
    }
  | { type: "dismissCouncilor"; factionId: string; councilorId: string }
  | { type: "hireCouncilor"; factionId: string; recruitId: string }
  | { type: "buyOrg"; factionId: string; councilorId: string; orgId: string }
  | { type: "sellOrg"; factionId: string; councilorId: string; orgId: string }
  /** Picks the next global tech in a slot whose last tech we contributed most to. */
  | { type: "chooseTech"; factionId: string; slot: number; techId: string }
  /** Sets the research pips: one per global tech slot, then one per project slot. */
  | { type: "setResearchPips"; factionId: string; pips: number[] }
  /** Starts a project in a slot, or clears the slot with null. Research already put in is kept. */
  | { type: "setProject"; factionId: string; slot: number; projectId: string | null };

export type CommandResult = { ok: true } | { ok: false; reason: string };

const reject = (reason: string): CommandResult => ({ ok: false, reason });

export function applyCommand(state: GameState, content: Content, command: Command): CommandResult {
  const faction = state.factions.find((f) => f.id === command.factionId);
  if (!faction) return reject(`Unknown faction "${command.factionId}"`);

  switch (command.type) {
    case "assignMission": {
      if (state.phase !== "council") return reject("Missions can only be assigned during a council phase");
      if (faction.councilDone) return reject("This faction has already ended its council phase");
      const councilor = findCouncilor(state, faction.id, command.councilorId);
      if (!councilor) return reject(`Unknown councilor "${command.councilorId}"`);
      if (command.mission) {
        const assessment = assessMission(state, content, faction.id, councilor, command.mission);
        if (!assessment.ok) return reject(assessment.reason);
        const cost = checkMissionCost(state, content, faction, councilor.id, command.mission);
        if (!cost.ok) return reject(cost.reason);
      }
      councilor.mission = command.mission;
      return { ok: true };
    }
    case "choosePolicy": {
      const check = settlePolicyChoice(state, content, faction.id, command.nationId, command.policy);
      return check.ok ? { ok: true } : reject(check.reason);
    }
    case "chooseClimateOption": {
      const check = settleClimateChoice(state, content, faction.id, command.choiceId, command.option);
      return check.ok ? { ok: true } : reject(check.reason);
    }
    case "nuclearStrike": {
      const check = checkNuclearStrike(state, content, faction.id, command.nationId, command.regionId);
      if (!check.ok) return reject(check.reason);
      launchNuclearStrike(state, content, faction.id, command.nationId, command.regionId);
      return { ok: true };
    }
    case "chooseTech": {
      const check = checkTechChoice(state, content, faction.id, command.slot, command.techId);
      if (!check.ok) return reject(check.reason);
      state.research.slots[command.slot]!.techId = command.techId;
      return { ok: true };
    }
    case "setResearchPips": {
      const r = content.rules.research;
      const pips = command.pips;
      if (pips.length !== faction.research.pips.length) return reject("Give a pip count for every research slot");
      if (pips.some((p) => !Number.isInteger(p) || p < 0 || p > r.maxPips)) return reject(`Pips run from 0 to ${r.maxPips}`);
      faction.research.pips = [...pips];
      return { ok: true };
    }
    case "setProject": {
      const check = checkProjectChoice(content, faction, command.slot, command.projectId);
      if (!check.ok) return reject(check.reason);
      faction.research.projectSlots[command.slot] = command.projectId;
      if (command.projectId) faction.research.choosing = faction.research.choosing.filter((j) => j !== command.slot);
      return { ok: true };
    }
    case "setPriorityWeights": {
      const nation = state.nations.find((n) => n.id === command.nationId);
      if (!nation) return reject(`Unknown nation "${command.nationId}"`);
      if (!nation.controlPoints.some((cp) => cp.owner === faction.id)) return reject("The faction holds no CP in that nation");
      const known = new Set(content.priorities.map((p) => p.id));
      const weights: Record<string, number> = {};
      for (const [id, weight] of Object.entries(command.weights)) {
        if (!known.has(id)) return reject(`Unknown priority "${id}"`);
        if (!(weight >= 0) || !Number.isFinite(weight)) return reject(`Invalid weight for "${id}"`);
        weights[id] = weight;
      }
      faction.priorityWeights[nation.id] = weights;
      return { ok: true };
    }
    case "abandonControlPoint": {
      const nation = state.nations.find((n) => n.id === command.nationId);
      const cp = nation?.controlPoints[command.cpIndex];
      if (!cp || cp.owner !== faction.id) return reject("We do not hold that control point");
      cp.owner = null;
      cp.disabledUntil = 0;
      cp.defendedUntil = 0;
      return { ok: true };
    }
    case "moveArmy":
    case "airliftArmy": {
      const army = state.armies.find((a) => a.id === command.armyId);
      if (!army) return reject(`Unknown army "${command.armyId}"`);
      if (armyCommander(state, army) !== faction.id) return reject("We don't command that army");
      if (command.type === "moveArmy" && command.regionId === null) {
        // Calling a move off brings the army back to where it set out from.
        army.move = null;
        return { ok: true };
      }
      const check = command.type === "airliftArmy" ? checkAirlift(state, content, army) : checkMove(state, content, army, command.regionId!);
      if (!check.ok) return reject(check.reason);
      // Moving off abandons an annexation.
      army.annex = null;
      const airlift = command.type === "airliftArmy";
      startMove(state, army, airlift ? army.homeRegionId : command.regionId!, check.days, check.naval, airlift);
      return { ok: true };
    }
    case "annexRegion": {
      const army = state.armies.find((a) => a.id === command.armyId);
      if (!army) return reject(`Unknown army "${command.armyId}"`);
      if (armyCommander(state, army) !== faction.id) return reject("We don't command that army");
      const check = checkAnnex(state, content, army);
      if (!check.ok) return reject(check.reason);
      startAnnex(state, army, check.days);
      return { ok: true };
    }
    case "diplomacy": {
      const check = checkDiplomacy(state, content, faction.id, command.action, command.nationId, command.targetId);
      if (!check.ok) return reject(check.reason);
      applyDiplomacy(state, content, faction.id, command.action, command.nationId, command.targetId);
      return { ok: true };
    }
    case "augmentAttribute":
    case "customizeCouncilor":
    case "dismissCouncilor":
    case "buyOrg":
    case "sellOrg": {
      const councilor = findCouncilor(state, faction.id, command.councilorId);
      if (!councilor) return reject(`Unknown councilor "${command.councilorId}"`);
      if (command.type === "augmentAttribute") {
        if (!ATTRIBUTES.includes(command.attribute)) return reject(`Unknown attribute "${command.attribute}"`);
        const check = checkAugment(content, councilor, command.attribute);
        if (!check.ok) return reject(check.reason);
        augment(content, councilor, command.attribute);
      } else if (command.type === "customizeCouncilor") {
        const name = command.name.trim();
        if (name.length === 0 || name.length > 40) return reject("A name needs 1–40 characters");
        if (command.skinTone !== null && !(Number.isInteger(command.skinTone) && command.skinTone >= 0 && command.skinTone < 32)) return reject("Invalid skin tone");
        const seed = (n: number | null) => n === null || (Number.isInteger(n) && n >= 0 && n <= 0x7fffffff);
        if (!seed(command.portraitSeed) || !seed(command.hairSeed)) return reject("Invalid portrait");
        if (command.gender !== "female" && command.gender !== "male") return reject("Invalid gender");
        councilor.name = name;
        councilor.gender = command.gender;
        councilor.hairSeed = command.hairSeed;
        councilor.skinTone = command.skinTone;
        councilor.portraitSeed = command.portraitSeed;
      } else if (command.type === "dismissCouncilor") {
        if (faction.councilors.length <= 1) return reject("A faction can't dismiss its last councilor");
        dismissCouncilor(state, content, faction, councilor);
      } else if (command.type === "buyOrg") {
        const check = checkBuyOrg(state, content, faction, councilor, command.orgId);
        if (!check.ok) return reject(check.reason);
        buyOrg(state, content, faction, councilor, command.orgId);
      } else {
        if (!councilor.orgs.includes(command.orgId)) return reject("The councilor doesn't hold that org");
        sellOrg(content, faction, councilor, command.orgId);
      }
      return { ok: true };
    }
    case "hireCouncilor": {
      const check = checkHire(state, content, faction, command.recruitId);
      if (!check.ok) return reject(check.reason);
      hire(state, content, faction, command.recruitId);
      return { ok: true };
    }
    case "endCouncilPhase": {
      if (state.phase !== "council") return reject("There is no council phase to end");
      factionState(state, faction.id).councilDone = true;
      if (allFactionsDone(state)) closeCouncilPhase(state, content);
      return { ok: true };
    }
  }
}
