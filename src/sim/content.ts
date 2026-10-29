// Content definitions (SPEC 2.18): everything the simulation reads from JSON.
// The simulation never imports JSON itself; callers pass a validated Content object in.

import type { MissionType } from "./state";

export const ATTRIBUTES = [
  "persuasion",
  "investigation",
  "espionage",
  "command",
  "administration",
  "science",
  "security",
  "loyalty",
] as const;
export type Attribute = (typeof ATTRIBUTES)[number];

export interface FactionDef {
  id: string;
  name: string;
  ideology: string;
  /** −3 (anti-alien) to +3 (pro-alien). */
  alienStance: number;
  /** −3 (Order) to +3 (Freedom). */
  means: number;
  color: string;
}

export interface ProfessionDef {
  id: string;
  name: string;
  /** Terra Invicta's odds of a new councilor having this profession, relative to the others. */
  weight: number;
  /** Terra Invicta's key stats. */
  primary: Attribute[];
  /** Starting attributes: base plus 0–rand, from Terra Invicta's councilor types. */
  attributes: Record<Attribute, [number, number]>;
  /** Missions this profession can run (Set National Policy is open to everyone). */
  missions: MissionType[];
}

/** Monthly resource incomes of a trait or org. Research is shown but not yet simulated. */
export interface CouncilorIncome {
  money?: number;
  influence?: number;
  ops?: number;
  boost?: number;
  research?: number;
}

export interface TraitDef {
  id: string;
  name: string;
  kind: "positive" | "mixed" | "negative" | "augmentation";
  description: string;
  /** A councilor holds at most one trait of a group (e.g. one wealth level). */
  group?: string;
  attributes?: Partial<Record<Attribute, number>>;
  income?: CouncilorIncome;
  grants?: MissionType[];
  prohibits?: MissionType[];
  /** Change to the XP cost of augmenting an attribute, e.g. −0.2 for 20% cheaper. */
  augmentCost?: number;
  /** Chance that a new councilor of a profession has it; "*" covers the other professions. */
  chance: Record<string, number>;
}

export interface OrgDef {
  id: string;
  name: string;
  /** 1–3 stars; a councilor can hold org tiers up to their Administration. */
  tier: number;
  type: "government" | "research" | "space" | "corporate" | "media" | "ngo" | "security" | "criminal";
  /** National orgs need a CP in the nation or a councilor from it. */
  nationId?: string;
  /** Who can hold it: any of these professions, or any of these traits. Unrestricted if both are missing. */
  professions?: string[];
  traits?: string[];
  attributes?: Partial<Record<Attribute, number>>;
  income?: CouncilorIncome;
  grants?: MissionType[];
  cost: { money?: number; influence?: number; ops?: number; boost?: number };
}

export interface PriorityDef {
  id: string;
  name: string;
  /** IP needed to complete the priority once (Terra Invicta's "IP cost"). */
  cost: number;
  /** Nation-building priorities give this diversity bonus × their share of a CP's pips to the CP's other priorities. */
  diversity?: number;
}

export interface NationDef {
  id: string;
  name: string;
  capital: { name: string; lat: number; lon: number };
  /** Millions of people. */
  population: number;
  /** Billions of USD. */
  gdp: number;
  education: number;
  inequality: number;
  cohesion: number;
  democracy: number;
  unrest: number;
  /** Annual rate, e.g. 0.01 = 1%. */
  populationGrowth: number;
  militaryTech: number;
  armies: number;
  navies: number;
  /** Strategic nuclear barrages. */
  nukes: number;
  spaceProgram: boolean;
  /**
   * A breakaway nation (Terra Invicta's nations that hold no regions at the start, such as
   * Scotland or Texas): it starts out not existing, with its capital region inside its parent.
   * Its stats are zero; it takes its parent's when it breaks away.
   */
  breakaway?: { parent: string; capitalRegion: string; ti: string; project?: string };
}

export interface RegionDef {
  id: string;
  name: string;
  nationId: string;
  lat: number;
  lon: number;
  /** Millions of people. */
  population: number;
  areaKm2: number;
  capital: boolean;
  coastal: boolean;
  /** Unit vector of the region's centre, precomputed so distances need no trig (detmath rule). */
  xyz: [number, number, number];
  /** Name of an orbital launch site in the region, if any. */
  launchSite?: string;
  /** Region ids sharing a land border. */
  neighbors: string[];
}

export type DifficultyId = "easy" | "normal" | "hard";

export type Gender = "female" | "male";

