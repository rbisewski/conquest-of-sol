import { describe, expect, it } from "vitest";
import { baseContent } from "../../content/index";
import {
  applyCommand,
  checkFoundHab,
  deltaV,
  delivery,
  deserialize,
  foundingCore,
  MINED_RESOURCES,
  probeDays,
  rollSiteYields,
  serialize,
  Simulation,
  transferFromEarth,
  type Destination,
  type GameState,
} from "../index";

const content = baseContent;

function game(): { sim: Simulation; state: GameState } {
  const sim = Simulation.create(content, { seed: 9, difficulty: "normal", playerFactions: ["aegis"] });
  // Close the opening council phase so time can run.
  for (const f of sim.state.factions) f.councilDone = true;
  sim.state.phase = "running";
  return { sim, state: sim.state };
}
const aegis = (state: GameState) => state.factions.find((f) => f.id === "aegis")!;
const probe = (state: GameState, bodyId: string) => applyCommand(state, content, { type: "launchProbe", factionId: "aegis", bodyId });
/** Gives Aegis a project as if it had completed it. */
function complete(state: GameState, projectId: string): void {
  aegis(state).research.completed[projectId] = 1;
  state.research.version += 1;
}
const site = (id: string): Destination => ({ kind: "site", id });
const orbit = (id: string): Destination => ({ kind: "orbit", id });

describe("transfers from the Earth", () => {
  it("take the textbook Hohmann times", () => {
    const days = (id: string) => transferFromEarth(content, id, 30)!.transferYears * 365.25;
    expect(days("Mars")).toBeCloseTo(259, 0);
    expect(days("Jupiter") / 365.25).toBeCloseTo(2.73, 2);
    // A moon of another planet goes by its planet's transfer; the Moon needs about five days from low Earth orbit.
    expect(days("Phobos")).toBe(days("Mars"));
    expect(days("Luna")).toBeGreaterThan(4.5);
    expect(days("Luna")).toBeLessThan(5.5);
  });

  it("have windows a synodic period apart, and none within the Earth's system", () => {
    const mars = transferFromEarth(content, "Mars", 30)!.window!;
    expect(mars.synodicYears * 365.25).toBeCloseTo(780, -1);
    expect(mars.inYears).toBeGreaterThanOrEqual(0);
    expect(mars.inYears).toBeLessThan(mars.synodicYears);
    // Just after a window, the next is about a synodic period away (the real, eccentric orbits shift it by weeks).
    const later = transferFromEarth(content, "Mars", 30 + mars.inYears + 0.01)!.window!;
    expect(Math.abs(later.inYears - (mars.synodicYears - 0.01))).toBeLessThan(0.1);
    expect(transferFromEarth(content, "Luna", 30)!.window).toBeNull();
  });
});

describe("hab site yields", () => {
  const normal = rollSiteYields(content, 9, "normal");

  it("are rolled for every site from the seed alone", () => {
    expect(Object.keys(normal)).toHaveLength(content.habSites.length);
    expect(rollSiteYields(content, 9, "normal")).toEqual(normal);
    expect(rollSiteYields(content, 10, "normal")).not.toEqual(normal);
    expect(game().state.siteYields).toEqual(normal);
  });

  it("are never negative, and never give more noble metals than half the base metals", () => {
    for (const y of Object.values(normal)) {
      for (const r of MINED_RESOURCES) expect(y[r]).toBeGreaterThanOrEqual(0);
      expect(y.nobleMetals).toBeLessThanOrEqual(y.metals / 2 + 1e-4);
    }
  });

  it("grow with the difficulty's mining rate", () => {
    const total = (yields: GameState["siteYields"]) => Object.values(yields).reduce((sum, y) => sum + y.water + y.metals, 0);
    const easy = total(rollSiteYields(content, 9, "easy"));
    const hard = total(rollSiteYields(content, 9, "hard"));
    expect(easy / hard).toBeGreaterThan(1.7);
    expect(total(normal) / hard).toBeGreaterThan(1.3);
  });
});

