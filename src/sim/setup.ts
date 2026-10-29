// Builds the starting GameState for the 2030 Arrival scenario (SPEC 2.16).

import { ATTRIBUTES, type Attribute, type Content, type DifficultyId, type Gender, type NationDef } from "./content";
import { councilorAge, refreshOrgMarkets, rollTraits } from "./councilors";
import { newClimate } from "./climate";
import { addAlliance, pairKey } from "./diplomacy";
import { boostPerCompletion } from "./economy";
import { createFederation } from "./federation";
import { addLog, factionDef, newId, professionDef } from "./lookup";
import { equipNavy, raiseArmy } from "./military";
import { homeCapital, startingOwners } from "./territory";
import { controlPointCount } from "./nation";
import { councilSize, initResearch, modifierSum, newFactionResearch, recruitBonus } from "./research";
import { nextFloat, nextInt, pick, seedRng, weightedPick, type RngState } from "./rng";
import { STATE_VERSION, UNDECIDED, type Councilor, type FactionState, type GameState, type LaunchSite, type NationState } from "./state";

export interface NewGameOptions {
  seed: number;
  difficulty: DifficultyId;
  /** Faction ids controlled by people. Empty for an all-AI self-play game. */
  playerFactions: string[];
}

export function newGame(content: Content, options: NewGameOptions): GameState {
  const known = new Set(content.factions.map((f) => f.id));
  for (const id of options.playerFactions) if (!known.has(id)) throw new Error(`Unknown faction "${id}"`);

  const state: GameState = {
    version: STATE_VERSION,
    seed: options.seed,
    difficulty: options.difficulty,
    dayIndex: 0,
    minuteOfDay: 0,
    phase: "running",
    rng: seedRng(options.seed),
    research: { slots: [], completed: [], maxMiltech: 0, takenProjects: [], version: 0 },
    nextId: 1,
    factions: [],
    nations: content.nations.map((def) => initialNation(content, def.id)),
    armies: [],
    wars: [],
    regionOwners: startingOwners(content),
    gainedClaims: [],
    claimStatus: {},
    breakaways: {},
    unrestRaised: {},
    diplomacy: {
      alliances: content.relations.alliances.map(([a, b]) => pairKey(a, b)).sort(),
      rivalries: Object.fromEntries(content.relations.rivalries.map(([a, b]) => [pairKey(a, b), 0])),
      cooldowns: {},
    },
    federations: [],
    defections: {},
    occupation: {},
    scheduledMissions: [],
    policyChoices: [],
    climateChoices: [],
    strikes: [],
    hidden: [],
    surveillance: {},
    recentTargets: {},
    protections: {},
    advisors: {},
    climate: newClimate(content),
    log: [],
  };
  for (const f of content.relations.federations) {
    createFederation(state, content, f.members, f.leader, f.name);
    for (const a of f.members) for (const b of f.members) if (a < b) addAlliance(state, a, b);
  }
  addStartingArmies(state, content);

  for (const def of content.factions) {
    const councilors: Councilor[] = [];
    for (let i = 0; i < content.rules.councilSize; i++) councilors.push(generateCouncilor(state, content));
    state.factions.push({
      id: def.id,
      isPlayer: options.playerFactions.includes(def.id),
      resources: { ...content.rules.startingResources },
      councilors,
      priorityWeights: {},
      councilDone: false,
      orgMarket: [],
      intel: {},
      recruits: [],
      research: newFactionResearch(content),
    });
  }
  refreshOrgMarkets(state, content);
  refreshRecruits(state, content);
  initResearch(state, content);
  return state;
}

