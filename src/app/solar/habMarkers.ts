// Habs in the Solar System view (SPEC 2.10.1, 2.10.2; decision D18). Every faction's bases and
// stations (Terra Invicta shows them all) are small pixel-art sprites in their faction's colour,
// by kind and tier, dimmed while the core is on its way or being built: a station on its orbit
// round its body, going round at the circular speed for the body's mass from a phase hashed from
// the hab's id, or at its Lagrange point; a base at its site's latitude and longitude, turned with
// the body. A hab shows where it is once that is far enough from its body's disc on screen to tell
// them apart, as a moon does (a base once its body is drawn at its true size, and only on the side
// facing the camera; a station not while behind the disc); till then the habs of a body, and of
// its moons not drawn, are fanned in a crown over its disc. The focused body's system shows its
// Lagrange points that have station orbits as small diamonds, faint unless a hab is there, which
// then sits over its diamond. The player's probes and deliveries in flight (theirs only: they are
// private) are dashed arcs in the faction's colour from the Earth at launch to where they arrive,
// each with a marker where it is now. Hovering any of them names it; clicking a hab, or a
// delivery, picks the hab. None show while the globe has the camera.
//
// Approximations (display only): orbits' inclinations and nodes are taken against the ecliptic,
// the Earth's against its equator (they are the real satellites', the ISS's and Tiangong's); a
// station at a Lagrange point sits on the point (its halo orbit too small to show); L1 and L2 lie
// a Hill radius from the body, L3 opposite it round the parent, L4 and L5 60° ahead and behind on
// its orbit. A transfer is the ellipse with the Sun (the Earth, within its system) at a focus
// through both ends, prograde, leaving at periapsis (apoapsis going inwards), or where no such
// ellipse exists a spiral easing between them; its marker keeps Kepler's second law along it. A
// delivery leaves when its hab was founded (the core), else its arrival less the Hohmann transfer
// time (later than it really left if it went outside a window). Within the Earth's system an arc
// runs from low Earth orbit, and shows only once it is wide enough on screen.

import * as THREE from "three";
import {
  dateOfDay,
  factionDef,
  formatLongDate,
  habDestination,
  habModuleDef,
  habTier,
  orbitPosition,
  orbitRadius,
  transferTo,
  yearsSinceJ2000,
  type Content,
  type GameState,
  type HabOrbitDef,
  type HabSiteDef,
  type HabState,
  type SpaceBodyDef,
  type Vec3,
} from "../../sim/index";
import { corePalette, type HabKind } from "../ui/habArt";
import { drawSprite, SITE_MARKER, SITE_PALETTES, type Palette } from "../ui/pixelArt";
import { EARTH_POLE } from "./earthFrame";

const G = 6.674e-11;
const AU_KM = 149597870.7;
const YEAR_S = 31557600;
const TWO_PI = 2 * Math.PI;
/** Art pixels across an atlas cell: the largest sprite. */
const CELL = 11;
/** A station shows on its orbit once that spans this many CSS pixels (as a moon does), and is clear of its body's disc. */
const HAB_MIN_PIXELS = 16;
/** A base shows on its site once its body is drawn at its true size and at least this radius, CSS pixels. */
const BASE_MIN_PIXELS = 24;
/** Gap between sprites fanned round a disc, CSS pixels. */
const FAN_GAP = 2;
/** Sprites fan over a disc up to this angle either side of straight up, clear of its name below; then a ring further out. */
const FAN_REACH = (100 * Math.PI) / 180;
/** A hab whose core isn't built yet: its brightness and opacity. */
const DIM_SHADE = 0.5;
const DIM_ALPHA = 0.85;
/** A Lagrange point with no hab: its opacity. */
const LPOINT_FAINT = 0.45;
const ARC_SEGMENTS = 256;
/** Dashes along an arc, whatever its length, and its opacity. */
const ARC_DASHES = 60;
const ARC_OPACITY = 0.7;

/**
 * Reduced looks of CORE_SPRITES (habArt.ts), small enough to sit beside a body's disc: the same
 * palette keys, the faction's colour ("f", "F") on the modules, a station's ring or a base's
 * band, so it reads at a glance. Platform, orbital, ring; outpost, settlement, colony.
 */
