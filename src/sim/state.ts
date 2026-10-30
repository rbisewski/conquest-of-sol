import type { Attribute, ClaimDef, DifficultyId, Gender } from "./content";
import type { RngState } from "./rng";

/** Bump when the shape of GameState changes, and add a migration in save.ts. */
export const STATE_VERSION = 28;

export const UNDECIDED = "undecided";

export interface ControlPoint {
  /** Faction id, or null when no faction holds it. */
  owner: string | null;
  /** Index 0 of every nation is the Executive CP (SPEC 2.6.2). */
  executive: boolean;
  /** A Crackdown disables the CP until this day: its owner gets no benefits from it. */
  disabledUntil: number;
  /** Defend Interests protects the CP until this day. */
  defendedUntil: number;
}

export interface LaunchSite {
  regionId: string;
  name: string;
}

export interface NationState {
  id: string;
  /** The capital region, or null while the nation holds no regions and so doesn't exist (territory.ts). */
  capitalId: string | null;
  population: number;
  gdp: number;
  education: number;
  inequality: number;
  cohesion: number;
  democracy: number;
  unrest: number;
  militaryTech: number;
  /** Found Military is complete: the nation can build armies and raise Miltech. Armies are in GameState.armies. */
  militaryFounded: boolean;
  /** Develop Atomic Bomb is complete: further nukes use the cheaper Nuclear Weapons priority. */
  atomicBomb: boolean;
  nukes: number;
  spaceProgram: boolean;
  /** Launch complexes, one per region at most. Empty without a space program. */
  launchSites: LaunchSite[];
  /** Money per year paid out to the holders of the nation's CPs (Funding priority). */
  annualFunding: number;
  /** Boost per year paid out to the holders of the nation's CPs (Boost priority). */
  annualBoost: number;
  /** Mission Control the nation provides, split between its CP holders. */
  missionControl: number;
  /** Share of the population per faction ideology, plus UNDECIDED. Sums to 1. */
  publicOpinion: Record<string, number>;
  controlPoints: ControlPoint[];
  /** IP accumulated toward the next completion of each priority. */
  ipProgress: Record<string, number>;
  /** Day of the last successful coup, or null. */
  lastCoupDay: number | null;
  /** Terra Invicta's Pollution Multiplier (0–10): scales the nation's emissions; Sustainability is its inverse. */
  pollution: number;
  /**
   * Who holds the executive CP, since which day, and whether they seized it by force (coup or
   * war). Kept in step with the CP by trackExecutives; see isConsolidated.
   */
  executiveHold: { factionId: string | null; since: number; seized: boolean };
  /** Government and Unity completions toward making the next hostile claim on its own regions peaceful. */
  integration: number;
}

/** A councilor's current assignment (SPEC 2.7). CP targets are indexes into the nation's controlPoints. */
export type Mission = (
  | { type: "controlNation"; nationId: string }
  | { type: "defendInterests"; nationId: string }
  | { type: "crackdown"; nationId: string; cpIndex: number }
  | { type: "purge"; nationId: string; cpIndex: number }
  | { type: "coup"; nationId: string }
  /** Public Campaign: propaganda of strength Persuasion, harder in populous nations. */
  | { type: "publicCampaign"; nationId: string }
  /** Missions aimed at a councilor: nationId is where the target was when the mission was chosen. */
  | { type: "investigateCouncilor"; nationId: string; targetId: string }
  | { type: "assassinate"; nationId: string; targetId: string }
  /** Protect Target: one of our own councilors, until the next council phase. */
  | { type: "protectTarget"; nationId: string; targetId: string }
  /** Inspire: raise the Loyalty of another of our councilors. */
  | { type: "inspire"; nationId: string; targetId: string }
  | { type: "stabilizeNation"; nationId: string }
  /** Increase Unrest: aimed at a region, it raises its nation's unrest and can set off a breakaway there. */
  | { type: "increaseUnrest"; nationId: string; regionId: string }
  /** Advise: lends the councilor's Administration and Command to a nation until the next council phase. */
  | { type: "advise"; nationId: string }
  /** Surveil Location: makes other factions' councilors easier to spot in a region and its neighbours. */
  | { type: "surveilLocation"; nationId: string; regionId: string }
  /** Go To Ground: hide in a region until the next council phase, shedding enemy intel. */
  | { type: "goToGround"; nationId: string; regionId: string }
  /**
   * Set National Policy: only in a nation whose (working) executive CP the faction holds. The
   * policy is chosen when the mission succeeds (see GameState.policyChoices).
   */
  | { type: "setPolicy"; nationId: string }
) & {
  /** Resources spent on a contested mission to improve its odds (one of rules.missions.spend.steps). */
  spend?: number;
};

