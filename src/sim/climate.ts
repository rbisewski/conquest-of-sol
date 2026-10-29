// Climate change after Terra Invicta (SPEC 2.6.5). Greenhouse gases above their baselines warm
// the Earth and stratospheric aerosols cool it; the sum is the Global Temperature Anomaly. Each
// month nations emit in proportion to their Pollution Multiplier, the atmosphere sheds a little,
// the sea rises, ice shelves may collapse, and every nation loses GDP (more where inequality is
// high and people live in ecologically vulnerable regions). The Spoils priority pollutes; the
// Environment priority cuts the Pollution Multiplier and, at 10 Sustainability, cleans the air.
// Some climate events (Environmental Degradation, Wet Bulb Disaster, Global Crop Failures) ask
// the faction running the struck nation what to do; a player's answer stops the clock.

import { dateOfDay } from "./calendar";
import type { ClimateCost, ClimateEventId, Content, GasId } from "./content";
import type { Check } from "./diplomacy";
import { detPow } from "./detmath";
import { priorityFlows } from "./economy";
import { addLog, factionDef, factionState, nationDef, nationState, newId } from "./lookup";
import { applyPropaganda } from "./missions";
import { gdpPerCapita } from "./nation";
import { nextFloat } from "./rng";
import type { ClimateChoice, ClimateChoiceEvent, ClimateState, FactionState, GameState, Gases, NationState, Resources } from "./state";
import { isExtant, populationShare, regionDef, regionOwner } from "./territory";

export const GASES: GasId[] = ["co2", "ch4", "n2o"];

/**
 * The campaign's starting climate. Ice that would already have melted at the starting anomaly
 * (Larsen A and B, for real, in 1995 and 2002) starts gone, its rise already in the sea level.
 */
export function newClimate(content: Content): ClimateState {
  const s = content.rules.climate.start;
  const gases = { co2: s.co2, ch4: s.ch4, n2o: s.n2o, aerosols: s.aerosols };
  const c = temperatureAnomaly(content, gases);
  const melted = content.rules.climate.melts.filter((m) => m.degrees <= c).map((m) => m.name);
  return { ...gases, seaLevel: s.seaLevel, melted, history: [], lastEvent: {}, regionEvents: {} };
}

/** Months since the campaign start (30-day months; only used for event cooldowns). */
export function monthIndex(state: GameState): number {
  return Math.floor(state.dayIndex / 30);
}

/** Each gas's (and the aerosols') contribution to the anomaly, in °C. */
export function temperatureParts(content: Content, gases: Gases): Record<GasId | "aerosols", number> {
  const r = content.rules.climate;
  const out = {} as Record<GasId | "aerosols", number>;
  for (const g of GASES) out[g] = Math.max(0, (gases[g] - r.gases[g].baseline) / r.gases[g].ppmPerDegree);
  out.aerosols = Math.max(r.aerosols.minDegrees, Math.min(0, -gases.aerosols / r.aerosols.ppmPerDegree));
  return out;
}

/** The Global Temperature Anomaly, in °C. */
export function temperatureAnomaly(content: Content, gases: Gases): number {
  const p = temperatureParts(content, gases);
  return p.co2 + p.ch4 + p.n2o + p.aerosols;
}

/** Sustainability: the inverse of the Pollution Multiplier, 10 at a multiplier of 0. */
export function sustainability(nation: NationState): number {
  return nation.pollution <= 0 ? 10 : Math.min(9.99, 1 / nation.pollution);
}

/** The lowest Pollution Multiplier Environment investment can reach: 0.3325, less what techs take off. */
export function pollutionFloor(state: GameState, content: Content): number {
  const p = content.rules.climate.pollution;
  let floor = p.floor;
  for (const [tech, cut] of Object.entries(p.floorTechs)) if (state.research.completed.includes(tech)) floor -= cut;
  return Math.max(0, floor);
}

/** A nation's ecological exposure from the regions it holds, weighted by their populations. */
export interface Vulnerability {
  /** Terra Invicta's ecological vulnerability multiplier, 0–2: protected regions count 0, vulnerable 2. */
  economy: number;
  /** The same for population losses, where protection only halves the harm. */
  people: number;
  /** Oil and mining resource regions held. */
  oil: number;
  mining: number;
}

