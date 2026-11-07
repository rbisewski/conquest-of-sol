// Display names for the space resources, shared by the top bar and the hab site lists.

import type { SpaceResource } from "../../sim/index";

export const SPACE_RESOURCE_NAMES: Record<SpaceResource, string> = {
  water: "Water",
  volatiles: "Volatiles",
  metals: "Base Metals",
  nobleMetals: "Noble Metals",
  fissiles: "Fissiles",
  antimatter: "Antimatter",
  exotics: "Exotics",
};
