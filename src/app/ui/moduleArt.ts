// The hab modules' structures in pixel art (decision D18), drawn with pixelKit's painter in a
// 128-unit design space: one draw function per line of modules, each after real hardware (the
// ISS's laboratories, Zvezda, inflatable habitats, Canadarm, SNAP-10A, tokamaks, Hubble and the
// James Webb telescope, Phalanx guns…) in the kit's anime cel style. Every module is built as
// station modules are: it lies along the cell's horizontal axis (AXIS), and a berthing adapter
// runs from each end out to the cell's edge on the axis, ending in a gold collar, so neighbouring
// modules and the hab's corridors meet it. Pressurised hulls come in three forms (pod()): a
// laboratory can with conical ends, a stepped service module with a spherical node and round
// portholes, and a fat inflatable in restraint straps. Structures that aren't pressurised (solar
// arrays, reactors, colliders) hang off a truss keel along the same axis. Equipment mounts above
// and below. The hull's finish tells the module's role: white for command and habitation, beige
// thermal blankets with a band in the field's colour for labs, dark plate for industry and armour
// for the military. A tier changes the build (a bigger hull, then modules docked upright onto it,
// rings, more equipment), so each upgrade looks its own. The ground-only base modules (the
// outpost core, the mining rig) keep their legs. The faction's colour goes on stripes, markings
// and flags. Each module shows its tier as gold pips in the bottom-right corner, and automated
// modules a cyan light in the top-left one.

import { baseContent } from "../../content/index";
import type { HabModuleDef } from "../../sim/index";
import { factionRamp, GLOW, Painter, RAMPS, type Ramp } from "./pixelKit";

type Tier = 1 | 2 | 3;
type Draw = (P: Painter, tier: Tier) => void;

// ---------------------------------------------------------------- the common build

/** Every module lies along this horizontal line (design units). */
const AXIS = 64;
/** A pressurised hull's length and diameter by tier. */
const LEN: Record<Tier, number> = { 1: 70, 2: 84, 3: 98 };
const BORE: Record<Tier, number> = { 1: 30, 2: 34, 3: 38 };

/** Each lab field's band colour. */
const FIELD = {
  energy: factionRamp("#3ad0e0"),
  information: factionRamp("#4a7cf0"),
  life: factionRamp("#4cc860"),
  materials: factionRamp("#f0803a"),
  military: factionRamp("#e04a4a"),
  social: factionRamp("#b870f0"),
  space: factionRamp("#7a6af8"),
  climate: factionRamp("#30c0a8"),
};

const PLASMA: Ramp = [GLOW.violetHi, GLOW.violet, 0x8a5cd8, 0x5a3a9a, 0x35215f];
const ENERGY: Ramp = [GLOW.cyanHi, GLOW.cyan, 0x4fc2dc, 0x3e8fb3, 0x2b5f88];
const BIO: Ramp = [0xd8ffe0, 0x8af0a0, 0x5fcc7a, 0x3fa05c, 0x2b7853, 0x1d4f3e];

/** A hull's box: left edge, length, diameter, and its top and bottom, centred on the axis. */
interface Hull {
  x: number;
  w: number;
  d: number;
  top: number;
  bottom: number;
}

function hullAt(len: number, d: number, cx = 64): Hull {
  return { x: cx - len / 2, w: len, d, top: AXIS - d / 2, bottom: AXIS + d / 2 };
}

/** The berthing line every module shares: an adapter from `left` and `right` out to the cell's edges on the axis, each ending in a gold collar. */
function berths(P: Painter, left: number, right: number, d = 12): void {
  P.part(() => {
    if (left > 6) P.hcyl(2, AXIS - d / 2, left + 2, d);
    if (right < 122) P.hcyl(right - 4, AXIS - d / 2, 130 - right, d);
  });
  P.part(() => {
    if (left > 6) P.box(1, AXIS - d / 2 - 2, 4, d + 4, RAMPS.gold, 0.15);
    if (right < 122) P.box(123, AXIS - d / 2 - 2, 4, d + 4, RAMPS.gold, 0.15);
  });
}

/**
 * A pressurised hull's build: "lab" a can with conical ends and framed windows (the ISS's
 * laboratories), "stepped" a wide compartment, a narrow one and a spherical node, with round
 * portholes (Zvezda), "soft" a fat inflatable in restraint straps round a rigid core (TransHab).
 */
type Form = "lab" | "stepped" | "soft";

interface PodOptions {
  seed?: number;
  /** Rows of windows. */
  rows?: number;
  /** Where the faction's stripe goes along the hull (0–1); negative for none. */
  stripe?: number;
  ramp?: Ramp;
  windows?: boolean;
  /** The end rings' colour (the hull's own from 64 px, if not given). */
  ring?: Ramp;
  form?: Form;
}

/** A pressurised module lying on its side: its hull in one of the forms, with rings, panel seams, the faction's stripe, windows and handrails. */
function pod(P: Painter, x: number, y: number, w: number, h: number, o: PodOptions = {}): void {
  const { seed = 1, rows = 1, stripe = 0.8, ramp = RAMPS.hull, windows = true, ring, form = "lab" } = o;
  const cy = y + h / 2;
  if (form === "soft") {
    // The straight stretch between the rounded ends.
    const r = h / 2, a = x + 5 + r, b = x + w - 5 - r;
    P.part(() => P.hcyl(x, cy - h * 0.27, w, h * 0.54, RAMPS.dark, 0.12));
    P.part(() => {
      P.hcyl(x + 5, y, w - 10, h, ramp, 0.5);
      if (P.medium) {
        for (let sx = a; sx <= b + 0.5; sx += 10) P.line(sx, y + 1, sx, y + h - 2, ramp[3]!);
        for (const f of [0.25, 0.77]) P.line(a - r * 0.5, y + h * f, b + r * 0.5, y + h * f, ramp[3]!);
      }
      if (stripe >= 0 && b > a) P.stripe(a + (b - a) * stripe - 2, y + h * 0.04, 5, h * 0.92);
      if (!windows) return;
      const n = Math.max(1, Math.floor((b - a + 4) / 10)), from = (a + b) / 2 - (n - 1) * 5 - (stripe >= 0 && n > 1 ? 3 : 0);
      for (let i = 0; i < rows; i++) P.portholes(from, y + h * (rows === 1 ? 0.5 : 0.41 + i * 0.22), n, 10, 2.3, seed + i);
    });
    return;
  }
  if (form === "stepped") {
    const big = w * 0.54, small = h * 0.64, node = h * 0.36;
    P.part(() => {
      P.hcyl(x + big - 2, cy - small / 2, w - big - node, small, ramp, 0.1);
      P.sphere(x + w - node, cy, node, node, ramp);
      P.ring(x + w - node * 2 - 2, cy - small / 2, 3, small, ring ?? ramp);
      if (windows) P.portholes(x + big + 13, cy - small * 0.1, Math.max(1, Math.floor((w - big - node * 2 - 14) / 9)), 9, 2, seed + 3);
      P.hatch(x + w - node - 4, cy - 4, 8, 8);
    });
    P.part(() => {
      P.hcone(x + big - 1, cy, 6, h, small + 2, ramp);
      P.hcyl(x, y, big, h, ramp, 0.14);
      P.seams(x + 6, y + h * 0.16, big - 10, h * 0.68, 11, ramp[3]!);
      if (ring || P.medium) P.ring(x + 5, y + 1, ring ? 4 : 3, h - 2, ring ?? ramp);
      if (stripe >= 0) P.stripe(x + big - 9, y + h * 0.08, 5, h * 0.84);
      if (windows) for (let i = 0; i < rows; i++) P.portholes(x + 16, y + h * (rows === 1 ? 0.42 : 0.3 + i * 0.26), Math.max(1, Math.floor((big - 28) / 9)), 9, 2.3, seed + i);
      P.handrail(x + 8, x + big - 4, y + h * 0.17);
    });
    return;
  }
  const cone = Math.min(h * 0.3, w * 0.12);
  P.part(() => {
    P.hcone(x, cy, cone, h * 0.6, h, ramp);
    P.hcone(x + w - cone, cy, cone, h, h * 0.6, ramp);
    P.hcyl(x + cone, y, w - 2 * cone, h, ramp, 0);
    P.seams(x + cone + 6, y + h * 0.16, w - 2 * cone - 12, h * 0.68, 12, ramp[3]!);
    if (ring || P.medium) for (const rx of [x + cone, x + w - cone - 4]) P.ring(rx, y, ring ? 4 : 3, h, ring ?? ramp);
    const end = stripe >= 0 ? x + w * stripe - 4 : x + w - cone - 8;
    if (stripe >= 0) P.stripe(x + w * stripe, y + h * 0.08, 5, h * 0.84);
    const from = x + cone + 8;
    if (windows) for (let r = 0; r < rows; r++) P.windows(from, y + h * (rows === 1 ? 0.36 : 0.28 + r * 0.24), Math.max(1, Math.floor((end - from) / 7)), 7, 3.5, 4.5, seed + r);
    P.handrail(x + cone + 3, x + w - cone - 3, y + h * 0.17);
    P.rivets(x + cone + 2, x + w - cone - 2, y + h * 0.86, 5);
  });
}

/** A module's main hull on the axis, with its berths. */
function hull(P: Painter, h: Hull, o: PodOptions & { band?: Ramp } = {}): void {
  berths(P, h.x + 4, h.x + h.w - 4);
  pod(P, h.x, h.top, h.w, h.d, { ...o, ring: o.band ?? o.ring });
}

/** A truss keel along the axis from edge to edge, collars at both ends, for the unpressurised structures. */
function keel(P: Painter, width = 9): void {
  P.part(() => P.truss(4, AXIS, 124, AXIS, width));
  P.part(() => {
    P.box(1, AXIS - width / 2 - 2, 4, width + 4, RAMPS.gold, 0.15);
    P.box(123, AXIS - width / 2 - 2, 4, width + 4, RAMPS.gold, 0.15);
  });
}

/**
 * A module docked upright onto a hull: above it (`y` its top, reaching down to the hull) or, with
 * `down`, hanging below it (`y` where it meets the hull). Draw it before the hull so the hull covers
 * its foot. A vertical can with floors of windows and a gold collar at the hull.
 */
function riser(P: Painter, cx: number, y: number, h: number, d: number, o: { ramp?: Ramp; seed?: number; band?: Ramp; down?: boolean; windows?: boolean } = {}): void {
  const { ramp = RAMPS.hull, seed = 1, band, down = false, windows = true } = o;
  P.part(() => {
    P.vcyl(cx - d / 2, y, d, h, ramp);
    const cap = d * 0.14;
    if (band) P.ring(cx - d / 2 + 1, down ? y + h - 8 : y + cap * 2 + 1, d - 2, 4, band);
    if (!windows) return;
    const n = Math.max(1, Math.floor((d - 6) / 6));
    const x0 = cx - (n * 6 - 3) / 2;
    const first = down ? y + 6 : y + cap * 2 + (band ? 8 : 4);
    const last = down ? y + h - (band ? 12 : 6) - cap * 2 : y + h - 8;
    for (let f = 0, fy = first; fy + 4 <= last; f++, fy += 7) P.windows(x0, fy, n, 6, 3, 4, seed + f);
  });
  P.part(() => P.box(cx - d / 2 - 2, down ? y - 1 : y + h - 3, d + 4, 4, RAMPS.gold, 0.15));
}

/** A docking port: a short tube ending in a gold collar, pointing up or down from (x, y). */
function port(P: Painter, x: number, y: number, side: "up" | "down", len = 10, d = 14): void {
  P.part(() => {
    const y0 = side === "up" ? y - len : y;
    P.vcyl(x - d / 2, y0, d, len, RAMPS.hull, side === "up");
    P.box(x - d / 2 - 1.5, side === "up" ? y0 : y0 + len - 3, d + 3, 3, RAMPS.gold);
  });
}

/** A solar wing: a panel of cells. */
function wing(P: Painter, x: number, y: number, w: number, h: number, cols = 4, rows = 6): void {
  P.part(() => P.solar(x, y, w, h, cols, rows));
}

/** A mast: a strut between two points. */
function mast(P: Painter, x0: number, y0: number, x1: number, y1: number, w = 3): void {
  P.part(() => P.pipe(x0, y0, x1, y1, w, RAMPS.dark));
}

/** A row of finned radiator panels hanging below the axis, from x0 to x1, `h` tall, with their manifold; `hot` makes them glow from the root. */
function radiators(P: Painter, x0: number, x1: number, n: number, h: number, hot = 0): void {
  const gap = 3, w = (x1 - x0 - gap * (n - 1)) / n;
  P.part(() => P.pipe(x0, AXIS + 8, x1, AXIS + 8, 3, RAMPS.dark));
  P.part(() => {
    for (let i = 0; i < n; i++) P.radiator(x0 + i * (w + gap), AXIS + 11, w, h, true, 4, hot);
  });
}

