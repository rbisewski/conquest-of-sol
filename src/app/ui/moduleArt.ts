// The hab modules' structures in pixel art (decision D18), drawn with pixelKit's painter in a
// 128-unit design space: one draw function per line of modules. Every module is built the same
// way, as station modules are: it lies along the cell's horizontal axis (AXIS), its pressurised
// hulls one diameter per tier, and a berthing adapter runs from each end out to the cell's edge
// on the axis, ending in a gold collar, so neighbouring modules and the hab's corridors meet it.
// Structures that aren't pressurised (solar arrays, reactors, colliders) hang off a truss keel
// along the same axis. Equipment mounts above and below. The hull's finish tells the module's
// role: white for command and habitation, beige thermal blankets with a band in the field's
// colour for labs, dark plate for industry and armour for the military. A tier changes the
// build (a bigger hull, then modules docked upright onto it, rings, more equipment), so each
// upgrade looks its own. The ground-only base modules (the outpost core, the mining rig) keep
// their legs. The faction's colour goes on stripes, markings and flags. Each module shows its tier
// as gold pips in the bottom-right corner, and automated modules a cyan light in the top-left one.

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
  materials: factionRamp("#e8803a"),
  military: factionRamp("#d84a3a"),
  social: factionRamp("#b070e0"),
  space: factionRamp("#7a6af0"),
  climate: factionRamp("#30b8a0"),
};

const PLASMA: Ramp = [GLOW.violetHi, GLOW.violet, 0x8a5cc8, 0x5a3a8a, 0x35214f];
const ENERGY: Ramp = [GLOW.cyanHi, GLOW.cyan, 0x5fc2cc, 0x3e98a3, 0x2b6f78];
const BIO: Ramp = [0xd8ffe0, 0x8ae6a0, 0x5fc27a, 0x3f9a5c, 0x2b7343, 0x1d4f2e];

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

/** A pressurised module lying on its side: banded hull with end rings (in `ring`'s colour, or the hull's from 64 px), panel seams, the faction's stripe, rows of framed windows, handrails. */
function pod(P: Painter, x: number, y: number, w: number, h: number, o: { seed?: number; rows?: number; stripe?: number; ramp?: Ramp; windows?: boolean; ring?: Ramp } = {}): void {
  const { seed = 1, rows = 1, stripe = 0.8, ramp = RAMPS.hull, windows = true, ring } = o;
  P.part(() => {
    P.hcyl(x, y, w, h, ramp);
    P.seams(x + 6, y + h * 0.16, w - 12, h * 0.68, 12);
    const inset = Math.max(3, h * 0.24);
    if (ring || P.medium) for (const rx of [x + inset, x + w - inset - 4]) P.ring(rx, y + 1, ring ? 4 : 3, h - 2, ring ?? ramp);
    const end = stripe >= 0 ? x + w * stripe - 4 : x + w - inset - 6;
    if (stripe >= 0) P.stripe(x + w * stripe, y + h * 0.1, 5, h * 0.8);
    const from = x + inset + 7;
    if (windows) for (let r = 0; r < rows; r++) P.windows(from, y + h * (rows === 1 ? 0.36 : 0.28 + r * 0.24), Math.max(1, Math.floor((end - from) / 7)), 7, 3.5, 4.5, seed + r);
    P.handrail(x + 8, x + w - 8, y + h * 0.17);
    P.rivets(x + 6, x + w - 6, y + h * 0.86, 5);
  });
}

