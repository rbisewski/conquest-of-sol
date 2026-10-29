// Headless self-play harness (SPEC 2.15): runs an all-AI campaign under Node and prints
// a summary plus a state hash. Running it twice with the same seed must print the same hash.
//
//   pnpm selfplay --seed 42 --years 10 --difficulty normal

import { parseArgs } from "node:util";
import { baseContent } from "../src/content/index";
import { controlledPoints, dateOfDay, formatDate, hashState, monthlyInfluence, nationDef, Simulation, type DifficultyId } from "../src/sim/index";

const { values } = parseArgs({
  // pnpm passes a literal "--" through to the script; drop it.
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    seed: { type: "string", default: "1" },
    years: { type: "string", default: "10" },
    difficulty: { type: "string", default: "normal" },
  },
});

const seed = Number(values.seed);
const years = Number(values.years);
const difficulty = values.difficulty as DifficultyId;
if (!Number.isInteger(seed) || !(years > 0) || !(difficulty in baseContent.rules.difficulty)) {
  console.error("Usage: selfplay --seed <int> --years <n> --difficulty easy|normal|hard");
  process.exit(1);
}

const sim = Simulation.create(baseContent, { seed, difficulty, playerFactions: [] });
const started = performance.now();
const days = Math.round(years * 365.25);
const passed = sim.advance(days);
const elapsed = performance.now() - started;
const state = sim.state;

console.log(`Seed ${seed}, ${difficulty}, ${passed} days simulated in ${elapsed.toFixed(0)} ms`);
console.log(`Date: ${formatDate(dateOfDay(baseContent.rules.startYear, state.dayIndex))}\n`);

console.log("Faction             CPs  Influence  Money   Income/mo");
for (const faction of state.factions) {
  const name = baseContent.factions.find((f) => f.id === faction.id)!.name;
  const r = faction.resources;
  console.log(
    `${name.padEnd(20)}${String(controlledPoints(state, faction.id)).padStart(3)}  ${r.influence.toFixed(0).padStart(9)}  ${r.money
      .toFixed(0)
      .padStart(5)}   ${monthlyInfluence(state, baseContent, faction).value.toFixed(1).padStart(9)}`,
  );
}

const missions = new Map<string, number>();
for (const entry of state.log) {
  const kind = /took the|seized/.test(entry.text) ? "Control Nation ok" : /purged/.test(entry.text) ? "Purge ok" : /cracked down/.test(entry.text) ? "Crackdown ok" : /overthrew/.test(entry.text) ? "Coup ok" : /defended our interests/.test(entry.text) ? "Defend Interests" : /failed/.test(entry.text) ? "Failed" : "Other";
  missions.set(kind, (missions.get(kind) ?? 0) + 1);
}
console.log(`\nLast ${state.log.length} log entries:`, Object.fromEntries(missions));

const top = [...state.nations].sort((a, b) => b.gdp - a.gdp).slice(0, 15);
console.log("\nNation              GDP ($B)   Unrest  Executive");
for (const nation of top) {
  const exec = nation.controlPoints[0]?.owner ?? "-";
  console.log(`${nationDef(baseContent, nation.id).name.padEnd(20)}${nation.gdp.toFixed(0).padStart(8)}   ${nation.unrest.toFixed(1).padStart(6)}  ${exec}`);
}

// Regions that changed hands, by the nation now holding them, and nations that are gone.
const gains = new Map<string, string[]>();
for (const r of baseContent.regions) {
  const owner = state.regionOwners[r.id]!;
  if (owner !== r.nationId) gains.set(owner, [...(gains.get(owner) ?? []), `${r.name} (${nationDef(baseContent, r.nationId).name})`]);
}
console.log(`\nBorders: ${[...gains.values()].reduce((n, list) => n + list.length, 0)} regions changed hands`);
for (const [owner, list] of [...gains].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${nationDef(baseContent, owner).name}: ${list.join(", ")}`);
const gone = state.nations.filter((n) => n.capitalId === null && !nationDef(baseContent, n.id).breakaway).map((n) => nationDef(baseContent, n.id).name);
if (gone.length > 0) console.log(`  No longer exist: ${gone.join(", ")}`);
const free = state.nations.filter((n) => n.capitalId !== null && nationDef(baseContent, n.id).breakaway).map((n) => nationDef(baseContent, n.id).name);
if (free.length > 0) console.log(`  Breakaway nations now independent: ${free.join(", ")}`);
const breakaways = Object.entries(state.breakaways).map(([child, parent]) => `${nationDef(baseContent, child).name} (from ${nationDef(baseContent, parent).name})`);
if (breakaways.length > 0) console.log(`  Breakaways: ${breakaways.join(", ")}`);

console.log(`\nState hash: ${hashState(state)}`);