/**
 * A crew capsule docked nose-first at (cx, y), above the hull it's docked to or, with `up` false,
 * below it: a gumdrop cabin on its heat shield, a trunk half covered in solar cells (a Dragon).
 * Draw it before the hull so the hull covers its nose.
 */
function capsule(P: Painter, cx: number, y: number, up = true, s = 1): void {
  const d = up ? -1 : 1, trunk = up ? y - 26 * s : y + 15 * s;
  P.part(() => {
    P.box(cx - 8 * s, trunk, 16 * s, 11 * s, RAMPS.hull);
    P.fill(cx - 8 * s, trunk, 8 * s, 11 * s, RAMPS.solar[3]!);
    if (P.medium) P.fill(cx - 8 * s, trunk + 5 * s, 8 * s, 1, RAMPS.solar[1]!);
  });
  P.part(() => {
    P.poly([cx - 4.5 * s, y, cx + 4.5 * s, y, cx + 9 * s, y + d * 14 * s, cx - 9 * s, y + d * 14 * s], { ramp: RAMPS.white, dir: [1, 0], from: 0, to: 0.7 });
    P.fill(cx - 9 * s, up ? y - 16 * s : y + 13 * s, 18 * s, 3 * s, RAMPS.dark[3]!);
    P.fill(cx - 3 * s, y + d * 7 * s - 1.5 * s, 3 * s, 3 * s, RAMPS.glass[4]!);
  });
}

/** A robot arm (a Canadarm): white booms from a base at (bx, by) by an elbow at (ex, ey) to a hand at (tx, ty), gold joints; `spark` lights a weld at the hand. */
function arm(P: Painter, bx: number, by: number, ex: number, ey: number, tx: number, ty: number, spark = false): void {
  P.part(() => {
    P.box(bx - 5, by - 3, 10, 6, RAMPS.dark);
    P.pipe(bx, by, ex, ey, 4.5, RAMPS.white);
    P.pipe(ex, ey, tx, ty, 4, RAMPS.white);
    P.sphere(ex, ey, 4, 4, RAMPS.gold);
    P.box(tx - 3, ty - 3, 6, 6, RAMPS.dark, 0.2);
  });
  if (!spark) return;
  P.glow(tx, ty, 7, GLOW.heatHi, 0.9);
  P.sparkle(tx, ty, 5, GLOW.heatHi);
}

/** An observation cupola on a hull at (cx, y): a truncated cone of three panes, pointing up or down. */
function cupola(P: Painter, cx: number, y: number, r: number, up = true): void {
  const d = up ? -1 : 1, t = y + d * r * 0.75;
  P.part(() => {
    P.poly([cx - r, y, cx + r, y, cx + r * 0.5, t, cx - r * 0.5, t], { ramp: RAMPS.dark, dir: [1, 0], from: 0.1, to: 0.7 });
    const y0 = y + d * 1.5, y1 = t - d * 1.5;
    P.poly([cx - r + 2.5, y0, cx - r * 0.36, y0, cx - r * 0.3, y1, cx - r * 0.5 + 1.5, y1], RAMPS.glass[1]!);
    P.poly([cx - r * 0.24, y0, cx + r * 0.24, y0, cx + r * 0.2, y1, cx - r * 0.2, y1], RAMPS.glass[2]!);
    P.poly([cx + r * 0.36, y0, cx + r - 2.5, y0, cx + r * 0.5 - 1.5, y1, cx + r * 0.3, y1], RAMPS.glass[3]!);
  });
}

/** Gold tier pips in the bottom-right corner, a cyan light top-left if automated. */
function badges(P: Painter, def: HabModuleDef): void {
  for (let i = 0; i < def.tier; i++) P.part(() => P.box(116 - i * 11, 115, 8, 8, RAMPS.gold, 0.15));
  if (def.automated) {
    P.part(() => P.sphere(10, 10, 6, 6, ENERGY));
    P.glow(10, 10, 12, GLOW.cyan, 0.5);
  }
}

// ---------------------------------------------------------------- cores

/** A base's core: a lander on legs (a foil-wrapped descent stage under a white cabin), its berths at the axis; a settlement adds inflatable side modules, a colony a dome. */
const OutpostCore: Draw = (P, tier) => {
  P.part(() => {
    for (const [x0, x1] of [[42, 22], [86, 106], [56, 50], [72, 78]] as const) P.pipe(x0, 88, x1, 112, 3.5, RAMPS.gold);
    for (const [x0, x1] of [[40, 29], [88, 99]] as const) P.pipe(x0, 97, x1, 100, 2, RAMPS.dark);
  });
  P.part(() => {
    for (const x of [15, 99, 44, 72]) P.box(x, 111, 14, 4, RAMPS.dark);
  });
  P.part(() => P.poly([58, 98, 70, 98, 76, 110, 52, 110], { ramp: RAMPS.dark, dir: [1, 0], from: 0.2, to: 0.9 }));
  berths(P, 40, 88, 14);
  if (tier >= 2) {
    pod(P, 4, 50, 34, 28, { form: "soft", ramp: RAMPS.cloth, seed: 5, stripe: -1 });
    pod(P, 90, 50, 34, 28, { form: "soft", ramp: RAMPS.cloth, seed: 6, stripe: -1 });
  }
  P.part(() => {
    P.vcyl(38, 34, 52, 52);
    P.sphere(64, 42, 26, 13, RAMPS.hull, 42);
    P.seams(42, 46, 44, 32, 11);
    P.stripe(39, 73, 50, 5);
    P.windows(43, 52, 6, 7.4, 4.4, 6, 2);
    if (tier >= 2) P.windows(43, 63, 6, 7.4, 4.4, 5, 8);
    P.rivets(42, 86, 48, 5);
  });
  P.part(() => {
    P.foil(33, 81, 62, 18);
    P.fill(33, 81, 62, 2, RAMPS.gold[0]!);
    P.hatch(57, 83, 14, 12);
  });
  P.part(() => P.ladder(62, 96, 16), false);
  if (tier === 3) {
    P.part(() => {
      P.sphere(64, 38, 24, 22, RAMPS.glass, 38);
      P.gloss(40, 16, 48, 22);
    });
    P.part(() => {
      P.box(52, 26, 10, 12, RAMPS.hull);
      P.box(64, 22, 10, 16, RAMPS.hull);
      P.windows(54, 29, 2, 4, 2, 2, 4, 1);
      P.windows(66, 25, 2, 4, 2, 2, 7, 1);
      P.ellipse(48, 34, 3, 3.5, RAMPS.green[2]!);
      P.ellipse(79, 33, 3.5, 4, RAMPS.green[1]!);
    }, false);
    P.sparkle(50, 22, 5);
  } else port(P, 64, 31, "up", 8, 16);
  mast(P, 84, 38, 84, 24, 2);
  P.part(() => P.dish(84, 20, 8, -60, 0.42));
  P.part(() => P.flag(46, 34, 12, 8));
};

/** A station's core: a spherical node with ports all round; an orbital core adds a truss and solar wings, a ring core a habitat ring. */
const PlatformCore: Draw = (P, tier) => {
  const r = 16 + tier * 3;
  if (tier === 3) P.part(() => P.torus(64, 66, 58, 26, 9, 6, "back"));
  if (tier >= 2) {
    for (const x of [6, 98]) {
      wing(P, x, 12, 24, 40, 3, 6);
      wing(P, x, 76, 24, 40, 3, 6);
    }
    P.part(() => {
      for (const x of [18, 110]) P.pipe(x, 50, x, 78, 3, RAMPS.gold);
    });
  }
  berths(P, 64 - r + 4, 64 + r - 4, 16);
  if (tier === 1) {
    mast(P, 64, 30, 64, 16);
    wing(P, 26, 4, 76, 14, 10, 2);
  }
  port(P, 64, 64 - r + 3, "up", 12, 16);
  port(P, 64, 64 + r - 3, "down", 12, 16);
  P.part(() => {
    P.sphere(64, 64, r, r);
    P.stripe(64 - r + 2, 62, 2 * r - 4, 6);
    P.windows(64 - r * 0.55, 50, 4, r * 0.3, 3.5, 4, 3);
    P.rivets(64 - r * 0.7, 64 + r * 0.7, 75, 4);
  });
  if (tier === 3) P.part(() => P.torus(64, 66, 58, 26, 9, 6, "front"));
  P.part(() => {
    P.light(64, 64 - r - 14, GLOW.beacon);
    P.light(64 - r - 4, 56, GLOW.beacon);
    P.light(64 + r + 4, 56, GLOW.beacon);
  }, false);
  P.sparkle(64 - r * 0.5, 64 - r * 0.55, 4);
};

// ---------------------------------------------------------------- command and engineering

/** Offices under a bridge of slanted glass; a tower raises the bridge on an office block as a control tower's cab, a complex hangs another block below and adds masts. */
const AdministrationNode: Draw = (P, tier) => {
  const h = hullAt(LEN[tier] + 6, BORE[tier]);
  /** A cab `w` wide with its roof at `y`: walls leaning out to the roof, a band of glass all round. */
  const cab = (y: number, w: number, hgt: number) =>
    P.part(() => {
      P.poly([64 - w / 2 + 5, y + hgt, 64 + w / 2 - 5, y + hgt, 64 + w / 2, y + 3, 64 - w / 2, y + 3], { ramp: RAMPS.hull, dir: [1, 0.4], from: 0.05, to: 0.6 });
      P.poly([64 - w / 2 + 4, y + hgt - 3, 64 + w / 2 - 4, y + hgt - 3, 64 + w / 2 - 1.5, y + 5, 64 - w / 2 + 1.5, y + 5], { ramp: RAMPS.glass, dir: [1, 0.5], from: 0.15, to: 0.8 });
      P.gloss(64 - w / 2, y + 5, w, hgt - 8, 0.6);
      if (P.medium) for (let mx = 64 - w / 2 + 8; mx < 64 + w / 2 - 5; mx += 8) P.line(mx, y + 5, mx, y + hgt - 4, RAMPS.hull[3]!);
      P.box(64 - w / 2 - 1.5, y, w + 3, 4, RAMPS.hull, 0.1);
      P.stripe(64 - w / 2 + 5, y + hgt - 2, w - 10, 2);
    });
  if (tier >= 2) riser(P, 64, tier === 3 ? 26 : 30, h.top - (tier === 3 ? 24 : 28), tier === 3 ? 28 : 24, { seed: 11 });
  if (tier === 3) riser(P, 64, h.bottom - 2, 34, 22, { seed: 13, down: true });
  P.part(() => {
    P.antenna(h.x + h.w - 12, h.top + 1, 16, 2);
    if (tier >= 2) P.antenna(h.x + h.w - 22, h.top + 1, 22, 3);
    if (tier === 3) P.antenna(h.x + 26, h.top + 1, 24, 3);
  });
  mast(P, h.x + 14, h.top, h.x + 14, h.top - 12);
  P.part(() => P.dish(h.x + 14, h.top - 16, tier === 3 ? 9 : 7, -120, 0.4));
  hull(P, h, { seed: 4, rows: tier === 1 ? 1 : 2, stripe: 0.84 });
  if (tier === 1) cab(h.top - 12, 36, 15);
  else if (tier === 2) cab(15, 38, 17);
  else cab(9, 48, 19);
  P.part(() => P.flag(h.x + h.w - 30, tier === 1 ? h.top + 1 : h.top - 6, 10, 7));
  P.part(() => P.light(64, tier === 1 ? h.top - 14 : tier === 2 ? 13 : 7, GLOW.beacon), false);
};

