// Versioned JSON saves (SPEC 2.3). Old saves are upgraded one version at a time.

import { newClimate } from "./climate";
import type { Content } from "./content";
import { STATE_VERSION, type GameState } from "./state";

interface SaveFile {
  format: "conquest-of-sol-save";
  version: number;
  state: GameState;
}

/**
 * Saves older than this can't be loaded: version 20 split regions to give Terra Invicta's
 * breakaway nations homelands of their own, so their region ids no longer exist.
 */
const OLDEST_LOADABLE = 20;

/** Each entry upgrades a save from version `key` to `key + 1`. */
const migrations: Record<number, (state: Record<string, unknown>, content: Content) => Record<string, unknown>> = {
  // Federations: older saves start without any.
  20: (state) => ({ ...state, federations: [] }),
  21: (state) => ({ ...state, defections: {} }),
  // Set National Policy picks its policy when it succeeds; a policy chosen in advance is dropped.
  22: (state) => ({ ...state, policyChoices: [] }),
  // Executive consolidation: executives already held count as consolidated.
  23: (state, content) => {
    const day = state.dayIndex as number;
    const nations = (state.nations as Record<string, unknown>[]).map((n) => {
      const owner = (n.controlPoints as { owner: string | null }[])[0]?.owner ?? null;
      return { ...n, executiveHold: { factionId: owner, since: day - content.rules.diplomacy.consolidationDays, seized: false } };
    });
    return { ...state, nations };
  },
  // Climate change: Terra Invicta's 2030 atmosphere, and each nation's starting Pollution Multiplier.
  24: (state, content) => {
    const nations = (state.nations as Record<string, unknown>[]).map((n) => ({ ...n, pollution: content.climate.pollution[n.id as string] ?? content.climate.defaultPollution }));
    return { ...state, nations, climate: newClimate(content) };
  },
  // Climate events with a choice, and nuclear strikes.
  25: (state) => ({ ...state, climateChoices: [], strikes: [], climate: { ...(state.climate as object), regionEvents: {} } }),
  // The clock waits for a player to pick the next project.
  26: (state) => ({
    ...state,
    factions: (state.factions as Record<string, unknown>[]).map((f) => ({ ...f, research: { ...(f.research as object), choosing: [] } })),
  }),
  // Councilors can repeat a mission.
  27: (state) => ({
    ...state,
    factions: (state.factions as Record<string, unknown>[]).map((f) => ({
      ...f,
      councilors: (f.councilors as Record<string, unknown>[]).map((c) => ({ ...c, repeatMission: null })),
    })),
  }),
};

export function serialize(state: GameState): string {
  const file: SaveFile = { format: "conquest-of-sol-save", version: STATE_VERSION, state };
  return JSON.stringify(file);
}

export function deserialize(text: string, content: Content): GameState {
  const file = JSON.parse(text) as Partial<SaveFile>;
  if (file.format !== "conquest-of-sol-save" || typeof file.version !== "number" || !file.state) {
    throw new Error("Not a Conquest of Sol save file");
  }
  if (file.version > STATE_VERSION) throw new Error(`Save version ${file.version} is newer than this game (${STATE_VERSION})`);
  if (file.version < OLDEST_LOADABLE) {
    throw new Error(`Saves from before version ${OLDEST_LOADABLE} cannot be loaded: the map's regions have changed since (breakaway nations)`);
  }
  let state = file.state as unknown as Record<string, unknown>;
  for (let v = file.version; v < STATE_VERSION; v++) {
    const migrate = migrations[v];
    if (!migrate) throw new Error(`No migration from save version ${v}`);
    state = migrate(state, content);
    state.version = v + 1;
  }
  return state as unknown as GameState;
}

/** FNV-1a hash of the full state, used to check that runs are deterministic. */
export function hashState(state: GameState): string {
  const text = JSON.stringify(state);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