/** A module's main hull on the axis, with its berths. */
function hull(P: Painter, h: Hull, o: { ramp?: Ramp; seed?: number; rows?: number; band?: Ramp; stripe?: number; windows?: boolean } = {}): void {
  berths(P, h.x + 4, h.x + h.w - 4);
  pod(P, h.x, h.top, h.w, h.d, { seed: o.seed, rows: o.rows, stripe: o.stripe, ramp: o.ramp, windows: o.windows, ring: o.band });
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

/** A row of finned radiator panels hanging below the axis, from x0 to x1, `h` tall, with their manifold. */
function radiators(P: Painter, x0: number, x1: number, n: number, h: number): void {
  const gap = 3, w = (x1 - x0 - gap * (n - 1)) / n;
  P.part(() => P.pipe(x0, AXIS + 8, x1, AXIS + 8, 3, RAMPS.dark));
  P.part(() => {
    for (let i = 0; i < n; i++) P.radiator(x0 + i * (w + gap), AXIS + 11, w, h, true, 4);
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

/** A base's core: a lander on legs, its berths at the axis; a settlement adds side modules, a colony a dome. */
const OutpostCore: Draw = (P, tier) => {
  P.part(() => {
    for (const [x0, x1] of [[44, 26], [84, 102], [56, 50], [72, 78]] as const) P.pipe(x0, 88, x1, 112, 3.5, RAMPS.dark);
  });
  P.part(() => {
    for (const x of [20, 96, 44, 72]) P.box(x, 111, 12, 4, RAMPS.dark);
  });
  berths(P, 40, 88, 14);
  if (tier >= 2) {
    pod(P, 8, 52, 28, 24, { seed: 5, stripe: -1 });
    pod(P, 92, 52, 28, 24, { seed: 6, stripe: -1 });
  }
  P.part(() => {
    P.vcyl(36, 36, 56, 58);
    P.sphere(64, 44, 28, 14, RAMPS.hull, 44);
    P.seams(40, 48, 48, 42, 10);
    P.stripe(37, 80, 54, 6);
    P.windows(42, 56, 7, 7, 4, 6, 2);
    if (tier >= 2) P.windows(42, 68, 7, 7, 4, 5, 8);
    P.hatch(56, 86, 16, 4);
    P.rivets(40, 88, 52, 5);
  });
  if (tier === 3) {
    P.part(() => P.sphere(64, 38, 24, 22, RAMPS.glass, 38));
    P.part(() => {
      P.box(52, 26, 10, 12, RAMPS.hull);
      P.box(64, 22, 10, 16, RAMPS.hull);
      P.windows(54, 29, 2, 4, 2, 2, 4, 1);
      P.windows(66, 25, 2, 4, 2, 2, 7, 1);
    }, false);
  } else port(P, 64, 31, "up", 8, 16);
  P.part(() => P.antenna(80, 34, 22, 2));
  P.part(() => P.flag(48, 34, 12, 8));
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
      for (const x of [18, 110]) P.pipe(x, 50, x, 78, 3, RAMPS.dark);
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
};

// ---------------------------------------------------------------- command and engineering

/** Offices: a white hull; a tower adds an office block docked on top, a complex another hanging below and more masts. */
const AdministrationNode: Draw = (P, tier) => {
  const h = hullAt(LEN[tier] + 6, BORE[tier]);
  if (tier >= 2) riser(P, 64, 20, h.top - 18, tier === 3 ? 28 : 24, { seed: 11 });
  if (tier === 3) riser(P, 64, h.bottom - 2, 34, 22, { seed: 13, down: true });
  P.part(() => {
    P.antenna(h.x + 10, h.top + 1, 14, 2);
    if (tier >= 2) P.antenna(h.x + h.w - 12, h.top + 1, 18, 3);
    if (tier === 3) P.antenna(h.x + 22, h.top + 1, 22, 3);
  });
  if (tier === 1) mast(P, 64, h.top, 64, h.top - 10);
  P.part(() => P.dish(64, tier === 1 ? h.top - 14 : 14, tier === 3 ? 9 : 7, -120, 0.4));
  hull(P, h, { seed: 4, rows: tier === 1 ? 1 : 2, stripe: 0.84 });
  P.part(() => P.flag(h.x + h.w - 18, h.top + 1, 10, 7));
};

/** Mission control: a wide hull with a bay of glowing screens, a radome; a command centre adds a dish and an operations deck below. */
const OperationsCenter: Draw = (P, tier) => {
  const h = hullAt(LEN[tier] + 14, BORE[tier] + 6);
  if (tier === 3) riser(P, 64, h.bottom - 2, 30, 26, { seed: 6, down: true, ramp: RAMPS.white });
  mast(P, h.x + 18, h.top, h.x + 18, h.top - 10);
  P.part(() => P.sphere(h.x + 18, h.top - 20, 11, 11, RAMPS.white));
  P.part(() => {
    P.antenna(h.x + h.w - 12, h.top + 1, 22, 3);
    P.antenna(h.x + h.w - 24, h.top + 1, 14, 2);
  });
  if (tier === 3) {
    mast(P, 64, h.top, 64, h.top - 12);
    P.part(() => P.dish(64, h.top - 18, 10, -110, 0.42));
  }
  hull(P, h, { seed: 5, windows: false, stripe: 0.88 });
  P.part(() => {
    const n = tier === 3 ? 5 : 4, sw = (h.w * 0.72) / n, x0 = h.x + h.w * 0.1;
    P.fill(x0 - 1, AXIS - 9, n * sw + 1, 16, RAMPS.dark[4]!);
    for (let i = 0; i < n; i++) {
      const sx = x0 + i * sw;
      P.fill(sx, AXIS - 8, sw - 2, 14, RAMPS.glass[4]!);
      for (let l = 0; l < 3; l++) P.fill(sx + 2, AXIS - 6 + l * 4, 3 + ((i * 5 + l * 7) % (sw - 6)), 1.5, l % 2 ? GLOW.cyan : RAMPS.glass[1]!);
    }
  });
  P.glow(64, AXIS, 18, GLOW.cyan, 0.3);
};

/** A robotic workshop: a dark hull on a truss keel with arms at work; a nanofactory frames it in trusses over vats, a complex builds a whole new hull. */
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
      for (let x = 72; x < 92; x += 5) P.line(x, 19, x, 34, RAMPS.dark[2]!);
    });
  if (tier >= 2)
    P.part(() => {
      const n = tier === 3 ? 5 : 3;
      for (let i = 0; i < n; i++) P.sphere(64 + (i - (n - 1) / 2) * 16, 96, 7, 7, RAMPS.gold);
    });
  const h = hullAt(tier === 1 ? 44 : LEN[tier] - 6, BORE[tier]);
  hull(P, h, { ramp: RAMPS.dark, seed: 7, rows: 1, stripe: 0.75 });
  const arm = (bx: number, by: number, ex: number, ey: number, tx: number, ty: number) => {
    P.part(() => {
      P.box(bx - 5, by - 3, 10, 6, RAMPS.dark);
      P.pipe(bx, by, ex, ey, 5, RAMPS.gold);
      P.pipe(ex, ey, tx, ty, 4, RAMPS.hull);
      P.sphere(ex, ey, 4, 4, RAMPS.dark);
      P.line(tx - 3, ty, tx - 4, ty - 4, RAMPS.dark[2]!, 1.5);
      P.line(tx + 3, ty, tx + 4, ty - 4, RAMPS.dark[2]!, 1.5);
    });
    P.glow(tx, ty - 4, 6, GLOW.heatHi, 0.9);
  };
  if (tier === 1) {
    P.part(() => P.box(54, 22, 34, 6, RAMPS.hull, 0.2));
    arm(48, h.top + 2, 40, 36, 58, 30);
  } else if (tier === 2) {
    arm(h.x + 10, h.top + 2, h.x + 4, 30, 30, 24);
    arm(h.x + h.w - 10, h.top + 2, h.x + h.w - 4, 30, 98, 24);
  } else {
    arm(h.x + 10, h.top + 2, h.x + 2, 34, 34, 36);
    arm(h.x + h.w - 10, h.top + 2, h.x + h.w - 2, 34, 94, 36);
    arm(64, h.bottom - 2, 50, 82, 40, 96);
  }
  P.part(() => {
    for (const [x, y] of tier === 1 ? ([[10, 58], [118, 58]] as const) : ([[8, 6], [120, 6], [8, 116]] as const)) P.light(x, y, GLOW.beacon);
  }, false);
};

/** An experimental hangar: a boxy pressurised bay, doors open on a prototype; a foundry adds furnace vents and radiators. */
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
    P.fill(32, 42, 64, 54, tier === 3 ? 0x6a3a2a : 0xe9c27a);
    P.fill(32, 42, 64, 4, tier === 3 ? 0xe07a3a : 0xfff0c8);
    P.fill(32, 80, 64, 16, tier === 3 ? 0x3a2420 : 0x8a6a48);
    P.hazard(30, 36, 68, 4);
  });
  if (tier === 2)
    P.part(() => {
      P.poly([38, 70, 54, 60, 86, 60, 94, 66, 86, 74, 44, 74], { ramp: RAMPS.white, dir: [0.2, 1] });
      P.poly([60, 60, 70, 50, 76, 50, 72, 60], { ramp: RAMPS.white, dir: [0.2, 1] });
      P.stripe(60, 66, 22, 3);
      P.fill(78, 62, 6, 3, RAMPS.glass[1]!);
    });
  else
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
  if (tier === 2) P.glow(52, 76, 7, GLOW.heatHi, 0.9);
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
  });
  P.part(() => {
    for (let i = 0; i < 4; i++) P.box(cx - r * 0.7 + i * r * 0.36, base - r * (0.25 + (i % 2) * 0.2), r * 0.3, r * (0.25 + (i % 2) * 0.2), RAMPS.hull);
    P.windows(cx - r * 0.6, base - 6, 4, r * 0.36, 2, 2, seed, 0.9);
    if (P.fine) for (let a = -0.6; a <= 0.6; a += 0.4) P.line(cx + a * r, base - Math.sqrt(1 - a * a) * r * 0.8, cx + a * r, base - 1, RAMPS.glass[0]!);
  }, false);
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
function labHull(P: Painter, tier: Tier, band: Ramp, seed: number, ramp: Ramp = RAMPS.cloth): Hull {
  const h = hullAt(LEN[tier], BORE[tier]);
  hull(P, h, { ramp, band, seed, rows: tier === 3 ? 2 : 1, stripe: -1 });
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
      for (let a = 0; a < 6.28; a += 0.02) P.dot(64 + Math.cos(a) * (A - 4.5), cy + Math.sin(a) * 6.5, a % 0.5 < 0.1 ? GLOW.cyanHi : GLOW.cyan);
    }, false);
    P.glow(64, cy, 6, GLOW.cyanHi, 1);
  };
  if (tier >= 2)
    P.part(() => {
      for (let i = 0; i < tier + 1; i++) P.vcyl(h.x + 10 + i * ((h.w - 30) / tier), h.top - 12, 8, 16, RAMPS.gold);
    });
  if (tier === 3) ring(h.bottom + 18, 34);
  labHull(P, tier, FIELD.energy, 5);
  ring(h.top - 20, 26 + tier * 6);
};

