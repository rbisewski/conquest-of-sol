import { describe, expect, it } from "vitest";
import { entryKind } from "../logKinds";

const old = (text: string, factionId?: string) => entryKind({ dayIndex: 0, minuteOfDay: 0, text, factionId });

describe("event kinds", () => {
  it("uses the kind an entry carries", () => {
    expect(entryKind({ dayIndex: 0, minuteOfDay: 0, text: "x", kind: "mission", mission: "purge", tone: "good" })).toEqual({ kind: "mission", mission: "purge", tone: "good" });
  });

  it("recognises older entries from their text", () => {
    expect(old("Ana Silva (Aegis Coalition) took the Bureaucracy control point in Brazil.")).toEqual({ kind: "mission", mission: "controlNation" });
    expect(old("Ana Silva (Aegis Coalition) failed to take control in Brazil (41%).")).toEqual({ kind: "mission", mission: "controlNation", tone: "bad" });
    expect(old("Ana Silva (Aegis Coalition)'s purge in Nigeria failed (34%).").mission).toBe("purge");
    expect(old("Ana Silva (Aegis Coalition) defended our interests in India.").mission).toBe("defendInterests");
    expect(old("Ana Silva (Aegis Coalition) abandoned Coup d'État in Peru: We already hold the executive.")).toEqual({ kind: "mission", mission: "coup", tone: "bad" });
    expect(old("We spotted an enemy councilor at work in Lagos, Nigeria.").kind).toBe("intel");
    expect(old("Researchers worldwide completed Mission to Space.").kind).toBe("research");
    expect(old("Russia has occupied Kharkiv, Ukraine.").kind).toBe("war");
    expect(old("France founded a space program at Kourou.").kind).toBe("nation");
  });
});