/** Every nation's ecological exposure (or just `only`'s), from who holds each region now. */
export function vulnerabilities(state: GameState, content: Content, only?: string): Map<string, Vulnerability> {
  const sums = new Map<string, { pop: number; economy: number; people: number; oil: number; mining: number }>();
  for (const region of content.regions) {
    const owner = state.regionOwners[region.id] ?? region.nationId;
    if (only !== undefined && owner !== only) continue;
    const t = content.climate.regions[region.id] ?? {};
    const pop = Math.max(region.population, 0.001);
    const v = t.vulnerable ?? 0;
    const p = t.protected ?? 0;
    const s = sums.get(owner) ?? { pop: 0, economy: 0, people: 0, oil: 0, mining: 0 };
    s.pop += pop;
    s.economy += pop * (1 - p + v);
    s.people += pop * (1 - p / 2 + v);
    s.oil += t.oil ?? 0;
    s.mining += t.mining ?? 0;
    sums.set(owner, s);
  }
  const out = new Map<string, Vulnerability>();
  for (const [id, s] of sums) out.set(id, { economy: s.economy / s.pop, people: s.people / s.pop, oil: s.oil, mining: s.mining });
  return out;
}

/**
 * Terra Invicta's expected yearly GDP loss (a fraction) at an anomaly of `c` °C, before the
 * nation's vulnerability: quadratic in the warming, steeper with inequality and, past
 * max(5.25, 10.25 − Inequality) °C, steeper still; cooling costs 4% a degree, more below −7 °C.
 */
export function annualGdpDamage(content: Content, c: number, inequality: number): number {
  const d = content.rules.climate.damage;
  let damage = 0;
  if (c > d.threshold) {
    const w = c - d.threshold;
    damage = (d.square * w * w + d.linear * w) * detPow(d.inequalityBase, inequality);
    if (c >= Math.max(d.extremeStartMin, d.extremeStart - inequality)) damage *= Math.min((w + inequality) / 10, d.extremeCap);
  } else if (c < 0) {
    damage = d.cold * -c;
    if (c < d.colderAt) damage += d.cold * (-c + d.colderAt);
    if (c < d.coldestAt) damage += d.coldest * (-c + d.coldestAt);
  }
  return Math.min(d.cap, damage);
}

/** A nation's yearly GDP loss to climate change now, its vulnerability included. */
export function nationGdpDamage(content: Content, c: number, nation: NationState, v: Vulnerability | undefined): number {
  return Math.min(content.rules.climate.damage.cap, annualGdpDamage(content, c, nation.inequality) * (v?.economy ?? 1));
}

/** Terra Invicta's yearly emissions bracket (tonnes of CO2) for a Pollution Multiplier of 1. */
export function emissionsBracket(content: Content, nation: NationState, oilRegions: number): number {
  const e = content.rules.climate.emissions;
  const people = nation.population * 1e6;
  const gdppc = people > 0 ? (nation.gdp * 1e9) / people : 0;
  const wealth = Math.min(1, gdppc / e.gdppcFull) ** 2 * Math.min(1, gdppc / e.gdppcFullSquared) ** 2;
  return nation.gdp * e.perGdpBillion + people * e.perPerson * wealth + Math.min(oilRegions * e.perOilRegion, nation.gdp * e.oilCapPerGdpBillion);
}

/** A nation's yearly emissions in tonnes of CO2 (its bracket times its Pollution Multiplier). */
export function nationEmissions(content: Content, nation: NationState, v: Vulnerability | undefined): number {
  return nation.pollution * emissionsBracket(content, nation, v?.oil ?? 0);
}

/** (Population / 50M)^0.35: how much slower a nation's Pollution Multiplier moves than a 50M nation's. */
function populationFactor(content: Content, nation: NationState): number {
  const p = content.rules.populationScaling;
  return detPow(Math.max(nation.population, 0.001) / p.referenceMillions, p.exponent);
}