/** Server racks and an antenna farm; a research centre adds a dish, an institute cooling radiators and a second rack hall. */
const InformationScienceLab: Draw = (P, tier) => {
  const h = hullAt(LEN[tier], BORE[tier]);
  if (tier === 3) radiators(P, h.x + 4, h.x + h.w - 4, 4, 30);
  const masts = [[h.x + 6, 22], [h.x + 14, 30], [h.x + h.w - 8, 26], [h.x + h.w - 16, 16]] as const;
  P.part(() => {
    for (const [x, len] of masts.slice(0, tier + 1)) P.antenna(x, h.top + 1, len, len > 20 ? 3 : 2);
  });
  labHull(P, tier, FIELD.information, 6);
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
    mast(P, h.x + h.w - 24, h.top, h.x + h.w - 24, h.top - 18);
    P.part(() => P.dish(h.x + h.w - 24, h.top - 24, 9, -100, 0.42));
  }
};

/** Bio tanks in a lit viewport; a research centre adds a medical bay on top, an institute a greenhouse dome. */
const LifeScienceLab: Draw = (P, tier) => {
  const h = labHull(P, tier, FIELD.life, 7);
  P.part(() => {
    const vx = h.x + 12, vw = h.w - 24;
    P.fill(vx, AXIS - h.d * 0.32, vw, h.d * 0.64, RAMPS.dark[4]!);
    P.fill(vx + 1, AXIS - h.d * 0.32 + 1, vw - 2, h.d * 0.64 - 2, RAMPS.glass[4]!);
    const n = Math.floor((vw - 4) / 12);
    for (let i = 0; i < n; i++) {
      const tx = vx + 4 + i * 12;
      P.vcyl(tx, AXIS - h.d * 0.26, 8, h.d * 0.48, BIO);
      if (P.medium) P.dot(tx + 3, AXIS - 2, BIO[0]!);
    }
  });
  if (tier >= 2)
    P.part(() => {
      P.box(h.x + 8, h.top - 14, 22, 16, RAMPS.white);
      P.fill(h.x + 17, h.top - 11, 4, 10, RAMPS.red[2]!);
      P.fill(h.x + 14, h.top - 8, 10, 4, RAMPS.red[2]!);
    });
  if (tier === 3) {
    P.part(() => P.sphere(h.x + h.w - 28, h.top + 2, 20, 18, RAMPS.glass, h.top + 2));
    P.part(() => {
      for (let i = 0; i < 6; i++) P.ellipse(h.x + h.w - 42 + i * 5.6, h.top - 4 - (i % 2) * 3, 3, 3.5, i % 2 ? RAMPS.green[1]! : RAMPS.green[2]!);
    }, false);
  }
  P.part(() => P.antenna(h.x + h.w - 8, h.top + 1, 14, 2));
};