/** Mission control: a wide hull with a bay of glowing screens, a radome and a phased array; a command centre adds a dish and an operations deck below. */
const OperationsCenter: Draw = (P, tier) => {
  const h = hullAt(LEN[tier] + 14, BORE[tier] + 6);
  if (tier === 3) riser(P, 64, h.bottom - 2, 30, 26, { seed: 6, down: true, ramp: RAMPS.white });
  mast(P, h.x + 18, h.top, h.x + 18, h.top - 10);
  P.part(() => {
    P.sphere(h.x + 18, h.top - 20, 11, 11, RAMPS.white);
    if (P.medium) {
      // A geodesic radome's facets.
      P.line(h.x + 9, h.top - 24, h.x + 27, h.top - 24, RAMPS.white[3]!);
      P.line(h.x + 8, h.top - 17, h.x + 28, h.top - 17, RAMPS.white[4]!);
      for (const dx of [-5, 2]) P.line(h.x + 18 + dx, h.top - 30, h.x + 18 + dx + 3, h.top - 11, RAMPS.white[3]!);
    }
  });
  mast(P, h.x + h.w - 22, h.top, h.x + h.w - 22, h.top - 8);
  P.part(() => {
    P.poly([h.x + h.w - 36, h.top - 8, h.x + h.w - 10, h.top - 14, h.x + h.w - 10, h.top - 30, h.x + h.w - 36, h.top - 24], { ramp: RAMPS.dark, dir: [1, 0.3], from: 0.3, to: 0.8 });
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) P.dot(h.x + h.w - 32 + i * 6, h.top - 13 - j * 5 - i * 1.4, (i + j) % 2 ? GLOW.cyan : RAMPS.gold[1]!);
    P.antenna(h.x + h.w - 6, h.top + 1, 18, 2);
  });
  if (tier === 3) {
    mast(P, 64, h.top, 64, h.top - 12);
    P.part(() => P.dish(64, h.top - 18, 11, -110, 0.42));
  }
  hull(P, h, { seed: 5, windows: false, stripe: 0.9 });
  P.part(() => {
    const n = tier === 3 ? 5 : 4, sw = (h.w * 0.66) / n, x0 = h.x + h.w * 0.15;
    P.fill(x0 - 1, AXIS - 9, n * sw + 1, 16, RAMPS.dark[4]!);
    for (let i = 0; i < n; i++) {
      const sx = x0 + i * sw;
      P.fill(sx, AXIS - 8, sw - 2, 14, RAMPS.glass[5]!);
      if (i === 1) {
        // The ground track on the big board.
        P.fill(sx, AXIS - 8, sw - 2, 14, 0x16306a);
        for (let t = 0; t < sw - 3; t += 1) P.dot(sx + 1 + t, AXIS - 1 + Math.sin(t * 0.7) * 4, GLOW.window);
      } else for (let l = 0; l < 3; l++) P.fill(sx + 2, AXIS - 6 + l * 4, 3 + ((i * 5 + l * 7) % (sw - 6)), 1.5, l % 2 ? GLOW.cyan : i % 2 ? GLOW.green : RAMPS.glass[1]!);
    }
  });
  P.glow(64, AXIS, 18, GLOW.cyan, 0.3);
};

/** A robotic workshop: a dark hull on a truss keel with a robot arm welding; a nanofactory frames it in trusses over vats, a complex builds a whole new hull. */
const ConstructionModule: Draw = (P, tier) => {
  if (tier >= 2)
    P.part(() => {
      P.truss(8, 10, 120, 10, 8);
      P.truss(8, 112, 120, 112, 8);
      P.truss(8, 10, 8, 112, 8);
      P.truss(120, 10, 120, 112, 8);
    });
  else keel(P);
  if (tier === 3)
    P.part(() => {
      P.hcyl(36, 18, 56, 18);
      P.fill(70, 18, 22, 18, RAMPS.dark[4]!);
      for (let x = 72; x < 92; x += 5) P.line(x, 19, x, 34, RAMPS.gold[3]!);
    });
  if (tier >= 2)
    P.part(() => {
      const n = tier === 3 ? 5 : 3;
      for (let i = 0; i < n; i++) P.sphere(64 + (i - (n - 1) / 2) * 16, 96, 7, 7, RAMPS.gold);
    });
  const h = hullAt(tier === 1 ? 46 : LEN[tier] - 6, BORE[tier]);
  hull(P, h, { ramp: RAMPS.dark, seed: 7, rows: 1, stripe: 0.72 });
  P.part(() => P.hazard(h.x + 8, h.bottom - 6, h.w - 16, 3));
  if (tier === 1) {
    P.part(() => {
      P.box(56, 20, 36, 7, RAMPS.hull, 0.2);
      P.hazard(56, 25, 36, 2);
    });
    arm(P, 48, h.top + 2, 38, 34, 58, 28, true);
  } else if (tier === 2) {
    arm(P, h.x + 10, h.top + 2, h.x + 4, 30, 30, 24, true);
    arm(P, h.x + h.w - 10, h.top + 2, h.x + h.w - 4, 30, 98, 24, true);
  } else {
    arm(P, h.x + 10, h.top + 2, h.x + 2, 34, 34, 36, true);
    arm(P, h.x + h.w - 10, h.top + 2, h.x + h.w - 2, 34, 94, 36, true);
    arm(P, 64, h.bottom - 2, 50, 82, 40, 96);
  }
  P.part(() => {
    for (const [x, y] of tier === 1 ? ([[10, 58], [118, 58]] as const) : ([[8, 6], [120, 6], [8, 116]] as const)) P.light(x, y, GLOW.beacon);
  }, false);
};

/** An experimental hangar: a boxy pressurised bay, doors open on a prototype spaceplane; a foundry adds furnace vents and radiators. */
const SkunkWorks: Draw = (P, tier) => {
  berths(P, 10, 118, 14);
  if (tier === 3) {
    P.part(() => {
      P.radiator(14, 6, 40, 14, false, 4);
      P.radiator(74, 6, 40, 14, false, 4);
    });
    mast(P, 34, 20, 34, 30);
    mast(P, 94, 20, 94, 30);
  }
  P.part(() => {
    P.box(8, 30, 112, 66, RAMPS.dark, 0.25);
    P.poly([8, 30, 64, 20, 120, 30], { ramp: RAMPS.dark, dir: [1, 0.3], from: 0.05, to: 0.5 });
    P.seams(10, 32, 108, 62, 9, RAMPS.dark[4]!);
    P.stripe(8, 30, 112, 4);
    P.windows(12, 40, 2, 7, 4, 4, 3);
    P.windows(104, 40, 2, 7, 4, 4, 6);
  });
  P.part(() => {
    P.fill(30, 40, 68, 56, RAMPS.dark[4]!);
    P.fill(32, 42, 64, 54, tier === 3 ? 0x7a3238 : 0xf2c878);
    P.fill(32, 42, 64, 4, tier === 3 ? 0xf0803a : 0xfff4cc);
    P.fill(32, 80, 64, 16, tier === 3 ? 0x402030 : 0x9a6a58);
    P.hazard(30, 36, 68, 4);
  });
  if (tier === 2) {
    P.part(() => {
      // A spaceplane: a white back over a black heat-shield belly, a tail fin.
      P.poly([38, 70, 54, 60, 86, 60, 94, 66, 86, 74, 44, 74], { ramp: RAMPS.white, dir: [0.2, 1] });
      P.poly([40, 71, 92, 68, 86, 74, 44, 74], RAMPS.dark[4]!);
      P.poly([40, 62, 50, 48, 56, 48, 56, 61], { ramp: RAMPS.white, dir: [0.2, 1] });
      P.stripe(60, 64, 20, 2);
      P.fill(80, 62, 7, 3, RAMPS.glass[1]!);
    });
    P.sparkle(74, 60, 4);
  } else
    P.part(() => {
      P.vcyl(40, 52, 22, 30, RAMPS.dark);
      P.fill(44, 70, 14, 8, GLOW.heat);
      P.fill(46, 72, 10, 4, GLOW.heatHi);
      P.pipe(62, 64, 84, 52, 4, RAMPS.gold);
      P.vcyl(80, 46, 12, 34, RAMPS.dark);
    });
  if (tier === 3) P.glow(51, 74, 14, GLOW.heat, 0.8);
  P.part(() => {
    P.box(40, 78, 6, 18, RAMPS.dark);
    P.box(82, 78, 6, 18, RAMPS.dark);
  });
  P.part(() => {
    P.light(10, 26, GLOW.beacon);
    P.light(118, 26, GLOW.beacon);
  }, false);
};

/** A glass dome on a hull: a little garden campus inside. */
function dome(P: Painter, cx: number, base: number, r: number, seed: number): void {
  P.part(() => {
    P.box(cx - r - 2, base - 2, 2 * r + 4, 5, RAMPS.dark);
    P.sphere(cx, base, r, r * 0.8, RAMPS.glass, base);
    P.gloss(cx - r, base - r * 0.8, 2 * r, r * 0.8, 0.45);
  });
  P.part(() => {
    for (let i = 0; i < 4; i++) P.box(cx - r * 0.7 + i * r * 0.36, base - r * (0.25 + (i % 2) * 0.2), r * 0.3, r * (0.25 + (i % 2) * 0.2), RAMPS.hull);
    P.windows(cx - r * 0.6, base - 6, 4, r * 0.36, 2, 2, seed, 0.9);
    P.ellipse(cx + r * 0.72, base - 4, r * 0.12, r * 0.16, RAMPS.green[2]!);
    P.ellipse(cx - r * 0.8, base - 3.5, r * 0.1, r * 0.14, RAMPS.green[1]!);
  }, false);
  if (r >= 18) P.sparkle(cx - r * 0.5, base - r * 0.55, 4);
}

/** A campus: a long white hull under a glass dome; a university adds a second dome, a lecture hall below and a flag. */
const ResearchCampus: Draw = (P, tier) => {
  const h = hullAt(LEN[tier] + 12, BORE[tier] + 2);
  if (tier === 3) riser(P, 40, h.bottom - 2, 30, 24, { seed: 3, down: true, band: P.faction });
  hull(P, h, { seed: 7, rows: 2, stripe: -1 });
  if (tier === 3) {
    dome(P, 48, h.top + 2, 22, 4);
    dome(P, 90, h.top + 2, 14, 9);
  } else dome(P, 64, h.top + 2, 24, 4);
  P.part(() => P.flag(h.x + 8, h.top + 1, 12, 8));
};

// ---------------------------------------------------------------- science labs

/** A lab's hull: beige blankets, bands in its field's colour; the rest is the field's equipment. */
function labHull(P: Painter, tier: Tier, band: Ramp, seed: number, o: PodOptions = {}): Hull {
  const h = hullAt(LEN[tier], BORE[tier]);
  hull(P, h, { ramp: RAMPS.cloth, band, seed, rows: tier === 3 ? 2 : 1, stripe: -1, ...o });
  return h;
}

/** A fusion test ring over the hull; a research centre adds capacitor banks, an institute a second ring hanging below. */
const EnergyLab: Draw = (P, tier) => {
  const h = hullAt(LEN[tier], BORE[tier]);
  const ring = (cy: number, A: number) => {
    P.part(() => P.torus(64, cy, A, 11, 8, 4, "back", RAMPS.hull, false));
    P.part(() => P.box(60, Math.min(cy, AXIS), 8, Math.abs(AXIS - cy), RAMPS.dark));
    P.part(() => P.torus(64, cy, A, 11, 8, 4, "front", RAMPS.hull, false));
    P.part(() => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.4;
        if (Math.sin(a) > 0.2) P.box(64 + Math.cos(a) * (A - 4) - 2, cy + Math.sin(a) * 8 - 2, 4, 8, RAMPS.gold, 0.2);
      }
    });
    P.part(() => {
      for (let a = 0; a < 6.28; a += 0.02) P.dot(64 + Math.cos(a) * (A - 4.5), cy + Math.sin(a) * 6.5, a % 0.5 < 0.1 ? GLOW.cyanHi : GLOW.cyan);
    }, false);
    P.glow(64, cy, 6, GLOW.cyanHi, 1);
    P.sparkle(64, cy, 5, GLOW.cyanHi);
  };
  if (tier >= 2)
    P.part(() => {
      for (let i = 0; i < tier + 1; i++) P.vcyl(h.x + 10 + i * ((h.w - 30) / tier), h.top - 12, 8, 16, RAMPS.gold);
    });
  if (tier === 3) ring(h.bottom + 18, 34);
  labHull(P, tier, FIELD.energy, 5);
  ring(h.top - 20, 26 + tier * 6);
};

/** A quantum computer's gold chandelier in a viewport, server racks and an antenna farm on top; a research centre adds a dish, an institute cooling radiators and a second rack hall. */
const InformationScienceLab: Draw = (P, tier) => {
  const h = hullAt(LEN[tier], BORE[tier]);
  if (tier === 3) radiators(P, h.x + 4, h.x + h.w - 4, 4, 30);
  const masts = [[h.x + 8, 22], [h.x + 16, 30], [h.x + h.w - 10, 26], [h.x + h.w - 18, 16]] as const;
  P.part(() => {
    for (const [x, len] of masts.slice(0, tier + 1)) P.antenna(x, h.top + 1, len, len > 20 ? 3 : 2);
  });
  labHull(P, tier, FIELD.information, 6);
  P.part(() => {
    // The dilution refrigerator: gold plates stepping down to the chip.
    P.fill(52, AXIS - 10, 24, 20, RAMPS.dark[4]!);
    P.fill(53.5, AXIS - 8.5, 21, 17, 0x101a3c);
    for (const [w, y] of [[16, -7], [12, -3], [8, 1], [4, 5]] as const) {
      P.fill(64 - w / 2, AXIS + y, w, 2, RAMPS.gold[1]!);
      P.fill(64 - w / 2, AXIS + y + 1.2, w, 0.8, RAMPS.gold[3]!);
    }
    P.fill(63, AXIS - 7, 2, 13, RAMPS.gold[2]!);
    P.fill(63, AXIS + 6.5, 2, 1.5, GLOW.cyanHi);
  });
  P.glow(64, AXIS + 6, 5, GLOW.cyan, 0.7);
  const racks = (x: number, y: number, n: number) =>
    P.part(() => {
      P.fill(x, y, n * 7.6 + 2, 16, RAMPS.dark[4]!);
      for (let i = 0; i < n; i++) {
        P.box(x + 1 + i * 7.6, y + 1, 6, 14, RAMPS.dark);
        for (let j = 0; j < 4; j++) P.dot(x + 3 + i * 7.6, y + 3 + j * 3, (i + j) % 3 ? GLOW.cyan : GLOW.green);
      }
    });
  racks(64 - (tier + 2) * 3.8 - 1, h.top - 15, tier + 2);
  if (tier >= 2) {
    mast(P, h.x + h.w - 26, h.top, h.x + h.w - 26, h.top - 18);
    P.part(() => P.dish(h.x + h.w - 26, h.top - 24, 9, -100, 0.42));
  }
};