export interface Rules {
  startYear: number;
  councilSize: number;
  councilPhaseDays: number[];
  recruitPoolSize: number;
  attribute: { min: number; max: number };
  startingResources: { money: number; influence: number; ops: number; boost: number; missionControl: number };
  controlPoints: {
    gdpExponent: number;
    divisor: number;
    min: number;
    max: number;
    capacityExponent: number;
    capacityDivisor: number;
    capAttributes: Attribute[];
  };
  corruption: { base: number; perGovernment: number; perCohesion: number; perGdppc3000: number; min: number };
  investment: {
    gdpExponent: number;
    unrestThreshold: number;
    unrestPenaltyPerPoint: number;
    maxUnrestPenalty: number;
    armyUpkeep: number;
    navyUpkeep: number;
  };
  populationScaling: { referenceMillions: number; exponent: number };
  defaultPriorities: Record<string, number>;
  unrest: { base: number; perGdppc10k: number; perCohesion: number; monthlyStep: number };
  priorityEffects: PriorityEffects;
  startingEconomy: { fundingShareOfGdp: { spaceProgram: number; other: number } };
  influence: { base: number; perBillionSupporters: number };
  publicOpinion: { undecided: number; affinityBias: number };
  propaganda: { opinionPerStrength: number };
  missions: MissionRules;
  councilors: {
    /** XP to raise an attribute by one; attributes can be augmented up to attribute.max. */
    augmentXpCost: number;
    maxStartingTraits: number;
    orgMarket: { refreshDay: number; minSize: number; maxSize: number; keepChancePerTier: number };
    /** Share of an org's Money cost refunded when it is sold. */
    orgSellRefund: number;
    /** Influence to hire a councilor from the recruit pool. */
    hireCost: number;
    recruitPool: { minSize: number; maxSize: number };
  };
  military: MilitaryRules;
  claims: ClaimRules;
  diplomacy: DiplomacyRules;
  climate: ClimateRules;
  difficulty: Record<DifficultyId, { researchCost: number; aiBonus: number }>;
  research: ResearchRules;
}

/** Research (Terra Invicta's Technology page and national research formula). See docs/formulas.md. */
export interface ResearchRules {
  /** The global techs under way when the campaign starts; there are always this many slots. */
  startingTechs: string[];
  /** Project slots: one free, one more for a councilor holding an org with research income, a third once habs exist. */
  maxProjectSlots: number;
  /** Research every faction gets each month before nations and councilors. */
  factionBase: number;
  /** Highest pip count per research slot, and the starting count. */
  maxPips: number;
  defaultPips: number;
  /** Each slot with pips adds this to the faction's research (Terra Invicta's distribution bonus). */
  bonusPerActiveSlot: number;
  /** A councilor's research income gains this per point of Science. */
  sciencePerPoint: number;
  /** The Knowledge Sector CP adds this to its holder's share of the nation's research. */
  knowledgeSectorBonus: number;
  /** The highest Miltech a nation can reach before techs raise it (the best starting Miltech). */
  startingMaxMiltech: number;
  /** Terra Invicta's research_month constants. */
  national: {
    scale: number;
    gdppcPivot: number;
    gdppcKnee: number;
    gdppcExponent: number;
    educationCap: number;
    governmentRoot: number;
    basePopulationDivisor: number;
    cohesionPeak: number;
    cohesionSlope: number;
    cohesionMax: number;
    unrestSquared: number;
  };
}

export type ResearchCategory = "energy" | "information" | "life" | "materials" | "military" | "social" | "space" | "xenology";

/** A global technology: researched by everyone together, completed once for the world. */
export interface TechDef {
  id: string;
  name: string;
  category: ResearchCategory;
  cost: number;
  prereqs: string[];
  summary: string;
  /** Effects on every faction or nation once the tech is known. */
  effects: ResearchEffect[];
}

/**
 * Faction modifiers from projects and techs, by Terra Invicta's context names. "add" values
 * are summed and "mul" values multiplied; docs/formulas.md ("Research") says where each applies.
 */
export type ModifierContext =
  | "ControlPointMaintenance"
  | "ControlPointCapacity"
  | "PublicCampaignStrength"
  | "DefendInterestsValue"
  | "CouncilSize"
  | "MaxMissionSliderSteps"
  | "AllRecruitStats"
  | "NewCouncilorRecruitXP"
  | "ControlPointResearch"
  | "BilateralRelationsCooldownMultiplier"
  | "OrgPurchaseCost"
  | "MaxAvailableOrgs"
  | "Corruption"
  | "SpoilsOutput"
  | "Economy_BasePCGDPIncrease";

/** Who a lasting effect applies to: the faction that completed it, or every faction. */
export type EffectScope = "faction" | "global";

export type ResearchEffect =
  /** IP the faction's CPs put into a priority goes this much further (0.1 = +10%). */
  | { kind: "priority"; priority: string; amount: number; scope: EffectScope }
  | { kind: "mission"; mission: MissionType; side: "attack" | "defense"; amount: number; scope: EffectScope }
  | { kind: "modifier"; context: ModifierContext; op: "add" | "mul"; value: number; scope: EffectScope; attribute?: Attribute; resource?: SpendResource | "boost" }
  /** On completion: every current councilor gains attribute points. */
  | { kind: "councilorAttribute"; attribute: Attribute; amount: number }
  /** On completion: every current councilor without the trait gains it. */
  | { kind: "councilorTrait"; trait: string }
  /** On completion: every councilor of every faction gains XP. */
  | { kind: "councilorXp"; amount: number }
  /** On completion: propaganda of this strength for the faction in every nation. */
  | { kind: "propaganda"; strength: number }
  /** On completion: re-rolls the faction's failed project unlocks. */
  | { kind: "reviewFailed" }
  /** On completion: raises the highest Miltech any nation can reach. */
  | { kind: "maxMiltech"; amount: number };