/** A furnace hanging below with an arm holding a crystal; a research centre adds a vacuum chamber, an institute a second furnace. */
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
  P.part(() => {
    P.box(h.x + h.w - 22, h.top - 6, 10, 8, RAMPS.dark);
    P.pipe(h.x + h.w - 17, h.top - 4, h.x + h.w - 2, h.top - 20, 5, RAMPS.gold);
    P.pipe(h.x + h.w - 2, h.top - 20, h.x + h.w + 8, h.top - 12, 4, RAMPS.hull);
    P.sphere(h.x + h.w - 2, h.top - 20, 3.5, 3.5, RAMPS.dark);
  });
  P.part(() => P.poly([h.x + h.w + 8, h.top - 16, h.x + h.w + 12, h.top - 22, h.x + h.w + 16, h.top - 16, h.x + h.w + 12, h.top - 8], { ramp: ENERGY, dir: [1, 1] }));
  if (tier >= 2) {
    mast(P, h.x + 24, h.top, h.x + 24, h.top - 8);
    P.part(() => {
      P.sphere(h.x + 24, h.top - 20, 13, 13, RAMPS.white);
      P.fill(h.x + 20, h.top - 24, 8, 8, RAMPS.dark[4]!);
      P.fill(h.x + 21, h.top - 23, 6, 6, RAMPS.glass[2]!);
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
  labHull(P, tier, FIELD.military, 9, RAMPS.armor);
  const barrel = (y: number, len: number) => {
    P.part(() => {
      P.box(h.x + 8, y - 2, 22, 14, RAMPS.dark);
      P.box(h.x + 28, y, len, 6, RAMPS.hull);
      P.box(h.x + 28, y + 6, len, 3, RAMPS.dark);
      for (let x = h.x + 34; x < h.x + 28 + len - 4; x += 11) P.box(x, y - 2, 4, 11, RAMPS.gold);
    });
    P.glow(h.x + 28 + len + 2, y + 3, 6, GLOW.cyan, 0.8);
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
      P.fill(x + 3, y + 3, w - 6, hh - 6, 0x0e1a24);
      const n = Math.floor((w - 8) / 7);
      for (let i = 0; i < n; i++) {
        const bh = ((i * 7 + seed * 5) % (hh - 12)) + 4;
        P.fill(x + 5 + i * 7, y + hh - 4 - bh, 5, bh, i % 2 ? GLOW.window : GLOW.violet);
      }
      P.line(x + 5, y + hh * 0.7, x + w - 5, y + hh * 0.3, RAMPS.white[0]!, 0.8);
    });
  };
  labHull(P, tier, FIELD.social, 10);
  screen(h.x + 4, h.top - 34, 40, 26, 1);
  if (tier === 3) screen(h.x + h.w - 34, h.top - 26, 30, 20, 3);
  if (tier >= 2) {
    P.part(() => P.sphere(tier === 3 ? 64 : h.x + h.w - 22, h.top + 2, 15, 13, RAMPS.glass, h.top + 2));
    P.part(() => {
      const cx = tier === 3 ? 64 : h.x + h.w - 22;
      P.fill(cx - 10, h.top - 4, 20, 5, 0x5c4a3a);
      P.windows(cx - 9, h.top - 6, 5, 4, 2, 2, 3, 0.9);
    }, false);
  }
};

/** A telescope on the hull; a research centre lengthens it, an institute adds a dish array. */
const SpaceScienceLab: Draw = (P, tier) => {
  const h = hullAt(LEN[tier], BORE[tier]);
  if (tier === 3) {
    for (const x of [h.x + 12, h.x + h.w - 12]) mast(P, x, h.bottom, x, h.bottom + 14);
    P.part(() => P.dish(h.x + 12, h.bottom + 22, 9, 100, 0.42));
    P.part(() => P.dish(h.x + h.w - 12, h.bottom + 22, 9, 80, 0.42));
  }
  labHull(P, tier, FIELD.space, 11);
  const len = 24 + tier * 8, a = -Math.PI / 4;
  const bx = 52, by = h.top - 2, ex = bx + Math.cos(a) * len, ey = by + Math.sin(a) * len;
  P.part(() => {
    P.box(bx - 10, by - 6, 20, 8, RAMPS.dark);
    P.pipe(bx, by - 2, bx, by - 10, 6, RAMPS.dark);
  });
  P.part(() => {
    P.pipe(bx, by - 8, ex, ey, 14 + tier * 2, RAMPS.white);
    P.pipe(bx + Math.cos(a) * 8, by - 8 + Math.sin(a) * 8, bx + Math.cos(a) * 20, by - 8 + Math.sin(a) * 20, 15 + tier * 2, RAMPS.gold);
  });
  P.part(() => P.shaded(ex, ey - 8, 6 + tier, 4 + tier * 0.6, (nx, ny, px, py) => (nx * nx + ny * ny > 0.55 ? RAMPS.white[2]! : P.shade(RAMPS.glass, 0.7 + ny * 0.2, px, py))));
  P.part(() => {
    P.light(118, 6, RAMPS.white[0]!);
    P.light(122, 22, RAMPS.white[1]!);
  }, false);
};

/** An Earth-watching lab: a sensor pod scanning below, solar wings; a research centre adds a second pair, an institute instrument booms. */
const ClimateLab: Draw = (P, tier) => {
  const h = hullAt(LEN[tier], BORE[tier]);
  const pairs: [number, number][] = tier === 1 ? [[h.top - 20, 20]] : [[h.top - 24, 20], [h.top - 46, 18]];
  for (const [y, hh] of pairs) {
    mast(P, h.x + 6, h.top, h.x + 6, y);
    mast(P, h.x + h.w - 6, h.top, h.x + h.w - 6, y);
    wing(P, 4, y, 40, hh, 5, 3);
    wing(P, 84, y, 40, hh, 5, 3);
  }
  if (tier === 3)
    P.part(() => {
      P.pipe(h.x + 4, h.bottom - 2, 8, h.bottom + 26, 2.5, RAMPS.dark);
      P.pipe(h.x + h.w - 4, h.bottom - 2, 120, h.bottom + 26, 2.5, RAMPS.dark);
      P.box(4, h.bottom + 24, 8, 6, RAMPS.gold);
      P.box(116, h.bottom + 24, 8, 6, RAMPS.gold);
    });
  P.part(() => {
    P.sphere(64, h.bottom + 2, 12, 9, RAMPS.dark);
    P.ellipse(64, h.bottom + 7, 6, 2.5, GLOW.cyan);
  });
  labHull(P, tier, FIELD.climate, 12);
  P.part(() => {
    for (const dx of [-18, -6, 6, 18]) for (let y = h.bottom + 14; y < 124; y += 3) P.dot(64 + dx * ((y - h.bottom - 6) / 30), y, GLOW.cyan);
  }, false);
  P.glow(64, h.bottom + 7, 8, GLOW.cyan, 0.7);
};