/** Bio tanks in a lit viewport; a research centre adds a specimen module on top, an institute a greenhouse dome. */
const LifeScienceLab: Draw = (P, tier) => {
  const h = labHull(P, tier, FIELD.life, 7);
  P.part(() => {
    const vx = h.x + 14, vw = h.w - 28;
    P.fill(vx, AXIS - h.d * 0.32, vw, h.d * 0.64, RAMPS.dark[4]!);
    P.fill(vx + 1, AXIS - h.d * 0.32 + 1, vw - 2, h.d * 0.64 - 2, 0x163a4c);
    const n = Math.floor((vw - 4) / 12);
    for (let i = 0; i < n; i++) {
      const tx = vx + 4 + (vw - 4 - n * 12) / 2 + i * 12;
      P.vcyl(tx, AXIS - h.d * 0.26, 8, h.d * 0.48, BIO);
      if (P.medium) {
        P.dot(tx + 3, AXIS - 2, BIO[0]!);
        P.dot(tx + 5, AXIS + 3, BIO[0]!);
      }
    }
  });
  P.glow(64, AXIS, h.d * 0.4, GLOW.green, 0.3);
  if (tier >= 2)
    P.part(() => {
      P.box(h.x + 10, h.top - 14, 22, 16, RAMPS.white);
      P.fill(h.x + 19, h.top - 11, 4, 10, RAMPS.green[3]!);
      P.fill(h.x + 16, h.top - 8, 10, 4, RAMPS.green[3]!);
    });
  if (tier === 3) {
    P.part(() => {
      P.sphere(h.x + h.w - 30, h.top + 2, 20, 18, RAMPS.glass, h.top + 2);
      P.gloss(h.x + h.w - 50, h.top - 16, 40, 18, 0.45);
    });
    P.part(() => {
      for (let i = 0; i < 6; i++) P.ellipse(h.x + h.w - 44 + i * 5.6, h.top - 4 - (i % 2) * 3, 3, 3.5, i % 2 ? RAMPS.green[1]! : RAMPS.green[2]!);
    }, false);
  }
  P.part(() => P.antenna(h.x + h.w - 10, h.top + 1, 14, 2));
};

/** A furnace hanging below with a robot arm holding a crystal; a research centre adds a vacuum chamber, an institute a second furnace. */
const MaterialsLab: Draw = (P, tier) => {
  const h = hullAt(LEN[tier], BORE[tier]);
  const furnace = (cx: number) => {
    P.part(() => {
      P.vcyl(cx - 14, h.bottom - 4, 28, 34, RAMPS.dark);
      P.fill(cx - 8, h.bottom + 12, 16, 12, RAMPS.dark[5]!);
      P.fill(cx - 6, h.bottom + 14, 12, 10, GLOW.heat);
      P.fill(cx - 4, h.bottom + 16, 8, 4, GLOW.heatHi);
      P.stripe(cx - 14, h.bottom + 26, 28, 3);
    });
    P.glow(cx, h.bottom + 19, 12, GLOW.heat, 0.7);
  };
  furnace(tier === 3 ? 40 : 52);
  if (tier === 3) furnace(84);
  labHull(P, tier, FIELD.materials, 8);
  arm(P, h.x + h.w - 18, h.top - 2, h.x + h.w - 4, h.top - 20, h.x + h.w + 7, h.top - 12);
  P.part(() => P.poly([h.x + h.w + 7, h.top - 18, h.x + h.w + 11, h.top - 26, h.x + h.w + 15, h.top - 18, h.x + h.w + 11, h.top - 8], { ramp: ENERGY, dir: [1, 1] }));
  P.sparkle(h.x + h.w + 9, h.top - 21, 4);
  if (tier >= 2) {
    mast(P, h.x + 24, h.top, h.x + 24, h.top - 8);
    P.part(() => {
      P.sphere(h.x + 24, h.top - 20, 13, 13, RAMPS.white);
      P.ellipse(h.x + 24, h.top - 20, 5.5, 5.5, RAMPS.dark[4]!);
      P.ellipse(h.x + 24, h.top - 20, 4, 4, GLOW.violet);
      P.dot(h.x + 23, h.top - 21, GLOW.violetHi);
    });
  }
};

/** An armoured hull with a railgun test barrel; a research centre adds a target drone, an institute a second barrel and a capacitor bank. */
const MilitaryScienceLab: Draw = (P, tier) => {
  const h = hullAt(LEN[tier], BORE[tier]);
  if (tier === 3)
    P.part(() => {
      for (let i = 0; i < 4; i++) P.box(h.x + 12 + i * 18, h.bottom - 2, 14, 20, RAMPS.dark, 0.15);
      P.hazard(h.x + 12, h.bottom + 14, 68, 3);
    });
  labHull(P, tier, FIELD.military, 9, { ramp: RAMPS.armor });
  const barrel = (y: number, len: number) => {
    P.part(() => {
      P.box(h.x + 8, y - 2, 22, 14, RAMPS.dark);
      P.box(h.x + 28, y, len, 6, RAMPS.hull);
      P.box(h.x + 28, y + 6, len, 3, RAMPS.dark);
      for (let x = h.x + 34; x < h.x + 28 + len - 4; x += 11) P.box(x, y - 2, 4, 11, RAMPS.gold);
    });
    P.glow(h.x + 28 + len + 2, y + 3, 6, GLOW.cyan, 0.8);
    P.sparkle(h.x + 28 + len + 2, y + 3, 4, GLOW.cyanHi);
  };
  barrel(h.top - 14, 50 + tier * 10);
  if (tier === 3) barrel(h.top - 30, 60);
  if (tier >= 2)
    P.part(() => {
      P.sphere(112, 18, 6, 5, RAMPS.dark);
      P.fill(104, 17, 16, 2, RAMPS.dark[2]!);
      P.light(112, 12, GLOW.beacon);
    });
};

/** A screen of charts on a mast; a research centre adds an atrium dome, an institute a second screen and a forum hanging below. */
const SocialScienceLab: Draw = (P, tier) => {
  const h = hullAt(LEN[tier], BORE[tier]);
  if (tier === 3) riser(P, 84, h.bottom - 2, 28, 22, { seed: 2, down: true, ramp: RAMPS.cloth, band: FIELD.social });
  const screen = (x: number, y: number, w: number, hh: number, seed: number) => {
    mast(P, x + w / 2, y + hh, x + w / 2, h.top);
    P.part(() => {
      P.box(x, y, w, hh, RAMPS.dark);
      P.fill(x + 3, y + 3, w - 6, hh - 6, 0x141a44);
      const n = Math.floor((w - 8) / 7);
      for (let i = 0; i < n; i++) {
        const bh = ((i * 7 + seed * 5) % (hh - 12)) + 4;
        P.fill(x + 5 + i * 7, y + hh - 4 - bh, 5, bh, i % 3 === 0 ? GLOW.pink : i % 3 === 1 ? GLOW.window : GLOW.violet);
      }
      P.line(x + 5, y + hh * 0.7, x + w - 5, y + hh * 0.3, RAMPS.white[0]!, 0.8);
    });
  };
  labHull(P, tier, FIELD.social, 10);
  screen(h.x + 4, h.top - 34, 40, 26, 1);
  if (tier === 3) screen(h.x + h.w - 34, h.top - 26, 30, 20, 3);
  if (tier >= 2) {
    const cx = tier === 3 ? 64 : h.x + h.w - 22;
    P.part(() => {
      P.sphere(cx, h.top + 2, 15, 13, RAMPS.glass, h.top + 2);
      P.gloss(cx - 15, h.top - 11, 30, 13, 0.45);
    });
    P.part(() => {
      P.fill(cx - 10, h.top - 4, 20, 5, 0x6c4a52);
      P.windows(cx - 9, h.top - 6, 5, 4, 2, 2, 3, 0.9);
    }, false);
  }
};

/** A space telescope on the hull (a Hubble: a silver tube, its aperture door open, two solar wings); a research centre has a longer one, an institute a segmented gold mirror over a sunshield (a Webb) and a dish array. */
const SpaceScienceLab: Draw = (P, tier) => {
  const h = hullAt(LEN[tier], BORE[tier]);
  if (tier === 3) {
    for (const x of [h.x + 12, h.x + h.w - 12]) mast(P, x, h.bottom, x, h.bottom + 14);
    P.part(() => P.dish(h.x + 12, h.bottom + 22, 9, 100, 0.42));
    P.part(() => P.dish(h.x + h.w - 12, h.bottom + 22, 9, 80, 0.42));
  }
  labHull(P, tier, FIELD.space, 11);
  if (tier === 3) {
    // The sunshield's layers of film, the coldest on top.
    for (let i = 0; i < 3; i++) P.part(() => P.poly([10, 40 - i * 2.5, 64, 33 - i * 2.5, 118, 40 - i * 2.5, 64, 47 - i * 2.5], { ramp: RAMPS.shield, dir: [1, 0.5], from: 0.3 - i * 0.14, to: 0.9 - i * 0.14 }));
    P.part(() => {
      // Eighteen hexagonal segments round the missing middle one.
      const s = 4.2;
      for (let q = -2; q <= 2; q++)
        for (let r = -2; r <= 2; r++) {
          if (Math.abs(q + r) > 2 || (q === 0 && r === 0)) continue;
          const hx = 64 + s * Math.sqrt(3) * (q + r / 2), hy = 18 + s * 1.5 * r;
          const pts: number[] = [];
          for (let i = 0; i < 6; i++) pts.push(hx + Math.cos(Math.PI / 6 + (i * Math.PI) / 3) * s * 1.04, hy + Math.sin(Math.PI / 6 + (i * Math.PI) / 3) * s * 1.04);
          P.poly(pts, RAMPS.gold[(((q - r) % 3) + 3) % 3]!);
        }
    });
    P.sparkle(53, 9, 6);
    P.part(() => P.light(120, 8, RAMPS.white[0]!), false);
    return;
  }
  const len = 30 + tier * 8, d = 13 + tier * 2, a = -Math.PI / 4, ux = Math.cos(a), uy = Math.sin(a);
  const bx = 48, by = h.top - 10, ex = bx + ux * len, ey = by + uy * len;
  const mx = bx + ux * len * 0.45, my = by + uy * len * 0.45;
  P.part(() => {
    P.box(bx - 10, h.top - 6, 20, 8, RAMPS.dark);
    P.pipe(bx, h.top - 2, bx, by, 6, RAMPS.dark);
  });
  P.part(() => P.pipe(mx + uy * (d / 2 + 6), my - ux * (d / 2 + 6), mx - uy * (d / 2 + 6), my + ux * (d / 2 + 6), 2, RAMPS.dark));
  P.part(() => {
    for (const s of [-1, 1]) {
      const cx = mx - uy * s * (d / 2 + 11), cy = my + ux * s * (d / 2 + 11);
      P.poly(
        [cx - ux * 9 + uy * 6, cy - uy * 9 - ux * 6, cx + ux * 9 + uy * 6, cy + uy * 9 - ux * 6, cx + ux * 9 - uy * 6, cy + uy * 9 + ux * 6, cx - ux * 9 - uy * 6, cy - uy * 9 + ux * 6],
        { ramp: RAMPS.solar, dir: [1, 1], from: 0.1, to: 0.75 },
      );
    }
  });
  P.part(() => {
    P.pipe(bx, by, ex, ey, d, RAMPS.white);
    P.pipe(bx - ux * 2, by - uy * 2, bx + ux * len * 0.34, by + uy * len * 0.34, d + 3, RAMPS.hull);
    P.pipe(bx + ux * len * 0.4, by + uy * len * 0.4, bx + ux * len * 0.46, by + uy * len * 0.46, d + 1, RAMPS.gold);
    P.ellipse(ex + ux * d * 0.12, ey + uy * d * 0.12, d * 0.36, d * 0.36, RAMPS.glass[5]!);
    P.ellipse(ex + ux * d * 0.12 - 1, ey + uy * d * 0.12 - 1, d * 0.14, d * 0.14, RAMPS.glass[2]!);
    // The aperture door, open.
    P.line(ex + uy * d * 0.5, ey - ux * d * 0.5, ex + uy * d * 0.5 + ux * 8, ey - ux * d * 0.5 + uy * 8, RAMPS.white[3]!, 2);
  });
  P.sparkle(bx + ux * len * 0.2 - 3, by + uy * len * 0.2 - 4, 4);
  P.part(() => {
    P.light(118, 6, RAMPS.white[0]!);
    P.light(122, 22, RAMPS.white[1]!);
  }, false);
};