/**
 * A nation's claim on a region, from Terra Invicta (tools/data/build_claims.py). Claims say which
 * regions a nation may take. Without a project the claim is held from the start; otherwise it
 * holds once any faction completes that project. Every nation claims its own regions.
 */
export interface ClaimDef {
  nation: string;
  region: string;
  project?: string;
  /** Historically hostile: the region's people don't want to belong to the nation. */
  hostile?: boolean;
}

/** A faction project: each faction researches its own copy. Prerequisites are tech or project ids. */
export interface ProjectDef {
  id: string;
  name: string;
  category: ResearchCategory;
  cost: number;
  prereqs: string[];
  /** Can stand in for the first prerequisite. */
  altPrereq?: string;
  /** Only these factions can get it. */
  factions?: string[];
  /** This faction always gets the idea. */
  guaranteedFor?: string;
  /** Chance a faction gets the idea once the prerequisites are met (rolled once; Project Review re-rolls). */
  unlockChance: number;
  /** Once the idea is had, the chance each month it becomes available to start: initial, + monthly per month waited, up to max. */
  availability: { initial: number; monthly: number; max: number };
  /** Can be completed again; each completion multiplies the cost by (1 + times completed). */
  repeatable?: boolean;
  /** The first faction to complete it takes it away from everyone else. */
  oneTimeGlobally?: boolean;
  summary: string;
  effects: ResearchEffect[];
  /** One-time resources on completion. */
  grants: { resource: SpendResource | "boost"; amount: number }[];
  /** Terra Invicta's AI role, which our AI uses to rank projects. */
  role: string;
}

/** Per-completion priority effects from Terra Invicta's Nations page, for a nation of 50M people. See docs/formulas.md. */
export interface PriorityEffects {
  economy: { gdppcBase: number; gdppcPerGovernment: number; gdppcPerEducation: number; inequality: number };
  welfare: { inequality: number };
  knowledge: { education: number; educationLow: number; educationHigh: number; cohesionTowardCenter: number; cohesionCenter: number };
  government: { governmentPerEducation: number };
  unity: {
    cohesionBase: number;
    cohesionPerEducation: number;
    cohesionPerGovernment: number;
    cohesionMin: number;
    education: number;
    propagandaPerCp: number;
    religionCpWeight: number;
  };
  military: { miltech: number };
  oppression: { government: number; unrestBase: number; unrestPerGovernment: number; unrestMultiplier: number; cohesionPerGovernmentOver5: number };
  spoils: {
    inequality: number;
    government: number;
    propagandaPerEduGov: number;
    moneyPerMonthlyIp: number;
    moneyPerMissingGovernment: number;
    aristocracyBonus: number;
  };
  funding: { annualBase: number; capPerGdpBillion: number; financialSectorBonus: number };
  boost: { annualBase: number; latitudeDivisor: number };
  foundSpaceProgram: { annualBoost: number };
  foundMilitary: { minMiltech: number };
  buildArmy: { populationBase: number; populationPerArmy: number };
  buildNavy: { minControlPoints: number; smallNationControlPoints: number; smallNationGdppc: number };
}

export type SpendResource = "money" | "influence" | "ops";

export interface MissionCost {
  resource: SpendResource;
  /** Paid in full for the mission. */
  fixed?: number;
  /** The faction may spend 0–64 of the resource to improve the odds. */
  spend?: boolean;
}

