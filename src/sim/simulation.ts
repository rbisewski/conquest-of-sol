// The game clock (SPEC 2.5) and a small wrapper that the worker and self-play share.
// Time runs in whole minutes: midnight runs the daily tick and may open a council phase,
// and scheduled missions resolve at their own minute in between.

import { planCouncilPhase } from "./ai";
import { dateOfDay } from "./calendar";
import { applyCommand, type Command, type CommandResult } from "./commands";
import type { Content } from "./content";
import { allFactionsDone, closeCouncilPhase, resolveNextMission, startCouncilPhase } from "./council";
import { awaitingClimateChoice, runClimateMonth } from "./climate";
import { aiBuyOrgs, refreshOrgMarkets } from "./councilors";
import { awaitingPolicyChoice } from "./diplomacy";
import { arriveArmies, nextArrival } from "./military";
import { addLog, nationDef } from "./lookup";
import { runDailyTick } from "./monthly";
import { trackExecutives } from "./nation";
import { aiHire, newGame, refreshRecruits, type NewGameOptions } from "./setup";
import { awaitingProjectChoice, awaitingTechChoice, rollProjectAvailability } from "./research";
import type { GameState } from "./state";
import { currentMinute, MINUTES_PER_DAY } from "./time";

/**
 * Opens a council phase. AI factions plan at once; if no person needs to act, the
 * phase closes immediately and time keeps running.
 */
function openCouncilPhase(state: GameState, content: Content): void {
  startCouncilPhase(state, content);
  for (const faction of state.factions) if (!faction.isPlayer) planCouncilPhase(state, content, faction);
  if (allFactionsDone(state)) closeCouncilPhase(state, content);
}

/** Tells each faction when its hold on a nation's executive has lasted long enough to consolidate. */
function noteConsolidations(state: GameState, content: Content): void {
  const days = content.rules.diplomacy.consolidationDays;
  for (const nation of state.nations) {
    const hold = nation.executiveHold;
    if (hold.factionId && !hold.seized && state.dayIndex - hold.since === days) {
      addLog(state, { factionId: hold.factionId, nationId: nation.id, kind: "nation", tone: "good", text: `We consolidated executive control of ${nationDef(content, nation.id).name}.` });
    }
  }
}

/** Midnight: the next day starts. */
function startDay(state: GameState, content: Content): void {
  state.dayIndex += 1;
  state.minuteOfDay = 0;
  runDailyTick(state, content);
  trackExecutives(state);
  noteConsolidations(state, content);
  const date = dateOfDay(content.rules.startYear, state.dayIndex);
  if (date.day === 1) {
    runClimateMonth(state, content);
    rollProjectAvailability(state, content);
    refreshRecruits(state, content);
    for (const faction of state.factions) if (!faction.isPlayer) aiHire(state, content, faction);
  }
  if (date.day === content.rules.councilors.orgMarket.refreshDay) {
    refreshOrgMarkets(state, content);
    for (const faction of state.factions) if (!faction.isPlayer) aiBuyOrgs(state, content, faction);
  }
  if (content.rules.councilPhaseDays.includes(date.day)) openCouncilPhase(state, content);
}

/** A council phase, or a player picking the next global tech or project, a national policy or an answer to a climate event, stops the clock. */
export function clockRuns(state: GameState, content: Content): boolean {
  return (
    state.phase === "running" &&
    !awaitingTechChoice(state) &&
    !awaitingProjectChoice(state, content) &&
    !awaitingPolicyChoice(state) &&
    !awaitingClimateChoice(state)
  );
}

/**
 * Advances up to `minutes` minutes of game time, resolving scheduled missions and landing
 * moving armies on the way. Stops early when a council phase opens. Returns the minutes
 * that passed.
 */
export function advanceMinutes(state: GameState, content: Content, minutes: number): number {
  let passed = 0;
  while (clockRuns(state, content)) {
    const now = currentMinute(state);
    const midnight = (state.dayIndex + 1) * MINUTES_PER_DAY;
    const mission = Math.max(now, state.scheduledMissions[0]?.at ?? Infinity);
    const arrival = Math.max(now, nextArrival(state));
    const target = Math.min(now + (minutes - passed), midnight, mission, arrival);
    passed += target - now;
    if (target === arrival) {
      // Arrivals are never scheduled on a midnight either.
      state.minuteOfDay = target - state.dayIndex * MINUTES_PER_DAY;
      arriveArmies(state);
    } else if (target === mission) {
      // Missions are never scheduled on a midnight, so this stays within today.
      state.minuteOfDay = target - state.dayIndex * MINUTES_PER_DAY;
      resolveNextMission(state, content);
      trackExecutives(state);
    } else if (target === midnight) {
      startDay(state, content);
    } else {
      state.minuteOfDay = target - state.dayIndex * MINUTES_PER_DAY;
      break;
    }
  }
  return passed;
}

export class Simulation {
  /** Every accepted command with the time it was applied, for replays. */
  readonly commandLog: { dayIndex: number; minuteOfDay: number; command: Command }[] = [];

  constructor(
    readonly content: Content,
    public state: GameState,
  ) {}

  static create(content: Content, options: NewGameOptions): Simulation {
    const sim = new Simulation(content, newGame(content, options));
    // The campaign opens with a council phase on day 0.
    openCouncilPhase(sim.state, content);
    return sim;
  }

  /** Advances up to `minutes` minutes and returns how many actually passed. */
  advanceMinutes(minutes: number): number {
    return advanceMinutes(this.state, this.content, minutes);
  }

  /** Advances up to `days` days and returns how many whole days actually passed. */
  advance(days: number): number {
    return Math.floor(this.advanceMinutes(days * MINUTES_PER_DAY) / MINUTES_PER_DAY);
  }

  apply(command: Command): CommandResult {
    const result = applyCommand(this.state, this.content, command);
    trackExecutives(this.state);
    if (result.ok) this.commandLog.push({ dayIndex: this.state.dayIndex, minuteOfDay: this.state.minuteOfDay, command });
    return result;
  }
}
