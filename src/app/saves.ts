// Save files. In the desktop app they are JSON files in the app's data folder (src-tauri/src/lib.rs);
// in a browser they live in localStorage, which is per-browser and can be cleared.

import { invoke } from "@tauri-apps/api/core";

export interface SaveInfo {
  name: string;
  /** Milliseconds since the Unix epoch. */
  savedAt: number;
}

export const QUICKSAVE = "Quicksave";

/** True inside the Tauri desktop shell. */
export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const PREFIX = "conquest-of-sol:save:";
/** Where the browser kept its one quicksave before named saves. */
const LEGACY_QUICKSAVE = "conquest-of-sol:quicksave";

interface StoredSave {
  savedAt: number;
  text: string;
}

function browserRead(name: string): StoredSave | null {
  try {
    const raw = localStorage.getItem(PREFIX + name);
    if (raw) return JSON.parse(raw) as StoredSave;
    if (name === QUICKSAVE) {
      const legacy = localStorage.getItem(LEGACY_QUICKSAVE);
      if (legacy) return { savedAt: 0, text: legacy };
    }
  } catch {
    // Storage unavailable or corrupt: treat as missing.
  }
  return null;
}

export async function listSaves(): Promise<SaveInfo[]> {
  if (isDesktop) return invoke<SaveInfo[]>("list_saves");
  const out: SaveInfo[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (!key.startsWith(PREFIX)) continue;
      const name = key.slice(PREFIX.length);
      out.push({ name, savedAt: browserRead(name)?.savedAt ?? 0 });
    }
    if (!out.some((s) => s.name === QUICKSAVE) && localStorage.getItem(LEGACY_QUICKSAVE)) out.push({ name: QUICKSAVE, savedAt: 0 });
  } catch {
    // Storage unavailable: no saves.
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

export async function readSave(name: string): Promise<string> {
  if (isDesktop) return invoke<string>("read_save", { name });
  const save = browserRead(name);
  if (!save) throw new Error(`No save named "${name}"`);
  return save.text;
}

export async function writeSave(name: string, text: string): Promise<void> {
  if (isDesktop) return invoke("write_save", { name, text });
  localStorage.setItem(PREFIX + name, JSON.stringify({ savedAt: Date.now(), text } satisfies StoredSave));
}

export async function deleteSave(name: string): Promise<void> {
  if (isDesktop) return invoke("delete_save", { name });
  localStorage.removeItem(PREFIX + name);
  if (name === QUICKSAVE) localStorage.removeItem(LEGACY_QUICKSAVE);
}

/** A file-safe name for a new save, e.g. "Aegis Coalition, 14 MAR 2031". */
export function saveName(label: string): string {
  return label.replace(/[^\p{L}\p{N} \-_.,'()]/gu, "").trim().slice(0, 100) || "Save";
}

export async function quitApp(): Promise<void> {
  if (isDesktop) await invoke("quit");
}
