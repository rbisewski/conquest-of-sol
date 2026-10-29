import type { Content, FactionDef, NationDef, PriorityDef, ProfessionDef } from "./content";
import type { FactionState, GameState, LogEntry, NationState } from "./state";
import { LOG_LIMIT } from "./state";

function byId<T extends { id: string }>(items: readonly T[], id: string, kind: string): T {
  const found = items.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown ${kind} "${id}"`);
  return found;
}

export const factionDef = (c: Content, id: string): FactionDef => byId(c.factions, id, "faction");
const defIndex = new WeakMap<NationDef[], Map<string, NationDef>>();
export function nationDef(c: Content, id: string): NationDef {
  let index = defIndex.get(c.nations);
  if (!index) defIndex.set(c.nations, (index = new Map(c.nations.map((n) => [n.id, n]))));
  const found = index.get(id);
  if (!found) throw new Error(`Unknown nation "${id}"`);
  return found;
}
export const priorityDef = (c: Content, id: string): PriorityDef => byId(c.priorities, id, "priority");
export const professionDef = (c: Content, id: string): ProfessionDef => byId(c.professions, id, "profession");
export const factionState = (s: GameState, id: string): FactionState => byId(s.factions, id, "faction");
// Nation lookups are hot and there are hundreds of nations, so each nations array gets an index.
const nationIndex = new WeakMap<NationState[], Map<string, NationState>>();
export function nationState(s: GameState, id: string): NationState {
  let index = nationIndex.get(s.nations);
  if (!index) nationIndex.set(s.nations, (index = new Map(s.nations.map((n) => [n.id, n]))));
  const found = index.get(id);
  if (!found) throw new Error(`Unknown nation "${id}"`);
  return found;
}

export function addLog(state: GameState, entry: Omit<LogEntry, "dayIndex" | "minuteOfDay">): void {
  state.log.push({ dayIndex: state.dayIndex, minuteOfDay: state.minuteOfDay, ...entry });
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
}

export function newId(state: GameState, prefix: string): string {
  return `${prefix}-${state.nextId++}`;
}