/** An Earth-watching lab: a great spinning mesh reflector on a boom, a sensor pod scanning below; a research centre adds radar panels, an institute a second reflector and a lidar. */
const ClimateLab: Draw = (P, tier) => {
  const h = hullAt(LEN[tier], BORE[tier]);
  const reflector = (cx: number, cy: number, rx: number, ry: number, footX: number) => {
    P.part(() => {
      P.pipe(footX, h.top, cx - rx * 0.6, cy + ry * 0.4, 2.5, RAMPS.dark);
      P.pipe(footX + 8, h.top, cx + rx * 0.1, cy + ry * 0.8, 2, RAMPS.dark);
    });
    P.part(() =>
      P.shaded(cx, cy, rx, ry, (nx, ny, px, py) => {
        if (nx * nx + ny * ny > 0.8) return RAMPS.gold[1]!;
        if (P.medium && (Math.abs(nx) < 1.2 / (rx * P.k) || Math.abs(ny) < 1.2 / (ry * P.k) || Math.abs(Math.abs(nx) - 0.5) < 1 / (rx * P.k))) return RAMPS.gold[1]!;
        return (px + py) % 2 ? RAMPS.gold[nx + ny < -0.2 ? 2 : 3]! : RAMPS.gold[nx + ny < -0.2 ? 4 : 5]!;
      }),
    );
    P.sparkle(cx - rx * 0.55, cy - ry * 0.5, 4);
  };
  if (tier >= 2)
    for (const x of [6, 82]) {
      mast(P, x + 20, h.bottom - 2, x + 20, h.bottom + 10);
      P.part(() => {
        for (let i = 0; i < 4; i++) P.box(x + i * 10, h.bottom + 9, 9.5, 9, RAMPS.white, 0.15);
        P.fill(x, h.bottom + 13, 40, 1, RAMPS.gold[2]!);
      });
    }
  P.part(() => {
    P.sphere(64, h.bottom + 2, 12, 9, RAMPS.dark);
    P.ellipse(64, h.bottom + 7, 6, 2.5, GLOW.cyan);
  });
  labHull(P, tier, FIELD.climate, 12);
  if (tier === 3) {
    reflector(46, 19, 32, 12, h.x + 12);
    reflector(104, 20, 18, 8, h.x + h.w - 22);
  } else reflector(58, 20, 34 + tier * 2, 13, h.x + 14);
  P.part(() => {
    for (const dx of [-18, -6, 6, 18]) for (let y = h.bottom + 14; y < 124; y += 3) P.dot(64 + dx * ((y - h.bottom - 6) / 30), y, GLOW.cyan);
    if (tier === 3) P.line(64, h.bottom + 12, 64, 126, GLOW.green);
  }, false);
  P.glow(64, h.bottom + 7, 8, GLOW.cyan, 0.7);
};

// ---------------------------------------------------------------- power

/** Solar power on a keel: two round fans of cells, then four long blanket wings on gold masts, then six. */
const SolarCollector: Draw = (P, tier) => {
  keel(P);
  if (tier === 1) {
    P.part(() => P.pipe(64, 24, 64, 104, 3, RAMPS.gold));
    P.part(() => P.fan(64, 30, 26));
    P.part(() => P.fan(64, 98, 26));
  } else {
    // Wings as the ISS's: two blankets either side of a mast.
    const xs = tier === 2 ? [32, 96] : [22, 64, 106], bw = tier === 2 ? 17 : 12;
    for (const x of xs) {
      P.part(() => P.pipe(x, 6, x, 122, 2.5, RAMPS.gold));
      for (const y of [4, AXIS + 9]) {
        wing(P, x - bw - 2, y, bw, AXIS - 13, 2, 8);
        wing(P, x + 2, y, bw, AXIS - 13, 2, 8);
      }
    }
  }
  P.part(() => {
    P.box(54, AXIS - 10, 20, 20);
    P.stripe(54, AXIS - 6, 20, 4);
    P.windows(57, AXIS + 2, 3, 5, 3, 3, 2);
    P.light(64, AXIS - 12, GLOW.beacon);
  });
  P.sparkle(tier === 1 ? 52 : tier === 2 ? 22 : 14, tier === 1 ? 18 : 14, 5);
};

/** Mirrors on booms off a keel: a round spoked reflector, two square sails, then the four great sheets of a soletta. */
const SolarMirror: Draw = (P, tier) => {
  keel(P, 7);
  /** A round reflector of film wedges between spokes (a Znamya). */
  const disc = (cx: number, cy: number, rx: number, ry: number) =>
    P.part(() =>
      P.shaded(cx, cy, rx, ry, (nx, ny) => {
        const d = Math.hypot(nx, ny), a = Math.atan2(ny, nx) + Math.PI, g = Math.floor(a / (Math.PI / 6));
        if (d < 0.1) return RAMPS.dark[2]!;
        if (d > 0.94) return RAMPS.mirror[5]!;
        if (P.medium && Math.abs(a - Math.round(a / (Math.PI / 6)) * (Math.PI / 6)) * d * rx * P.k < 0.6) return RAMPS.mirror[4]!;
        return P.shade(RAMPS.mirror, Math.abs(nx - ny * 0.6 + 0.3) < 0.14 ? 0 : 0.3 + (nx + ny) * 0.2 + (g % 2 ? 0.16 : 0));
      }),
    );
  /** A square sail on diagonal booms (an IKAROS). */
  const sail = (cx: number, cy: number, rx: number, ry: number) =>
    P.part(() => {
      P.poly([cx, cy - ry, cx + rx, cy, cx, cy + ry, cx - rx, cy], { ramp: RAMPS.mirror, dir: [0.6, 1], from: 0.05, to: 0.75 });
      P.gloss(cx - rx, cy - ry, 2 * rx, 2 * ry, 0.7);
      if (P.medium) for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) P.line(cx + (sx * rx) / 2, cy, cx, cy + (sy * ry) / 2, RAMPS.mirror[4]!);
      P.line(cx - rx, cy, cx + rx, cy, RAMPS.mirror[5]!);
      P.line(cx, cy - ry, cx, cy + ry, RAMPS.mirror[5]!);
      P.fill(cx - 2.5, cy - 2.5, 5, 5, RAMPS.dark[2]!);
    });
  const sheet = (cx: number, cy: number, w: number, h: number) =>
    P.part(() => {
      P.poly([cx - w / 2, cy - h / 2 + 8, cx + w / 2, cy - h / 2, cx + w / 2 - 6, cy + h / 2 - 8, cx - w / 2 - 6, cy + h / 2], { ramp: RAMPS.mirror, dir: [0.8, 1], from: 0.05, to: 0.75 });
      P.gloss(cx - w / 2 - 6, cy - h / 2, w + 6, h, 0.7);
      if (P.medium)
        for (let i = 1; i < 4; i++) {
          const t = i / 4;
          P.line(cx - w / 2 + w * t, cy - h / 2 + 8 - 8 * t, cx - w / 2 - 6 + w * t, cy + h / 2 - 8 * t, RAMPS.mirror[5]!);
        }
    });
  if (tier === 1) {
    mast(P, 64, AXIS, 64, 36);
    disc(64, 31, 52, 26);
    P.sparkle(38, 18, 6);
  } else if (tier === 2) {
    P.part(() => P.pipe(64, 28, 64, 102, 3, RAMPS.dark));
    sail(64, 29, 56, 25);
    sail(64, 101, 46, 21);
    P.sparkle(44, 22, 6);
  } else {
    const sheets = [[36, 28, 52, 46], [94, 28, 52, 46], [36, 100, 52, 38], [94, 100, 52, 38]] as const;
    P.part(() => {
      for (const [cx, cy] of sheets) P.pipe(cx, AXIS, cx, cy, 3, RAMPS.dark);
    });
    for (const [cx, cy, w, hh] of sheets) sheet(cx, cy, w, hh);
    P.sparkle(26, 18, 6);
    P.sparkle(88, 92, 4);
  }
  P.part(() => {
    P.box(52, AXIS - 8, 24, 16);
    P.stripe(52, AXIS - 4, 24, 4);
    P.windows(56, AXIS + 2, 4, 5, 3, 3, 2);
  });
};

/** A space reactor standing on the keel (a SNAP-10A): a foil-wrapped core over its shadow shield, at the apex of a cone of radiator, glowing where the coolant comes in. */
function reactor(P: Painter, cx: number, base: number, s: number): void {
  const top = base - 40 * s;
  P.part(() => {
    P.poly([cx - 8 * s, top + 12 * s, cx + 8 * s, top + 12 * s, cx + 21 * s, base, cx - 21 * s, base], { ramp: RAMPS.white, dir: [1, 0], from: 0, to: 0.75 });
    if (P.medium) for (let i = -2; i <= 2; i++) P.line(cx + i * 3 * s, top + 13 * s, cx + i * 8 * s, base - 1, RAMPS.white[4]!);
    P.stripe(cx - 15 * s, base - 12 * s, 30 * s, 3 * s);
    P.hazard(cx - 17.5 * s, base - 6 * s, 35 * s, 3 * s);
  });
  P.part(() => {
    P.box(cx - 9.5 * s, top + 8.5 * s, 19 * s, 4.5 * s, RAMPS.dark);
    P.foil(cx - 6 * s, top, 12 * s, 9 * s);
    P.fill(cx - 6 * s, top, 12 * s, 1.5, RAMPS.gold[0]!);
  });
  P.glow(cx, top + 15 * s, 9 * s, GLOW.heat, 0.6);
}

/** Space reactors on a keel over glowing radiator panels: one, two, three. */
const FissionPile: Draw = (P, tier) => {
  keel(P);
  radiators(P, 12, 116, tier + 1, 40, 0.7);
  if (tier === 1) reactor(P, 64, AXIS - 3, 1.3);
  else if (tier === 2) for (const cx of [42, 86]) reactor(P, cx, AXIS - 3, 1.1);
  else {
    reactor(P, 26, AXIS - 3, 0.95);
    reactor(P, 102, AXIS - 3, 0.95);
    reactor(P, 64, AXIS - 3, 1.2);
  }
};

/** Armoured heavy reactors glowing blue through their ports, over a fan of radiator panels hot at the root. */
const HeavyFissionPile: Draw = (P, tier) => {
  keel(P);
  P.part(() => {
    P.poly([10, AXIS + 8, 118, AXIS + 8, 124, 120, 4, 120], { ramp: RAMPS.white, dir: [0, 1], from: 0.05, to: 0.55 });
    P.poly([10, AXIS + 8, 118, AXIS + 8, 119, AXIS + 14, 9, AXIS + 14], GLOW.heatHi);
    P.poly([9, AXIS + 14, 119, AXIS + 14, 120, AXIS + 22, 8, AXIS + 22], GLOW.heat);
    P.poly([8, AXIS + 22, 120, AXIS + 22, 121, AXIS + 30, 7, AXIS + 30], 0xf6c8a8);
  });
  P.part(() => {
    if (!P.medium) return;
    for (let x = 16; x < 118; x += 8) P.line(x, AXIS + 9, x + (x - 64) * 0.08, 119, RAMPS.white[4]!);
  }, false);
  const units = tier === 1 ? [64] : tier === 2 ? [46, 82] : [34, 64, 94];
  const w = tier === 1 ? 40 : tier === 2 ? 30 : 24;
  for (const cx of units)
    P.part(() => {
      P.vcyl(cx - w / 2, 6, w, AXIS - 2, RAMPS.dark, true);
      P.fill(cx - w / 2 + 4, 22, w - 8, 22, RAMPS.dark[5]!);
      P.fill(cx - w / 2 + 6, 24, w - 12, 18, GLOW.cyan);
      for (let x = cx - w / 2 + 8; x < cx + w / 2 - 7; x += 5) P.fill(x, 26, 2, 14, GLOW.cyanHi);
      P.hazard(cx - w / 2 + 2, 48, w - 4, 3);
      P.stripe(cx - w / 2 + 2, 54, w - 4, 4);
    });
  for (const cx of units) {
    P.glow(cx, 33, w * 0.6, GLOW.cyan, 0.5);
    P.sparkle(cx - w / 2 + 9, 27, 3, GLOW.cyanHi);
  }
};