/** Mission modifiers from Terra Invicta (SPEC D11, D13). See docs/formulas.md. */
export interface MissionRules {
  rollBase: number;
  critDivisor: number;
  /** Resources a faction may spend on a contested mission, and the attack bonus per doubling: log2(1 + spent). */
  spend: { steps: number[]; bonusPerDoubling: number };
  /** What each mission costs: a fixed amount, or a spend the player chooses. Missions not listed are free. */
  costs: Partial<Record<MissionType, MissionCost>>;
  gdpScalingFactor: number;
  councilStatDivisor: number;
  supportBase: number;
  neighborWeight: number;
  /** Control Nation: weight of the faction's CPs in larger allies and fellow federation members. */
  allyWeight: number;
  cpTypeBonus: number;
  ideologyWeight: number;
  defendBonus: number;
  overcapDivisor: number;
  critSuccessPropaganda: number;
  controlNation: { order: number; xp: number; supportWeight: number };
  publicCampaign: { order: number; xp: number; populationScale: number };
  defendInterests: { order: number; xp: number; daysPerCp: number; baseDays: number };
  crackdown: { order: number; xp: number; disableMonths: number; critDisableMonths: number };
  purge: { order: number; xp: number; difficulty: number; disabledBase: number; disabledPerExtra: number };
  setPolicy: { order: number; xp: number };
  investigateCouncilor: { order: number; xp: number; intelBase: number; intelPerInvestigation: number };
  assassinate: { order: number; xp: number; difficulty: number; detainPhases: number };
  protectTarget: { order: number; xp: number };
  /** Loyalty change (an integer in the range) and Apparent Loyalty change by outcome. */
  inspire: { order: number; xp: number; difficulty: number; loyalty: Record<string, [number, number]>; apparentLoyalty: Record<string, number> };
  stabilizeNation: { order: number; xp: number; unrestReduction: number };
  /** Unrest added on a success (doubled on a critical one, halved above twice the resting level). */
  increaseUnrest: { order: number; xp: number; unrestIncrease: number };
  advise: { order: number; xp: number };
  surveilLocation: { order: number; xp: number; detectionBonus: number };
  goToGround: { order: number; xp: number; intelLossBase: number; intelLossPerEspionage: number };
  /** Terra Invicta's mission noise on a normal success: added to the chance of being spotted. */
  noise: Partial<Record<MissionType, number>>;
  /** Intel lost per council phase on a councilor the faction didn't target. */
  intelDecay: number;
  /** Detecting a councilor at work: how much each attribute point counts by distance, and the intel it gives. */
  detection: { sameRegion: number; sameNation: number; neighborRegion: number; cpWeight: number; intel: number; critIntel: number };
  /** Intel needed to target a councilor: to Investigate, and for the other councilor missions. */
  intelToLocate: number;
  intelToTarget: number;
  coup: {
    order: number;
    xp: number;
    difficulty: number;
    eliteDissatisfactionWeight: number;
    eliteSatisfactionWeight: number;
    detainPhases: number;
    critFailPropaganda: number;
  };
}

/** Terrestrial warfare after Terra Invicta (SPEC 2.6.4, D11). See docs/formulas.md, "Armies and war". */
export interface MilitaryRules {
  deployedArmyUpkeep: number;
  landKmPerDay: number;
  navalKmPerDay: number;
  navalBaseDays: number;
  /** Travel times scale with this / Miltech. */
  speedMiltech: number;
  hostileMoveFactor: number;
  unrestMoveDivisor: number;
  smallRegionKm2: number;
  airliftBaseDays: number;
  homeBonus: number;
  disabledCpPenalty: number;
  cohesionBonus: number;
  unrestPenalty: number;
  adjacentRegionBonus: number;
  lostHealthEffect: number;
  occupationEffect: number;
  hitBase: number;
  hitExponent: number;
  armyDamage: number;
  regionDamage: number;
  occupationRate: number;
  maxOccupationPerHit: number;
  crowdingAreaKm2: number;
  crowdingPenalty: number;
  crowdingFloor: number;
  liberationRate: number;
  occupationDecay: number;
  heal: { base: number; homeNation: number; homeRegion: number };
  armyRefund: { home: [number, number]; abroad: [number, number] };
  navyRefund: { home: [number, number]; abroad: [number, number]; blockaded: [number, number] };
  unrestPerArmy: number;
  unrestRegionExponent: number;
  strength: { perRegion: number; perArmy: number; perNavy: number; perUnrest: number; hasNukes: number; perNuke: number };
  conquest: { unrestBase: number; unrestPerOccupiedShare: number; cohesionLoss: number; governmentLoss: number; governmentConvergence: [number, number] };
  declareWar: { earlyRivalryDays: number; earlyCohesionPerGovernment: number; attackerCohesion: number; defenderCohesion: number; allyCohesion: number; joinCohesion: number; maxUnrest: number; minCohesion: number; maxGovernment: number };
  nukes: NukeRules;
}

/** Terra Invicta's nuclear strike. Ranges are [low, high], drawn uniformly. Defensive strikes hit our or an ally's ground. */
export interface NukeRules {
  /** Share of the region's GDP lost (the region's share of the nation's population stands in for its GDP share). */
  gdp: { offensive: [number, number]; defensive: [number, number] };
  /** Share of the region's people killed. */
  population: { offensive: [number, number]; defensive: [number, number] };
  /** Pollution Multiplier gained, × the region's share of the nation. */
  pollution: { offensive: [number, number]; defensive: [number, number] };
  /** Every nation's GDP: −(`perWorldShare` + up to `random`) × the region's share of world GDP; `defensivePerWorldShare` for defensive strikes. */
  worldGdp: { perWorldShare: number; random: number; defensivePerWorldShare: number };
  /** The target nation's yearly Funding lost, × the region's share of the nation. Not on our own ground. */
  funding: number;
  /** Priorities whose progress survives a strike on the nation. */
  keepPriorities: string[];
  /** Hostile armies: health lost is 100% less `hardening` (a range, per point of Miltech above `hardeningFrom`). */
  hardening: [number, number];
  hardeningFrom: number;
  /** Health friendly armies in the region lose: 1 / a draw from this range. */
  friendlyDivisor: [number, number];
  /** Chance each councilor in the region dies (the Survivor trait protects). */
  councilorDeath: number;
  survivorTrait: string;
  /** Excess stratospheric aerosols each strike adds, in ppm. */
  aerosols: number;
}