/** National policies set by the Set National Policy mission (SPEC 2.6.4). */
export type Policy =
  | { kind: "declareWar"; targetId: string }
  | { kind: "joinWar"; warId: string; side: WarSide }
  | { kind: "seekPeace"; warId: string }
  /** Take a region the nation has a non-hostile claim on from a nation at peace. */
  | { kind: "demandTerritory"; regionId: string }
  /** Absorb a whole nation (Peaceful Unification). */
  | { kind: "unify"; targetId: string }
  /** Join the target's federation, bring the target into ours, or found one together. */
  | { kind: "federate"; targetId: string }
  | { kind: "leaveFederation" }
  /** Recreate a nation that no longer exists in its home capital, or free a breakaway. */
  | { kind: "grantIndependence"; targetId: string }
  /** A breakaway leaves its parent, which declares war on it. */
  | { kind: "declareIndependence" }
  /** Disband one of the nation's armies that the faction commands. */
  | { kind: "disbandArmy"; armyId: string }
  /** Take apart up to rules.diplomacy.disarmNukes nuclear weapons. */
  | { kind: "disarm" };

export type WarSide = "attackers" | "defenders";

export interface ArmyMove {
  toRegionId: string;
  /** Minutes since the campaign start (see time.ts). */
  departAt: number;
  arriveAt: number;
  naval: boolean;
  /** Set when the army is airlifted home (it flies rather than sails). */
  airlift?: true;
}

/**
 * An army (SPEC 2.6.4). It answers to one of its nation's CPs (see armyControlPoint) and the
 * faction holding that CP commands it. Navies are an upgrade carried by an army.
 */
export interface ArmyState {
  id: string;
  nationId: string;
  /** Formation name, e.g. "XVIII Airborne Corps" (see nextArmyName). */
  name: string;
  /** Headquarters: upkeep is lower while the army is here. */
  homeRegionId: string;
  /** Where the army is, or the region it left while moving. */
  regionId: string;
  /** Remaining strength, 0–1. */
  health: number;
  navy: boolean;
  move: ArmyMove | null;
  /** Annex Region under way in the army's region, done on doneDay. */
  annex: { regionId: string; doneDay: number } | null;
}

export interface WarState {
  id: string;
  /** Nation ids; the first entries started the war (the leader is the strongest, see sideLeader). */
  attackers: string[];
  defenders: string[];
  startDay: number;
}

/** Relations between nations. Pairs are "a|b" with the ids sorted (see pairKey). */
export interface Diplomacy {
  alliances: string[];
  /** Rival pairs and the day the rivalry began. */
  rivalries: Record<string, number>;
  /** No new diplomatic action between the pair before this day. */
  cooldowns: Record<string, number>;
}

/** A federation (federation.ts): members are in permanent alliance and pool Funding and Boost. */
export interface FederationState {
  id: string;
  name: string;
  leaderId: string;
  /** Nation ids, sorted, the leader included. */
  members: string[];
}

export type MissionType = Mission["type"];

export interface Councilor {
  id: string;
  name: string;
  professionId: string;
  nationId: string;
  /** The nation the councilor is in now: home at first, then wherever their last mission was. */
  locationId: string;
  /** The region the councilor is in, inside locationId's nation. */
  regionId: string;
  gender: Gender;
  /** Picks the pixel-art portrait's features (face, skin, eyes, hair…); the UI decides how. */
  portraitSeed: number;
  birthYear: number;
  /** Hair chosen in Customize ("Change Hair"), or null to take it from portraitSeed. */
  hairSeed: number | null;
  /** Skin tone chosen in Customize (an index into the portrait palette), or null for the seed's. */
  skinTone: number | null;
  /** Trait ids (content traits.json). */
  traits: string[];
  /** Org ids (content orgs.json) this councilor holds. */
  orgs: string[];
  /** Factions this councilor knows have intel on them (cleared by Go To Ground). */
  spottedBy: string[];
  attributes: Record<Attribute, number>;
  /** What the owning faction sees (SPEC 2.7). The true value is attributes.loyalty. */
  apparentLoyalty: number;
  xp: number;
  mission: Mission | null;
  /** The mission to take up again at each council phase, if auto-repeat is on. */
  repeatMission: Mission | null;
  /** Council phases left in detention; a detained councilor cannot take missions. */
  detainedPhases: number;
}