/** A tokamak over a control module: gold field coils round a torus of pink plasma; a bigger torus, then two, over radiators. */
const FusionPile: Draw = (P, tier) => {
  keel(P);
  if (tier >= 2) radiators(P, 20, 108, tier + 1, 34, 0.5);
  const torus = (cx: number, A: number) => {
    P.part(() => P.torus(cx, 34, A, 18, 12, 10, "back"));
    P.part(() => P.ellipse(cx, 34, A - 16, 5, 0x3a1750), false);
    P.part(() => P.torus(cx, 34, A, 18, 12, 10, "front", RAMPS.hull, false));
    P.part(() => {
      for (const t of [-0.75, -0.25, 0.25, 0.75]) P.box(cx + t * (A - 6) - 2.5, 34 + Math.sqrt(1 - t * t) * 14 - 4, 5, 12, RAMPS.gold, 0.2);
    });
    P.part(() => {
      for (let a = Math.PI; a < Math.PI * 2; a += 0.04) {
        P.dot(cx + Math.cos(a) * (A - 7), 34 + Math.sin(a) * 12, GLOW.pinkHi);
        P.dot(cx + Math.cos(a) * (A - 7), 35 + Math.sin(a) * 12, GLOW.pink);
      }
    }, false);
    P.glow(cx, 28, A * 0.7, GLOW.pink, 0.4);
    P.sparkle(cx - (A - 7) * 0.7, 34 - 12 * 0.7, 4, GLOW.pinkHi);
  };
  pod(P, 40, AXIS - 10, 48, 20, { seed: 3, stripe: 0.72 });
  if (tier === 3) {
    torus(36, 30);
    torus(92, 30);
  } else torus(64, tier === 1 ? 36 : 46);
};

/** A laser fusion chamber (after the National Ignition Facility's): a sphere studded with beam ports, its beamlines braced to radiators above and below, a star at its heart: four beamlines, six, then a bigger chamber. */
const HeavyFusionPile: Draw = (P, tier) => {
  const r = tier === 3 ? 28 : 24;
  P.part(() => {
    P.radiator(8, 2, 112, 14, false, 5);
    P.radiator(8, 112, 112, 14, false, 5);
  });
  keel(P);
  const angles = tier === 1 ? [45, 135, 225, 315] : [45, 90, 135, 225, 270, 315];
  P.part(() => {
    for (const d of angles) {
      const a = (d * Math.PI) / 180;
      // Out to the radiators above and below.
      const reach = Math.min(64, Math.abs(46 / Math.sin(a)));
      P.pipe(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 64 + Math.cos(a) * reach, 64 + Math.sin(a) * reach, 6, RAMPS.white);
      P.box(64 + Math.cos(a) * (r + 8) - 4, 64 + Math.sin(a) * (r + 8) - 4, 8, 8, RAMPS.gold, 0.2);
    }
  });
  P.part(() => {
    P.sphere(64, 64, r, r, RAMPS.hull);
    P.stripe(64 - r + 3, 64 + r * 0.56, 2 * r - 14, 3);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.39;
      P.ellipse(64 + Math.cos(a) * r * 0.72, 64 + Math.sin(a) * r * 0.72, 3, 3, RAMPS.hull[5]!);
      P.ellipse(64 + Math.cos(a) * r * 0.72, 64 + Math.sin(a) * r * 0.72, 1.6, 1.6, RAMPS.red[2]!);
    }
    P.ellipse(64, 64, r * 0.42, r * 0.42, RAMPS.gold[3]!);
    P.ellipse(64, 64, r * 0.34, r * 0.34, 0x2a1a4a);
    P.ellipse(64, 64, r * 0.16, r * 0.16, GLOW.heatHi);
  });
  P.glow(64, 64, r * 0.5, GLOW.heat, 0.7);
  P.sparkle(64, 64, 9, 0xffffff);
};

// ---------------------------------------------------------------- exotic

/** Magnetic traps strung along the keel, glowing violet: three, four, five, and a collector boom at the top tier. */
const AntimatterTrap: Draw = (P, tier) => {
  const rings = tier + 2;
  keel(P, 8);
  if (tier === 3) {
    mast(P, 64, AXIS - 34, 64, 10);
    P.part(() => P.poly([40, 4, 88, 4, 76, 14, 52, 14], { ramp: RAMPS.mirror, dir: [0, 1] }));
  }
  P.part(() => {
    P.pipe(64, AXIS, 64, AXIS + 36, 4, RAMPS.dark);
    P.box(44, AXIS + 34, 40, 20);
    P.stripe(44, AXIS + 37, 40, 3);
    P.windows(48, AXIS + 44, 4, 8, 4, 4, 2);
    P.hazard(44, AXIS + 52, 40, 2);
  });
  const xs = Array.from({ length: rings }, (_, i) => 20 + (i * 88) / (rings - 1));
  for (const x of xs) {
    P.part(() =>
      P.shaded(x, AXIS, 10, 30, (nx, ny) => {
        const d = nx * nx + ny * ny;
        if (d < 0.42) return P.shade(PLASMA, 0.35 + d * 1.6);
        return nx < 0 ? P.shade(RAMPS.hull, 0.2 + ny * 0.2) : P.shade(RAMPS.hull, 0.6 + ny * 0.15);
      }),
    );
    P.part(() => {
      for (let y = AXIS - 26; y < AXIS + 26; y += 10) P.box(x - 10, y, 4, 5, RAMPS.gold, 0.2);
    });
  }
  P.part(() => {
    for (let x = 6; x < 122; x += 1) {
      P.dot(x, AXIS - 1, (x & 3) === 0 ? GLOW.violetHi : GLOW.violet);
      P.dot(x, AXIS, GLOW.violet);
    }
  }, false);
  for (const x of xs) P.glow(x, AXIS, 10, GLOW.violet, 0.7);
  P.sparkle(xs[1]!, AXIS, 6, GLOW.violetHi);
};

/** A collider ring round the keel with its detector at the centre, seen end on (red yoke, gold calorimeter, the beam at its heart): wider and taller at each tier. */
const ParticleCollider: Draw = (P, tier) => {
  const A = 46 + tier * 6, B = 22 + tier * 6;
  P.part(() => P.torus(64, AXIS, A, B, 9, 8, "back", RAMPS.hull, false));
  keel(P, 7);
  P.part(() => {
    P.box(42, AXIS + 14, 44, 8, RAMPS.dark);
    P.shaded(64, AXIS, 20, 20, (nx, ny) => {
      const d = Math.hypot(nx, ny), a = Math.atan2(ny, nx) + Math.PI, seg = (a / (Math.PI / 6)) % 1;
      const lit = (nx + ny) * 0.22;
      if (d < 0.14) return GLOW.cyanHi;
      if (d < 0.26) return RAMPS.dark[5]!;
      if (d < 0.48) return P.shade(RAMPS.gold, 0.3 + lit);
      if (d < 0.58) return P.shade(RAMPS.white, 0.3 + lit);
      if (d < 0.64 || seg < 0.1 || seg > 0.9) return RAMPS.dark[4]!;
      return P.shade(RAMPS.red, 0.4 + lit + (d > 0.84 ? 0.15 : 0));
    });
  });
  P.glow(64, AXIS, 7, GLOW.cyanHi, 0.9);
  P.part(() => P.torus(64, AXIS, A, B, 9, 8, "front", RAMPS.hull, false));
  P.part(() => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (Math.abs(Math.cos(a)) > 0.95) continue;
      const x = 64 + Math.cos(a) * (A - 4.5), y = AXIS + Math.sin(a) * (B - 3);
      P.box(x - 3.5, y - 3, 7, 6 + (Math.sin(a) > 0 ? 6 : 0), i % 2 ? RAMPS.gold : RAMPS.solar, 0.2);
    }
  });
  P.part(() => {
    for (let a = 0; a < Math.PI * 2; a += 0.04) P.dot(64 + Math.cos(a) * (A - 4.5), AXIS - 1 + Math.sin(a) * (B - 3), GLOW.cyan);
  }, false);
  P.sparkle(64, AXIS, 6, GLOW.cyanHi);
};

/** A gas scoop on the axis: a ramscoop intake, a processing hull, fins. */
const Helium3Mine: Draw = (P, tier) => {
  berths(P, 6, 110, 12);
  P.part(() => {
    P.poly([96, AXIS - 20, 114, AXIS - 46, 120, AXIS - 46, 112, AXIS - 16], { ramp: RAMPS.hull, dir: [1, 0] });
    P.poly([96, AXIS + 20, 114, AXIS + 46, 120, AXIS + 46, 112, AXIS + 16], { ramp: RAMPS.dark, dir: [1, 0] });
  });
  P.part(() => {
    P.poly([26, AXIS - 24, 104, AXIS - 18, 118, AXIS - 4, 118, AXIS + 4, 104, AXIS + 18, 26, AXIS + 24], { ramp: RAMPS.hull, dir: [0, 1], from: 0.05, to: 0.75 });
    P.seams(32, AXIS - 18, 70, 36, 12);
    P.windows(64, AXIS - 12, 5, 7, 4, 4, 3);
    P.stripe(38, AXIS + 6, 60, 5);
  });
  if (tier >= 2) P.part(() => P.hcyl(40, AXIS + 20, 50, 14, RAMPS.gold));
  P.part(() => {
    P.poly([4, AXIS - 40, 30, AXIS - 24, 30, AXIS + 24, 4, AXIS + 40], { ramp: RAMPS.dark, dir: [1, 0.3], from: 0.15, to: 0.8 });
    P.poly([6, AXIS - 30, 26, AXIS - 18, 26, AXIS + 18, 6, AXIS + 30], RAMPS.dark[5]!);
  });
  P.glow(6, AXIS, 22, GLOW.heat, 0.7);
  P.sparkle(10, AXIS, 6, GLOW.heatHi);
};

/** A base's mining rig on the ground: a derrick, a conveyor up to ore hoppers, a pressurised control hut. */
const OutpostMiningComplex: Draw = (P, tier) => {
  const top = tier === 1 ? 14 : 6;
  P.part(() => {
    P.box(4, 104, 120, 18);
    P.stripe(4, 108, 120, 4);
    P.windows(10, 115, 14, 8, 4, 3, 5);
  });
  if (tier >= 2)
    P.part(() => {
      P.truss(46, 30, 124, 30, 7, RAMPS.dark);
      P.box(112, 24, 12, 12, RAMPS.gold);
    });
  P.part(() => {
    P.pipe(10, 104, 22, top, 3, RAMPS.gold);
    P.pipe(38, 104, 26, top, 3, RAMPS.gold);
    for (let y = top + 10; y < 100; y += 12) {
      const t = (y - top) / (104 - top);
      P.line(22 - t * 12, y, 26 + t * 12, y, RAMPS.gold[3]!, 1.5);
      P.line(22 - t * 12, y, 26 + (t + 0.11) * 12, y + 12, RAMPS.gold[4]!, 1);
    }
    P.box(18, top - 4, 12, 6, RAMPS.dark);
  });
  P.part(() => {
    P.pipe(24, top, 24, 112, 2.5, RAMPS.hull);
    P.box(20, 84, 8, 10, RAMPS.red);
    P.light(24, top - 6, GLOW.beacon);
  });
  P.part(() => P.truss(36, 96, 80, 44, 7, RAMPS.dark));
  P.part(() => {
    for (let i = 0; i < 5; i++) P.ellipse(42 + i * 9, 87 - i * 10.5, 2.5, 1.8, RAMPS.ore[1]!);
  }, false);
  const hopper = (x: number, y: number, s: number) => {
    P.part(() => {
      P.poly([x, y, x + 34 * s, y, x + 22 * s, y + 24 * s, x + 12 * s, y + 24 * s], { ramp: RAMPS.hull, dir: [1, 0], from: 0.1, to: 0.7 });
      P.hazard(x + 2 * s, y + 2, 30 * s, 3);
      P.box(x + 12 * s, y + 24 * s, 10 * s, 6, RAMPS.dark);
      P.pipe(x + 4 * s, y + 10, x + 4 * s, 104, 3, RAMPS.dark);
      P.pipe(x + 30 * s, y + 10, x + 30 * s, 104, 3, RAMPS.dark);
    });
    P.part(() => {
      P.shaded(x + 17 * s, y, 16 * s, 6 * s, (nx, ny) => (ny > 0.2 ? -1 : P.shade(RAMPS.ore, 0.3 + nx * 0.3 + ny * 0.2)));
    });
  };
  hopper(76, 44, 1);
  if (tier === 3) hopper(100, 62, 0.65);
  P.part(() => {
    P.box(48, 72, 24, 32);
    P.windows(52, 78, 3, 6, 3, 3, 4);
    P.vcyl(52, 58, 8, 14, RAMPS.dark);
    P.hazard(48, 98, 24, 3);
    P.ladder(66, 82, 16);
  });
};

// ---------------------------------------------------------------- living and services