const HAB_SPRITES: Record<HabKind, [string[], string[], string[]]> = {
  station: [
    ["kkk.....kkk", "kSk.kkk.kSk", "kskkfffkksk", "k33kfwFk33k", "kSkkfFFkkSk", "ksk.kkk.ksk", "kkk.....kkk"],
    ["....kkk....", "kkk.kfk.kkk", "kSk.kfk.kSk", "ksk.kFk.ksk", "kSkkfffkkSk", "k333fwF333k", "kSkkfFFkkSk", "ksk.kFk.ksk", "kSk.kfk.kSk", "kkk.kFk.kkk", "....krk...."],
    ["...kkkkk...", ".kkfffffkk.", "kffkk2kkFFk", "kfk.k2k.kFk", "kf2221w33Fk", "kFk.k3k.kFk", "kFFkk4kkFFk", ".kkFFFFFkk.", "...kkkkk..."],
  ],
  base: [
    ["..k........", ".krk..kkk..", ".k4fk.k1wk.", ".k4Fkkf1fFk", ".k4kkkfffFk", "keeeeeeeeek", "kggegggggGk", ".kkGGGGGkk."],
    ["...........", "..kkk......", ".kdDdk.kkk.", "kdDdddkdDdk", "kdddddkdddk", "kfFfFfffFfk", "keeeeeeeeek", ".kkgggggkk."],
    ["....krk....", "....kfk....", "..kkdddkk..", ".kdDdddddk.", "kdDdw2wdddk", "kDdd232dddk", "kfFfFfFfFfk", "keeeeeeeeek", ".kkgggggkk."],
  ],
};
/** A delivery on its way: a cargo pod in the faction's colour, its thrusters lit. */
const POD = ["..kkk..", ".k122k.", ".kfffk.", ".k2w3k.", ".kFFFk.", "kk3k3kk", ".r...r."];
/** A prospecting probe in flight: PROBE (pixelArt.ts) cut down, its dish up. */
const PROBE_SMALL = [".aaaa..", "abbbba.", ".aaaa..", "...a...", "..aca.a", ".a.a.a.", "a.....a"];
/** The sprites in each faction's run of atlas cells: the hab looks, then the pod and the probe. */
const FACTION_SPRITES = [...HAB_SPRITES.station, ...HAB_SPRITES.base, POD, PROBE_SMALL];
const POD_CELL = 6;
const PROBE_CELL = 7;

/**
 * The hab palette at this size: the solar cells and dome glass toned down, so the faction's colour
 * is the only strong one (CORE_COLORS' blue cells would pass for the Aegis Coalition's).
 */
function habPalette(color: string): Palette {
  const palette = corePalette(color);
  return { ...palette, s: "#283241", S: "#56657a", d: "#7fa6b8", D: "#e3f3f8", a: color, b: palette.F!, c: "#ffd37a" };
}

const vertexShader = /* glsl */ `
  uniform float pixel;
  uniform vec2 resolution;
  attribute float cell;
  attribute float alpha;
  attribute float shade;
  varying float vCell;
  varying float vAlpha;
  varying float vShade;

  void main() {
    if (alpha <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    vCell = cell;
    vAlpha = alpha;
    vShade = shade;
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // On whole device pixels, so each art pixel covers whole pixels.
    float size = ${CELL.toFixed(1)} * pixel;
    vec2 p = (clip.xy / clip.w * 0.5 + 0.5) * resolution;
    p = mod(size, 2.0) > 0.5 ? floor(p) + 0.5 : floor(p + 0.5);
    clip.xy = (p / resolution * 2.0 - 1.0) * clip.w;
    gl_Position = clip;
    gl_PointSize = size;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D atlas;
  uniform float cells;
  varying float vCell;
  varying float vAlpha;
  varying float vShade;

  void main() {
    vec2 px = floor(gl_PointCoord * ${CELL.toFixed(1)});
    vec4 texel = texture2D(atlas, (vec2(vCell * ${CELL.toFixed(1)}, 0.0) + px + 0.5) / vec2(cells * ${CELL.toFixed(1)}, ${CELL.toFixed(1)}));
    if (texel.a < 0.5) discard;
    gl_FragColor = vec4(texel.rgb * vShade, vAlpha);
  }
`;

/** Ecliptic coordinates (z north) to the scene's (y up), as SolarSystem.ts's. */
const toScene = (p: Vec3, out = new THREE.Vector3()) => out.set(p.x, p.z, -p.y);
const toEcliptic = (v: THREE.Vector3): Vec3 => ({ x: v.x, y: -v.z, z: v.y });

/** The ecliptic's axes in the scene (x to the vernal equinox, z north), and the Earth's equator's. */
const ECLIPTIC: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)];
const EQUATOR: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(1, 0, 0), EARTH_POLE.clone().cross(new THREE.Vector3(1, 0, 0)).normalize(), EARTH_POLE.clone()];

/** A string's FNV-1a hash as a fraction, 0–1. */
function hashFraction(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0) / 4294967296;
}

/** Where things are: each frame's from the view, or a time's for an arc's ends. */
type PositionOf = (id: string) => THREE.Vector3;

/** What a station needs to be placed. */
interface Placement {
  orbit: HabOrbitDef;
  /** Its phase on its orbit, radians, and its motion, radians a year; both 0 at a Lagrange point. */
  phase: number;
  motion: number;
  /** Its distance from its body's centre, AU; 0 at a Lagrange point. */
  radius: number;
}