/** A Spoils completion: more pollution and greenhouse gases, more so with oil and mining regions. */
export function spoilsPollution(state: GameState, content: Content, nation: NationState, v: Vulnerability | undefined): void {
  const r = content.rules.climate;
  const p = r.pollution;
  const resources = (v?.oil ?? 0) + (v?.mining ?? 0);
  const scale = populationFactor(content, nation);
  const emitted = (nation.pollution * detPow(Math.max(nation.gdp, 0), 0.35) * (1 + p.spoilsResourceBonus * resources)) / scale / p.spoilsDivisor;
  for (const g of GASES) state.climate[g] += emitted * r.gases[g].spoils;
  nation.pollution = Math.min(p.max, nation.pollution + (p.spoilsGain + p.spoilsGainPerResource * resources) / scale);
}

/**
 * An Environment completion cuts the Pollution Multiplier (more slowly above 2 and below 0.5,
 * never below the tech floor); at 10 Sustainability it takes greenhouse gases out of the air.
 */
export function environmentCleanup(state: GameState, content: Content, nation: NationState): void {
  const r = content.rules.climate;
  const p = r.pollution;
  const scale = populationFactor(content, nation);
  if (nation.pollution <= 0) {
    for (const g of GASES) state.climate[g] = Math.max(0, state.climate[g] + (scale / p.environmentDivisor) * r.gases[g].environment);
    return;
  }
  let cut = p.environmentCut / scale;
  if (nation.pollution > 2) cut *= nation.pollution / 2;
  if (nation.pollution < 0.5) cut *= Math.max(0.25, nation.pollution / 0.5);
  nation.pollution = Math.max(Math.min(nation.pollution, pollutionFloor(state, content)), nation.pollution - cut);
}

/** A nuclear strike: smoke and dust in the stratosphere. */
export function nuclearStrikeAerosols(state: GameState, content: Content): void {
  state.climate.aerosols += content.rules.military.nukes.aerosols;
}

/** A nuclear weapon built: a little more aerosol in the stratosphere. */
export function nuclearTestAerosols(state: GameState, content: Content): void {
  state.climate.aerosols += content.rules.climate.aerosols.perNuclearWeapon;
}

const EVENT_TEXT: Record<ClimateEventId, string> = {
  methane: "Arctic methane eruption: permafrost and seabed clathrates release methane into the atmosphere.",
  volcano: "A volcanic eruption throws ash and smoke into the stratosphere, cooling the Earth a little.",
  majorVolcano: "A major volcanic eruption fills the stratosphere with ash, cooling the Earth.",
  colossalVolcano: "A colossal volcanic eruption darkens the skies worldwide.",
};

/**
 * The monthly climate step (1st of the month): emissions, natural removal, aerosol decay, sea
 * level, melting ice, climate events, then the damage to every nation.
 */
export function runClimateMonth(state: GameState, content: Content): void {
  const r = content.rules.climate;
  const climate = state.climate;
  climate.history = [...climate.history, { co2: climate.co2, ch4: climate.ch4, n2o: climate.n2o, aerosols: climate.aerosols }].slice(-12);

  const exposure = vulnerabilities(state, content);
  const nations = state.nations.filter(isExtant);
  let tonnes = 0;
  for (const nation of nations) tonnes += nationEmissions(content, nation, exposure.get(nation.id));
  for (const g of GASES) {
    const gas = r.gases[g];
    climate[g] = Math.max(0, climate[g] + (tonnes / 12) * gas.ppmPerTonne - climate[g] / gas.removalDivisor);
  }
  climate.aerosols = Math.max(climate.aerosols * r.aerosols.decay - r.aerosols.decayFlat, 0);

  const c = temperatureAnomaly(content, climate);
  if (c > 0) climate.seaLevel += r.seaLevel.perDegreeMonth * c;
  for (const melt of r.melts) {
    if (c < melt.degrees || climate.melted.includes(melt.name)) continue;
    climate.melted.push(melt.name);
    climate.seaLevel += melt.cm;
    addLog(state, { kind: "climate", tone: "bad", text: `The ${melt.name} has collapsed${melt.cm > 0 ? `: the sea will rise ${melt.cm} cm` : ""}.` });
  }
  climateEvents(state, content, c);
  climateChoiceEvents(state, content, c);

  const d = r.damage;
  for (const nation of nations) {
    const v = exposure.get(nation.id);
    const annual = nationGdpDamage(content, c, nation, v);
    if (annual > 0) {
      const monthly = 1 - detPow(1 - annual, 1 / 12);
      nation.gdp *= 1 - monthly;
      nation.inequality = Math.min(10, nation.inequality + monthly * d.inequalityShare);
    }
    if (climate.co2 > d.co2EducationAt && nation.education > d.co2EducationMinEducation) {
      nation.education -= Math.min((climate.co2 - d.co2EducationAt) * d.co2EducationPerPpm, d.co2EducationMax);
    }
    if (Math.abs(c) > d.populationAt) nation.population *= 1 - (d.populationPerDegree * (Math.abs(c) - d.populationAt) * (v?.people ?? 1)) / 12;
  }
}