function initialNation(content: Content, nationId: string): NationState {
  const def = content.nations.find((n) => n.id === nationId)!;
  const cpCount = def.breakaway ? 0 : controlPointCount(content, def.gdp).value;
  return {
    id: def.id,
    // A breakaway starts out not existing (territory.ts).
    capitalId: def.breakaway ? null : homeCapital(content, def.id).id,
    population: def.population,
    gdp: def.gdp,
    education: def.education,
    inequality: def.inequality,
    cohesion: def.cohesion,
    democracy: def.democracy,
    unrest: def.unrest,
    militaryTech: def.militaryTech,
    militaryFounded: def.armies > 0,
    atomicBomb: def.nukes > 0,
    nukes: def.nukes,
    spaceProgram: def.spaceProgram,
    launchSites: def.spaceProgram ? startingLaunchSites(content, def.id) : [],
    ...startingOutputs(content, def),
    publicOpinion: initialOpinion(content, def.democracy),
    controlPoints: Array.from({ length: cpCount }, (_, i) => ({ owner: null, executive: i === 0, disabledUntil: 0, defendedUntil: 0 })),
    ipProgress: {},
    lastCoupDay: null,
    pollution: content.climate.pollution[nationId] ?? content.climate.defaultPollution,
    executiveHold: { factionId: null, since: 0, seized: false },
    integration: 0,
  };
}

/** Each nation's starting armies, headquartered capital first, with its navies on the coastal ones. */
export function addStartingArmies(state: GameState, content: Content): void {
  for (const def of content.nations) {
    for (let i = 0; i < def.armies; i++) raiseArmy(state, content, def.id);
    for (let i = 0; i < Math.min(def.navies, def.armies); i++) equipNavy(state, content, def.id);
  }
}

/** The real launch sites in a nation's regions. */
export function startingLaunchSites(content: Content, nationId: string): LaunchSite[] {
  return content.regions.filter((r) => r.nationId === nationId && r.launchSite).map((r) => ({ regionId: r.id, name: r.launchSite! }));
}

/**
 * Starting Funding, Boost and Mission Control. Terra Invicta's scenario values aren't
 * published, so these are heuristics (docs/formulas.md): Funding is a share of GDP, and
 * each launch site counts as one Boost completion and one Mission Control.
 */
function startingOutputs(content: Content, def: NationDef): Pick<NationState, "annualFunding" | "annualBoost" | "missionControl"> {
  const share = content.rules.startingEconomy.fundingShareOfGdp;
  // GDP is in billions and money is in millions of USD.
  const annualFunding = Math.round(def.gdp * 1000 * (def.spaceProgram ? share.spaceProgram : share.other));
  if (!def.spaceProgram) return { annualFunding, annualBoost: 0, missionControl: 0 };
  const sites = content.regions.filter((r) => r.nationId === def.id && r.launchSite);
  const annualBoost = content.rules.priorityEffects.foundSpaceProgram.annualBoost + sites.reduce((sum, r) => sum + boostPerCompletion(content, r.lat), 0);
  return { annualFunding, annualBoost, missionControl: sites.length };
}

/**
 * Most people start undecided. The rest split between the factions, leaning toward
 * those whose Means axis matches the nation: democracies lean Freedom, autocracies
 * lean Order (SPEC 2.4: public-opinion affinity derives from the ideology axes).
 */
function initialOpinion(content: Content, democracy: number): Record<string, number> {
  const { undecided, affinityBias } = content.rules.publicOpinion;
  const lean = (democracy - 5) / 5; // −1 (autocracy) … +1 (democracy)
  const raw = content.factions.map((f) => Math.max(0.001, 1 + lean * f.means * affinityBias));
  const total = raw.reduce((a, b) => a + b, 0);
  const opinion: Record<string, number> = {};
  content.factions.forEach((f, i) => (opinion[f.id] = ((1 - undecided) * raw[i]!) / total));
  opinion[UNDECIDED] = undecided;
  return opinion;
}

const startingCache = new WeakMap<Content, NationDef[]>();

/** The nations that exist at the start (not the breakaways), which councilors come from. */
export function startingNations(content: Content): NationDef[] {
  let list = startingCache.get(content);
  if (!list) startingCache.set(content, (list = content.nations.filter((n) => !n.breakaway)));
  return list;
}

/** A name from the nation's culture: given name first, with the female form of the family name where there is one. */
export function councilorName(rng: RngState, content: Content, nationId: string, gender: Gender): string {
  const culture = content.names.cultures[content.names.nations[nationId]!]!;
  const i = nextInt(rng, 0, culture.family.length - 1);
  const family = gender === "female" && culture.familyFemale ? culture.familyFemale[i]! : culture.family[i]!;
  return `${pick(rng, culture[gender])} ${family}`;
}

