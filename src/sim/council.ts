// Council phases (SPEC 2.5, 2.7). A mission is a councilor's current assignment; every
// free councilor can take one per phase. When all factions are done, the missions are
// scheduled through the following run phase in Terra Invicta's order (closeCouncilPhase).

import type { Content } from "./content";
import { abandonOverCap } from "./ai";
import { dateOfDay } from "./calendar";
import { factionState } from "./lookup";
import { assessMission, payForMissions, resolveMission, startTurnIntel } from "./missions";
import { nextInt } from "./rng";
import { currentMinute, MINUTES_PER_DAY } from "./time";
import type { Councilor, GameState, Mission } from "./state";

/** Stops time and opens a council phase. */
export function startCouncilPhase(state: GameState, content: Content): void {
  state.phase = "council";
  // Protect Target and Advise last until the next council phase; intel fades.
  state.protections = {};
  state.advisors = {};
  startTurnIntel(state, content);
  for (const faction of state.factions) {
    faction.councilDone = false;
    for (const councilor of faction.councilors) {
      councilor.mission = null;
      if (councilor.detainedPhases > 0) councilor.detainedPhases -= 1;
    }
  }
}

export function allFactionsDone(state: GameState): boolean {
  return state.factions.every((f) => f.councilDone);
}

interface Pending {
  factionIndex: number;
  councilorIndex: number;
  factionId: string;
  councilor: Councilor;
  mission: Mission;
  order: number;
  contested: boolean;
  chance: number;
}

/**
 * Closes the council phase and lets time run again. Missions don't resolve at once: as in
 * Terra Invicta they resolve "in a sequence over the next few days or weeks". The sequence
 * is fixed now, in Terra Invicta's order: by resolution order (0–4), uncontested before
 * contested, then highest success chance first. Remaining ties go by faction and council
 * order so the RNG draws stay deterministic. Each mission gets a random time before the
 * next council phase, and re-checks its target and odds when it resolves.
 */
export function closeCouncilPhase(state: GameState, content: Content): void {
  const rules = content.rules.missions;
  // Resources are spent when the missions are committed, whatever the outcome.
  for (const faction of state.factions) payForMissions(state, content, faction);
  const pending: Pending[] = [];
  state.factions.forEach((faction, factionIndex) => {
    faction.councilors.forEach((councilor, councilorIndex) => {
      const mission = councilor.mission;
      if (!mission) return;
      const assessment = assessMission(state, content, faction.id, councilor, mission);
      pending.push({
        factionIndex,
        councilorIndex,
        factionId: faction.id,
        councilor,
        mission,
        order: rules[mission.type].order,
        contested: assessment.ok ? assessment.contested : true,
        chance: assessment.ok && assessment.contested ? assessment.odds.chance : 0,
      });
    });
  });
  pending.sort(
    (a, b) =>
      a.order - b.order ||
      Number(a.contested) - Number(b.contested) ||
      b.chance - a.chance ||
      a.factionIndex - b.factionIndex ||
      a.councilorIndex - b.councilorIndex,
  );

  // Random minutes strictly inside the window, never on a midnight, so a mission can't
  // coincide with the daily tick; sorted so they follow the sequence.
  const start = currentMinute(state);
  const end = (state.dayIndex + daysUntilNextCouncilPhase(state, content)) * MINUTES_PER_DAY;
  const times = pending.map(() => {
    const t = nextInt(state.rng, start + 1, end - 1);
    return t % MINUTES_PER_DAY === 0 ? t + 1 : t;
  });
  times.sort((a, b) => a - b);
  state.scheduledMissions = pending.map((p, i) => ({ factionId: p.factionId, councilorId: p.councilor.id, at: times[i]! }));
  state.phase = "running";
}

/** Resolves the next scheduled mission. */
export function resolveNextMission(state: GameState, content: Content): void {
  const next = state.scheduledMissions.shift();
  if (!next) return;
  const councilor = findCouncilor(state, next.factionId, next.councilorId);
  const mission = councilor?.mission;
  if (!councilor || !mission) return;
  const result = resolveMission(state, content, next.factionId, councilor, mission);
  councilor.mission = null;
  // Councilors travel to their missions and stay there afterwards.
  councilor.locationId = mission.nationId;
  councilor.regionId = result.regionId;
  // Once a coup succeeds, other coups planned against that nation abort.
  if (mission.type === "coup" && (result.outcome === "success" || result.outcome === "criticalSuccess")) {
    state.scheduledMissions = state.scheduledMissions.filter((s) => {
      const other = findCouncilor(state, s.factionId, s.councilorId);
      if (other?.mission?.type !== "coup" || other.mission.nationId !== mission.nationId) return true;
      other.mission = null;
      return false;
    });
  }
  // AI factions shed CPs straight away if a mission left them over their cap (for example
  // because a councilor was detained), before the influence penalty builds up.
  for (const faction of state.factions) if (!faction.isPlayer) abandonOverCap(state, content, faction);
}

/** Resolves every scheduled mission now, ignoring their times (tests and tools). */
export function resolveAllScheduledMissions(state: GameState, content: Content): void {
  while (state.scheduledMissions.length > 0) resolveNextMission(state, content);
}

/** Days from today to the next council phase day (at least 1). */
export function daysUntilNextCouncilPhase(state: GameState, content: Content): number {
  for (let d = 1; d <= 62; d++) {
    if (content.rules.councilPhaseDays.includes(dateOfDay(content.rules.startYear, state.dayIndex + d).day)) return d;
  }
  throw new Error("rules.councilPhaseDays names no day of the month");
}

export function findCouncilor(state: GameState, factionId: string, councilorId: string): Councilor | undefined {
  return factionState(state, factionId).councilors.find((c) => c.id === councilorId);
}