describe("prospecting probes", () => {
  it("need the body's mission tech and the probe's boost", () => {
    const { state } = game();
    expect(probe(state, "Luna")).toEqual({ ok: false, reason: "Needs Mission to the Moon" });
    state.research.completed.push("MissiontotheMoon");
    aegis(state).resources.boost = 0;
    expect(probe(state, "Luna")).toEqual({ ok: false, reason: "Needs 1 boost" });
    expect(probe(state, "Venus").ok).toBe(false);
  });

  it("prospect the body when they arrive, after the transfer", () => {
    const { sim, state } = game();
    state.research.completed.push("MissiontotheMoon");
    aegis(state).resources.boost = 1.5;
    expect(probe(state, "Luna")).toEqual({ ok: true });
    expect(aegis(state).resources.boost).toBeCloseTo(0.5, 6);
    expect(probe(state, "Luna").ok).toBe(false);
    const arrives = aegis(state).probes[0]!.arrivesDay;
    expect(arrives - state.dayIndex).toBe(5);
    sim.advance(arrives - state.dayIndex - 1);
    expect(aegis(state).prospected).not.toContain("Luna");
    sim.advance(1);
    expect(aegis(state).prospected).toEqual(["Luna"]);
    expect(aegis(state).probes).toEqual([]);
    expect(state.log.at(-1)).toMatchObject({ factionId: "aegis", kind: "space", bodyId: "Luna" });
    expect(probe(state, "Luna")).toEqual({ ok: false, reason: "We have already prospected Luna" });
  });

  it("take longer off the launch window, and half as long with High Thrust Probes", () => {
    const { state } = game();
    const transfer = transferFromEarth(content, "Mars", 30)!;
    const days = probeDays(state, content, "aegis", "Mars");
    expect(days).toBeGreaterThanOrEqual(transfer.transferYears * 365.25 - 1e-6);
    expect(days).toBeLessThanOrEqual(transfer.transferYears * 365.25 * (1 + content.rules.space.offWindowPenalty));
    complete(state, "Project_HighThrustProbes");
    expect(probeDays(state, content, "aegis", "Mars")).toBeCloseTo(days / 2, 6);
  });

  it("lose a quarter of the off-window delay with Solar Steamers", () => {
    const { state } = game();
    const hohmann = transferFromEarth(content, "Mars", 30)!.transferYears * 365.25;
    const before = probeDays(state, content, "aegis", "Mars");
    complete(state, "Project_SolarSteamers");
    expect(probeDays(state, content, "aegis", "Mars") - hohmann).toBeCloseTo((before - hohmann) * 0.75, 6);
  });
});

describe("Δv from low Earth orbit", () => {
  const burns = (d: Destination) => deltaV(content, d).terms.map((t) => t.value);

  it("matches the textbook patched-conic burns", () => {
    // The Moon: about 3.1 km/s into the transfer (Apollo's TLI), 0.8–0.9 into low lunar orbit, about 1.8 more to land.
    const [tli, loi] = burns(orbit("LowLunarOrbit"));
    expect(tli).toBeCloseTo(3.1, 1);
    expect(loi).toBeGreaterThan(0.75);
    expect(loi).toBeLessThan(0.95);
    expect(deltaV(content, site("LunaSite1")).value).toBeGreaterThan(5.6);
    expect(deltaV(content, site("LunaSite1")).value).toBeLessThan(6);
    // Mars: about 3.6 km/s to leave a 300 km Earth orbit on a Hohmann transfer (a little less from our 500 km), 2.1 to brake into a low Mars orbit.
    const [tmi, moi] = burns(orbit("LowMarsOrbit"));
    expect(tmi).toBeGreaterThan(3.5);
    expect(tmi).toBeLessThan(3.6);
    expect(moi).toBeCloseTo(2.1, 1);
    // Geostationary orbit: about 3.8 km/s from 500 km without a plane change; the Sun–Earth L1 point, the Earth's escape speed less its orbital speed.
    expect(deltaV(content, orbit("SynchronousEarthOrbit")).value).toBeCloseTo(3.8, 1);
    expect(deltaV(content, orbit("SunEarthL1Orbit")).value).toBeCloseTo(3.15, 1);
    // Ceres: the Hohmann transfer from 1 to 2.77 AU leaves at 6.3 km/s past the Earth and arrives 4.9 km/s off Ceres's pace.
    const ceres = deltaV(content, orbit("LowCeresOrbit")).value;
    expect(ceres).toBeGreaterThan(9);
    expect(ceres).toBeLessThan(10);
  });

  it("is nothing within low Earth orbit, and finite and positive everywhere else", () => {
    for (const o of content.orbits) {
      const v = deltaV(content, orbit(o.id)).value;
      if (o.earthLeo) expect(v).toBe(0);
      else expect(v > 0 && Number.isFinite(v)).toBe(true);
    }
    for (const s of content.habSites) expect(deltaV(content, site(s.id)).value).toBeGreaterThan(deltaV(content, site(s.id)).terms[0]!.value);
  });
});