// ---------------------------------------------------------------- power

/** Solar wings on a keel: two, then four, then six. */
const SolarCollector: Draw = (P, tier) => {
  keel(P);
  const cols = tier === 1 ? [[24, 80]] : tier === 2 ? [[6, 56], [66, 56]] : [[4, 38], [45, 38], [86, 38]];
  for (const [x, w] of cols) {
    P.part(() => P.pipe(x! + w! / 2, 12, x! + w! / 2, 116, 2.5, RAMPS.dark));
    wing(P, x!, tier === 3 ? 4 : 8, w!, AXIS - (tier === 3 ? 10 : 14), Math.round(w! / 9), 5);
    wing(P, x!, AXIS + 6, w!, AXIS - (tier === 3 ? 10 : 14), Math.round(w! / 9), 5);
  }
  P.part(() => {
    P.box(54, AXIS - 10, 20, 20);
    P.stripe(54, AXIS - 6, 20, 4);
    P.windows(57, AXIS + 2, 3, 5, 3, 3, 2);
    P.light(64, AXIS - 12, GLOW.beacon);
  });
};

/** Mirror sheets on booms off a keel: one, two, then the four great sheets of a soletta. */
const SolarMirror: Draw = (P, tier) => {
  keel(P, 7);
  const sheet = (cx: number, cy: number, w: number, h: number) =>
    P.part(() => {
      P.poly([cx - w / 2, cy - h / 2 + 8, cx + w / 2, cy - h / 2, cx + w / 2 - 6, cy + h / 2 - 8, cx - w / 2 - 6, cy + h / 2], { ramp: RAMPS.mirror, dir: [0.8, 1], from: 0.05, to: 0.75 });
      if (P.medium)
        for (let i = 1; i < 4; i++) {
          const t = i / 4;
          P.line(cx - w / 2 + w * t, cy - h / 2 + 8 - 8 * t, cx - w / 2 - 6 + w * t, cy + h / 2 - 8 * t, RAMPS.mirror[4]!);
        }
    });
  const sheets: [number, number, number, number][] =
    tier === 1 ? [[64, 28, 80, 44]] : tier === 2 ? [[64, 26, 96, 42], [64, 102, 96, 34]] : [[36, 28, 52, 46], [94, 28, 52, 46], [36, 100, 52, 38], [94, 100, 52, 38]];
  P.part(() => {
    for (const [cx, cy] of sheets) P.pipe(cx, AXIS, cx, cy, 3, RAMPS.dark);
  });
  for (const [cx, cy, w, h] of sheets) sheet(cx, cy, w, h);
  P.part(() => {
    P.box(52, AXIS - 8, 24, 16);
    P.stripe(52, AXIS - 4, 24, 4);
    P.windows(56, AXIS + 2, 4, 5, 3, 3, 2);
  });
};

/** A reactor vessel standing on the keel: a vertical cylinder under a domed head, hazard banding, the faction's band. */
function vessel(P: Painter, x: number, y: number, w: number, h: number, ramp: Ramp = RAMPS.gold): void {
  P.part(() => {
    P.vcyl(x, y + w * 0.3, w, h - w * 0.3, ramp, false);
    P.sphere(x + w / 2, y + w * 0.32, w / 2, w * 0.32, ramp, y + w * 0.34);
    P.hazard(x + 1, y + h * 0.62, w - 2, 4);
    P.stripe(x + 1, y + h - 10, w - 2, 4);
    P.seams(x + 3, y + w * 0.4, w - 6, h * 0.5, 7, ramp[4]!);
  });
}

/** Foil-wrapped fission vessels on a keel over finned radiators: one, two, three. */
const FissionPile: Draw = (P, tier) => {
  keel(P);
  radiators(P, 12, 116, tier + 1, 40);
  const w = tier === 1 ? 32 : tier === 2 ? 26 : 22;
  for (let i = 0; i < tier; i++) vessel(P, 64 - (tier * (w + 4)) / 2 + i * (w + 4) + 2, 8 + (i % 2) * 4, w, AXIS - 2);
};