/** Arctic methane eruptions while it is warm, and volcanic eruptions at random, each with a cooldown. */
function climateEvents(state: GameState, content: Content, c: number): void {
  const month = monthIndex(state);
  const climate = state.climate;
  for (const [id, e] of Object.entries(content.rules.climate.events) as [ClimateEventId, (typeof content.rules.climate.events)[ClimateEventId]][]) {
    if (e.degrees !== undefined && c < e.degrees) continue;
    const last = climate.lastEvent[id];
    if (last !== undefined && month - last < e.cooldownMonths) continue;
    if (nextFloat(state.rng) >= e.chancePerMonth) continue;
    climate.lastEvent[id] = month;
    const amount = (range: [number, number]) => range[0] + (range[1] - range[0]) * nextFloat(state.rng);
    if (e.ch4) climate.ch4 += amount(e.ch4);
    if (e.aerosols) climate.aerosols += amount(e.aerosols);
    addLog(state, { kind: "climate", tone: e.ch4 ? "bad" : undefined, text: EVENT_TEXT[id] });
  }
}

/** For the UI: how the nation's climate stands. */
export function nationClimate(state: GameState, content: Content, nation: NationState): { sustainability: number; emissions: number; gdpDamage: number; vulnerability: Vulnerability } {
  const v = vulnerabilities(state, content, nation.id).get(nation.id) ?? { economy: 1, people: 1, oil: 0, mining: 0 };
  const c = temperatureAnomaly(content, state.climate);
  return { sustainability: sustainability(nation), emissions: nationEmissions(content, nation, v), gdpDamage: nationGdpDamage(content, c, nation, v), vulnerability: v };
}

// ---------------------------------------------------------------------------
// Climate events with a choice

/** The answers each event offers, in Terra Invicta's order. */
export type ClimateOption = "ignore" | "subsidize" | "recruit" | "loot" | "assist";

export const CLIMATE_OPTIONS: Record<ClimateChoiceEvent, ClimateOption[]> = {
  degradation: ["ignore", "subsidize", "recruit", "loot"],
  wetBulb: ["ignore", "assist"],
  cropFailures: ["ignore"],
};

/** An answer's bill (negative amounts are income) and whether the faction may give it. */
export interface ClimateOptionState {
  option: ClimateOption;
  cost: Partial<Pick<Resources, "money" | "influence" | "ops">>;
  check: Check;
}

/** Whether the climate is waiting on a player's answer (the clock stops until it comes). */
export function awaitingClimateChoice(state: GameState): boolean {
  return state.climateChoices.length > 0;
}

/** People in the struck region now, in millions: its share of the nation's population. */
function regionMillions(state: GameState, content: Content, regionId: string): number {
  return nationState(state, regionOwner(state, regionId)).population * populationShare(state, content, regionId);
}