/** Claims and the ways regions change hands (Terra Invicta's Foreign Relations). See docs/formulas.md, "Claims". */
export interface ClaimRules {
  /** A claim turns hostile when the claimant's Government is this much below the region's nation's. */
  hostileGovernmentGap: number;
  /** Hostile population share × this × (10 − Government) adds to Base Unrest; × Government comes off cohesion. */
  hostilePenalty: number;
  /** Government and Unity completions that reconcile one hostile region. */
  integration: number;
  /** Diplomatic cooldowns after Demand Territory and a grant of independence. */
  demandCooldownDays: number;
  independenceCooldownDays: number;
  /** Annex Region: days = base × ((population / mean)^0.75 + (area / median)^0.5), clamped, × their Miltech / ours. */
  annex: { baseDays: number; minDays: number; maxDays: number; minHealth: number };
  /** Secession when a nation's cohesion is at most maxCohesion and its unrest at least minUnrest. */
  secession: {
    maxCohesion: number;
    minUnrest: number;
    /** Neighbouring nations' claims are tested this often. */
    neighborEveryDays: number;
    hostileFactor: number;
    /** Armies in the region hold it unless the nation's Government is at least this. */
    armyGovernment: number;
    armyDivisor: number;
    /** P% = the score / divisor. */
    divisor: number;
  };
  /** A breakaway set off by Increase Unrest: P% = base (× critical) / council phases a month (× project) × (unrest − cohesion / 2) − Government, … ÷ divisor. */
  unrestSecession: { base: number; criticalFactor: number; projectFactor: number; divisor: number };
  /** War Conquest unrest: − per point of Psyops-type projects of the new faction, + for Guerrilla Warfare of the old one, − per unrest raised by the new faction. */
  conquestUnrest: { psyops: number; guerrilla: number; perRaised: number };
  /** Peaceful Unification caps the absorbing nation's unrest here. */
  unificationMaxUnrest: number;
}

export type GasId = "co2" | "ch4" | "n2o";

/** Terra Invicta's Climate Change rules (climate.ts, docs/formulas.md "Climate"). */
export interface ClimateRules {
  /** Atmosphere (ppm) and sea level anomaly (cm) at the campaign start (Terra Invicta's 2030 start). */
  start: Record<GasId | "aerosols", number> & { seaLevel: number };
  gases: Record<
    GasId,
    {
      /** No warming at or below this concentration. */
      baseline: number;
      /** Excess ppm per °C of warming. */
      ppmPerDegree: number;
      /** Each month the atmosphere loses its concentration divided by this. */
      removalDivisor: number;
      /** ppm per tonne of CO2-equivalent the nations emit. */
      ppmPerTonne: number;
      /** ppm per Spoils completion, before the nation's scaling (see spoilsEmissions). */
      spoils: number;
      /** ppm per Environment completion at 10 Sustainability, before the nation's scaling. */
      environment: number;
    }
  >;
  aerosols: { ppmPerDegree: number; minDegrees: number; decay: number; decayFlat: number; perNuclearWeapon: number };
  /** The yearly emissions bracket, in tonnes of CO2, that the Pollution Multiplier scales. */
  emissions: { perGdpBillion: number; perPerson: number; gdppcFull: number; gdppcFullSquared: number; perOilRegion: number; oilCapPerGdpBillion: number };
  pollution: {
    max: number;
    /** The lowest Pollution Multiplier, before techs lower it. */
    floor: number;
    floorTechs: Record<string, number>;
    spoilsGain: number;
    spoilsGainPerResource: number;
    environmentCut: number;
    spoilsResourceBonus: number;
    spoilsDivisor: number;
    environmentDivisor: number;
  };
  damage: {
    threshold: number;
    square: number;
    linear: number;
    inequalityBase: number;
    extremeStart: number;
    extremeStartMin: number;
    extremeCap: number;
    cold: number;
    colderAt: number;
    coldestAt: number;
    coldest: number;
    cap: number;
    /** Inequality gained per unit of monthly GDP loss. */
    inequalityShare: number;
    co2EducationAt: number;
    co2EducationMinEducation: number;
    co2EducationPerPpm: number;
    co2EducationMax: number;
    populationAt: number;
    populationPerDegree: number;
  };
  seaLevel: { perDegreeMonth: number; visibleAt: number };
  /** Ice shelves and sheets that melt once the anomaly reaches `degrees`, raising the sea by `cm`. */
  melts: { name: string; degrees: number; cm: number }[];
  events: Record<ClimateEventId, { degrees?: number; cooldownMonths: number; chancePerMonth: number; ch4?: [number, number]; aerosols?: [number, number] }>;
  choices: ClimateChoiceRules;
}

/** An option's resource bill: a fixed part plus a part per million people in the struck region. Negative is income. */
export interface ClimateCost {
  money?: number;
  influence?: number;
  ops?: number;
  moneyPerMillion?: number;
  influencePerMillion?: number;
}

/**
 * Terra Invicta's climate events that ask the faction running the struck nation what to do.
 * `recession` is the share of the struck region's GDP lost; cohesion, education and inequality
 * changes are scaled down in populous nations as Terra Invicta's "PopScaled" effects are.
 */