/** Armoured heavy reactors glowing blue through their ports, over a fan of radiator panels. */
const HeavyFissionPile: Draw = (P, tier) => {
  keel(P);
  P.part(() => {
    P.poly([10, AXIS + 8, 118, AXIS + 8, 124, 120, 4, 120], { ramp: RAMPS.white, dir: [0, 1], from: 0.05, to: 0.55 });
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
  for (const cx of units) P.glow(cx, 33, w * 0.6, GLOW.cyan, 0.5);
};

/** A fusion torus over a control module: a bigger torus, then two, over radiators. */
const FusionPile: Draw = (P, tier) => {
  keel(P);
  if (tier >= 2) radiators(P, 20, 108, tier + 1, 34);
  const torus = (cx: number, A: number) => {
    P.part(() => P.torus(cx, 34, A, 18, 12, 10, "back"));
    P.part(() => P.ellipse(cx, 34, A - 16, 5, 0x2a1740), false);
    P.part(() => P.torus(cx, 34, A, 18, 12, 10, "front", RAMPS.hull, false));
    P.part(() => {
      for (const t of [-0.75, -0.25, 0.25, 0.75]) P.box(cx + t * (A - 6) - 2.5, 34 + Math.sqrt(1 - t * t) * 14 - 4, 5, 12, RAMPS.gold, 0.2);
    });
    P.part(() => {
      for (let a = Math.PI; a < Math.PI * 2; a += 0.06) P.dot(cx + Math.cos(a) * (A - 7), 34 + Math.sin(a) * 12, GLOW.violetHi);
    }, false);
    P.glow(cx, 28, A * 0.7, GLOW.violet, 0.45);
  };
  pod(P, 40, AXIS - 10, 48, 20, { seed: 3, stripe: 0.75 });
  if (tier === 3) {
    torus(36, 30);
    torus(92, 30);
  } else torus(64, tier === 1 ? 36 : 46);
};

/** A spherical heavy fusion reactor braced to radiators above and below: four struts, six, then a bigger core. */
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
      P.pipe(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 64 + Math.cos(a) * reach, 64 + Math.sin(a) * reach, 6, RAMPS.hull);
    }
  });
  P.part(() => {
    P.sphere(64, 64, r, r, RAMPS.gold);
    P.stripe(64 - r + 3, 74, 2 * r - 6, 4);
    P.fill(58, 56, 12, 12, RAMPS.dark[5]!);
    P.fill(60, 58, 8, 8, GLOW.cyanHi);
  });
  P.glow(64, 62, 16, GLOW.cyan, 0.6);
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
      P.shaded(x, AXIS, 10, 30, (nx, ny, px, py) => {
        const d = nx * nx + ny * ny;
        if (d < 0.42) return P.shade(PLASMA, 0.35 + d * 1.6, px, py);
        return nx < 0 ? P.shade(RAMPS.hull, 0.2 + ny * 0.2, px, py) : P.shade(RAMPS.hull, 0.6 + ny * 0.15, px, py);
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
};

/** A collider ring round the keel with its detector at the centre: wider and taller at each tier. */
const ParticleCollider: Draw = (P, tier) => {
  const A = 46 + tier * 6, B = 22 + tier * 6;
  P.part(() => P.torus(64, AXIS, A, B, 9, 8, "back", RAMPS.hull, false));
  keel(P, 7);
  P.part(() => {
    P.box(46, AXIS - 18, 36, 36);
    P.fill(52, AXIS - 12, 24, 24, RAMPS.dark[5]!);
    P.ellipse(64, AXIS, 10, 10, RAMPS.dark[3]!);
    P.ellipse(64, AXIS, 6, 6, GLOW.cyan);
    P.stripe(46, AXIS + 12, 36, 4);
  });
  P.glow(64, AXIS, 10, GLOW.cyanHi, 0.9);
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
  if (tier >= 2) P.part(() => P.hcyl(40, AXIS + 20, 50, 14));
  P.part(() => {
    P.poly([4, AXIS - 40, 30, AXIS - 24, 30, AXIS + 24, 4, AXIS + 40], { ramp: RAMPS.dark, dir: [1, 0.3], from: 0.15, to: 0.8 });
    P.poly([6, AXIS - 30, 26, AXIS - 18, 26, AXIS + 18, 6, AXIS + 30], RAMPS.dark[5]!);
  });
  P.glow(6, AXIS, 22, GLOW.heat, 0.7);
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
    P.pipe(10, 104, 22, top, 3, RAMPS.dark);
    P.pipe(38, 104, 26, top, 3, RAMPS.dark);
    for (let y = top + 10; y < 100; y += 12) {
      const t = (y - top) / (104 - top);
      P.line(22 - t * 12, y, 26 + t * 12, y, RAMPS.dark[2]!, 1.5);
      P.line(22 - t * 12, y, 26 + (t + 0.11) * 12, y + 12, RAMPS.dark[3]!, 1);
    }
    P.box(18, top - 4, 12, 6, RAMPS.dark);
  });
  P.part(() => {
    P.pipe(24, top, 24, 112, 2.5, RAMPS.hull);
    P.box(20, 84, 8, 10, RAMPS.gold);
    P.light(24, top - 6, GLOW.beacon);
  });
  P.part(() => P.truss(36, 96, 80, 44, 7, RAMPS.dark));
  P.part(() => {
    for (let i = 0; i < 5; i++) P.ellipse(42 + i * 9, 87 - i * 10.5, 2.5, 1.8, RAMPS.ore[1]!);
  }, false);
  const hopper = (x: number, y: number, s: number) => {
    P.part(() => {
      P.poly([x, y, x + 34 * s, y, x + 22 * s, y + 24 * s, x + 12 * s, y + 24 * s], { ramp: RAMPS.hull, dir: [1, 0], from: 0.1, to: 0.7 });
      P.box(x + 12 * s, y + 24 * s, 10 * s, 6, RAMPS.dark);
      P.pipe(x + 4 * s, y + 10, x + 4 * s, 104, 3, RAMPS.dark);
      P.pipe(x + 30 * s, y + 10, x + 30 * s, 104, 3, RAMPS.dark);
    });
    P.part(() => {
      P.shaded(x + 17 * s, y, 16 * s, 6 * s, (nx, ny, px, py) => (ny > 0.2 ? -1 : P.shade(RAMPS.ore, 0.3 + nx * 0.3 + ny * 0.2, px, py)));
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

/** Crew quarters: a white hull of windows; residences dock a block above and below, a civilian complex turns a habitat ring round it. */
const Quarters: Draw = (P, tier) => {
  const h = hullAt(LEN[tier] + 8, BORE[tier] + 4);
  if (tier === 3) P.part(() => P.torus(64, AXIS, 56, 22, 8, 6, "back"));
  if (tier === 2) {
    riser(P, 46, 14, h.top - 12, 22, { seed: 12 });
    riser(P, 82, h.bottom - 2, 40, 22, { seed: 14, down: true });
  }
  if (tier === 3)
    P.part(() => {
      for (const y of [AXIS - 22, AXIS + 22]) P.pipe(64, AXIS, 64, y, 4, RAMPS.dark);
    });
  hull(P, h, { seed: 2, rows: tier === 1 ? 2 : 3, stripe: 0.86 });
  P.part(() => P.greebles(h.x + 20, h.top - 6, h.w - 40, 6, 7));
  if (tier === 3) P.part(() => P.torus(64, AXIS, 56, 22, 8, 6, "front"));
};

/** Plants growing in glass: a greenhouse window along the hull; a farm adds a garden dome, an agriculture complex glass tubes of crops above and below. */
const HydroponicsBay: Draw = (P, tier) => {
  const h = hullAt(LEN[tier] + 6, BORE[tier] + 4);
  const crops = (x: number, y: number, w: number, hh: number) =>
    P.part(() => {
      for (let i = 0; i < w - 6; i += 4) {
        const px = x + 3 + i, ph = hh * (0.45 + ((i * 37) % 13) / 30);
        P.fill(px - 0.5, y + hh - ph, 1.5, ph, RAMPS.green[4]!);
        P.ellipse(px, y + hh - ph + 2, 2.5, 3, i % 8 ? RAMPS.green[2]! : RAMPS.green[1]!);
        if (P.medium) P.dot(px - 1, y + hh - ph, RAMPS.green[0]!);
      }
      P.fill(x + 1, y + hh - 2, w - 2, 2, 0x5c4a3a);
      if (P.medium) for (let gx = x + 6; gx < x + w - 6; gx += 12) P.fill(gx, y + 1, 5, 1.5, 0xff8ad8);
    }, false);
  const tube = (y: number, w: number, d: number) => {
    P.part(() => P.hcyl(64 - w / 2, y, w, d, RAMPS.glass));
    crops(64 - w / 2 + 4, y + 2, w - 8, d - 4);
  };
  if (tier === 3) {
    P.part(() => {
      for (const x of [40, 88]) P.pipe(x, 18, x, 110, 3, RAMPS.dark);
    });
    tube(6, 92, 22);
    tube(100, 92, 22);
  }
  hull(P, h, { seed: 4, windows: false, stripe: 0.88 });
  const gx = h.x + 10, gw = h.w * 0.78 - 14;
  P.part(() => {
    P.fill(gx - 1, AXIS - h.d * 0.3 - 1, gw + 2, h.d * 0.6 + 2, RAMPS.hull[4]!);
    P.fill(gx, AXIS - h.d * 0.3, gw, h.d * 0.6, RAMPS.glass[3]!);
  });
  crops(gx, AXIS - h.d * 0.3, gw, h.d * 0.6);
  if (tier === 2) {
    P.part(() => P.sphere(64, h.top + 2, 28, 22, RAMPS.glass, h.top + 2));
    crops(40, h.top - 18, 48, 18);
  }
};

/** A white hospital hull with a red cross; a geriatrics facility adds a care block on top and a garden dome below. */
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
  hull(P, h, { seed: 3, rows: 2, ramp: RAMPS.white, stripe: 0.88 });
  cross(64, AXIS, 8);
  if (tier === 3) cross(40, 26, 4);
  P.part(() => P.antenna(h.x + h.w - 18, h.top + 1, 14, 2));
  P.light(h.x + 6, h.top + 2, GLOW.beacon);
};

/** A lounge of panorama windows; a hotel adds an observation dome, a resort a great glass sphere. */
const TouristBerth: Draw = (P, tier) => {
  const h = hullAt(LEN[tier] + 18, BORE[tier] + 14);
  if (tier === 3) {
    P.part(() => P.box(56, h.top - 10, 16, 12, RAMPS.dark));
    P.part(() => P.sphere(64, h.top - 26, 26, 22, RAMPS.glass));
    P.part(() => {
      P.ellipse(64, h.top - 18, 18, 4, RAMPS.green[2]!);
      P.fill(50, h.top - 30, 28, 2, RAMPS.hull[2]!);
      P.windows(52, h.top - 36, 5, 5, 2.5, 2.5, 7, 0.9);
    }, false);
  }
  hull(P, h, { seed: 9, windows: false, stripe: -1 });
  P.part(() => {
    const x = h.x + 10, w = h.w - 20, y = AXIS - h.d * 0.3, hh = h.d * 0.55;
    P.fill(x - 1, y - 1, w + 2, hh + 2, RAMPS.dark[4]!);
    P.fill(x, y, w, hh, RAMPS.glass[3]!);
    P.fill(x, y + hh * 0.55, w, hh * 0.45, 0xe9c27a);
    P.fill(x, y + hh * 0.55, w, 2, 0xfff0c8);
    for (let i = x + 10; i < x + w - 10; i += 18) {
      P.fill(i, y + hh * 0.6, 8, 5, RAMPS.red[3]!);
      P.ellipse(i + 12, y + hh * 0.45, 3, 4, RAMPS.green[2]!);
      P.fill(i + 11.5, y + hh * 0.5, 1, 6, RAMPS.green[4]!);
    }
    for (let i = x; i < x + w; i += 14) P.fill(i, y, 1.5, hh, RAMPS.hull[3]!);
    if (P.medium) for (let i = x + 4; i < x + w - 10; i += 23) P.line(i, y + 1, i + 8, y + 9, RAMPS.glass[0]!);
    P.stripe(h.x + 6, AXIS + h.d * 0.32, h.w - 12, 3);
  });
  if (tier === 2) P.part(() => P.sphere(64, h.top + 2, 20, 14, RAMPS.glass, h.top + 2));
  P.part(() => {
    P.light(h.x + 4, AXIS, GLOW.beacon);
    P.light(h.x + h.w - 5, AXIS, GLOW.beacon);
  });
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
    P.pipe(64, h.top, 64, 12, 4, RAMPS.hull);
    P.line(52, 30, 76, 30, RAMPS.dark[2]!, 2);
    for (const [x, y, , , ax, ay] of dishes) P.pipe(ax, ay, x, y, 2.5, RAMPS.dark);
  });
  for (const [x, y, r, a] of dishes) P.part(() => P.dish(x, y, r, a, 0.42));
  hull(P, h, { seed: 6, rows: 1 });
  if (tier === 3)
    P.part(() => {
      P.box(h.x + 6, AXIS - 9, 30, 18, RAMPS.dark);
      P.fill(h.x + 8, AXIS - 7, 26, 14, RAMPS.glass[4]!);
      P.fill(h.x + 10, AXIS - 5, 10, 10, P.faction[1]!);
      P.fill(h.x + 22, AXIS - 4, 10, 2, GLOW.window);
      P.fill(h.x + 22, AXIS, 8, 2, GLOW.cyan);
    });
  P.part(() => {
    for (const [x, y, , a] of dishes) {
      const fx = Math.cos((a * Math.PI) / 180), fy = Math.sin((a * Math.PI) / 180);
      for (let i = 1; i <= 2; i++) P.dot(x + fx * (10 + i * 6), y + fy * (10 + i * 6), GLOW.cyan);
    }
  }, false);
  P.light(64, 9, GLOW.beacon);
};