interface HabMark {
  hab: HabState;
  kind: HabKind;
  cell: number;
  half: [number, number];
  dim: boolean;
  /** The body it is on or round (for a Lagrange point's orbit, the smaller of the pair). */
  body: string;
  site: HabSiteDef | null;
  place: Placement | null;
  text: string;
}

interface ArcMark {
  line: THREE.Line;
  /** The arc's way, relative to the body at its focus (the Sun, or the Earth within its system). */
  path: TransferPath;
  /** The Earth for an arc within its system, else null (the Sun, at the scene's origin). */
  centre: string | null;
  launch: number;
  arrive: number;
  cell: number;
  habId: string | null;
  text: string;
  /** Its span from its centre, AU, which must show wide enough on screen (within the Earth's system). */
  span: number;
}

interface LMark {
  orbit: HabOrbitDef;
  occupied: boolean;
  text: string;
}

/** A sprite set's per-point attributes (see the shaders). */
interface PointAttributes {
  position: THREE.BufferAttribute;
  cell: THREE.BufferAttribute;
  alpha: THREE.BufferAttribute;
  shade: THREE.BufferAttribute;
}

/** Something drawn that can be hovered or clicked: its screen position and half size, CSS pixels. */
interface Pickable {
  x: number;
  y: number;
  half: [number, number];
  habId: string | null;
  /** A Lagrange point's station orbit. */
  orbitId?: string;
  text: string;
}

export interface MarkerFrame {
  camera: THREE.PerspectiveCamera;
  width: number;
  height: number;
  pixelRatio: number;
  years: number;
  positions: Map<string, THREE.Vector3>;
  focusId: string;
  /** Whether to draw at all: not while this view follows the globe, whose canvas is on top. */
  shown: boolean;
  /** Whether the Hide Objects setting shows only the focused body: its habs stay. */
  backgroundHidden: boolean;
  /** A body's disc as drawn now, its radius on screen and its true radius there, CSS pixels; null when it isn't drawn. */
  disc(id: string): { drawn: number; true: number } | null;
  /** A body's own frame (columns: longitude 0°, the north pole, longitude 90° west) in the scene; null if it has none. */
  frame(id: string): THREE.Matrix4 | null;
}

/** The pickable under a screen point. */
export interface MarkerPick {
  habId: string | null;
  orbitId?: string;
  text: string;
}

/** A transfer's way: points evenly in angle round its focus, and the share of its time taken to reach each. */
interface TransferPath {
  points: THREE.Vector3[];
  times: number[];
}

/**
 * A transfer from a to b (ecliptic, round a body at the origin), going prograde. Its time runs
 * with r² dθ (Kepler's second law), so it is quick near the focus and slow far out.
 */
function transferPath(a: Vec3, b: Vec3, segments: number): TransferPath {
  const r1 = Math.hypot(a.x, a.y);
  const r2 = Math.hypot(b.x, b.y);
  const t1 = Math.atan2(a.y, a.x);
  let delta = Math.atan2(b.y, b.x) - t1;
  delta -= TWO_PI * Math.floor(delta / TWO_PI);
  // r = p / (1 + out·e·cos φ), φ from the start, which is periapsis going out and apoapsis going in.
  const out = r2 >= r1 ? 1 : -1;
  const e = (r1 - r2) / (out * (r2 * Math.cos(delta) - r1));
  const conic = Number.isFinite(e) && e >= 0 && e < 1;
  const p = r1 * (1 + out * e);
  const radius = (s: number) => (conic ? p / (1 + out * e * Math.cos(delta * s)) : r1 + (r2 - r1) * s * s * (3 - 2 * s));
  const points: THREE.Vector3[] = [];
  const times = [0];
  for (let k = 0; k <= segments; k++) {
    const s = k / segments;
    const r = radius(s);
    const t = t1 + delta * s;
    points.push(toScene({ x: r * Math.cos(t), y: r * Math.sin(t), z: a.z + (b.z - a.z) * s }));
    if (k > 0) times.push(times[k - 1]! + radius(s - 0.5 / segments) ** 2);
  }
  return { points, times: times.map((t) => t / times[segments]!) };
}

/** Where along a transfer it is a share of its time in. */
function along(path: TransferPath, s: number, out: THREE.Vector3): THREE.Vector3 {
  const { points, times } = path;
  let k = 0;
  while (k < times.length - 2 && times[k + 1]! < s) k++;
  return out.lerpVectors(points[k]!, points[k + 1]!, THREE.MathUtils.clamp((s - times[k]!) / (times[k + 1]! - times[k]!), 0, 1));
}

