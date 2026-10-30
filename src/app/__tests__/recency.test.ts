import { describe, expect, it } from "vitest";
import { Recency } from "../solar/recency";

describe("Recency", () => {
  it("says whether an id is newly kept", () => {
    const recent = new Recency();
    expect(recent.touch("a", 1)).toBe(true);
    expect(recent.touch("a", 2)).toBe(false);
    expect(recent.has("a")).toBe(true);
    expect(recent.has("b")).toBe(false);
  });

  it("lets go of the longest unwanted first", () => {
    const recent = new Recency();
    recent.touch("a", 1);
    recent.touch("b", 2);
    recent.touch("c", 3);
    recent.touch("a", 4);
    expect(recent.evict(2, 5)).toEqual(["b"]);
    expect(recent.has("b")).toBe(false);
    expect(recent.has("a")).toBe(true);
  });

  it("keeps what is wanted now, even over the limit", () => {
    const recent = new Recency();
    recent.touch("a", 1);
    recent.touch("b", 2);
    recent.touch("c", 2);
    expect(recent.evict(1, 2)).toEqual(["a"]);
    expect(recent.has("b")).toBe(true);
    expect(recent.has("c")).toBe(true);
  });

  it("clears everything", () => {
    const recent = new Recency();
    recent.touch("a", 1);
    recent.touch("b", 2);
    expect(recent.clear()).toEqual(["a", "b"]);
    expect(recent.has("a")).toBe(false);
  });
});