/** A great listening dish on the hull; a reconnaissance array adds a row of small dishes below, Argus a second great dish and an antenna lattice. */
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
  hull(P, h, { seed: 8, ramp: RAMPS.dark, stripe: 0.86 });
  const big = (cx: number, r: number, a: number) => {
    P.part(() => {
      P.box(cx - 8, h.top - 6, 16, 8, RAMPS.dark);
      P.pipe(cx, h.top - 4, cx, h.top - 12, 6, RAMPS.dark);
    });
    P.part(() => P.dish(cx, h.top - 12 - r * 0.6, r, a, 0.4));
  };
  if (tier === 3) {
    big(44, 24, -60);
    big(92, 18, -110);
  } else big(64, 26 + tier * 4, -70);
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
  hull(P, h, { ramp: RAMPS.armor, seed: 5, windows: false, stripe: 0.12 });
  P.part(() => {
    for (let i = 0; i < Math.floor((h.w - 30) / 14); i++) P.box(h.x + 22 + i * 14, AXIS - h.d * 0.32, 12, h.d * 0.3, RAMPS.armor, 0.15);
    for (let i = 0; i < Math.floor((h.w - 30) / 14); i++) P.fill(h.x + 24 + i * 14, AXIS - h.d * 0.32 + 3, 8, 2, GLOW.window);
    P.hazard(h.x + 22, AXIS + h.d * 0.2, h.w - 34, 3);
  });
  P.part(() => P.hatch(h.x + h.w - 26, AXIS - 6, 14, 14));
};