export class HabMarkers {
  private readonly bodies = new Map<string, SpaceBodyDef>();
  /** Each body's orbit's normal in the scene, for its L4 and L5. */
  private readonly normals = new Map<string, THREE.Vector3>();
  private readonly atlas: THREE.CanvasTexture;
  private readonly material: THREE.ShaderMaterial;
  private readonly factionCell = new Map<string, number>();
  private readonly lCells: { faint: number; occupied: number };
  private habs: HabMark[] = [];
  private arcs: ArcMark[] = [];
  private lpoints: LMark[] = [];
  private habPoints: THREE.Points | null = null;
  private arcPoints: THREE.Points | null = null;
  private lPoints: THREE.Points | null = null;
  /** What the habs, probes and deliveries were last built from, and the focus the Lagrange points were. */
  private signature = "";
  private lFocus = "";
  private picks: { habs: Pickable[]; arcs: Pickable[]; lpoints: Pickable[] } = { habs: [], arcs: [], lpoints: [] };
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly content: Content,
    /** CSS pixels per art pixel, as the bodies'. */
    private readonly pixel: number,
    /** Device pixels per art pixel. */
    devicePixel: number,
  ) {
    for (const b of content.solarSystem) {
      this.bodies.set(b.id, b);
      if (!b.orbit) continue;
      const i = THREE.MathUtils.degToRad(b.orbit.i);
      const node = THREE.MathUtils.degToRad(b.orbit.node);
      this.normals.set(b.id, toScene({ x: Math.sin(i) * Math.sin(node), y: -Math.sin(i) * Math.cos(node), z: Math.cos(i) }));
    }
    const cells = content.factions.length * FACTION_SPRITES.length + 2;
    const canvas = document.createElement("canvas");
    canvas.width = cells * CELL;
    canvas.height = CELL;
    const ctx = canvas.getContext("2d")!;
    content.factions.forEach((f, fi) => {
      const first = fi * FACTION_SPRITES.length;
      this.factionCell.set(f.id, first);
      const palette = habPalette(f.color);
      FACTION_SPRITES.forEach((rows, k) => drawSprite(ctx, rows, palette, (first + k + 0.5) * CELL, CELL / 2));
    });
    this.lCells = { faint: cells - 2, occupied: cells - 1 };
    drawSprite(ctx, SITE_MARKER, SITE_PALETTES.unknown, (cells - 1.5) * CELL, CELL / 2);
    drawSprite(ctx, SITE_MARKER, SITE_PALETTES.prospected, (cells - 0.5) * CELL, CELL / 2);
    this.atlas = new THREE.CanvasTexture(canvas);
    this.atlas.magFilter = THREE.NearestFilter;
    this.atlas.minFilter = THREE.NearestFilter;
    this.atlas.generateMipmaps = false;
    this.atlas.flipY = false;
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        atlas: { value: this.atlas },
        cells: { value: cells },
        pixel: { value: devicePixel },
        resolution: { value: new THREE.Vector2(1, 1) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
  }

  private body(id: string): SpaceBodyDef {
    return this.bodies.get(id)!;
  }

  /** Takes the game's state; rebuilds the sprites and arcs only when the habs, probes or deliveries have changed. */
  setState(state: GameState | null, playerFactionId: string | null): void {
    const day = state?.dayIndex ?? 0;
    const habs = state?.habs ?? [];
    const player = state?.factions.find((f) => f.id === playerFactionId) ?? null;
    const arrivals = player ? this.arrivals(habs.filter((h) => h.factionId === player.id), day) : [];
    const signature = JSON.stringify([
      habs.map((h) => [h.id, h.factionId, h.name, h.siteId, h.orbitId, h.modules[0]!.moduleId, h.modules[0]!.doneDay > day]),
      player?.probes.map((p) => [p.bodyId, p.launchedDay, p.arrivesDay]) ?? [],
      arrivals.map((a) => [a.hab.id, a.day, a.launch]),
      playerFactionId,
    ]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.clear();
    this.habs = habs.map((h) => this.habMark(h, day));
    this.habPoints = this.makePoints(this.habs.length, 7);
    if (player) {
      const color = factionDef(this.content, player.id).color;
      const first = this.factionCell.get(player.id)!;
      for (const probe of player.probes) {
        this.arcs.push(this.arcMark(probe.bodyId, null, probe.launchedDay, probe.arrivesDay, color, first + PROBE_CELL, null, `Probe to ${this.body(probe.bodyId).name}`));
      }
      for (const a of arrivals) {
        const mark = this.habs.find((m) => m.hab.id === a.hab.id)!;
        this.arcs.push(this.arcMark(mark.body, mark.place, a.launch, a.day, color, first + POD_CELL, a.hab.id, `${a.modules.join(", ")} for ${a.hab.name}`));
      }
    }
    this.arcPoints = this.makePoints(this.arcs.length, 6.5);
    this.lFocus = "";
  }

  /** The player's deliveries still on their way, one per hab and arrival day, and when each left (see the header). */
  private arrivals(habs: HabState[], day: number): { hab: HabState; day: number; launch: number; modules: string[] }[] {
    const out: { hab: HabState; day: number; launch: number; modules: string[] }[] = [];
    for (const hab of habs) {
      const byDay = new Map<number, { launch: number; modules: string[] }>();
      let hohmann: number | null = null;
      const add = (moduleId: string, arrives: number, core: boolean) => {
        if (arrives <= day) return;
        let launch: number;
        if (core) launch = hab.foundedDay;
        else {
          hohmann ??= Math.round(transferTo(this.content, habDestination(hab), 0).transferYears * 365.25);
          launch = Math.max(hab.foundedDay, arrives - hohmann);
        }
        launch = Math.min(launch, day, arrives - 1);
        const entry = byDay.get(arrives) ?? { launch, modules: [] };
        entry.launch = Math.min(entry.launch, launch);
        entry.modules.push(habModuleDef(this.content, moduleId).name);
        byDay.set(arrives, entry);
      };
      hab.modules.forEach((slot, i) => {
        if (!slot) return;
        add(slot.moduleId, slot.arrivesDay, i === 0);
        if (slot.upgrade) add(slot.upgrade.moduleId, slot.upgrade.arrivesDay, false);
      });
      for (const [arrives, entry] of byDay) out.push({ hab, day: arrives, ...entry });
    }
    return out;
  }

  private habMark(hab: HabState, day: number): HabMark {
    const core = hab.modules[0]!;
    const kind: HabKind = hab.siteId ? "base" : "station";
    const tier = habTier(this.content, hab);
    const rows = HAB_SPRITES[kind][tier - 1]!;
    const faction = factionDef(this.content, hab.factionId);
    const site = hab.siteId ? this.content.habSites.find((s) => s.id === hab.siteId)! : null;
    const orbit = hab.orbitId ? this.content.orbits.find((o) => o.id === hab.orbitId)! : null;
    const body = site?.body ?? orbit!.body;
    const state = core.arrivesDay > day ? " · core on its way" : core.doneDay > day ? " · being built" : "";
    let place: Placement | null = null;
    if (orbit?.lagrange) place = { orbit, phase: 0, motion: 0, radius: 0 };
    else if (orbit) {
      const r = orbitRadius(this.content, orbit);
      place = { orbit, phase: hashFraction(hab.id) * TWO_PI, motion: Math.sqrt((G * this.body(body).massKg) / (r * r * r)) * YEAR_S, radius: r / (AU_KM * 1000) };
    }
    return {
      hab,
      kind,
      cell: this.factionCell.get(hab.factionId)! + (kind === "station" ? 0 : 3) + tier - 1,
      half: [(rows[0]!.length * this.pixel) / 2, (rows.length * this.pixel) / 2],
      dim: core.doneDay > day,
      body,
      site,
      place,
      text: `${hab.name} · ${faction.name}${state}`,
    };
  }

  /** A body's position relative to the Sun at a time, ecliptic AU. */
  private heliocentric(id: string, years: number): Vec3 {
    const at = { x: 0, y: 0, z: 0 };
    let body = this.body(id);
    while (body.parent) {
      const parent = this.body(body.parent);
      const p = orbitPosition(body.orbit!, parent.massKg, body.massKg, years);
      at.x += p.x;
      at.y += p.y;
      at.z += p.z;
      body = parent;
    }
    return at;
  }

  /** A Lagrange point of a body and its parent, in the scene. */
  private lagrange(point: number, bodyId: string, positionOf: PositionOf, out: THREE.Vector3): THREE.Vector3 {
    const body = this.body(bodyId);
    const at = positionOf(bodyId);
    const parent = positionOf(body.parent!);
    const d = this.w.copy(at).sub(parent);
    if (point === 1 || point === 2) {
      const hill = Math.cbrt(body.massKg / (3 * this.body(body.parent!).massKg));
      return out.copy(at).addScaledVector(d, (point === 1 ? -1 : 1) * hill);
    }
    if (point === 3) return out.copy(parent).sub(d);
    return out.copy(parent).add(d.applyAxisAngle(this.normals.get(bodyId)!, ((point === 4 ? 1 : -1) * Math.PI) / 3));
  }

  /** Where a station is at a time, in the scene. */
  private stationAt(place: Placement, years: number, positionOf: PositionOf, out: THREE.Vector3): THREE.Vector3 {
    const { orbit } = place;
    if (orbit.lagrange) return this.lagrange(orbit.lagrange, orbit.body, positionOf, out);
    const [x, y, z] = orbit.body === "Earth" ? EQUATOR : ECLIPTIC;
    const u = place.phase + place.motion * years;
    const i = THREE.MathUtils.degToRad(orbit.inclinationDeg);
    const node = THREE.MathUtils.degToRad(orbit.nodeDeg);
    const [cu, su, ci, si, cn, sn] = [Math.cos(u), Math.sin(u), Math.cos(i), Math.sin(i), Math.cos(node), Math.sin(node)];
    const r = place.radius;
    return out
      .copy(positionOf(orbit.body))
      .addScaledVector(x, r * (cn * cu - sn * su * ci))
      .addScaledVector(y, r * (sn * cu + cn * su * ci))
      .addScaledVector(z, r * su * si);
  }

  /** The body round the Sun a body is, or is in the system of. */
  private rootOf(id: string): string {
    let body = this.body(id);
    while (body.parent && body.parent !== "Sol") body = this.body(body.parent);
    return body.id;
  }

  /** A transfer's arc from the Earth at launch to where it arrives (a station's place then, or the body's centre). */
  private arcMark(bodyId: string, place: Placement | null, launchDay: number, arriveDay: number, color: string, cell: number, habId: string | null, text: string): ArcMark {
    const start = this.content.rules.startYear;
    const launch = yearsSinceJ2000(start, launchDay, 0);
    const arrive = yearsSinceJ2000(start, arriveDay, 0);
    const local = this.rootOf(bodyId) === "Earth";
    const then = new Map<string, THREE.Vector3>();
    const positionOf: PositionOf = (id) => {
      let p = then.get(id);
      if (!p) then.set(id, (p = toScene(this.heliocentric(id, arrive))));
      return p;
    };
    const end = place ? this.stationAt(place, arrive, positionOf, new THREE.Vector3()) : positionOf(bodyId).clone();
    let path: TransferPath;
    if (local) {
      // From low Earth orbit opposite where it arrives, round the Earth.
      const to = toEcliptic(end.sub(positionOf("Earth")));
      const leo = this.content.orbits.find((o) => o.earthLeo && o.altitudeKm !== undefined)!;
      const r = (this.body("Earth").radiusKm + leo.altitudeKm!) / AU_KM;
      const t = Math.atan2(to.y, to.x) + Math.PI;
      path = transferPath({ x: r * Math.cos(t), y: r * Math.sin(t), z: 0 }, to, ARC_SEGMENTS);
    } else path = transferPath(this.heliocentric("Earth", launch), toEcliptic(end), ARC_SEGMENTS);
    let length = 0;
    for (let k = 1; k < path.points.length; k++) length += path.points[k]!.distanceTo(path.points[k - 1]!);
    const dash = length / ARC_DASHES;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(path.points),
      new THREE.LineDashedMaterial({ color, dashSize: dash * 0.6, gapSize: dash * 0.4, transparent: true, opacity: ARC_OPACITY, depthTest: false, depthWrite: false }),
    );
    line.computeLineDistances();
    line.renderOrder = 2;
    line.frustumCulled = false;
    this.scene.add(line);
    const span = Math.max(...path.points.map((p) => p.length()));
    text += ` · arrives ${formatLongDate(dateOfDay(start, arriveDay))}`;
    return { line, path, centre: local ? "Earth" : null, launch, arrive, cell, habId, text, span };
  }

  private makePoints(count: number, renderOrder: number): THREE.Points | null {
    if (count === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute("cell", new THREE.Float32BufferAttribute(new Float32Array(count), 1));
    geometry.setAttribute("alpha", new THREE.Float32BufferAttribute(new Float32Array(count), 1));
    geometry.setAttribute("shade", new THREE.Float32BufferAttribute(new Float32Array(count).fill(1), 1));
    const points = new THREE.Points(geometry, this.material);
    points.renderOrder = renderOrder;
    points.frustumCulled = false;
    this.scene.add(points);
    return points;
  }

  private dropPoints(points: THREE.Points | null): null {
    if (points) {
      this.scene.remove(points);
      points.geometry.dispose();
    }
    return null;
  }

  private clear(): void {
    this.habPoints = this.dropPoints(this.habPoints);
    this.arcPoints = this.dropPoints(this.arcPoints);
    for (const arc of this.arcs) {
      this.scene.remove(arc.line);
      arc.line.geometry.dispose();
      (arc.line.material as THREE.Material).dispose();
    }
    this.habs = [];
    this.arcs = [];
  }

  /** The Lagrange points with station orbits of the focused body and its parent, and of its moons with it. */
  private focusLagrange(focusId: string): void {
    this.lFocus = focusId;
    this.lPoints = this.dropPoints(this.lPoints);
    const orbits = this.content.orbits.filter((o) => o.lagrange && (o.body === focusId || this.body(o.body).parent === focusId) && focusId !== "Sol");
    this.lpoints = orbits.map((orbit) => {
      const there = this.habs.filter((m) => m.hab.orbitId === orbit.id);
      return { orbit, occupied: there.length > 0, text: [orbit.name, ...there.map((m) => m.hab.name)].join(" · ") };
    });
    this.lPoints = this.makePoints(this.lpoints.length, 6);
  }

  /** Places everything for the camera as it is. */
  draw(frame: MarkerFrame): void {
    this.picks = { habs: [], arcs: [], lpoints: [] };
    if (frame.focusId !== this.lFocus) this.focusLagrange(frame.focusId);
    const shown = frame.shown && !Number.isNaN(frame.years);
    for (const points of [this.habPoints, this.arcPoints, this.lPoints]) if (points) points.visible = shown;
    for (const arc of this.arcs) arc.line.visible = false;
    if (!shown) return;
    const { camera, positions, years } = frame;
    (this.material.uniforms.resolution!.value as THREE.Vector2).set(frame.width * frame.pixelRatio, frame.height * frame.pixelRatio);
    const origin = positions.get(frame.focusId)!;
    const positionOf: PositionOf = (id) => positions.get(id)!;
    const ppu = (at: THREE.Vector3) => ((frame.height / 2) * camera.projectionMatrix.elements[5]!) / Math.max(1e-12, camera.position.distanceTo(at));
    const screen = new THREE.Vector3();
    const project = (at: THREE.Vector3): [number, number] | null => {
      screen.copy(at).project(camera);
      if (screen.z > 1) return null;
      return [((screen.x + 1) / 2) * frame.width, ((1 - screen.y) / 2) * frame.height];
    };
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const toCamera = new THREE.Vector3();

    // The focused system's Lagrange points, where they are far enough from their body on screen.
    const lShown = new Map<string, THREE.Vector3>();
    if (this.lPoints) {
      const attr = this.attributes(this.lPoints);
      const half: [number, number] = [(7 * this.pixel) / 2, (7 * this.pixel) / 2];
      this.lpoints.forEach((l, k) => {
        attr.cell.setX(k, l.occupied ? this.lCells.occupied : this.lCells.faint);
        attr.alpha.setX(k, 0);
        const body = l.orbit.body;
        const disc = frame.disc(body);
        if (!disc || frame.backgroundHidden) return;
        const at = this.lagrange(l.orbit.lagrange!, body, positionOf, new THREE.Vector3());
        const bodyAt = positions.get(body)!;
        if (at.distanceTo(bodyAt) * ppu(bodyAt) < Math.max(HAB_MIN_PIXELS, disc.drawn + half[0] + FAN_GAP)) return;
        lShown.set(l.orbit.id, at);
        this.show(attr, k, at, origin, l.occupied ? 1 : LPOINT_FAINT);
        const p = project(at);
        if (p) this.picks.lpoints.push({ x: p[0], y: p[1], half, habId: null, orbitId: l.orbit.id, text: l.text });
      });
      this.finish(this.lPoints, attr, origin);
    }

    // Habs: each where it is, if far enough from its body's disc to show there; else fanned over
    // the nearest disc drawn. A station at a Lagrange point marked on screen sits over its diamond.
    if (this.habPoints) {
      const attr = this.attributes(this.habPoints);
      const fans = new Map<string, { at: THREE.Vector3; drawn: number; list: number[] }>();
      const fan = (key: string, hostAt: THREE.Vector3, drawn: number, k: number) => {
        const entry = fans.get(key) ?? { at: hostAt, drawn, list: [] };
        entry.list.push(k);
        fans.set(key, entry);
      };
      const at = new THREE.Vector3();
      this.habs.forEach((m, k) => {
        attr.cell.setX(k, m.cell);
        attr.shade.setX(k, m.dim ? DIM_SHADE : 1);
        attr.alpha.setX(k, 0);
        const bodyAt = positions.get(m.body)!;
        const disc = frame.disc(m.body);
        const focused = m.body === frame.focusId;
        if (frame.backgroundHidden && !focused) return;
        let placed: "here" | "hidden" | "fan" = "fan";
        const lpoint = m.hab.orbitId ? lShown.get(m.hab.orbitId) : undefined;
        if (lpoint) {
          fan(m.hab.orbitId!, lpoint, (7 * this.pixel) / 2, k);
          return;
        }
        if (disc && m.place) {
          this.stationAt(m.place, years, positionOf, at);
          const offset = at.distanceTo(bodyAt) * ppu(bodyAt);
          if (offset >= HAB_MIN_PIXELS && (offset >= disc.drawn + m.half[0] + FAN_GAP || disc.true >= disc.drawn - this.pixel)) {
            placed = "here";
            // Behind its body's disc.
            const p = project(at);
            const c = project(bodyAt);
            if (p && c && Math.hypot(p[0] - c[0], p[1] - c[1]) < disc.drawn && camera.position.distanceTo(at) > camera.position.distanceTo(bodyAt)) placed = "hidden";
          }
        } else if (disc && m.site?.lat !== undefined && m.site.lon !== undefined && disc.true >= BASE_MIN_PIXELS && disc.true >= disc.drawn - this.pixel) {
          const lat = THREE.MathUtils.degToRad(m.site.lat);
          const lon = THREE.MathUtils.degToRad(m.site.lon);
          const direction = this.v.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
          const turn = frame.frame(m.body);
          if (turn) direction.transformDirection(turn);
          at.copy(bodyAt).addScaledVector(direction, this.body(m.body).radiusKm / AU_KM);
          // On the side facing the camera.
          placed = direction.dot(toCamera.copy(camera.position).sub(at).normalize()) > 0 ? "here" : "hidden";
        }
        if (placed === "hidden") return;
        if (placed === "here") {
          this.show(attr, k, at, origin, m.dim ? DIM_ALPHA : 1);
          const p = project(at);
          if (p) this.picks.habs.push({ x: p[0], y: p[1], half: m.half, habId: m.hab.id, text: m.text });
          return;
        }
        // Fanned over the disc of its body, or of the nearest body above it drawn.
        let host: string | null = m.body;
        while (host && !frame.disc(host)) host = this.body(host).parent;
        if (!host || (frame.backgroundHidden && host !== frame.focusId)) return;
        fan(host, positions.get(host)!, frame.disc(host)!.drawn, k);
      });
      // Every sprite takes a cell's width, so the rings stay even.
      const size = CELL * this.pixel + FAN_GAP;
      for (const { at: hostAt, drawn, list } of fans.values()) {
        const scale = 1 / ppu(hostAt);
        let radius = drawn + size / 2;
        let slot = 0;
        for (const k of list) {
          const m = this.habs[k]!;
          if (Math.ceil(slot / 2) * (size / radius) > FAN_REACH) {
            radius += size;
            slot = 0;
          }
          // Straight up first, then right and left in turn.
          const angle = Math.PI / 2 + (slot % 2 === 1 ? -1 : 1) * Math.ceil(slot / 2) * (size / radius);
          slot++;
          at.copy(hostAt)
            .addScaledVector(right, radius * Math.cos(angle) * scale)
            .addScaledVector(up, radius * Math.sin(angle) * scale);
          this.show(attr, k, at, origin, m.dim ? DIM_ALPHA : 1);
          const p = project(at);
          if (p) this.picks.habs.push({ x: p[0], y: p[1], half: m.half, habId: m.hab.id, text: m.text });
        }
      }
      this.finish(this.habPoints, attr, origin);
    }

    // Probes and deliveries in flight, along their arcs.
    if (this.arcPoints) {
      const attr = this.attributes(this.arcPoints);
      const at = new THREE.Vector3();
      const half: [number, number] = [(7 * this.pixel) / 2, (7 * this.pixel) / 2];
      this.arcs.forEach((arc, k) => {
        attr.cell.setX(k, arc.cell);
        attr.alpha.setX(k, 0);
        const centre = arc.centre ? positions.get(arc.centre)! : this.v.set(0, 0, 0);
        if (frame.backgroundHidden || (arc.centre && arc.span * ppu(centre) < HAB_MIN_PIXELS)) return;
        arc.line.visible = true;
        arc.line.position.copy(centre);
        along(arc.path, (years - arc.launch) / (arc.arrive - arc.launch), at).add(centre);
        this.show(attr, k, at, origin, 1);
        const p = project(at);
        if (p) this.picks.arcs.push({ x: p[0], y: p[1], half, habId: arc.habId, text: arc.text });
      });
      this.finish(this.arcPoints, attr, origin);
    }
  }

  private attributes(points: THREE.Points): PointAttributes {
    const g = points.geometry;
    return {
      position: g.getAttribute("position") as THREE.BufferAttribute,
      cell: g.getAttribute("cell") as THREE.BufferAttribute,
      alpha: g.getAttribute("alpha") as THREE.BufferAttribute,
      shade: g.getAttribute("shade") as THREE.BufferAttribute,
    };
  }

  /** Shows a sprite at a scene position (kept relative to the focus, so float32 holds it steady close up). */
  private show(attr: PointAttributes, k: number, at: THREE.Vector3, origin: THREE.Vector3, alpha: number): void {
    attr.position.setXYZ(k, at.x - origin.x, at.y - origin.y, at.z - origin.z);
    attr.alpha.setX(k, alpha);
  }

  private finish(points: THREE.Points, attr: PointAttributes, origin: THREE.Vector3): void {
    points.position.copy(origin);
    for (const a of Object.values(attr)) a.needsUpdate = true;
  }

  /** The hab, probe, delivery or Lagrange point under a screen point (CSS pixels in the view): habs first. */
  pick(x: number, y: number): MarkerPick | null {
    for (const group of [this.picks.habs, this.picks.arcs, this.picks.lpoints]) {
      let best: Pickable | null = null;
      let bestDistance = Infinity;
      for (const p of group) {
        if (Math.abs(p.x - x) > p.half[0] + 1 || Math.abs(p.y - y) > p.half[1] + 1) continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bestDistance) [best, bestDistance] = [p, d];
      }
      if (best) return { habId: best.habId, orbitId: best.orbitId, text: best.text };
    }
    return null;
  }

  dispose(): void {
    this.clear();
    this.lPoints = this.dropPoints(this.lPoints);
    this.material.dispose();
    this.atlas.dispose();
  }
}
