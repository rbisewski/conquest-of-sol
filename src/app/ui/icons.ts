// Glyphs used across the UI (Lucide, ISC licence), named by meaning so components don't
// depend on the icon set. Colours for resources follow Terra Invicta's top bar.

import Anchor from "@lucide/svelte/icons/anchor";
import Archive from "@lucide/svelte/icons/archive";
import Atom from "@lucide/svelte/icons/atom";
import Bomb from "@lucide/svelte/icons/bomb";
import Cpu from "@lucide/svelte/icons/cpu";
import Dna from "@lucide/svelte/icons/dna";
import Gem from "@lucide/svelte/icons/gem";
import Library from "@lucide/svelte/icons/library";
import Microscope from "@lucide/svelte/icons/microscope";
import Telescope from "@lucide/svelte/icons/telescope";
import Banknote from "@lucide/svelte/icons/banknote";
import BookOpen from "@lucide/svelte/icons/book-open";
import ChartLine from "@lucide/svelte/icons/chart-line";
import Check from "@lucide/svelte/icons/check";
import Coins from "@lucide/svelte/icons/coins";
import Crosshair from "@lucide/svelte/icons/crosshair";
import Crown from "@lucide/svelte/icons/crown";
import Ellipsis from "@lucide/svelte/icons/ellipsis";
import Droplets from "@lucide/svelte/icons/droplets";
import Eye from "@lucide/svelte/icons/eye";
import EyeOff from "@lucide/svelte/icons/eye-off";
import FastForward from "@lucide/svelte/icons/fast-forward";
import Flag from "@lucide/svelte/icons/flag";
import Flame from "@lucide/svelte/icons/flame";
import HandFist from "@lucide/svelte/icons/hand-fist";
import FlaskConical from "@lucide/svelte/icons/flask-conical";
import Gavel from "@lucide/svelte/icons/gavel";
import Globe from "@lucide/svelte/icons/globe";
import HandCoins from "@lucide/svelte/icons/hand-coins";
import HandHelping from "@lucide/svelte/icons/hand-helping";
import Handshake from "@lucide/svelte/icons/handshake";
import Heart from "@lucide/svelte/icons/heart";
import HeartHandshake from "@lucide/svelte/icons/heart-handshake";
import Hourglass from "@lucide/svelte/icons/hourglass";
import House from "@lucide/svelte/icons/house";
import Landmark from "@lucide/svelte/icons/landmark";
import Link from "@lucide/svelte/icons/link";
import MapIcon from "@lucide/svelte/icons/map";
import Megaphone from "@lucide/svelte/icons/megaphone";
import Orbit from "@lucide/svelte/icons/orbit";
import Pause from "@lucide/svelte/icons/pause";
import Plane from "@lucide/svelte/icons/plane";
import Play from "@lucide/svelte/icons/play";
import Radar from "@lucide/svelte/icons/radar";
import Radiation from "@lucide/svelte/icons/radiation";
import Rewind from "@lucide/svelte/icons/rewind";
import Rocket from "@lucide/svelte/icons/rocket";
import Route from "@lucide/svelte/icons/route";
import Satellite from "@lucide/svelte/icons/satellite";
import SatelliteDish from "@lucide/svelte/icons/satellite-dish";
import Scale from "@lucide/svelte/icons/scale";
import Search from "@lucide/svelte/icons/search";
import Shield from "@lucide/svelte/icons/shield";
import ShieldAlert from "@lucide/svelte/icons/shield-alert";
import ShieldCheck from "@lucide/svelte/icons/shield-check";
import Skull from "@lucide/svelte/icons/skull";
import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
import Sparkles from "@lucide/svelte/icons/sparkles";
import Star from "@lucide/svelte/icons/star";
import Bird from "@lucide/svelte/icons/bird";
import Building from "@lucide/svelte/icons/building";
import Swords from "@lucide/svelte/icons/swords";
import Thermometer from "@lucide/svelte/icons/thermometer";
import Waves from "@lucide/svelte/icons/waves";
import Leaf from "@lucide/svelte/icons/leaf";
import Factory from "@lucide/svelte/icons/factory";
import Fuel from "@lucide/svelte/icons/fuel";
import Pickaxe from "@lucide/svelte/icons/pickaxe";
import Target from "@lucide/svelte/icons/target";
import User from "@lucide/svelte/icons/user";
import UserPlus from "@lucide/svelte/icons/user-plus";
import UserSearch from "@lucide/svelte/icons/user-search";
import Users from "@lucide/svelte/icons/users";
import X from "@lucide/svelte/icons/x";
import Zap from "@lucide/svelte/icons/zap";
import ZapOff from "@lucide/svelte/icons/zap-off";
import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
import Maximize from "@lucide/svelte/icons/maximize";
import ChevronLeft from "@lucide/svelte/icons/chevron-left";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";
import AntimatterIcon from "./AntimatterIcon.svelte";
import CrewIcon from "./CrewIcon.svelte";
import ExoticsIcon from "./ExoticsIcon.svelte";
import FissilesIcon from "./FissilesIcon.svelte";
import LaunchComplexIcon from "./LaunchComplexIcon.svelte";
import MetalsIcon from "./MetalsIcon.svelte";
import NobleMetalsIcon from "./NobleMetalsIcon.svelte";
import ProbeIcon from "./ProbeIcon.svelte";
import PowerIcon from "./PowerIcon.svelte";
import TankIcon from "./TankIcon.svelte";
import VolatilesIcon from "./VolatilesIcon.svelte";
import type { Component } from "svelte";
import type { Attribute, LogKind, MissionType, ResearchCategory } from "../../sim/index";