export interface Resources {
  money: number;
  influence: number;
  ops: number;
  boost: number;
  /** Mission Control capacity: recomputed each month from the CPs the faction holds. */
  missionControl: number;
}

export interface FactionState {
  id: string;
  /** Controlled by a person rather than the AI. */
  isPlayer: boolean;
  resources: Resources;
  councilors: Councilor[];
  /** Priority weights this faction applies to the CPs it holds, per nation id. */
  priorityWeights: Record<string, Record<string, number>>;
  /** True once the faction has finished assigning missions in the current council phase. */
  councilDone: boolean;
  /** Org ids on this faction's private market (refreshed monthly). */
  orgMarket: string[];
  /** Intel (0–1) on other factions' councilors, by councilor id (Terra Invicta's intel levels). */
  intel: Record<string, number>;
  /** Councilors this faction can hire, refreshed monthly. */
  recruits: Councilor[];
  research: FactionResearch;
}

/** One of the global research slots (Terra Invicta researches three techs at once). */
export interface TechSlot {
  /** Null while the faction in `chooser` picks the next tech, or when none is left. */
  techId: string | null;
  progress: number;
  /** Research each faction has put into the current tech. */
  contributions: Record<string, number>;
  /** The top contributor to the last tech here, who picks the next one. */
  chooser: string | null;
}

export interface ResearchState {
  slots: TechSlot[];
  /** Completed techs, in order. */
  completed: string[];
  /** The highest Miltech any nation can reach; techs raise it. */
  maxMiltech: number;
  /** One-of-a-kind projects some faction has completed, taken away from the others. */
  takenProjects: string[];
  /** Counts completions, so the summed-up effects of techs and projects know when to refresh. */
  version: number;
}

/** A faction's research: how it splits its research, and its projects. */
export interface FactionResearch {
  /** Pips per slot: the global tech slots first, then the project slots. */
  pips: number[];
  /** Project in each project slot, or null. */
  projectSlots: (string | null)[];
  /** Research put into each project so far (kept when a project is set aside). */
  progress: Record<string, number>;
  /** Times each project has been completed. */
  completed: Record<string, number>;
  /** Projects the faction can start. */
  available: string[];
  /** Projects the faction has the idea for, waiting to become available: months waited so far. */
  pending: Record<string, number>;
  /** Projects whose unlock roll failed. */
  failed: string[];
  /** Project slots emptied by a completed (or taken) project, where a player faction picks the next one while the clock waits. */
  choosing: number[];
}

export interface LogEntry {
  dayIndex: number;
  minuteOfDay: number;
  text: string;
  factionId?: string;
  nationId?: string;
  /** What the entry is about, for its icon. Saves before version 17 have none. */
  kind?: LogKind;
  /** The mission an entry of kind "mission" reports. */
  mission?: Mission["type"];
  /** Whether it went well or badly for the faction it belongs to. */
  tone?: "good" | "bad";
}

export type LogKind = "mission" | "intel" | "council" | "research" | "war" | "nation" | "diplomacy" | "territory" | "climate";

