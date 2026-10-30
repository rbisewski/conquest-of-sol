import { describe, expect, it } from "vitest";
import { loadSettings, saveSettings } from "../settings";

function store(initial: string | null = null) {
  let value = initial;
  return { getItem: () => value, setItem: (_: string, v: string) => void (value = v) };
}

describe("settings", () => {
  it("hides objects by default", () => {
    expect(loadSettings(store()).hideObjectsWhenUnpaused).toBe(true);
  });

  it("blurs the stars by default", () => {
    expect(loadSettings(store()).blurStars).toBe(true);
    expect(loadSettings(store('{"hideObjectsWhenUnpaused":false}')).blurStars).toBe(true);
  });

  it("keeps what was saved", () => {
    const s = store();
    saveSettings({ hideObjectsWhenUnpaused: false, blurStars: false }, s);
    expect(loadSettings(s).hideObjectsWhenUnpaused).toBe(false);
    expect(loadSettings(s).blurStars).toBe(false);
  });

  it("falls back to the defaults on anything unreadable", () => {
    expect(loadSettings(store("not json")).hideObjectsWhenUnpaused).toBe(true);
    expect(loadSettings(store('{"hideObjectsWhenUnpaused":"no"}')).hideObjectsWhenUnpaused).toBe(true);
    expect(loadSettings({ getItem: () => { throw new Error("blocked"); }, setItem: () => {} }).hideObjectsWhenUnpaused).toBe(true);
  });
});
