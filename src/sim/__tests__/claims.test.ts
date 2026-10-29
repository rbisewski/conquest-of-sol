import { describe, expect, it } from "vitest";
import { baseContent } from "../../content/index";
import { claimHeld, claimHostile, claimsOn, foreignClaims, hasClaim, projectClaims, Simulation } from "../index";

const content = baseContent;
const fresh = () => Simulation.create(content, { seed: 5, difficulty: "normal", playerFactions: ["aegis"] }).state;

describe("claims", () => {
  it("gives every nation a claim on its own regions", () => {
    const state = fresh();
    for (const r of content.regions) expect(hasClaim(state, content, r.nationId, r.id), r.id).toBe(true);
  });

  it("starts with Terra Invicta's claims, such as Russia's on Ukraine and China's on Taiwan", () => {
    const state = fresh();
    const russia = foreignClaims(state, content, "rus");
    expect(russia.some((c) => c.region.startsWith("ukr-"))).toBe(true);
    expect(claimsOn(state, content, "twn-1").map((c) => c.nation)).toContain("chn");
  });

  it("holds a project's claims once any faction completes it", () => {
    const state = fresh();
    const claim = projectClaims(content, "Project_RegionalAfricanUnions").find((c) => c.nation === "ago" && c.region === "cod-1")!;
    expect(claim).toBeDefined();
    expect(claimHeld(state, claim)).toBe(false);
    expect(hasClaim(state, content, "ago", "cod-1")).toBe(false);
    state.research.takenProjects.push("Project_RegionalAfricanUnions");
    expect(claimHeld(state, claim)).toBe(true);
    expect(claimsOn(state, content, "cod-1").map((c) => c.nation)).toContain("ago");
  });

  it("is hostile by history, or when the claimant's Government is 1.5 below the region's nation's", () => {
    const state = fresh();
    const serbia = foreignClaims(state, content, "srb").find((c) => c.region === "hrv-1")!;
    expect(claimHostile(state, content, serbia)).toBe(true);
    const china = claimsOn(state, content, "twn-1").find((c) => c.nation === "chn")!;
    const nation = (id: string) => state.nations.find((n) => n.id === id)!;
    nation("twn").democracy = 8;
    nation("chn").democracy = 6.4;
    expect(claimHostile(state, content, china)).toBe(true);
    nation("chn").democracy = 6.6;
    expect(claimHostile(state, content, { ...china, hostile: false })).toBe(false);
  });
});
