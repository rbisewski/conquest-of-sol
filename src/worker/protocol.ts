// Messages between the UI thread and the simulation worker (SPEC 2.3).

import type { Command, CommandResult, GameState, NewGameOptions } from "../sim/index";

/** Hours of game time per real second at each speed, as in Terra Invicta (SPEC 2.5). */
export const SPEED_HOURS_PER_SECOND = [0, 0.5, 1, 2, 4, 8] as const;
/** Button labels: Terra Invicta names its speeds by the game time one second covers. */
export const SPEED_LABELS = ["❚❚", "30m", "1h", "2h", "4h", "8h"] as const;
export type Speed = 0 | 1 | 2 | 3 | 4 | 5;

export type ToWorker =
  | { type: "newGame"; options: NewGameOptions }
  | { type: "load"; text: string }
  | { type: "save" }
  | { type: "command"; id: number; command: Command }
  | { type: "setSpeed"; speed: Speed };

export type FromWorker =
  | { type: "snapshot"; state: GameState }
  /** Time of day as a fraction of the current day, sent every timer tick while time runs. */
  | { type: "clock"; dayFraction: number }
  | { type: "commandResult"; id: number; result: CommandResult }
  | { type: "saved"; text: string }
  | { type: "error"; message: string };