export const icons = {
  money: Banknote,
  influence: Sparkles,
  ops: Swords,
  boost: Rocket,
  missionControl: SatelliteDish,
  research: FlaskConical,
  water: Droplets,
  volatiles: VolatilesIcon,
  metals: MetalsIcon,
  nobleMetals: NobleMetalsIcon,
  fissiles: FissilesIcon,
  antimatter: AntimatterIcon,
  exotics: ExoticsIcon,
  probe: ProbeIcon,
  power: PowerIcon,
  crew: CrewIcon,
  powerOff: ZapOff,
  warning: TriangleAlert,
  expand: Maximize,
  previous: ChevronLeft,
  next: ChevronRight,
  interface: ArrowUpDown,
  radiation: Radiation,
  investment: Coins,
  corruption: HandCoins,
  democracy: Landmark,
  unrest: Flame,
  gdp: ChartLine,
  miltech: Star,
  army: TankIcon,
  navy: Anchor,
  spacecraft: Satellite,
  habitat: Building,
  nuke: Radiation,
  space: Orbit,
  archive: Archive,
  launchComplex: LaunchComplexIcon,
  population: Users,
  person: User,
  recruit: UserPlus,
  intel: Eye,
  education: BookOpen,
  inequality: Scale,
  cohesion: Link,
  executive: Crown,
  defended: ShieldCheck,
  crackdown: Zap,
  pending: Hourglass,
  done: Check,
  close: X,
  search: Search,
  menu: Ellipsis,
  filter: SlidersHorizontal,
  play: Play,
  pause: Pause,
  faster: FastForward,
  slower: Rewind,
  globe: Globe,
  nation: Flag,
  regions: MapIcon,
  hostile: HandFist,
  opinion: Megaphone,
  war: Swords,
  peace: Bird,
  climate: Thermometer,
  seaLevel: Waves,
  sustainability: Leaf,
  emissions: Factory,
  oil: Fuel,
  mining: Pickaxe,
  alliance: Handshake,
  leader: Star,
  rival: ShieldAlert,
  policy: Gavel,
  move: Route,
  airlift: Plane,
  home: House,
} satisfies Record<string, Component>;

export type IconName = keyof typeof icons;

/** Terra Invicta-like resource colours. */
export const resourceColor: Partial<Record<IconName, string>> = {
  money: "#7ad35f",
  influence: "#ff7a52",
  ops: "#e3b765",
  boost: "#f2f5f8",
  missionControl: "#ffb347",
  research: "#8fe0e6",
  water: "#3fa3e0",
  volatiles: "#e2552e",
  metals: "#a4eef2",
  nobleMetals: "#f5ea8c",
  fissiles: "#58c046",
  antimatter: "#f2f5f8",
  exotics: "#b585ec",
  power: "#ffd34d",
  crew: "#c8d2dc",
};

/** One glyph per field of research, used on its techs and projects. */
export const researchCategoryIcons: Record<ResearchCategory, Component> = {
  energy: Atom,
  information: Cpu,
  life: Dna,
  materials: Gem,
  military: Bomb,
  social: Library,
  space: Telescope,
  xenology: Microscope,
};

/** Glyphs for event-feed entries that aren't mission reports. */
export const logIcons: Record<LogKind, Component> = {
  mission: Flag,
  intel: Eye,
  council: Users,
  research: FlaskConical,
  war: Swords,
  nation: Landmark,
  diplomacy: Handshake,
  territory: MapIcon,
  climate: Thermometer,
  space: ProbeIcon,
};

export const missionIcons: Record<MissionType, Component> = {
  controlNation: Flag,
  defendInterests: ShieldCheck,
  crackdown: Zap,
  purge: Skull,
  coup: Crosshair,
  setPolicy: Gavel,
  publicCampaign: Megaphone,
  investigateCouncilor: UserSearch,
  assassinate: Target,
  protectTarget: Shield,
  inspire: HeartHandshake,
  stabilizeNation: Scale,
  advise: HandHelping,
  surveilLocation: Radar,
  goToGround: EyeOff,
  increaseUnrest: Flame,
};

/** Attribute glyph colours, after Terra Invicta's councilor panel. */
export const attributeColor: Record<Attribute, string> = {
  persuasion: "#ff8a4c",
  investigation: "#6fb6e8",
  espionage: "#9aa6b2",
  command: "#e9bd4c",
  administration: "#cfd9e2",
  science: "#b47cf0",
  security: "#5f8fe8",
  loyalty: "#ef4b3f",
};

export const attributeIcons: Record<Attribute, Component> = {
  persuasion: Megaphone,
  investigation: Search,
  espionage: Eye,
  command: Star,
  administration: Landmark,
  science: FlaskConical,
  security: Shield,
  loyalty: Heart,
};
