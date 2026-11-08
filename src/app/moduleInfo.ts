// Hab modules and habs in words, for the hab panel and its details screen: a module's hover card
// (ModuleTooltip) after Terra Invicta's (tier, crew and mass, monthly incomes and bonuses, support
// costs, crew support, description; in a hab, a mine's yield and power follow its site and body),
// how a slot's module is coming on, and a hab's grade and place.

import { baseContent } from "../content/index";
import {
  dateOfDay,
  EARTH_ORBIT_PRIORITIES,
  formatLongDate,
  habBodyId,
  habModuleDef,
  habTier,
  isBuilt,
  mineRate,
  moduleScale,
  spaceBody,
  type GameState,
  type HabModuleDef,
  type HabModuleState,
  type HabState,
  type ModuleStatus,
} from "../sim/index";
import type { IconName } from "./ui/icons";

const onDay = (day: number) => formatLongDate(dateOfDay(baseContent.rules.startYear, day));

/** How the module in a slot is coming on, or whether it works. */
export function slotProgress(state: GameState, m: HabModuleState, status: ModuleStatus | null): string {
  if (m.upgrade) {
    const to = habModuleDef(baseContent, m.upgrade.moduleId).name;
    return m.upgrade.arrivesDay > state.dayIndex ? `Upgrade to ${to} on its way, arriving ${onDay(m.upgrade.arrivesDay)}` : `Upgrading to ${to}, done ${onDay(m.upgrade.doneDay)}`;
  }
  if (isBuilt(state, m)) return status === "off" ? "Switched off" : status === "unpowered" ? "Idle: not enough power" : "Working";
  if (m.arrivesDay > state.dayIndex) return `On its way from the Earth, arriving ${onDay(m.arrivesDay)}`;
  return `Being built, done ${onDay(m.doneDay)}`;
}

/** "Outpost (tier 1/max 3)": the hab's kind by its core, its tier and the most its body allows. */
export function habGrade(hab: HabState): string {
  const core = habModuleDef(baseContent, hab.modules[0]!.moduleId).name.replace(/^Automated /, "").replace(/ Core$/, "");
  return `${core} (tier ${habTier(baseContent, hab)}/max ${spaceBody(baseContent, habBodyId(baseContent, hab)).maxHabTier ?? 3})`;
}

/** Where the hab is: its site and body, or its orbit. */
export function habPlace(hab: HabState): string {
  const body = spaceBody(baseContent, habBodyId(baseContent, hab));
  if (hab.siteId) return `${baseContent.habSites.find((s) => s.id === hab.siteId)!.name}, ${body.name}`;
  return baseContent.orbits.find((o) => o.id === hab.orbitId)!.name;
}

export type Amount = [IconName, number];

export interface ModuleFacts {
  name: string;
  tier: number;
  crew: number;
  massTons: number;
  buildDays: number;
  /** Power, mission control, money, research… it makes a month. */
  incomes: Amount[];
  /** What else it does, in words. */
  bonuses: string[];
  /** What it costs a month to run, power and mission control included. */
  support: Amount[];
  /** Its crew's life support a month. */
  crewSupport: Amount[];
  summary: string;
}

const nonzero = (list: Amount[]) => list.filter(([, v]) => Math.abs(v) > 1e-9);

