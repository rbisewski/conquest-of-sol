// The base game's content, loaded from the JSON files next to this module.
// Mods will layer on top of this in the mod loader (SPEC 2.18).

import { validateContent, type Content, type Rules } from "../sim/content";
import armyNames from "./armyNames.json";
import claims from "./claims.json";
import climate from "./climate.json";
import factions from "./factions.json";
import names from "./names.json";
import nations from "./nations.json";
import orgs from "./orgs.json";
import priorities from "./priorities.json";
import projects from "./projects.json";
import professions from "./professions.json";
import regions from "./regions.json";
import relations from "./relations.json";
import rules from "./rules.json";
import techs from "./techs.json";
import traits from "./traits.json";

export const baseContent: Content = validateContent({
  factions,
  professions: professions as unknown as Content["professions"],
  priorities,
  nations,
  regions,
  names: names as unknown as Content["names"],
  relations: relations as unknown as Content["relations"],
  traits: traits as unknown as Content["traits"],
  orgs: orgs as unknown as Content["orgs"],
  techs: techs as unknown as Content["techs"],
  projects: projects as unknown as Content["projects"],
  claims,
  climate: climate as unknown as Content["climate"],
  armyNames: armyNames as Record<string, string[]>,
  rules: rules as unknown as Rules,
} as Content);