export interface ClimateChoiceRules {
  /** Factions that may recruit among the dispossessed (Terra Invicta's extremists) or loot (its Exploit ideology). */
  extremists: string[];
  exploiters: string[];
  /** Population losses are divided by 1 + GDP per capita / this (Terra Invicta's wealth mitigation). */
  wealthMitigationGdppc: number;
  degradation: {
    /** Strikes while the anomaly's magnitude exceeds this. */
    degrees: number;
    chancePerMonth: number;
    /** The tech that halves the odds, and the odds with it. */
    mitigationTech: string;
    mitigatedChancePerMonth: number;
    cooldownMonths: number;
    regionCooldownMonths: number;
    /** Regions at least this protected are spared. */
    protectedAt: number;
    /** Weight multipliers for vulnerable regions and nations putting less than `lowWelfareShare` of their IP into Welfare. */
    vulnerableWeight: number;
    lowWelfareWeight: number;
    lowWelfareShare: number;
    ignore: { recession: number; unrest: number; propaganda: number };
    subsidize: { recession: number; propaganda: number; cost: ClimateCost };
    recruit: { recession: number; cohesion: number; propaganda: number; cost: ClimateCost };
    loot: { recession: number; unrest: number; education: number; inequality: number; cost: ClimateCost };
  };
  wetBulb: {
    degrees: number;
    /** Calendar months (1–12) it can strike in, inclusive. */
    months: [number, number];
    chancePerMonth: number;
    cooldownMonths: number;
    regionCooldownMonths: number;
    /** Share of the region's people killed, before wealth mitigation. */
    population: number;
    assist: { population: number; propaganda: number; cost: ClimateCost };
  };
  cropFailures: {
    /** Strikes once the anomaly falls below this. */
    degrees: number;
    cooldownMonths: number;
    gdp: number;
    cohesion: number;
    population: number;
  };
}

export type ClimateEventId = "methane" | "volcano" | "majorVolcano" | "colossalVolcano";

/** A region's climate traits (src/content/climate.json, from Terra Invicta's regions). */
export interface RegionClimate {
  /** Population share in ecologically vulnerable areas (twice the economic harm). */
  vulnerable?: number;
  /** Population share in ecologically protected areas (no economic harm). */
  protected?: number;
  /** Oil and mining resource regions (they add to emissions and Spoils pollution). */
  oil?: number;
  mining?: number;
  /** Holds one of the regions Terra Invicta's Wet Bulb Disaster can strike. */
  wetBulb?: number;
}

export interface ClimateContent {
  /** Pollution Multiplier for nations without emissions data. */
  defaultPollution: number;
  regions: Record<string, RegionClimate>;
  /** Starting Pollution Multiplier by nation id. */
  pollution: Record<string, number>;
}

export interface DiplomacyRules {
  influenceCost: number;
  cooldownDays: number;
  rejectedCooldownDays: number;
  /** Either nation needs more than this many CPs, a shared border or a navy to deal with the other. */
  minControlPoints: number;
  /** Nuclear weapons the Disarm Warheads policy takes apart at most. */
  disarmNukes: number;
  /** Days of continuous executive control before it is consolidated (unless seized by force). */
  consolidationDays: number;
  federation: FederationRules;
}

/** Terra Invicta's federation rules (see federation.ts). */
export interface FederationRules {
  /** Cooldown between a new member and every other member. */
  joinCooldownDays: number;
  /** Cooldown between a nation that left and every remaining member. */
  leaveCooldownDays: number;
  /** A lead nation below this Government may veto a member's leaving. */
  vetoGovernment: number;
  /** Pooled Funding and Boost go to members by CP count to this power. */
  shareExponent: number;
  /** Economy bonus: (other members' GDP in $B)^economyExponent / economyDivisor percent. */
  economyExponent: number;
  economyDivisor: number;
  /** Share of GDP a nation loses on leaving (ours: Terra Invicta gives no number). */
  leaveGdpLoss: number;
  /** Days a player-run authoritarian leader has to declare war on a member lost to a coup (ours). */
  defectionWarDays: number;
}

/** Relations at the start of the campaign, as pairs of nation ids. */
export interface StartingRelations {
  rivalries: [string, string][];
  alliances: [string, string][];
  /** Federations at the start: their members are allied to one another. */
  federations: { name: string; leader: string; members: string[] }[];
  /** The name a federation founded and led by this nation takes (Terra Invicta's union names). */
  federationNames: Record<string, string>;
}

/** Councilor names by culture; each nation names its councilors from one culture. */
export interface NameCulture {
  male: string[];
  female: string[];
  family: string[];
  /** Female forms of the family names, in the same order, where they differ (Kowalski → Kowalska). */
  familyFemale?: string[];
}

export interface NameData {
  cultures: Record<string, NameCulture>;
  nations: Record<string, string>;
}

export type SpaceBodyType = "star" | "planet" | "moon" | "dwarf" | "asteroid" | "comet";

