import { describe, expect, it } from "vitest";
import { baseContent } from "../../content/index";
import {
  applyCommand,
  awaitingProjectChoice,
  awaitingTechChoice,
  assessMission,
  controlCap,
  controlUpkeep,
  councilSize,
  deserialize,
  priorityFlows,
  rollProjectAvailability,
  spendSteps,
  monthlyResearch,
  nationResearch,
  projectCost,
  projectSlotCount,
  runResearchTick,
  serialize,
  Simulation,
  techCost,
  type FactionState,
  type GameState,
} from "../index";

const content = baseContent;
const r = content.rules.research;

function game(): { sim: Simulation; state: GameState; us: FactionState } {
  const sim = Simulation.create(content, { seed: 9, difficulty: "normal", playerFactions: ["aegis"] });
  // Close the opening council phase so time can run.
  for (const f of sim.state.factions) f.councilDone = true;
  sim.state.phase = "running";
  const us = sim.state.factions.find((f) => f.id === "aegis")!;
  for (const c of us.councilors) {
    c.traits = [];
    c.orgs = [];
  }
  return { sim, state: sim.state, us };
}

describe("national research", () => {
  it("follows Terra Invicta's research_month", () => {
    const { state } = game();
    const usa = state.nations.find((n) => n.id === "usa")!;
    const gdppc = (usa.gdp / usa.population) * 1000;
    const wealth = gdppc <= 30000 ? (gdppc / 15000) ** 0.6 : 2 ** 0.6 * (1 + 0.6 * Math.log(gdppc / 30000));
    const people = usa.population * wealth * usa.education * Math.min(usa.education, 12) * Math.max(usa.democracy, 1) ** (1 / 6) * 0.0075;
    const base = usa.controlPoints.length + usa.education + usa.democracy / 2;
    const expected = (people + base) * (1.25 - Math.abs(usa.cohesion - 5) / 10) * (1 - usa.unrest * usa.unrest * 0.01);
    expect(nationResearch(content, usa).value).toBeCloseTo(expected, 3);
  });

  it("pays each CP holder an equal share", () => {
    const { state, us } = game();
    for (const n of state.nations) for (const cp of n.controlPoints) cp.owner = null;
    const nga = state.nations.find((n) => n.id === "nga")!;
    nga.controlPoints[0]!.owner = "aegis";
    const share = monthlyResearch(state, content, us).terms.find((t) => t.label === "Nations (control points)")!.value;
    expect(share).toBeCloseTo(nationResearch(content, nga).value / nga.controlPoints.length, 6);
  });
});

describe("spending research", () => {
  it("splits by pips with +5% per active slot, and records contributions", () => {
    const { state, us } = game();
    for (const f of state.factions) f.research.pips = f.research.pips.map(() => 0);
    us.research.pips = [2, 1, 0, 0, 0, 0];
    us.research.projectSlots = [null, null, null];
    const monthly = monthlyResearch(state, content, us).value;
    runResearchTick(state, content, 1);
    const [a, b, c] = state.research.slots;
    const total = monthly * (1 + 2 * r.bonusPerActiveSlot);
    expect(a!.contributions["aegis"]).toBeCloseTo((total * 2) / 3, 6);
    expect(b!.contributions["aegis"]).toBeCloseTo(total / 3, 6);
    expect(c!.contributions["aegis"]).toBeUndefined();
  });

  it("lets an AI top contributor pick the next tech at once", () => {
    const { state } = game();
    const slot = state.research.slots[0]!;
    const done = slot.techId!;
    slot.contributions = { "iron-dawn": 10 };
    slot.progress = techCost(state, content, done);
    runResearchTick(state, content, 0);
    expect(state.research.completed).toContain(done);
    expect(state.research.slots[0]!.chooser).toBe("iron-dawn");
    expect(state.research.slots[0]!.techId).not.toBeNull();
  });

  it("stops the clock until a player top contributor picks", () => {
    const { sim, state } = game();
    const slot = state.research.slots[1]!;
    slot.contributions = { aegis: 10 };
    slot.progress = techCost(state, content, slot.techId!);
    runResearchTick(state, content, 0);
    expect(awaitingTechChoice(state)).toBe(true);
    expect(sim.advance(5)).toBe(0);
    const tech = content.techs.find((t) => t.prereqs.length === 0 && !state.research.completed.includes(t.id) && !state.research.slots.some((s) => s.techId === t.id))!;
    expect(applyCommand(state, content, { type: "chooseTech", factionId: "iron-dawn", slot: 1, techId: tech.id }).ok).toBe(false);
    expect(applyCommand(state, content, { type: "chooseTech", factionId: "aegis", slot: 1, techId: tech.id })).toEqual({ ok: true });
    expect(awaitingTechChoice(state)).toBe(false);
    expect(sim.advance(5)).toBe(5);
  });
});

