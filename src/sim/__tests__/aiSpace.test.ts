import { describe, expect, it } from "vitest";
import { baseContent } from "../../content/index";
import { planSpace } from "../aiSpace";
import { habOperation, MINING_SLOT, Simulation, type GameState } from "../index";

/** Every faction has mission control enough for several habs, so the AI's limit is boost. */
const content = { ...baseContent, rules: { ...baseContent.rules, space: { ...baseContent.rules.space, baseMissionControl: 20 } } };

/** An all-AI game where Aegis can probe and found on the Moon, with boost and mission control to spare. */
function game(boost = 300): { sim: Simulation; state: GameState } {
  const sim = Simulation.create(content, { seed: 13, difficulty: "normal", playerFactions: [] });
  const state = sim.state;
  state.research.completed.push("MissiontotheMoon");
  const aegis = state.factions.find((f) => f.id === "aegis")!;
  for (const p of ["Project_OutpostCore", "Project_Solid-FuelSpaceRockets", "Project_SolarCollector", "Project_PlatformCore", "Project_OutpostMiningComplex"]) aegis.research.completed[p] = 1;
  state.research.version += 1;
  Object.assign(aegis.resources, { boost, missionControl: 20, money: 1000 });
  return { sim, state };
}
const aegis = (state: GameState) => state.factions.find((f) => f.id === "aegis")!;
const plan = (state: GameState) => planSpace(state, content, aegis(state));

describe("space AI", () => {
  it("prospects the Moon first, then founds an outpost at its best site", () => {
    const { state } = game();
    plan(state);
    expect(aegis(state).probes.map((p) => p.bodyId)).toEqual(["Luna"]);
    expect(state.habs.some((h) => h.factionId === "aegis")).toBe(false);
    aegis(state).probes = [];
    aegis(state).prospected.push("Luna");
    plan(state);
    const base = state.habs.find((h) => h.factionId === "aegis")!;
    expect(base.siteId).toMatch(/^LunaSite/);
  });

  it("powers its outpost, then gives it a mine that works", () => {
    const { sim, state } = game();
    aegis(state).prospected.push("Luna");
    plan(state);
    const base = state.habs.find((h) => h.factionId === "aegis")!;
    for (let i = 0; i < 6; i++) {
      sim.advance(30);
      Object.assign(aegis(state).resources, { boost: 300 });
      plan(state);
    }
    expect(base.modules[MINING_SLOT]?.moduleId).toBe("OutpostMiningComplex");
    expect(habOperation(state, content, base).status[MINING_SLOT]).toBe("working");
  });

  it("founds nothing it couldn't keep: not without boost to spare", () => {
    const { state } = game(3);
    aegis(state).prospected.push("Luna");
    plan(state);
    expect(state.habs.some((h) => h.factionId === "aegis")).toBe(false);
  });
});