/** Crew quarters: a stepped service module with portholes and its own solar wings (a Zvezda); a residential module is a fat inflatable with a crew capsule docked, a civilian complex turns a habitat ring round its hull. */
const Quarters: Draw = (P, tier) => {
  if (tier === 1) {
    const h = hullAt(LEN[1] + 16, BORE[1] + 4);
    const wx = h.x + h.w * 0.7;
    mast(P, wx, AXIS - 36, wx, AXIS + 36, 2.5);
    wing(P, wx - 10, 10, 20, 32, 2, 6);
    wing(P, wx - 10, 86, 20, 32, 2, 6);
    hull(P, h, { form: "stepped", seed: 2, rows: 2 });
    P.part(() => P.greebles(h.x + 10, h.top - 5, h.w * 0.4, 6, 7));
    return;
  }
  if (tier === 2) {
    const h = hullAt(LEN[2] + 14, BORE[2] + 16);
    capsule(P, 44, h.top + 4);
    riser(P, 80, h.bottom - 3, 26, 22, { seed: 14, down: true });
    hull(P, h, { form: "soft", ramp: RAMPS.white, seed: 2, rows: 2, stripe: 0.92 });
    return;
  }
  const h = hullAt(LEN[3] + 8, BORE[3] + 4);
  P.part(() => P.torus(64, AXIS, 56, 22, 8, 6, "back"));
  P.part(() => {
    for (const y of [AXIS - 22, AXIS + 22]) P.pipe(64, AXIS, 64, y, 4, RAMPS.dark);
  });
  hull(P, h, { seed: 2, rows: 3, stripe: 0.86 });
  P.part(() => P.greebles(h.x + 20, h.top - 6, h.w - 40, 6, 7));
  P.part(() => P.torus(64, AXIS, 56, 22, 8, 6, "front"));
  P.sparkle(22, AXIS + 12, 4);
};

/** Plants under magenta grow lights: a greenhouse window along the hull; a farm adds a garden dome, an agriculture complex glass tubes of crops above and below. */
const HydroponicsBay: Draw = (P, tier) => {
  const h = hullAt(LEN[tier] + 6, BORE[tier] + 4);
  const crops = (x: number, y: number, w: number, hh: number) =>
    P.part(() => {
      for (let i = 0; i < w - 6; i += 4) {
        const px = x + 3 + i, ph = hh * (0.45 + ((i * 37) % 13) / 30);
        P.fill(px - 0.5, y + hh - ph, 1.5, ph, RAMPS.green[4]!);
        P.ellipse(px, y + hh - ph + 2, 2.5, 3, i % 8 ? RAMPS.green[2]! : RAMPS.green[1]!);
        if (P.medium) P.dot(px - 1, y + hh - ph, RAMPS.green[0]!);
        if (P.medium && i % 12 === 8) P.dot(px + 1, y + hh - ph + 3, RAMPS.red[1]!);
      }
      P.fill(x + 1, y + hh - 2, w - 2, 2, 0x6c4a52);
      for (let gx = x + 4; gx < x + w - 7; gx += 10) P.fill(gx, y + 1, 6, 1.5, GLOW.pinkHi);
    }, false);
  const tube = (y: number, w: number, d: number) => {
    P.part(() => {
      P.hcyl(64 - w / 2, y, w, d, RAMPS.glass);
      P.fill(64 - w / 2 + 6, y + 3, w - 12, d - 6, 0x6a2a8a);
      P.gloss(64 - w / 2, y, w, d, 0.3);
    });
    crops(64 - w / 2 + 6, y + 3, w - 12, d - 6);
  };
  if (tier === 3) {
    P.part(() => {
      for (const x of [40, 88]) P.pipe(x, 18, x, 110, 3, RAMPS.dark);
    });
    tube(6, 92, 22);
    tube(100, 92, 22);
  }
  hull(P, h, { seed: 4, windows: false, stripe: 0.88 });
  const gx = h.x + 12, gw = h.w * 0.78 - 16;
  P.part(() => {
    P.fill(gx - 1, AXIS - h.d * 0.3 - 1, gw + 2, h.d * 0.6 + 2, RAMPS.hull[5]!);
    P.fill(gx, AXIS - h.d * 0.3, gw, h.d * 0.6, 0x6a2a8a);
    P.fill(gx, AXIS - h.d * 0.3, gw, h.d * 0.2, 0x9a3aa8);
  });
  crops(gx, AXIS - h.d * 0.3, gw, h.d * 0.6);
  P.glow(gx + gw / 2, AXIS - h.d * 0.2, gw * 0.45, GLOW.pink, 0.3);
  if (tier === 2) {
    P.part(() => {
      P.sphere(64, h.top + 2, 28, 22, RAMPS.glass, h.top + 2);
      P.gloss(36, h.top - 20, 56, 22, 0.45);
    });
    crops(40, h.top - 18, 48, 18);
    P.sparkle(50, h.top - 12, 4);
  }
};

/** A white hospital hull with a red cross and an ambulance capsule docked; a geriatrics facility adds a care block on top and a garden module below. */
const OrbitalHospital: Draw = (P, tier) => {
  const h = hullAt(LEN[tier] + 14, BORE[tier] + 8);
  const cross = (cx: number, cy: number, s: number) =>
    P.part(() => {
      P.fill(cx - s * 1.5, cy - s * 0.5, s * 3, s, RAMPS.red[2]!);
      P.fill(cx - s * 0.5, cy - s * 1.5, s, s * 3, RAMPS.red[2]!);
      P.fill(cx - s * 1.5, cy - s * 0.5, s * 3, 1.5, RAMPS.red[1]!);
      P.fill(cx - s * 0.5, cy - s * 1.5, s, 1.5, RAMPS.red[1]!);
    });
  if (tier === 3) {
    riser(P, 40, 10, h.top - 8, 26, { seed: 8, ramp: RAMPS.white, band: RAMPS.red });
    riser(P, 88, h.bottom - 2, 28, 24, { seed: 9, ramp: RAMPS.white, band: RAMPS.green, down: true });
  }
  capsule(P, tier === 3 ? 86 : 36, h.top + 3, true, 0.9);
  hull(P, h, { seed: 3, rows: 2, ramp: RAMPS.white, stripe: 0.88 });
  P.part(() => P.ellipse(64, AXIS, 15, 15, RAMPS.white[0]!));
  cross(64, AXIS, 8);
  if (tier === 3) cross(40, 26, 4);
  P.part(() => P.antenna(h.x + h.w - 18, h.top + 1, 14, 2));
  P.part(() => {
    P.light(h.x + 8, h.top + 2, GLOW.beacon);
    P.light(h.x + 14, h.top + 1, GLOW.cyan);
  }, false);
};

/** A lounge of panorama windows under neon, a cupola on top and the guests' capsule docked below; a hotel adds an observation dome, a resort a great glass sphere. */
const TouristBerth: Draw = (P, tier) => {
  const h = hullAt(LEN[tier] + 18, BORE[tier] + 14);
  if (tier === 3) {
    P.part(() => P.box(56, h.top - 10, 16, 12, RAMPS.dark));
    P.part(() => {
      P.sphere(64, h.top - 26, 26, 22, RAMPS.glass);
      P.gloss(38, h.top - 48, 52, 44, 0.4);
    });
    P.part(() => {
      P.ellipse(64, h.top - 18, 18, 4, RAMPS.green[2]!);
      P.fill(50, h.top - 30, 28, 2, RAMPS.hull[2]!);
      P.windows(52, h.top - 36, 5, 5, 2.5, 2.5, 7, 0.9);
      P.ellipse(52, h.top - 21, 3, 4, RAMPS.green[1]!);
      P.ellipse(77, h.top - 21, 3, 4, RAMPS.green[1]!);
    }, false);
    P.sparkle(50, h.top - 38, 6);
  }
  capsule(P, h.x + h.w - 24, h.bottom - 3, false, 0.85);
  hull(P, h, { seed: 9, windows: false, stripe: -1 });
  const x = h.x + 14, w = h.w - 28, y = AXIS - h.d * 0.3, hh = h.d * 0.55;
  P.part(() => {
    P.fill(x - 1, y - 1, w + 2, hh + 2, RAMPS.dark[4]!);
    P.fill(x, y, w, hh, 0x2c2a78);
    P.fill(x, y + hh * 0.3, w, hh * 0.25, 0x6a3a9c);
    P.fill(x, y + hh * 0.55, w, hh * 0.45, 0xf2c878);
    P.fill(x, y + hh * 0.55, w, 2, 0xfff4cc);
    for (let i = x + 8; i < x + w - 12; i += 18) {
      P.fill(i, y + hh * 0.6, 8, 5, RAMPS.red[2]!);
      P.ellipse(i + 12, y + hh * 0.45, 3, 4, RAMPS.green[2]!);
      P.fill(i + 11.5, y + hh * 0.5, 1, 6, RAMPS.green[4]!);
    }
    for (let i = x; i < x + w; i += 14) P.fill(i, y, 1.5, hh, RAMPS.hull[3]!);
    P.gloss(x, y, w, hh * 0.55, 0.35);
    P.stripe(h.x + 10, AXIS + h.d * 0.32, h.w - 20, 3);
  });
  P.part(() => {
    // Neon along the lounge's brow.
    for (let i = 0; i < w - 3; i += 6) P.fill(x + i, y - 5, 4, 2, (i / 6) % 2 ? GLOW.cyan : GLOW.pink);
  }, false);
  P.glow(64, y - 4, w * 0.5, GLOW.pink, 0.25);
  if (tier === 1) cupola(P, 44, h.top + 3, 15);
  if (tier === 2) {
    P.part(() => {
      P.sphere(64, h.top + 2, 22, 16, RAMPS.glass, h.top + 2);
      P.gloss(42, h.top - 14, 44, 16, 0.45);
    });
    P.part(() => {
      P.ellipse(58, h.top - 2, 3, 4, RAMPS.green[1]!);
      P.ellipse(72, h.top - 3, 4, 5, RAMPS.green[2]!);
    }, false);
    P.sparkle(54, h.top - 9, 4);
  }
  P.part(() => {
    P.light(h.x + 6, AXIS, GLOW.beacon);
    P.light(h.x + h.w - 7, AXIS, GLOW.beacon);
  }, false);
};

/** A broadcast mast of dishes over the hull; a communications hub adds dishes hanging below, a media centre a big screen. */
const BroadcastOutlet: Draw = (P, tier) => {
  const h = hullAt(LEN[tier] + 10, BORE[tier]);
  const dishes: [number, number, number, number, number, number][] = [
    [40, 20, 12, -150, 64, 26],
    [88, 20, 12, -30, 64, 26],
  ];
  if (tier >= 2) dishes.push([30, h.bottom + 22, 11, 150, 30, h.bottom], [98, h.bottom + 22, 11, 30, 98, h.bottom]);
  if (tier === 3) dishes.push([64, 10, 9, -90, 64, 16]);
  P.part(() => {
    P.truss(64, h.top, 64, 12, 6);
    P.line(52, 30, 76, 30, RAMPS.dark[2]!, 2);
    for (const [x, y, , , ax, ay] of dishes) P.pipe(ax, ay, x, y, 2.5, RAMPS.dark);
  });
  for (const [x, y, r, a] of dishes) P.part(() => P.dish(x, y, r, a, 0.42));
  hull(P, h, { seed: 6, rows: 1 });
  if (tier === 3)
    P.part(() => {
      P.box(h.x + 12, AXIS - 9, 30, 18, RAMPS.dark);
      P.fill(h.x + 14, AXIS - 7, 26, 14, 0x16306a);
      P.fill(h.x + 16, AXIS - 5, 10, 10, P.faction[1]!);
      P.fill(h.x + 28, AXIS - 4, 10, 2, GLOW.window);
      P.fill(h.x + 28, AXIS, 8, 2, GLOW.cyan);
      P.fill(h.x + 28, AXIS + 3, 5, 1.5, GLOW.pink);
    });
  P.part(() => {
    // The signal going out, in arcs.
    for (const [x, y, , a] of dishes) {
      const fx = Math.cos((a * Math.PI) / 180), fy = Math.sin((a * Math.PI) / 180);
      for (let i = 1; i <= 2; i++) for (const t of [-0.5, 0, 0.5]) P.dot(x + fx * (9 + i * 6) - fy * t * (3 + i * 3) - fx * Math.abs(t) * 2, y + fy * (9 + i * 6) + fx * t * (3 + i * 3) - fy * Math.abs(t) * 2, GLOW.cyan);
    }
  }, false);
  P.part(() => P.light(64, 9, GLOW.beacon), false);
};

/** A great gold mesh dish on the hull; a reconnaissance array adds a row of small dishes below, Argus a second great dish and an antenna lattice. */
const ListeningPost: Draw = (P, tier) => {
  const h = hullAt(LEN[tier], BORE[tier]);
  if (tier >= 2) {
    const n = tier === 2 ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const x = h.x + 10 + (i * (h.w - 20)) / (n - 1);
      mast(P, x, h.bottom, x, h.bottom + 12);
      P.part(() => P.dish(x, h.bottom + 20, 7, 90, 0.42));
    }
  }
  if (tier === 3)
    P.part(() => {
      for (const x of [h.x + 6, h.x + h.w - 6]) {
        P.line(x, h.top, x, 8, RAMPS.dark[1]!, 1.2);
        for (let y = 12; y < h.top; y += 6) P.line(x - 4, y, x + 4, y, RAMPS.dark[2]!);
      }
    });
  hull(P, h, { ramp: RAMPS.dark, seed: 8, stripe: 0.84 });
  const big = (cx: number, r: number, a: number) => {
    P.part(() => {
      P.box(cx - 8, h.top - 6, 16, 8, RAMPS.dark);
      P.pipe(cx, h.top - 4, cx, h.top - 12, 6, RAMPS.dark);
    });
    P.part(() => P.dish(cx, h.top - 12 - r * 0.6, r, a, 0.4, RAMPS.gold, true));
  };
  if (tier === 3) {
    big(44, 24, -60);
    big(92, 18, -110);
  } else big(64, 26 + tier * 4, -70);
  P.sparkle(tier === 3 ? 30 : 46, tier === 3 ? 14 : 16, 4);
};