function billOf(cost: ClimateCost, millions: number): ClimateOptionState["cost"] {
  const round = (n: number) => (n >= 0 ? Math.ceil(n) : -Math.floor(-n));
  const out: ClimateOptionState["cost"] = {};
  const money = (cost.money ?? 0) + (cost.moneyPerMillion ?? 0) * millions;
  const influence = (cost.influence ?? 0) + (cost.influencePerMillion ?? 0) * millions;
  if (money !== 0) out.money = round(money);
  if (influence !== 0) out.influence = round(influence);
  if (cost.ops) out.ops = cost.ops;
  return out;
}

/** The answers a faction can give to a climate event, with their bills. */
export function climateOptions(state: GameState, content: Content, factionId: string, choice: Pick<ClimateChoice, "event" | "regionId">): ClimateOptionState[] {
  const r = content.rules.climate.choices;
  const faction = factionState(state, factionId);
  const millions = choice.regionId ? regionMillions(state, content, choice.regionId) : 0;
  return CLIMATE_OPTIONS[choice.event].map((option) => {
    let cost: ClimateOptionState["cost"] = {};
    let check: Check = { ok: true };
    if (choice.event === "degradation" && option !== "ignore") {
      cost = billOf(r.degradation[option as "subsidize" | "recruit" | "loot"].cost, millions);
      if (option === "recruit" && !r.extremists.includes(factionId)) check = { ok: false, reason: "Only extremist factions recruit among the dispossessed" };
      if (option === "loot" && !r.exploiters.includes(factionId)) check = { ok: false, reason: "Only a faction out for profit loots the region" };
    } else if (choice.event === "wetBulb" && option === "assist") cost = billOf(r.wetBulb.assist.cost, millions);
    if (check.ok) {
      for (const [resource, amount] of Object.entries(cost) as [keyof typeof cost, number][]) {
        if (amount > 0 && faction.resources[resource] < amount) check = { ok: false, reason: `Needs ${amount} ${resource}` };
      }
    }
    return { option, cost, check };
  });
}

/** Terra Invicta's "PopScaled" effects: (Population / 50M)^0.35 slower in bigger nations. */
function popScaled(content: Content, nation: NationState, amount: number): number {
  return amount / populationFactor(content, nation);
}

/** Terra Invicta's wealth mitigation: richer nations lose fewer people. */
function wealthMitigated(content: Content, nation: NationState, share: number): number {
  return share / (1 + (gdpPerCapita(nation) * 1000) / content.rules.climate.choices.wealthMitigationGdppc);
}

/** The region loses `share` of its GDP (its population share stands in for its GDP share), and inequality rises with it. */
function recession(state: GameState, content: Content, nation: NationState, regionId: string, share: number): void {
  const lost = share * populationShare(state, content, regionId);
  nation.gdp *= 1 - lost;
  nation.inequality = Math.min(10, nation.inequality + lost * content.rules.climate.damage.inequalityShare);
}