describe("projects", () => {
  /** Marks projects completed and refreshes the summed effects. */
  const complete = (state: GameState, f: FactionState, id: string, times = 1) => {
    f.research.completed[id] = times;
    state.research.version += 1;
  };

  it("unlocks the starting projects and grants their resources on completion", () => {
    const { state, us } = game();
    expect(us.research.available).toEqual(expect.arrayContaining(["Project_AudienceResearch", "Project_CommercialResearch", "Project_OperationsResearch", "Project_ManagementResearch"]));
    const influence = us.resources.influence;
    expect(applyCommand(state, content, { type: "setProject", factionId: "aegis", slot: 0, projectId: "Project_AudienceResearch" })).toEqual({ ok: true });
    us.research.progress["Project_AudienceResearch"] = projectCost(state, content, us, "Project_AudienceResearch");
    us.research.pips = [0, 0, 0, 1, 0, 0];
    runResearchTick(state, content, 0.001);
    expect(us.research.completed["Project_AudienceResearch"]).toBe(1);
    expect(us.research.projectSlots[0]).toBeNull();
    expect(us.resources.influence).toBeCloseTo(influence + 25, 6);
    // Repeatable: back on the list, at twice the cost.
    expect(us.research.available).toContain("Project_AudienceResearch");
    expect(projectCost(state, content, us, "Project_AudienceResearch")).toBe(200);
  });

  it("stops the clock until a player picks the next project", () => {
    const { sim, state, us } = game();
    expect(applyCommand(state, content, { type: "setProject", factionId: "aegis", slot: 0, projectId: "Project_CommercialResearch" })).toEqual({ ok: true });
    us.research.progress["Project_CommercialResearch"] = projectCost(state, content, us, "Project_CommercialResearch");
    us.research.pips = [0, 0, 0, 1, 0, 0];
    runResearchTick(state, content, 0.001);
    expect(us.research.projectSlots[0]).toBeNull();
    expect(awaitingProjectChoice(state, content)).toBe(true);
    expect(sim.advance(5)).toBe(0);
    expect(applyCommand(state, content, { type: "setProject", factionId: "aegis", slot: 0, projectId: "Project_AudienceResearch" })).toEqual({ ok: true });
    expect(awaitingProjectChoice(state, content)).toBe(false);
    expect(us.research.choosing).toEqual([]);
    expect(sim.advance(5)).toBe(5);
  });

  it("doesn't wait for a project when there is none to pick", () => {
    const { state, us } = game();
    us.research.choosing = [0];
    us.research.available = [];
    expect(awaitingProjectChoice(state, content)).toBe(false);
  });

  it("adds control point capacity with Management Research", () => {
    const { state, us } = game();
    const cap = controlCap(state, content, us).value;
    complete(state, us, "Project_ManagementResearch", 2);
    expect(controlCap(state, content, us).value).toBe(cap + 10);
  });

  it("makes the faction's IP go further in the priorities its projects improve", () => {
    const { state, us } = game();
    const ind = state.nations.find((n) => n.id === "ind")!;
    for (const cp of ind.controlPoints) cp.owner = "aegis";
    us.priorityWeights["ind"] = { boost: 1 };
    const before = priorityFlows(state, content, ind)["boost"]!;
    complete(state, us, "Project_ImprovedInterplanetaryRockets");
    expect(priorityFlows(state, content, ind)["boost"]).toBeCloseTo(before * 1.1, 6);
  });

  it("adds mission bonuses, council seats and spend steps", () => {
    const { state, us } = game();
    const councilor = us.councilors[0]!;
    councilor.professionId = "politician";
    const plain = assessMission(state, content, "aegis", councilor, { type: "publicCampaign", nationId: "nga" });
    complete(state, us, "Project_ForTheGreaterGood");
    const boosted = assessMission(state, content, "aegis", councilor, { type: "publicCampaign", nationId: "nga" });
    if (!(plain.ok && plain.contested && boosted.ok && boosted.contested)) throw new Error("expected contested missions");
    expect(boosted.odds.attack.value - plain.odds.attack.value).toBe(4);
    const seats = councilSize(state, content, us);
    complete(state, us, "Project_ClandestineCells");
    expect(councilSize(state, content, us)).toBe(seats + 1);
    const maxEffort = content.projects.find((p) => p.effects.some((e) => e.kind === "modifier" && e.context === "MaxMissionSliderSteps"))!;
    complete(state, us, maxEffort.id);
    expect(spendSteps(state, content, "aegis").at(-1)).toBe(128);
  });

  it("takes a one-of-a-kind project away from everyone else", () => {
    const { state, us } = game();
    const them = state.factions.find((f) => f.id === "iron-dawn")!;
    const project = content.projects.find((p) => p.oneTimeGlobally && !p.factions)!;
    us.research.available.push(project.id);
    them.research.available.push(project.id);
    them.research.progress[project.id] = 10;
    us.research.projectSlots[0] = project.id;
    us.research.progress[project.id] = projectCost(state, content, us, project.id);
    us.research.pips = [0, 0, 0, 1, 0, 0];
    runResearchTick(state, content, 0.001);
    expect(state.research.takenProjects).toContain(project.id);
    expect(them.research.available).not.toContain(project.id);
    expect(them.research.progress[project.id]).toBeUndefined();
  });

  it("makes waiting projects available with the monthly roll", () => {
    const { state, us } = game();
    const project = content.projects.find((p) => p.availability.initial === 0 && p.availability.monthly > 0)!;
    us.research.pending[project.id] = 1000;
    rollProjectAvailability(state, content);
    expect(us.research.available).toContain(project.id);
    expect(project.id in us.research.pending).toBe(false);
  });

  it("raises the Miltech cap when a tech says so", () => {
    const { state } = game();
    const tech = content.techs.find((t) => t.effects.some((e) => e.kind === "maxMiltech"))!;
    const before = state.research.maxMiltech;
    state.research.completed.push(...tech.prereqs.filter((p) => !state.research.completed.includes(p)));
    state.research.slots[0] = { techId: tech.id, progress: techCost(state, content, tech.id), contributions: { "iron-dawn": 1 }, chooser: null };
    runResearchTick(state, content, 0);
    expect(state.research.maxMiltech).toBe(before + 0.5);
  });

  it("opens a second slot for a councilor with a research org", () => {
    const { state, us } = game();
    expect(projectSlotCount(content, us)).toBe(1);
    expect(applyCommand(state, content, { type: "setProject", factionId: "aegis", slot: 1, projectId: "Project_CommercialResearch" }).ok).toBe(false);
    us.councilors[0]!.orgs = ["brookhaven"];
    expect(projectSlotCount(content, us)).toBe(2);
  });

  it("validates pips", () => {
    const { state } = game();
    expect(applyCommand(state, content, { type: "setResearchPips", factionId: "aegis", pips: [1, 1, 1, 1, 1, 9] }).ok).toBe(false);
    expect(applyCommand(state, content, { type: "setResearchPips", factionId: "aegis", pips: [1, 1] }).ok).toBe(false);
    expect(applyCommand(state, content, { type: "setResearchPips", factionId: "aegis", pips: [3, 0, 0, 2, 0, 0] })).toEqual({ ok: true });
    expect(applyCommand(state, content, { type: "setResearchPips", factionId: "aegis", pips: [4, 0, 0, 2, 0, 0] }).ok).toBe(false);
  });
});