/** Keplerian elements at an epoch, around the body's parent (Terra Invicta's TISpaceBodyTemplate). */
export interface OrbitDef {
  /** Semi-major axis, AU. */
  a: number;
  e: number;
  /** Inclination, ascending node, argument of periapsis and mean anomaly at the epoch, degrees. */
  i: number;
  node: number;
  peri: number;
  meanAnomaly: number;
  /** Julian year of the elements (2000 = J2000). */
  epoch: number;
}

/** A body of the solar system (src/content/solarSystem.json, from tools/data/build_solar.py). */
export interface SpaceBodyDef {
  id: string;
  name: string;
  type: SpaceBodyType;
  /** The body it orbits; null for the Sun. */
  parent: string | null;
  radiusKm: number;
  massKg: number;
  /** Absent for the Sun. */
  orbit?: OrbitDef;
}

export interface Content {
  factions: FactionDef[];
  professions: ProfessionDef[];
  priorities: PriorityDef[];
  nations: NationDef[];
  regions: RegionDef[];
  names: NameData;
  relations: StartingRelations;
  traits: TraitDef[];
  orgs: OrgDef[];
  techs: TechDef[];
  projects: ProjectDef[];
  claims: ClaimDef[];
  climate: ClimateContent;
  /** Real formation names per nation, used in order as armies are raised. */
  armyNames: Record<string, string[]>;
  /** The Sun and the bodies orbiting it, parents before the bodies that orbit them. */
  solarSystem: SpaceBodyDef[];
  rules: Rules;
}