/** Gun turrets on an armoured hull: one, two, then three and a fire-control radar. */
const PointDefenseArray: Draw = (P, tier) => {
  const h = hullAt(LEN[tier], BORE[tier]);
  hull(P, h, { ramp: RAMPS.armor, seed: 4, windows: false, stripe: 0.5 });
  const turret = (cx: number, base: number, s: number) => {
    P.part(() => {
      P.pipe(cx + 2 * s, base - 14 * s, cx + 30 * s, base - 40 * s, 4 * s, RAMPS.dark);
      P.pipe(cx + 7 * s, base - 11 * s, cx + 35 * s, base - 37 * s, 4 * s, RAMPS.dark);
    });
    P.part(() => {
      P.box(cx - 16 * s, base - 4 * s, 32 * s, 6 * s, RAMPS.dark);
      P.sphere(cx, base - 6 * s, 16 * s, 14 * s, RAMPS.armor, base - 2 * s);
      P.fill(cx - 10 * s, base - 14 * s, 7 * s, 3 * s, GLOW.cyan);
    });
    P.glow(cx + 33 * s, base - 39 * s, 5 * s, GLOW.heat, 0.7);
  };
  const base = h.top + 2;
  if (tier === 1) turret(54, base, 1);
  else if (tier === 2) {
    turret(h.x + 18, base, 0.8);
    turret(h.x + h.w - 34, base, 0.8);
  } else {
    turret(h.x + 14, base, 0.75);
    turret(64, base, 0.75);
    turret(h.x + h.w - 26, base, 0.75);
  }
  if (tier === 3) {
    mast(P, 64, h.bottom, 64, h.bottom + 12);
    P.part(() => {
      P.box(48, h.bottom + 12, 32, 8, RAMPS.dark);
      for (let x = 50; x < 78; x += 4) P.fill(x, h.bottom + 14, 2, 4, RAMPS.dark[1]!);
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
      P.poly([x, cy - hh / 2 + 2, x + l - 18, cy - hh / 2, x + l, cy, x + l - 18, cy + hh / 2, x, cy + hh / 2 - 2], { ramp: RAMPS.hull, dir: [0, 1], from: 0.05, to: 0.75 });
      for (let i = 0; i < engines; i++) P.box(x - 6, cy - hh / 2 + 3 + (i * (hh - 6)) / engines, 7, (hh - 6) / engines - 1, RAMPS.dark);
      P.seams(x + 6, cy - hh / 2 + 2, l - 26, hh - 4, 10);
      P.windows(x + 12, cy - hh * 0.2, Math.floor((l - 34) / 7), 7, 3.5, 4, 6);
      P.stripe(x + 8, cy + hh * 0.12, l - 30, 4);
    });
    P.part(() => {
      for (let i = 0; i < engines; i++) P.fill(x - 8, cy - hh / 2 + 4 + (i * (hh - 6)) / engines, 2, (hh - 6) / engines - 3, GLOW.heat);
    }, false);
    P.glow(x - 8, cy, hh * 0.4, GLOW.heat, 0.4);
  };
  if (tier === 1) ship(32, AXIS, 64, 26, 1);
  else if (tier === 2) ship(24, AXIS, 90, 34, 2);
  else {
    ship(22, AXIS + 10, 96, 38, 3);
    ship(72, 32, 40, 14, 1);
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
};

/** A depot on the keel: water and propellant spheres above and below, cargo containers clamped alongside. */
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
    P.box(72, 22, 40, 18);
    P.box(80, 6, 28, 16);
    P.box(72, 88, 40, 18);
    P.stripe(74, 26, 36, 3);
    P.stripe(82, 10, 24, 3);
    P.hazard(72, 102, 40, 3);
    P.seams(74, 92, 36, 10, 8);
  });
  P.light(34, 6, GLOW.beacon);
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

const cache = new Map<string, HTMLCanvasElement>();

/** A module's picture on a canvas, `size` pixels square, cached. */
export function drawModule(moduleId: string, factionColor: string, size: 32 | 64 | 128): HTMLCanvasElement {
  const key = `${moduleId}|${factionColor}|${size}`;
  let canvas = cache.get(key);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    canvas.getContext("2d")!.putImageData(new ImageData(paintModule(moduleId, factionColor, size), size, size), 0, 0);
    cache.set(key, canvas);
  }
  return canvas;
}
