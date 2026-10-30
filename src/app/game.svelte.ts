// UI-side handle on the simulation worker. Components read `game.state` reactively.

import type { Command, CommandResult, GameState, MissionType, NewGameOptions } from "../sim/index";
import type { FromWorker, Speed, ToWorker } from "../worker/protocol";
import type { MissionTarget } from "./missionTargets";
import { loadSettings, saveSettings, type Settings } from "./settings";

/** Which screen is up: the title menu, faction choice, save list, or the game itself. */
export type Screen = "title" | "newGame" | "load" | "game";

class GameClient {
  screen = $state<Screen>("title");
  /** Replaced wholesale by each worker snapshot, so it needs no deep reactivity. */
  state = $state.raw<GameState | null>(null);
  speed = $state<Speed>(0);
  /** Time of day as a fraction of the current day (the worker's clock). */
  dayFraction = $state(0);
  playerFactionId = $derived(this.state?.factions.find((f) => f.isPlayer)?.id ?? null);
  selectedNationId = $state<string | null>(null);
  /** The councilor whose panel is open (lower right), if any. */
  selectedCouncilorId = $state<string | null>(null);
  /** Whether the Recruiting screen is open. */
  recruitingOpen = $state(false);
  /** The player's settings, and whether their panel is open. */
  settings = $state.raw<Settings>(loadSettings());
  settingsOpen = $state(false);
  /** Whether the Climate panel is open. */
  climateOpen = $state(false);
  /** The nation whose Foreign Relations window is open (one whose executive we hold), if any. */
  foreignRelationsNationId = $state<string | null>(null);
  /** Whether the Research panel is open (it also opens while we must pick the next global tech). */
  researchOpen = $state(false);
  /** The councilor whose full summary screen is open, if any (ours, or another faction's we have intel on). */
  summaryCouncilorId = $state<string | null>(null);
  /** Which view fills the screen: the Earth's globe, or the Solar System (zoom out of the globe to reach it). */
  view = $state<"earth" | "solar">("earth");
  /** The solar-system body whose Celestial Body panel is open in the Solar System view, if any. */
  selectedBodyId = $state<string | null>(null);
  /** Another faction's councilor, clicked on the globe, whose Rival Councilor panel is open (upper left), if any. */
  rivalCouncilorId = $state<string | null>(null);
  /** The army whose panel is open (lower right, in place of the councilor's), if any. */
  selectedArmyId = $state<string | null>(null);
  /**
   * While set, the selected councilor's mission is aimed on the globe: hovering lights up a valid
   * target (a single region, or a whole nation) and a click assigns it. Targets are keyed by
   * region id or nation id.
   */
  globePick = $state<{ type: MissionType; scope: "region" | "nation"; targets: Map<string, MissionTarget> } | null>(null);
  /**
   * While set, the nation's nuclear weapons are being aimed: the valid target regions light up
   * on the globe, and clicking one asks to confirm the strike.
   */
  nukePick = $state<{ nationId: string; targets: Set<string> } | null>(null);
  /** While set, clicking a region on the globe orders the selected army there. */
  armyMoveMode = $state(false);
  /** Set to turn the globe toward a point; the globe view clears it once done. */
  focus = $state<{ lat: number; lon: number } | null>(null);
  error = $state<string | null>(null);

  private readonly worker: Worker;
  private nextCommandId = 1;
  private readonly pending = new Map<number, (result: CommandResult) => void>();
  private pendingSave: ((text: string) => void) | null = null;
  /** Set while a new or loaded game is on its way from the worker; its first snapshot opens the game screen. */
  private starting = false;

  constructor() {
    this.worker = new Worker(new URL("../worker/sim.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<FromWorker>) => this.receive(event.data);
  }

  private send(message: ToWorker): void {
    this.worker.postMessage(message);
  }

  private receive(msg: FromWorker): void {
    switch (msg.type) {
      case "snapshot":
        this.state = msg.state;
        if (this.starting) {
          this.starting = false;
          this.screen = "game";
        }
        break;
      case "clock":
        this.dayFraction = msg.dayFraction;
        break;
      case "commandResult":
        this.pending.get(msg.id)?.(msg.result);
        this.pending.delete(msg.id);
        if (!msg.result.ok) this.error = msg.result.reason;
        break;
      case "saved":
        this.pendingSave?.(msg.text);
        this.pendingSave = null;
        break;
      case "error":
        this.starting = false;
        this.error = msg.message;
        break;
    }
  }

  newGame(options: NewGameOptions): void {
    this.starting = true;
    this.clearSelection();
    this.send({ type: "newGame", options });
  }

  command(command: Command): Promise<CommandResult> {
    const id = this.nextCommandId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.send({ type: "command", id, command });
    });
  }

  updateSettings(changes: Partial<Settings>): void {
    this.settings = { ...this.settings, ...changes };
    saveSettings(this.settings);
  }

  setSpeed(speed: Speed): void {
    this.speed = speed;
    this.send({ type: "setSpeed", speed });
  }

  save(): Promise<string> {
    return new Promise((resolve) => {
      this.pendingSave = resolve;
      this.send({ type: "save" });
    });
  }

  load(text: string): void {
    this.starting = true;
    this.clearSelection();
    this.send({ type: "load", text });
  }

  /** Pauses the game and goes back to the title menu. */
  toTitle(): void {
    this.setSpeed(0);
    this.clearSelection();
    this.screen = "title";
  }

  private clearSelection(): void {
    this.selectedNationId = null;
    this.selectedCouncilorId = null;
    this.selectedArmyId = null;
    this.summaryCouncilorId = null;
    this.rivalCouncilorId = null;
    this.view = "earth";
    this.selectedBodyId = null;
    this.recruitingOpen = false;
    this.researchOpen = false;
    this.foreignRelationsNationId = null;
    this.climateOpen = false;
    this.armyMoveMode = false;
    this.nukePick = null;
  }
}

export const game = new GameClient();