/** Checks the cross-references a JSON schema cannot express. Throws on the first problem. */
export function validateContent(content: Content): Content {
  const fail = (msg: string): never => {
    throw new Error(`Invalid content: ${msg}`);
  };
  const unique = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) fail(`duplicate ${kind} id "${id}"`);
      seen.add(id);
    }
  };
  unique("faction", content.factions.map((f) => f.id));
  unique("profession", content.professions.map((p) => p.id));
  unique("priority", content.priorities.map((p) => p.id));
  unique("nation", content.nations.map((n) => n.id));
  unique("region", content.regions.map((r) => r.id));

  const attributes = new Set<string>(ATTRIBUTES);
  for (const p of content.professions) {
    for (const a of p.primary) if (!attributes.has(a)) fail(`profession "${p.id}" has unknown attribute "${a}"`);
    for (const a of attributes) if (!p.attributes[a as Attribute]) fail(`profession "${p.id}" has no range for "${a}"`);
  }
  const priorityIds = new Set(content.priorities.map((p) => p.id));
  for (const id of Object.keys(content.rules.defaultPriorities)) {
    if (!priorityIds.has(id)) fail(`defaultPriorities names unknown priority "${id}"`);
  }
  for (const p of content.priorities) {
    if (!(p.cost > 0)) fail(`priority "${p.id}" needs a positive cost`);
  }
  for (const f of content.factions) {
    if (Math.abs(f.alienStance) > 3 || Math.abs(f.means) > 3) fail(`faction "${f.id}" axis out of range`);
  }
  const nationIds = new Set(content.nations.map((n) => n.id));
  const regionIds = new Set(content.regions.map((r) => r.id));
  const regionCount = new Map<string, number>();
  for (const r of content.regions) {
    if (!nationIds.has(r.nationId)) fail(`region "${r.id}" names unknown nation "${r.nationId}"`);
    for (const n of r.neighbors) if (!regionIds.has(n)) fail(`region "${r.id}" has unknown neighbor "${n}"`);
    regionCount.set(r.nationId, (regionCount.get(r.nationId) ?? 0) + 1);
  }
  unique("trait", content.traits.map((t) => t.id));
  unique("org", content.orgs.map((o) => o.id));
  const professionIds = new Set(content.professions.map((p) => p.id));
  const traitIds = new Set(content.traits.map((t) => t.id));
  for (const t of content.traits) {
    for (const key of Object.keys(t.chance)) if (key !== "*" && !professionIds.has(key)) fail(`trait "${t.id}" has a chance for unknown profession "${key}"`);
    for (const a of Object.keys(t.attributes ?? {})) if (!attributes.has(a)) fail(`trait "${t.id}" has unknown attribute "${a}"`);
  }
  for (const o of content.orgs) {
    if (![1, 2, 3].includes(o.tier)) fail(`org "${o.id}" needs a tier of 1–3`);
    if (o.nationId && !content.nations.some((n) => n.id === o.nationId)) fail(`org "${o.id}" names unknown nation "${o.nationId}"`);
    for (const p of o.professions ?? []) if (!professionIds.has(p)) fail(`org "${o.id}" names unknown profession "${p}"`);
    for (const t of o.traits ?? []) if (!traitIds.has(t)) fail(`org "${o.id}" names unknown trait "${t}"`);
    for (const a of Object.keys(o.attributes ?? {})) if (!attributes.has(a)) fail(`org "${o.id}" has unknown attribute "${a}"`);
  }
  for (const id of Object.keys(content.armyNames)) if (!nationIds.has(id)) fail(`armyNames names unknown nation "${id}"`);
  const states = content.nations.filter((n) => !n.breakaway);
  for (const n of states) if (!regionCount.get(n.id)) fail(`nation "${n.id}" has no regions`);
  for (const n of states) if (content.regions.filter((r) => r.nationId === n.id && r.capital).length !== 1) fail(`nation "${n.id}" needs exactly one capital region`);
  for (const n of content.nations) {
    if (!n.breakaway) continue;
    if (regionCount.get(n.id)) fail(`breakaway nation "${n.id}" can't start with regions`);
    const capital = content.regions.find((r) => r.id === n.breakaway!.capitalRegion);
    if (!capital || capital.nationId !== n.breakaway.parent) fail(`breakaway nation "${n.id}" needs a capital region in "${n.breakaway.parent}"`);
    if (capital!.capital) fail(`breakaway nation "${n.id}" can't have its parent's capital as its own`);
  }
  const pairs = new Set<string>();
  for (const [kind, list] of [["rivalry", content.relations.rivalries], ["alliance", content.relations.alliances]] as const) {
    for (const [a, b] of list) {
      if (!nationIds.has(a) || !nationIds.has(b) || a === b) fail(`${kind} "${a}"–"${b}" needs two different known nations`);
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (pairs.has(key)) fail(`nations "${a}" and "${b}" are given more than one starting relation`);
      pairs.add(key);
    }
  }
  const federated = new Set<string>();
  for (const f of content.relations.federations) {
    if (f.members.length < 2 || !f.members.includes(f.leader)) fail(`federation "${f.name}" needs two members or more, its leader among them`);
    for (const id of f.members) {
      if (!nationIds.has(id) || content.nations.find((n) => n.id === id)!.breakaway) fail(`federation "${f.name}" names unknown or breakaway nation "${id}"`);
      if (federated.has(id)) fail(`nation "${id}" is in more than one federation`);
      federated.add(id);
    }
    for (const [a, b] of content.relations.rivalries) if (f.members.includes(a) && f.members.includes(b)) fail(`federation "${f.name}" members "${a}" and "${b}" can't be rivals`);
  }
  for (const id of Object.keys(content.relations.federationNames)) if (!nationIds.has(id)) fail(`federation name given for unknown nation "${id}"`);
  for (const a of content.rules.controlPoints.capAttributes) if (!attributes.has(a)) fail(`unknown cap attribute "${a}"`);
  unique("tech", content.techs.map((t) => t.id));
  unique("project", content.projects.map((p) => p.id));
  const techIds = new Set(content.techs.map((t) => t.id));
  const researchIds = new Set([...techIds, ...content.projects.map((p) => p.id)]);
  for (const t of content.techs) for (const p of t.prereqs) if (!techIds.has(p)) fail(`tech "${t.id}" needs unknown tech "${p}"`);
  for (const p of content.projects) {
    for (const q of [...p.prereqs, ...(p.altPrereq ? [p.altPrereq] : [])]) if (!researchIds.has(q)) fail(`project "${p.id}" needs unknown tech or project "${q}"`);
    for (const f of p.factions ?? []) if (!content.factions.some((x) => x.id === f)) fail(`project "${p.id}" names unknown faction "${f}"`);
  }
  for (const item of [...content.techs, ...content.projects]) {
    for (const e of item.effects) {
      if (e.kind === "priority" && !priorityIds.has(e.priority)) fail(`"${item.id}" names unknown priority "${e.priority}"`);
      if (e.kind === "councilorTrait" && !traitIds.has(e.trait)) fail(`"${item.id}" names unknown trait "${e.trait}"`);
    }
  }
  for (const id of content.rules.research.startingTechs) if (!techIds.has(id)) fail(`unknown starting tech "${id}"`);
  for (const [id, c] of Object.entries(content.names.cultures)) {
    if (c.male.length === 0 || c.female.length === 0 || c.family.length === 0) fail(`name culture "${id}" has an empty pool`);
    if (c.familyFemale && c.familyFemale.length !== c.family.length) fail(`name culture "${id}" needs a female form for every family name`);
  }
  // Councilors come from nations that exist at the start, so breakaways need no name culture.
  for (const n of states) {
    const culture = content.names.nations[n.id];
    if (!culture || !content.names.cultures[culture]) fail(`nation "${n.id}" has no name culture`);
  }
  const projectIds = new Set(content.projects.map((p) => p.id));
  for (const c of content.claims) {
    if (!nationIds.has(c.nation)) fail(`claim by unknown nation "${c.nation}"`);
    if (!regionIds.has(c.region)) fail(`claim on unknown region "${c.region}"`);
    if (c.project && !projectIds.has(c.project)) fail(`claim unlocked by unknown project "${c.project}"`);
  }
  unique("space body", content.solarSystem.map((b) => b.id));
  const placed = new Set<string>();
  for (const b of content.solarSystem) {
    if (b.parent === null ? b.orbit !== undefined : !placed.has(b.parent) || !b.orbit) fail(`space body "${b.id}" needs an orbit around a body listed before it`);
    placed.add(b.id);
  }
  return content;
}
