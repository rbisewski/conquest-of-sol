// Runs the simulation off the UI thread and streams state snapshots back (SPEC 2.3).

import { baseContent } from "../content/index";
import { deserialize, MINUTES_PER_DAY, serialize, Simulation, type GameState } from "../sim/index";
import { SPEED_HOURS_PER_SECOND, type FromWorker, type Speed, type ToWorker } from "./protocol";

interface WorkerScope {
  postMessage(message: FromWorker): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
}
const scope = self as unknown as WorkerScope;

const TICK_MS = 50;

let sim: Simulation | null = null;
let speed: Speed = 0;
/** Fraction of a game minute carried between timer ticks (the clock shows seconds). */
let pendingMinutes = 0;
let lastTick = performance.now();

function snapshot(): void {
  if (sim) scope.postMessage({ type: "snapshot", state: sim.state });
}

function clock(): void {
  if (sim) scope.postMessage({ type: "clock", dayFraction: (sim.state.minuteOfDay + pendingMinutes) / MINUTES_PER_DAY });
}

/** Cheap fingerprint of the things that change between days: a new day, a resolved mission, a phase, an army arriving. */
const changeKey = (s: GameState) => `${s.dayIndex}:${s.scheduledMissions.length}:${s.phase}:${s.armies.reduce((n, a) => n + (a.move ? 1 : 0), 0)}`;

setInterval(() => {
  const now = performance.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  // Pausing keeps the time of day; a council phase always stops the clock at midnight.
  if (!sim || speed === 0 || sim.state.phase !== "running") return;
  pendingMinutes += dt * SPEED_HOURS_PER_SECOND[speed] * 60;
  const whole = Math.floor(pendingMinutes);
  pendingMinutes -= whole;
  const before = changeKey(sim.state);
  if (whole > 0) sim.advanceMinutes(whole);
  if (sim.state.phase !== "running") pendingMinutes = 0;
  if (changeKey(sim.state) !== before) snapshot();
  clock();
}, TICK_MS);

scope.onmessage = (event) => {
  const msg = event.data;
  try {
    switch (msg.type) {
      case "newGame":
        sim = Simulation.create(baseContent, msg.options);
        pendingMinutes = 0;
        snapshot();
        clock();
        break;
      case "load":
        sim = new Simulation(baseContent, deserialize(msg.text, baseContent));
        pendingMinutes = 0;
        snapshot();
        clock();
        break;
      case "save":
        if (sim) scope.postMessage({ type: "saved", text: serialize(sim.state) });
        break;
      case "command": {
        if (!sim) throw new Error("No game is running");
        const result = sim.apply(msg.command);
        scope.postMessage({ type: "commandResult", id: msg.id, result });
        if (result.ok) snapshot();
        break;
      }
      case "setSpeed":
        speed = msg.speed;
        break;
    }
  } catch (error) {
    scope.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
