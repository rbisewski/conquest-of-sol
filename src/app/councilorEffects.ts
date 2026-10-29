// Plain-language effects of traits and orgs, shared by the Councilor Summary and Recruiting screens.

import { ATTRIBUTES, INCOME_KEYS, MISSION_NAMES, type Attribute, type CouncilorIncome, type MissionType } from "../sim/index";

export interface Effect {
  text: string;
  good: boolean;
}

export const INCOME_LABELS: Record<keyof CouncilorIncome, string> = { money: "Money", influence: "Influence", ops: "Ops", boost: "Boost", research: "Research" };

export const titleCase = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** Plain-language effects of a trait or org, for tooltips and cards. */
export function effects(def: { attributes?: Partial<Record<Attribute, number>>; income?: CouncilorIncome; grants?: MissionType[]; prohibits?: MissionType[]; augmentCost?: number }): Effect[] {
  const out: Effect[] = [];
  for (const attr of ATTRIBUTES) {
    const v = def.attributes?.[attr];
    if (v) out.push({ text: `${v > 0 ? "+" : ""}${v} ${titleCase(attr)}`, good: v > 0 });
  }
  for (const key of INCOME_KEYS) {
    const v = def.income?.[key];
    if (v) out.push({ text: `${v > 0 ? "+" : ""}${v} ${INCOME_LABELS[key]} a month`, good: v > 0 });
  }
  for (const m of def.grants ?? []) out.push({ text: `Grants ${MISSION_NAMES[m]}`, good: true });
  for (const m of def.prohibits ?? []) out.push({ text: `Can't run ${MISSION_NAMES[m]}`, good: false });
  if (def.augmentCost) out.push({ text: `Augmenting costs ${Math.abs(def.augmentCost * 100)}% ${def.augmentCost < 0 ? "less" : "more"} XP`, good: def.augmentCost < 0 });
  return out;
}
