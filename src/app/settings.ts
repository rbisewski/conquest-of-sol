// The player's settings, kept per browser or desktop install rather than per save.

export interface Settings {
  /** Hide everything but the stars behind a body zoomed into in the 3D view while the clock runs: bodies racing past can make people queasy. */
  hideObjectsWhenUnpaused: boolean;
}

const KEY = "conquest-of-sol-settings";
const DEFAULTS: Settings = { hideObjectsWhenUnpaused: true };

type Store = Pick<Storage, "getItem" | "setItem">;

/** The saved settings, with the defaults for any missing or unreadable. */
export function loadSettings(store: Store = localStorage): Settings {
  try {
    const saved = JSON.parse(store.getItem(KEY) ?? "{}") as Partial<Settings>;
    return { hideObjectsWhenUnpaused: typeof saved.hideObjectsWhenUnpaused === "boolean" ? saved.hideObjectsWhenUnpaused : DEFAULTS.hideObjectsWhenUnpaused };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings, store: Store = localStorage): void {
  try {
    store.setItem(KEY, JSON.stringify(settings));
  } catch {
    // The setting still holds for this session.
  }
}