/** Armoured troop quarters with a boarding hatch; a company docks drop pods below, a battalion a second hull above. */
const MarinePlatoonBarracks: Draw = (P, tier) => {
  const h = hullAt(LEN[tier] + 8, BORE[tier] + 4);
  if (tier >= 2)
    for (let i = 0; i < tier; i++) {
      const cx = h.x + 16 + (i * (h.w - 32)) / Math.max(1, tier - 1);
      P.part(() => {
        P.box(cx - 3, h.bottom - 2, 6, 8, RAMPS.dark);
        P.poly([cx - 8, h.bottom + 6, cx + 8, h.bottom + 6, cx + 6, h.bottom + 22, cx - 6, h.bottom + 22], { ramp: RAMPS.armor, dir: [1, 0.2] });
        P.fill(cx - 4, h.bottom + 22, 8, 3, RAMPS.dark[3]!);
        P.stripe(cx - 7, h.bottom + 10, 14, 2);
      });
    }
  if (tier === 3) {
    P.part(() => {
      for (const x of [h.x + 20, h.x + h.w - 20]) P.pipe(x, h.top, x, h.top - 12, 5, RAMPS.dark);
    });
    pod(P, h.x + 6, 8, h.w - 12, 22, { ramp: RAMPS.armor, seed: 21, stripe: 0.2 });
  }
  hull(P, h, { ramp: RAMPS.armor, seed: 5, windows: false, stripe: 0.14 });
  P.part(() => {
    for (let i = 0; i < Math.floor((h.w - 44) / 14); i++) P.box(h.x + 28 + i * 14, AXIS - h.d * 0.32, 12, h.d * 0.3, RAMPS.armor, 0.15);
    for (let i = 0; i < Math.floor((h.w - 44) / 14); i++) P.fill(h.x + 30 + i * 14, AXIS - h.d * 0.32 + 3, 8, 2, GLOW.window);
    P.hazard(h.x + 28, AXIS + h.d * 0.2, h.w - 48, 3);
  });
  P.part(() => P.hatch(h.x + h.w - 30, AXIS - 6, 14, 14));
};

/** Close-in guns on an armoured hull (Phalanx mounts: a white radome over a rotary cannon); a layered array adds a laser turret, battlestations a third mount and a fire-control radar. */
const PointDefenseArray: Draw = (P, tier) => {
  const h = hullAt(LEN[tier], BORE[tier]);
  hull(P, h, { ramp: RAMPS.armor, seed: 4, windows: false, stripe: 0.5 });
  const gun = (cx: number, base: number, s: number) => {
    P.part(() => {
      P.pipe(cx + 4 * s, base - 13 * s, cx + 30 * s, base - 33 * s, 5 * s, RAMPS.dark);
      P.pipe(cx + 10 * s, base - 17.5 * s, cx + 16 * s, base - 22 * s, 7 * s, RAMPS.dark);
    });
    P.part(() => {
      P.box(cx - 13 * s, base - 5 * s, 26 * s, 7 * s, RAMPS.dark);
      P.box(cx - 9 * s, base - 17 * s, 18 * s, 13 * s, RAMPS.armor);
    });
    P.part(() => {
      P.vcyl(cx - 9 * s, base - 36 * s, 14 * s, 22 * s, RAMPS.white, false);
      P.sphere(cx - 2 * s, base - 33 * s, 7 * s, 8 * s, RAMPS.white, base - 32 * s);
      P.stripe(cx - 8.5 * s, base - 20 * s, 13 * s, 2.5 * s);
    });
    P.glow(cx + 31 * s, base - 34 * s, 5 * s, GLOW.heat, 0.8);
    P.sparkle(cx + 31 * s, base - 34 * s, 3, GLOW.heatHi);
  };
  const laser = (cx: number, base: number, s: number) => {
    P.part(() => {
      P.box(cx - 12 * s, base - 5 * s, 24 * s, 7 * s, RAMPS.dark);
      P.sphere(cx, base - 15 * s, 12 * s, 12 * s, RAMPS.armor);
      P.ellipse(cx + 4 * s, base - 19 * s, 5.5 * s, 5.5 * s, RAMPS.dark[4]!);
      P.ellipse(cx + 4 * s, base - 19 * s, 3.6 * s, 3.6 * s, GLOW.cyan);
    });
    P.part(() => P.line(cx + 7 * s, base - 22 * s, cx + 7 * s + 60, base - 22 * s - 60, GLOW.cyanHi), false);
    P.glow(cx + 4 * s, base - 19 * s, 8 * s, GLOW.cyan, 0.8);
    P.sparkle(cx + 4 * s, base - 19 * s, 4, GLOW.cyanHi);
  };
  const base = h.top + 2;
  if (tier === 1) gun(56, base, 1.1);
  else if (tier === 2) {
    gun(h.x + 20, base, 0.9);
    laser(h.x + h.w - 24, base, 0.9);
  } else {
    gun(h.x + 14, base, 0.8);
    laser(60, base, 0.8);
    gun(h.x + h.w - 28, base, 0.8);
  }
  if (tier === 3) {
    mast(P, 64, h.bottom, 64, h.bottom + 12);
    P.part(() => {
      P.box(48, h.bottom + 12, 32, 8, RAMPS.dark);
      for (let x = 50; x < 78; x += 4) P.fill(x, h.bottom + 14, 2, 4, GLOW.green);
    });
  }
};

/** An open truss dock along the axis with a ship in its cradle: a shuttle, a frigate, then a cruiser with a tender. */
const SpaceDock: Draw = (P, tier) => {
  P.part(() => {
    P.truss(4, 16, 124, 16, 9);
    P.truss(4, 112, 124, 112, 9);
    P.truss(8, 16, 8, 112, 9);
    P.truss(120, 16, 120, 112, 9);
  });
  P.part(() => {
    P.box(1, AXIS - 8, 4, 16, RAMPS.gold, 0.15);
    P.box(123, AXIS - 8, 4, 16, RAMPS.gold, 0.15);
  });
  P.part(() => {
    for (const x of [44, 84]) P.truss(x, 20, x, 108, 6);
    P.ladder(51, 24, 80);
  }, true);
  const ship = (x: number, cy: number, l: number, hh: number, engines: number) => {
    P.part(() => {
      P.poly([x + 4, cy - hh / 2, x + 20, cy - hh / 2 - 7, x + 26, cy - hh / 2 - 7, x + 30, cy - hh / 2], { ramp: RAMPS.hull, dir: [1, 0] });
      P.poly([x, cy - hh / 2 + 2, x + l - 18, cy - hh / 2, x + l, cy, x + l - 18, cy + hh / 2, x, cy + hh / 2 - 2], { ramp: RAMPS.hull, dir: [0, 1], from: 0.05, to: 0.75 });
      for (let i = 0; i < engines; i++) P.box(x - 6, cy - hh / 2 + 3 + (i * (hh - 6)) / engines, 7, (hh - 6) / engines - 1, RAMPS.dark);
      P.seams(x + 6, cy - hh / 2 + 2, l - 26, hh - 4, 10);
      P.windows(x + 12, cy - hh * 0.2, Math.floor((l - 40) / 7), 7, 3.5, 4, 6);
      P.poly([x + l - 20, cy - hh * 0.3, x + l - 12, cy - hh * 0.12, x + l - 20, cy - hh * 0.02], RAMPS.glass[1]!);
      P.stripe(x + 8, cy + hh * 0.12, l - 30, 4);
    });
    P.part(() => {
      for (let i = 0; i < engines; i++) P.fill(x - 8, cy - hh / 2 + 4 + (i * (hh - 6)) / engines, 2, (hh - 6) / engines - 3, GLOW.cyan);
    }, false);
    P.glow(x - 8, cy, hh * 0.4, GLOW.cyan, 0.4);
  };
  if (tier === 1) ship(32, AXIS, 64, 26, 1);
  else if (tier === 2) ship(24, AXIS, 90, 34, 2);
  else {
    ship(22, AXIS + 10, 96, 38, 3);
    ship(72, 34, 40, 14, 1);
  }
  P.part(() => {
    for (const x of [44, 84]) {
      P.pipe(x, 22, x, AXIS - 18, 3, RAMPS.gold);
      P.pipe(x, 106, x, AXIS + 18, 3, RAMPS.gold);
    }
  });
  P.part(() => {
    for (const [x, y] of [[4, 12], [124, 12], [4, 116], [124, 116], [64, 12], [64, 116]] as const) P.light(x, y, GLOW.beacon);
  }, false);
  P.sparkle(tier === 1 ? 86 : 104, AXIS - (tier === 3 ? -4 : 4), 4, GLOW.heatHi);
};

/** A depot on the keel: a water sphere above and a foil-wrapped propellant sphere below, cargo containers clamped alongside. */
const SupplyDepot: Draw = (P) => {
  keel(P);
  P.part(() => {
    for (const x of [34, 92]) {
      P.pipe(x, AXIS, x, 30, 3, RAMPS.dark);
      P.pipe(x, AXIS, x, 98, 3, RAMPS.dark);
    }
  });
  for (const [x, y, ramp] of [[34, 30, RAMPS.hull], [34, 98, RAMPS.gold]] as const) {
    P.part(() => P.sphere(x, y, 22, 22, ramp));
    P.part(() => P.stripe(x - 20, y - 2, 40, 4), false);
  }
  P.part(() => {
    P.box(72, 22, 40, 18, RAMPS.red);
    P.box(80, 6, 28, 16, RAMPS.solar);
    P.box(72, 88, 40, 18);
    P.fill(74, 26, 36, 3, RAMPS.white[1]!);
    P.fill(82, 10, 24, 3, RAMPS.white[1]!);
    P.hazard(72, 102, 40, 3);
    P.seams(74, 92, 36, 10, 8);
    P.seams(74, 30, 36, 8, 8, RAMPS.red[4]!);
  });
  P.part(() => P.light(34, 6, GLOW.beacon), false);
  P.sparkle(24, 20, 5);
  P.sparkle(26, 88, 4, GLOW.heatHi);
};

const LINES: Record<string, Draw> = {
  OutpostCore,
  PlatformCore,
  AdministrationNode,
  OperationsCenter,
  ConstructionModule,
  SkunkWorks,
  ResearchCampus,
  EnergyLab,
  InformationScienceLab,
  LifeScienceLab,
  MaterialsLab,
  MilitaryScienceLab,
  SocialScienceLab,
  SpaceScienceLab,
  ClimateLab,
  SolarCollector,
  SolarMirror,
  FissionPile,
  HeavyFissionPile,
  FusionPile,
  HeavyFusionPile,
  AntimatterTrap,
  ParticleCollider,
  "Helium-3Mine": Helium3Mine,
  OutpostMiningComplex,
  Quarters,
  HydroponicsBay,
  OrbitalHospital,
  TouristBerth,
  BroadcastOutlet,
  ListeningPost,
  MarinePlatoonBarracks,
  PointDefenseArray,
  SpaceDock,
  SupplyDepot,
};

const MODULES = new Map(baseContent.habModules.map((m) => [m.id, m]));

/** Automated modules whose crewed line isn't their id without "Automated". */
const AUTOMATED_LINES: Record<string, string> = { AutomatedMiningComplex: "OutpostMiningComplex" };

/** A module's line: the first module down its upgradesFrom chain; automated modules belong to the crewed line. */
export function moduleLine(moduleId: string): string {
  let def = MODULES.get(moduleId);
  if (!def) throw new Error(`Unknown hab module "${moduleId}"`);
  while (def.upgradesFrom) {
    const from = MODULES.get(def.upgradesFrom);
    if (!from) throw new Error(`Hab module "${def.id}" upgrades from unknown "${def.upgradesFrom}"`);
    def = from;
  }
  const line = def.id.startsWith("Automated") ? (AUTOMATED_LINES[def.id] ?? def.id.slice("Automated".length)) : def.id;
  if (!LINES[line]) throw new Error(`No art for hab module line "${line}"`);
  return line;
}

/** A module's picture as RGBA pixels, `size` square: its line's structure at its tier, its badges on top. */
export function paintModule(moduleId: string, factionColor: string, size: 32 | 64 | 128): Uint8ClampedArray<ArrayBuffer> {
  const def = MODULES.get(moduleId);
  const draw = LINES[moduleLine(moduleId)];
  if (!def || !draw) throw new Error(`Unknown hab module "${moduleId}"`);
  const P = new Painter(size, factionColor);
  draw(P, def.tier);
  badges(P, def);
  return P.finish();
}