export interface GameState {
  version: number;
  research: ResearchState;
  seed: number;
  difficulty: DifficultyId;
  /** Days since 1 January of rules.startYear. */
  dayIndex: number;
  /** Minutes since midnight, 0–1439. */
  minuteOfDay: number;
  /** "council" means time is stopped while factions assign missions (SPEC 2.5). */
  phase: "running" | "council";
  rng: RngState;
  /** Counter for generated ids, so ids stay deterministic. */
  nextId: number;
  factions: FactionState[];
  nations: NationState[];
  armies: ArmyState[];
  wars: WarState[];
  diplomacy: Diplomacy;
  federations: FederationState[];
  /**
   * Members that left an authoritarian federation through a coup, by nation id: its lead
   * nation (run by a player) may declare war on them, free of penalties, until `until`.
   */
  defections: Record<string, { leaderId: string; federation: string; until: number }>;
  /** Region id → the nation holding it. Replaced, never edited in place (territory.ts). */
  regionOwners: Record<string, string>;
  /** Claims gained in play, on top of content's (from Peaceful Unification and War Conquest). */
  gainedClaims: ClaimDef[];
  /**
   * Claims whose hostility was settled in play, by "nation|region": "hostile" when the region
   * was taken under a hostile claim, "peaceful" once Government and Unity investment reconciled it.
   */
  claimStatus: Record<string, "hostile" | "peaceful">;
  /** Successful Increase Unrest missions per faction, by nation id (cleared by War Conquest). */
  unrestRaised: Record<string, Record<string, number>>;
  /** Breakaway nation id → the nation it broke away from. They stay rivals until it is settled. */
  breakaways: Record<string, string>;
  /** Occupation per region id: the share (0–1) held by each occupying nation. Shares sum to at most 1. */
  occupation: Record<string, Record<string, number>>;
  /** Missions waiting to resolve, in resolution order with ascending times. */
  scheduledMissions: ScheduledMission[];
  /**
   * Set National Policy missions that succeeded for a player faction, oldest first: the clock
   * waits until the player picks a policy (or none) with the choosePolicy command.
   */
  policyChoices: PolicyChoice[];
  /** Protect Target until the next council phase: protector councilor ids by protected councilor id. */
  protections: Record<string, string[]>;
  /** Councilors gone to ground until the next council phase: they can't be spotted or targeted. */
  hidden: string[];
  /** Surveil Location until the next council phase: surveilling faction ids by region id. */
  surveillance: Record<string, string[]>;
  /** Councilors each faction aimed a mission at since the last council phase; their intel doesn't fade. */
  recentTargets: Record<string, string[]>;
  /** Advise until the next council phase, by nation id, in the order the advisors arrived. */
  advisors: Record<string, { councilorId: string; administration: number; command: number }[]>;
  climate: ClimateState;
  /**
   * Climate events waiting on a player faction's answer, oldest first: the clock waits until
   * each is answered with the chooseClimateOption command (climate.ts).
   */
  climateChoices: ClimateChoice[];
  /** The latest nuclear strikes, oldest first (at most STRIKE_LIMIT), for the globe's missiles. */
  strikes: NuclearStrike[];
  log: LogEntry[];
}

/** A climate event a player faction must answer (Terra Invicta's narrative events). */
export interface ClimateChoice {
  id: string;
  event: ClimateChoiceEvent;
  factionId: string;
  /** The nation and region struck; null for Global Crop Failures, which strikes everyone. */
  nationId: string | null;
  regionId: string | null;
}

export type ClimateChoiceEvent = "degradation" | "wetBulb" | "cropFailures";

/** A nuclear strike (military.ts), launched from the launcher's capital. */
export interface NuclearStrike {
  id: string;
  dayIndex: number;
  minuteOfDay: number;
  launcherId: string;
  factionId: string;
  fromRegionId: string;
  regionId: string;
}

export const STRIKE_LIMIT = 20;

/** Atmospheric concentrations, in ppm. */
export interface Gases {
  co2: number;
  ch4: number;
  n2o: number;
  /** Excess stratospheric aerosols. */
  aerosols: number;
}

/** Earth's climate (climate.ts). */
export interface ClimateState extends Gases {
  /** Global sea level anomaly, in cm. It never falls. */
  seaLevel: number;
  /** Names of the ice shelves and sheets that have melted (rules.climate.melts). */
  melted: string[];
  /** The atmosphere at the start of each of the last 12 months, oldest first. */
  history: Gases[];
  /** Month index (see monthIndex) when each climate event last happened. */
  lastEvent: Record<string, number>;
  /** Month index when a climate event last struck a region, by "event:region id" (regional cooldowns). */
  regionEvents: Record<string, number>;
}

/** A player's Set National Policy waiting for its policy. */
export interface PolicyChoice {
  factionId: string;
  nationId: string;
  councilorId: string;
}

/** A councilor's mission (councilor.mission) set to resolve at a given minute (see time.ts). */
export interface ScheduledMission {
  factionId: string;
  councilorId: string;
  at: number;
}

export const LOG_LIMIT = 300;