/** Applies an answer to a climate event (or its outcome when nobody answers: `factionId` null). */
function applyClimateOption(state: GameState, content: Content, factionId: string | null, choice: Pick<ClimateChoice, "event" | "nationId" | "regionId">, option: ClimateOption): void {
  const r = content.rules.climate.choices;
  if (factionId) {
    const bill = climateOptions(state, content, factionId, choice).find((o) => o.option === option)!.cost;
    const resources = factionState(state, factionId).resources;
    for (const [resource, amount] of Object.entries(bill) as [keyof typeof bill, number][]) resources[resource] -= amount;
  }
  if (choice.event === "cropFailures") return;
  const nation = nationState(state, choice.nationId!);
  const regionId = choice.regionId!;
  const region = regionDef(content, regionId);
  const propaganda = (strength: number) => factionId && applyPropaganda(content, nation, factionId, strength);
  const who = factionId ? factionDef(content, factionId).name : null;
  const name = nationDef(content, nation.id).name;
  let text = "";
  if (choice.event === "wetBulb") {
    const effect = option === "assist" ? r.wetBulb.assist.population : r.wetBulb.population;
    nation.population *= 1 - wealthMitigated(content, nation, effect) * populationShare(state, content, regionId);
    if (option === "assist") propaganda(r.wetBulb.assist.propaganda);
    text = option === "assist" ? `${who} distributed air conditioners and other assistance during a deadly heat wave in ${region.name}, ${name}.` : `A deadly wet-bulb heat wave is killing people in ${region.name}, ${name}.`;
  } else {
    const d = r.degradation;
    switch (option) {
      case "subsidize":
        recession(state, content, nation, regionId, d.subsidize.recession);
        propaganda(d.subsidize.propaganda);
        text = `${who} funded subsidies to offset climate effects in ${region.name}, ${name}.`;
        break;
      case "recruit":
        recession(state, content, nation, regionId, d.recruit.recession);
        nation.cohesion = Math.min(10, nation.cohesion + popScaled(content, nation, d.recruit.cohesion));
        propaganda(d.recruit.propaganda);
        text = `${who} recruited disaffected locals suffering from climate effects in ${region.name}, ${name}.`;
        break;
      case "loot":
        recession(state, content, nation, regionId, d.loot.recession);
        nation.unrest = Math.min(10, nation.unrest + d.loot.unrest);
        nation.education = Math.max(1, nation.education + popScaled(content, nation, d.loot.education));
        nation.inequality = Math.min(10, nation.inequality + popScaled(content, nation, d.loot.inequality));
        text = `${who} looted assets from the decaying economy of ${region.name}, ${name}, accelerating its decline.`;
        break;
      default:
        recession(state, content, nation, regionId, d.ignore.recession);
        nation.unrest = Math.min(10, nation.unrest + d.ignore.unrest);
        propaganda(d.ignore.propaganda);
        text = `Environmental degradation is hampering the economy of ${region.name}, ${name}.`;
    }
  }
  addLog(state, { kind: "climate", nationId: nation.id, factionId: factionId ?? undefined, tone: factionId && option !== "ignore" && option !== "loot" ? "good" : "bad", text });
}

/**
 * How an AI faction answers, after Terra Invicta's AI preferences: extremists recruit and the
 * profit-minded loot when they can; others pay to help when they can afford a quarter of
 * their money for it, and otherwise leave the region to cope.
 */
export function aiClimateOption(state: GameState, content: Content, factionId: string, choice: Pick<ClimateChoice, "event" | "regionId">): ClimateOption {
  const options = climateOptions(state, content, factionId, choice).filter((o) => o.check.ok);
  const has = (option: ClimateOption) => options.find((o) => o.option === option);
  if (has("recruit")) return "recruit";
  if (has("loot")) return "loot";
  const money = factionState(state, factionId).resources.money;
  const help = has("subsidize") ?? has("assist");
  if (help && (help.cost.money ?? 0) <= money / 4) return help.option;
  return "ignore";
}

/** Settles a player's answer to a climate event. */
export function settleClimateChoice(state: GameState, content: Content, factionId: string, choiceId: string, option: ClimateOption): Check {
  const index = state.climateChoices.findIndex((c) => c.id === choiceId && c.factionId === factionId);
  if (index < 0) return { ok: false, reason: "No such climate event awaits our answer" };
  const choice = state.climateChoices[index]!;
  const found = climateOptions(state, content, factionId, choice).find((o) => o.option === option);
  if (!found) return { ok: false, reason: `"${option}" is not an answer to this event` };
  if (!found.check.ok) return found.check;
  state.climateChoices.splice(index, 1);
  applyClimateOption(state, content, factionId, choice, option);
  return { ok: true };
}

/** Puts a struck region's event to the faction running its nation: a player answers, the AI answers at once. */
function strikeRegion(state: GameState, content: Content, event: "degradation" | "wetBulb", regionId: string): void {
  const nationId = regionOwner(state, regionId);
  const factionId = nationState(state, nationId).controlPoints[0]?.owner ?? null;
  const choice = { event, nationId, regionId };
  const faction: FactionState | null = factionId ? factionState(state, factionId) : null;
  if (faction?.isPlayer) state.climateChoices.push({ id: newId(state, "cc"), factionId: faction.id, ...choice });
  else applyClimateOption(state, content, factionId, choice, factionId ? aiClimateOption(state, content, factionId, choice) : "ignore");
}

