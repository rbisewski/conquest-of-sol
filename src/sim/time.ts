// Game time below a day. The simulation runs on whole minutes, so any way of slicing real
// time into advance() calls reaches the same state.

import type { GameState } from "./state";

export const MINUTES_PER_DAY = 1440;

/** Minutes since midnight on 1 January of rules.startYear. */
export function currentMinute(state: GameState): number {
  return state.dayIndex * MINUTES_PER_DAY + state.minuteOfDay;
}