/** The module's facts; in a hab (`hab`), with its mine's yield there and its power scaled by the body. */
export function moduleFacts(state: GameState | null, m: HabModuleDef, hab: HabState | null = null): ModuleFacts {
  const scale = hab && m.scalesWithMining ? moduleScale(baseContent, hab, m) : 1;
  const incomes: Amount[] = [];
  const support: Amount[] = [];
  if (m.power > 0) incomes.push(["power", m.power]);
  if ((m.missionControl ?? 0) > 0) incomes.push(["missionControl", m.missionControl!]);
  for (const [r, v] of Object.entries(m.income)) incomes.push([r as IconName, v]);
  if (m.mine && state && hab?.siteId) for (const [r, v] of Object.entries(mineRate(state, baseContent, hab.factionId, hab.siteId, m))) incomes.push([r as IconName, v]);
  if (m.power < 0) support.push(["power", -m.power * scale]);
  if ((m.missionControl ?? 0) < 0) support.push(["missionControl", -m.missionControl!]);
  for (const [r, v] of Object.entries(m.support)) support.push([r as IconName, v]);

  const life = baseContent.rules.space.lifeSupport;
  const crewSupport: Amount[] = [
    ["money", m.rules?.includes("Stability") ? 0 : (m.crew * life.money) / 12],
    ["water", (m.crew * life.water) / 12],
    ["volatiles", (m.crew * life.volatiles) / 12],
  ];

  const bonuses: string[] = [];
  if (m.mineOutput) bonuses.push(`Mines ${m.mineOutput} × its site's resources a month; its cost and power go with the body's mining modifier`);
  if (m.rules?.includes("Solar_Power_Variable_Output")) bonuses.push("Power in full sunlight at the Earth's distance: more nearer the Sun, less farther out");
  for (const [field, v] of Object.entries(m.researchBonuses ?? {})) bonuses.push(`+${+(v * 100).toFixed(1)}% to our ${field} research (less above 50% in all)`);
  if (m.projectSlots) bonuses.push(`${m.projectSlots} project income: opens our third project slot; more speeds projects`);
  for (const rule of m.rules ?? []) {
    const priority = EARTH_ORBIT_PRIORITIES[rule];
    if (priority) bonuses.push(`In low Earth orbit: +${Math.round((m.ruleValue ?? 0) * 100)}% to our CPs' ${baseContent.priorities.find((p) => p.id === priority)!.name} priority (at most +30%)`);
  }
  if (m.rules?.includes("LEOBonusPropagandaStrength")) bonuses.push(`In low Earth orbit: +${m.ruleValue} strength to our public campaigns (at most +9)`);
  if (m.rules?.includes("LEOBonusHumanDetection")) bonuses.push(`In low Earth orbit: +${m.tier} to spotting enemy councilors on Earth (at most +9)`);
  if (m.rules?.includes("LEOBonusArmyCombatValue")) bonuses.push(`In low Earth orbit: +${m.ruleValue} Miltech to the armies we command (at most +0.3)`);
  if (m.controlPointCapacity) bonuses.push(`In low Earth orbit: +${m.controlPointCapacity} control point capacity`);
  if (m.rules?.includes("Efficiency")) bonuses.push(`+${Math.round((m.ruleValue ?? 0) * 100)}% to everything this hab makes`);
  if (m.constructionTime) bonuses.push(`Builds this hab's modules in ${Math.round(m.constructionTime * 100)}% of the time`);
  if (m.rules?.includes("SolarMirror")) bonuses.push(`+${m.ruleValue} power × tier to our solar modules on the body below; costs more the farther from the Sun`);
  if (m.rules?.includes("HarvestHelium3")) bonuses.push("Our helium-3 fusion modules take water instead of fissiles");
  if (m.rules?.includes("UsesHelium3")) bonuses.push("Takes water instead of fissiles while we harvest helium-3");
  if (m.rules?.includes("HarvestAntimatter")) bonuses.push(`Harvests ${Math.round((m.ruleValue ?? 0) * 100)}% of the orbit's natural antimatter`);
  if (m.rules?.includes("Stability")) bonuses.push("Its crew cost no money");
  if (m.rules?.includes("Farm")) bonuses.push(`Feeds ${m.ruleValue} crew: no water or volatiles for them`);
  if (m.rules?.includes("PowerFirst")) bonuses.push("Takes power first, and can't be switched off");
  if (m.rules?.includes("EarthLEOOnly")) bonuses.push("Only in low Earth orbit");
  if (m.rules?.includes("NotInIrradiated")) bonuses.push("Not where there is radiation");
  if (m.onePerHab) bonuses.push("One per hab");

  return { name: m.name, tier: m.tier, crew: m.crew, massTons: m.massTons, buildDays: m.buildDays, incomes: nonzero(incomes), bonuses, support: nonzero(support), crewSupport: nonzero(crewSupport), summary: m.summary };
}