/** A weighted draw: null when every weight is 0. */
function weightedPick<T>(state: GameState, items: { item: T; weight: number }[]): T | null {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  if (total <= 0) return null;
  let roll = nextFloat(state.rng) * total;
  for (const i of items) {
    roll -= i.weight;
    if (roll < 0) return i.item;
  }
  return items[items.length - 1]!.item;
}

/** Environmental Degradation and Wet Bulb Disasters while it is hot, Global Crop Failures when it is very cold. */
function climateChoiceEvents(state: GameState, content: Content, c: number): void {
  const r = content.rules.climate.choices;
  const climate = state.climate;
  const month = monthIndex(state);
  const ready = (event: ClimateChoiceEvent, cooldown: number) => climate.lastEvent[event] === undefined || month - climate.lastEvent[event]! >= cooldown;
  const regionReady = (event: ClimateChoiceEvent, regionId: string, cooldown: number) => {
    const last = climate.regionEvents[`${event}:${regionId}`];
    return last === undefined || month - last >= cooldown;
  };
  const struck = (event: ClimateChoiceEvent, regionId?: string) => {
    climate.lastEvent[event] = month;
    if (regionId) climate.regionEvents = { ...climate.regionEvents, [`${event}:${regionId}`]: month };
  };

  const d = r.degradation;
  const chance = state.research.completed.includes(d.mitigationTech) ? d.mitigatedChancePerMonth : d.chancePerMonth;
  if (Math.abs(c) > d.degrees && ready("degradation", d.cooldownMonths) && nextFloat(state.rng) < chance) {
    const lowWelfare = new Map<string, boolean>();
    const candidates = content.regions.flatMap((region) => {
      const traits = content.climate.regions[region.id] ?? {};
      if ((traits.protected ?? 0) >= d.protectedAt || !regionReady("degradation", region.id, d.regionCooldownMonths)) return [];
      const owner = regionOwner(state, region.id);
      if (!lowWelfare.has(owner)) {
        const flows = priorityFlows(state, content, nationState(state, owner));
        const total = Object.values(flows).reduce((sum, f) => sum + f, 0);
        lowWelfare.set(owner, total <= 0 || (flows["welfare"] ?? 0) / total < d.lowWelfareShare);
      }
      const weight = ((traits.vulnerable ?? 0) >= 0.5 ? d.vulnerableWeight : 1) * (lowWelfare.get(owner) ? d.lowWelfareWeight : 1);
      return [{ item: region.id, weight }];
    });
    const regionId = weightedPick(state, candidates);
    if (regionId) {
      struck("degradation", regionId);
      strikeRegion(state, content, "degradation", regionId);
    }
  }

  const w = r.wetBulb;
  const calendarMonth = dateOfDay(content.rules.startYear, state.dayIndex).month;
  if (c > w.degrees && calendarMonth >= w.months[0] && calendarMonth <= w.months[1] && ready("wetBulb", w.cooldownMonths) && nextFloat(state.rng) < w.chancePerMonth) {
    const candidates = content.regions.filter((region) => content.climate.regions[region.id]?.wetBulb && regionReady("wetBulb", region.id, w.regionCooldownMonths));
    const regionId = weightedPick(state, candidates.map((region) => ({ item: region.id, weight: 1 })));
    if (regionId) {
      struck("wetBulb", regionId);
      strikeRegion(state, content, "wetBulb", regionId);
    }
  }

  const f = r.cropFailures;
  if (c < f.degrees && ready("cropFailures", f.cooldownMonths)) {
    struck("cropFailures");
    for (const nation of state.nations.filter(isExtant)) {
      nation.gdp *= 1 - f.gdp;
      nation.cohesion = Math.max(0, nation.cohesion - f.cohesion);
      nation.population *= 1 - wealthMitigated(content, nation, f.population);
    }
    addLog(state, { kind: "climate", tone: "bad", text: "Global crop failures: famine grips every nation and logistics networks are breaking down." });
    for (const faction of state.factions) if (faction.isPlayer) state.climateChoices.push({ id: newId(state, "cc"), event: "cropFailures", factionId: faction.id, nationId: null, regionId: null });
  }
}