describe("boost deliveries", () => {
  it("cost boost by the rocket equation, less with each better rocket", () => {
    const { state } = game();
    const leo = orbit("LowEarthOrbit1");
    // Low Earth orbit needs no rockets: 15 tons at ten tons a boost.
    expect(delivery(state, content, "aegis", leo, foundingCore(content, leo)).boost!.value).toBeCloseTo(1.5, 6);
    const luna = site("LunaSite1");
    const core = foundingCore(content, luna);
    expect(delivery(state, content, "aegis", luna, core).boost).toBeNull();
    complete(state, "Project_Solid-FuelSpaceRockets");
    const solid = delivery(state, content, "aegis", luna, core).boost!.value;
    expect(solid).toBeCloseTo((core.massTons / 10) * Math.exp(deltaV(content, luna).value / 2.6), 6);
    complete(state, "Project_Liquid-FuelRockets");
    expect(delivery(state, content, "aegis", luna, core).boost!.value).toBeLessThan(solid);
    // Mercury's radiation doubles the mass sent.
    const mercury = site("MercurySite1");
    const plain = (core.massTons / 10) * Math.exp(deltaV(content, mercury).value / 3.3);
    expect(delivery(state, content, "aegis", mercury, core).boost!.value).toBeCloseTo(plain * 2, 6);
  });

  it("arrive after the transfer, sooner with Space Tugs", () => {
    const { state } = game();
    const leo = orbit("LowEarthOrbit1");
    expect(delivery(state, content, "aegis", leo, foundingCore(content, leo)).arrivesDay).toBe(state.dayIndex);
    const luna = site("LunaSite1");
    const days = delivery(state, content, "aegis", luna, foundingCore(content, luna)).days;
    expect(days).toBeCloseTo(transferFromEarth(content, "Luna", 30)!.transferYears * 365.25, 1);
    complete(state, "Project_SpaceTugs");
    expect(delivery(state, content, "aegis", luna, foundingCore(content, luna)).days).toBeCloseTo(days * 0.9, 6);
  });

  it("say what stands in the way of founding an outpost", () => {
    const { state } = game();
    const luna = site("LunaSite1");
    const reason = () => {
      const check = checkFoundHab(state, content, "aegis", luna);
      return check.ok ? "ok" : check.reason;
    };
    expect(reason()).toBe("Needs Mission to the Moon");
    state.research.completed.push("MissiontotheMoon");
    expect(reason()).toBe("Needs the Outpost Core project");
    complete(state, "Project_OutpostCore");
    expect(reason()).toBe("Prospect Luna first");
    aegis(state).prospected.push("Luna");
    expect(reason()).toBe("Needs Solid-Fuel Space Rockets to send it beyond low Earth orbit");
    complete(state, "Project_Solid-FuelSpaceRockets");
    aegis(state).resources.boost = 0;
    expect(reason()).toMatch(/^Needs [\d.]+ boost$/);
    aegis(state).resources.boost = 100;
    expect(reason()).toBe("ok");
  });
});

describe("saves", () => {
  it("give version 29 saves the yields a new game of their seed rolls, and nothing prospected", () => {
    const { state } = game();
    const old = JSON.parse(serialize(state));
    old.version = 29;
    delete old.state.siteYields;
    for (const f of old.state.factions) {
      delete f.prospected;
      delete f.probes;
    }
    const loaded = deserialize(JSON.stringify(old), content);
    expect(loaded.siteYields).toEqual(state.siteYields);
    expect(loaded.factions.every((f) => f.prospected.length === 0 && f.probes.length === 0)).toBe(true);
  });
});