export function generateCouncilor(state: GameState, content: Content): Councilor {
  const rng: RngState = state.rng;
  const a = content.rules.attribute;
  const profession = weightedPick(rng, content.professions, (p) => p.weight);
  const attributes = {} as Record<Attribute, number>;
  for (const attr of ATTRIBUTES) {
    const [base, rand] = profession.attributes[attr];
    attributes[attr] = Math.min(a.max, Math.max(a.min, base + nextInt(rng, 0, rand)));
  }
  const nation = pick(rng, startingNations(content));
  const gender: Gender = nextInt(rng, 0, 1) === 0 ? "female" : "male";
  return {
    id: newId(state, "c"),
    name: councilorName(rng, content, nation.id, gender),
    professionId: profession.id,
    nationId: nation.id,
    locationId: nation.id,
    regionId: homeCapital(content, nation.id).id,
    gender,
    portraitSeed: nextInt(rng, 0, 0x7fffffff),
    skinTone: null,
    hairSeed: null,
    birthYear: Math.floor(content.rules.startYear + state.dayIndex / 365.25) - nextInt(rng, 28, 66),
    traits: rollTraits(state, content, profession.id),
    orgs: [],
    spottedBy: [],
    attributes,
    apparentLoyalty: attributes.loyalty,
    xp: 0,
    mission: null,
    detainedPhases: 0,
  };
}

// ---------------------------------------------------------------------------
// Recruiting (Terra Invicta's monthly candidate pool)

/**
 * On the 1st of each month every faction's candidates are refreshed: each leaves with a chance
 * of 1% per year of age, then new ones are generated up to a random pool size.
 */
export function refreshRecruits(state: GameState, content: Content): void {
  const pool = content.rules.councilors.recruitPool;
  for (const faction of state.factions) {
    faction.recruits = faction.recruits.filter((c) => nextFloat(state.rng) >= councilorAge(state, content, c) / 100);
    const size = nextInt(state.rng, pool.minSize, pool.maxSize);
    while (faction.recruits.length < size) faction.recruits.push(trainRecruit(state, content, faction, generateCouncilor(state, content)));
  }
}

/** Projects give a faction's new candidates extra attributes and XP. */
function trainRecruit(state: GameState, content: Content, faction: FactionState, c: Councilor): Councilor {
  for (const attr of ATTRIBUTES) c.attributes[attr] = Math.min(content.rules.attribute.max, c.attributes[attr] + recruitBonus(state, content, faction.id, attr));
  c.apparentLoyalty = c.attributes.loyalty;
  c.xp += modifierSum(state, content, faction.id, "NewCouncilorRecruitXP");
  return c;
}

export function checkHire(state: GameState, content: Content, faction: FactionState, recruitId: string): { ok: true } | { ok: false; reason: string } {
  const seats = councilSize(state, content, faction);
  if (!faction.recruits.some((c) => c.id === recruitId)) return { ok: false, reason: "That candidate isn't available" };
  if (faction.councilors.length >= seats) return { ok: false, reason: `The council is full (${seats})` };
  if (faction.resources.influence < content.rules.councilors.hireCost) return { ok: false, reason: `Needs ${content.rules.councilors.hireCost} influence` };
  return { ok: true };
}

export function hire(state: GameState, content: Content, faction: FactionState, recruitId: string): void {
  const c = faction.recruits.find((r) => r.id === recruitId)!;
  faction.recruits = faction.recruits.filter((r) => r !== c);
  faction.resources.influence -= content.rules.councilors.hireCost;
  faction.councilors.push(c);
  addLog(state, { factionId: faction.id, kind: "council", text: `${c.name} (${professionDef(content, c.professionId).name}) joined the ${factionDef(content, faction.id).name} council.` });
}

/** AI factions fill empty council seats with the candidate whose attributes add up highest. */
export function aiHire(state: GameState, content: Content, faction: FactionState): void {
  const total = (c: Councilor) => ATTRIBUTES.reduce((sum, a) => sum + (a === "loyalty" ? 0 : c.attributes[a]), 0);
  while (faction.councilors.length < councilSize(state, content, faction) && faction.resources.influence >= content.rules.councilors.hireCost + 20) {
    const best = [...faction.recruits].sort((a, b) => total(b) - total(a) || a.id.localeCompare(b.id))[0];
    if (!best) return;
    hire(state, content, faction, best.id);
  }
}
