// The hab modules' structures in pixel art (decision D18), drawn with pixelKit's painter in a
// 128-unit design space: one draw function per line of modules, the module's tier changing the
// build where an upgrade naturally looks bigger (longer halls, more panels, more units). The
// faction's colour goes on stripes, markings and flags. Each module shows its tier as gold pips
// in the bottom-right corner, and automated modules a cyan light in the top-left one.

import { baseContent } from "../../content/index";
import type { HabModuleDef } from "../../sim/index";
import { GLOW, Painter, RAMPS, type Ramp } from "./pixelKit";

type Tier = 1 | 2 | 3;
type Draw = (P: Painter, tier: Tier) => void;

// ---------------------------------------------------------------- shared parts

/** A pressurised module lying on its side: banded hull, panel seams, the faction's stripe, rows of windows, handrails. */
function pod(P: Painter, x: number, y: number, w: number, h: number, o: { seed?: number; rows?: number; stripe?: number; ramp?: Ramp; windows?: boolean } = {}): void {
  const { seed = 1, rows = 1, stripe = 0.8, ramp = RAMPS.hull, windows = true } = o;
  P.part(() => {
    P.hcyl(x, y, w, h, ramp);
    P.seams(x + 6, y + h * 0.16, w - 12, h * 0.68, 12);
    const end = stripe >= 0 ? x + w * stripe - 4 : x + w - 8;
    if (stripe >= 0) P.stripe(x + w * stripe, y + h * 0.1, 5, h * 0.8);
    if (windows) for (let r = 0; r < rows; r++) P.windows(x + 8, y + h * (rows === 1 ? 0.36 : 0.28 + r * 0.24), Math.max(1, Math.floor((end - x - 8) / 7)), 7, 3.5, 4.5, seed + r);
    P.handrail(x + 8, x + w - 8, y + h * 0.17);
    P.rivets(x + 6, x + w - 6, y + h * 0.86, 5);
  });
}

/** A docking port: a short tube ending in a gold collar, pointing left, right, up or down from (x, y). */
function port(P: Painter, x: number, y: number, side: "left" | "right" | "up" | "down", len = 10, d = 14): void {
  P.part(() => {
    if (side === "left" || side === "right") {
      const x0 = side === "left" ? x - len : x;
      P.hcyl(x0, y - d / 2, len, d);
      P.box(side === "left" ? x0 : x0 + len - 3, y - d / 2 - 1.5, 3, d + 3, RAMPS.gold);
    } else {
      const y0 = side === "up" ? y - len : y;
      P.vcyl(x - d / 2, y0, d, len, RAMPS.hull, side === "up");
      P.box(x - d / 2 - 1.5, side === "up" ? y0 : y0 + len - 3, d + 3, 3, RAMPS.gold);
    }
  });
}

/** A solar wing: a mast and a panel of cells off it. */
function wing(P: Painter, x: number, y: number, w: number, h: number, cols = 4, rows = 6): void {
  P.part(() => P.solar(x, y, w, h, cols, rows));
}

/** A lab: a pressurised module, longer at higher tiers, returning its box for the field's equipment. */
function labPod(P: Painter, tier: Tier, y = 66, h = 34, seed = 3): { x: number; y: number; w: number; h: number } {
  const w = 82 + tier * 12, x = 64 - w / 2;
  port(P, x + 2, y + h / 2, "left", 6, 14);
  pod(P, x, y, w, h, { seed, rows: tier === 3 ? 2 : 1 });
  return { x, y, w, h };
}

/** Gold tier pips in the bottom-right corner, a cyan light top-left if automated. */
function badges(P: Painter, def: HabModuleDef): void {
  for (let i = 0; i < def.tier; i++) P.part(() => P.box(116 - i * 11, 115, 8, 8, RAMPS.gold, 0.15));
  if (def.automated) {
    P.part(() => P.sphere(10, 10, 6, 6, [GLOW.cyanHi, GLOW.cyan, 0x5fc2cc, 0x3e98a3, 0x2b6f78]));
    P.glow(10, 10, 12, GLOW.cyan, 0.5);
  }
}

// ---------------------------------------------------------------- cores

const OutpostCore: Draw = (P, tier) => {
  P.part(() => {
    for (const [x0, x1] of [[44, 26], [84, 102], [56, 50], [72, 78]] as const) P.pipe(x0, 88, x1, 112, 3.5, RAMPS.dark);
  });
  P.part(() => {
    for (const x of [20, 96, 44, 72]) P.box(x, 111, 12, 4, RAMPS.dark);
  });
  if (tier >= 2) {
    pod(P, 2, 56, 30, 24, { seed: 5, stripe: -1 });
    pod(P, 96, 56, 30, 24, { seed: 6, stripe: -1 });
  }
  port(P, 38, 68, "left", 8, 16);
  port(P, 90, 68, "right", 8, 16);
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

const PlatformCore: Draw = (P, tier) => {
  if (tier === 3) P.part(() => P.torus(64, 66, 62, 26, 9, 6, "back"));
  if (tier >= 2) {
    P.part(() => P.truss(4, 64, 124, 64, 9));
    for (const x of [6, 98]) {
      wing(P, x, 18, 24, 38, 3, 6);
      wing(P, x, 74, 24, 38, 3, 6);
    }
  }
  port(P, 46, 64, "left", 14, 18);
  port(P, 82, 64, "right", 14, 18);
  port(P, 64, 46, "up", 14, 18);
  port(P, 64, 82, "down", 14, 18);
  P.part(() => {
    P.sphere(64, 64, 22, 22);
    P.stripe(43, 62, 42, 6);
    P.windows(52, 50, 4, 7, 3.5, 4, 3);
    P.rivets(48, 80, 75, 4);
  });
  if (tier === 3) {
    P.part(() => {
      P.pipe(64, 64, 64, 40, 3, RAMPS.dark);
      P.pipe(64, 64, 64, 92, 3, RAMPS.dark);
    }, false);
    P.part(() => P.torus(64, 66, 62, 26, 9, 6, "front"));
  }
  if (tier === 1) {
    wing(P, 4, 50, 26, 28, 4, 3);
    wing(P, 98, 50, 26, 28, 4, 3);
  }
  P.part(() => {
    P.light(64, 30, GLOW.beacon);
    P.light(30, 64, GLOW.beacon);
    P.light(98, 64, GLOW.beacon);
  }, false);
};

// ---------------------------------------------------------------- command and engineering

const AdministrationNode: Draw = (P, tier) => {
  const top = tier === 2 ? 40 : 36;
  const roof = tier === 1 ? 60 : top - 5;
  P.part(() => {
    P.antenna(30, 60, 18, 3);
    P.antenna(98, 60, 12, 2);
    P.pipe(64, roof, 64, roof - 8, 3, RAMPS.dark);
  });
  P.part(() => P.dish(64, roof - 12, 9, -120, 0.4));
  if (tier >= 2)
    P.part(() => {
      P.box(42, top - 6, 44, 30);
      for (let r = 0; r < 3; r++) P.windows(46, top + r * 8, 6, 6.5, 4, 4, 11 + r);
      P.stripe(42, top - 6, 44, 3);
    });
  if (tier === 3) {
    pod(P, 4, 80, 36, 26, { seed: 9, stripe: -1 });
    pod(P, 88, 80, 36, 26, { seed: 10, stripe: -1 });
  }
  pod(P, 14, 58, 100, 44, { seed: 4, rows: 3, stripe: 0.86 });
  P.part(() => {
    P.box(52, 100, 24, 8, RAMPS.dark);
    P.hatch(58, 101, 12, 6);
  });
};

const OperationsCenter: Draw = (P, tier) => {
  const r = tier === 3 ? 16 : 12;
  P.part(() => {
    P.box(30, 48 - r * 0.4, 12, r * 0.6 + 4, RAMPS.dark);
    P.antenna(86, 48, 24, 3);
    P.antenna(100, 48, 16, 2);
    P.antenna(112, 48, 10, 1);
  });
  P.part(() => P.sphere(36, 40 - r, r, r, RAMPS.white));
  if (tier === 3) P.part(() => P.dish(64, 34, 10, -110, 0.4));
  P.part(() => P.greebles(46, 40, 34, 8, 4));
  P.part(() => {
    P.box(8, 48, 112, 52);
    P.seams(10, 52, 108, 44, 16);
    P.stripe(8, 88, 112, 5);
    for (let i = 0; i < 4; i++) {
      const sx = 14 + i * 26;
      P.fill(sx, 58, 22, 22, RAMPS.dark[4]!);
      P.fill(sx + 1, 59, 20, 20, RAMPS.glass[4]!);
      for (let l = 0; l < 4; l++) P.fill(sx + 3, 62 + l * 4, 6 + ((i * 5 + l * 7) % 12), 1.5, l % 2 ? GLOW.cyan : RAMPS.glass[1]!);
      P.fill(sx + 14, 66, 4, 10, GLOW.cyan);
    }
    P.windows(14, 84, 15, 7, 3.5, 2.5, 4);
    P.rivets(12, 116, 96, 5);
  });
  P.part(() => P.hatch(54, 94, 20, 10));
};

const ConstructionModule: Draw = (P, tier) => {
  const big = tier >= 2;
  P.part(() => {
    P.truss(6, 12, 122, 12, 10);
    P.truss(6, 112, 122, 112, 10);
    P.truss(6, 12, 6, 112, 10);
    P.truss(122, 12, 122, 112, 10);
  });
  P.part(() => {
    P.hcyl(30, big ? 54 : 62, big ? 70 : 58, big ? 34 : 26);
    P.box(30, big ? 58 : 66, 10, big ? 26 : 18, RAMPS.gold);
    P.stripe(84, big ? 56 : 64, 5, big ? 30 : 22);
    P.seams(40, 60, 40, 20, 8);
  });
  if (tier === 3) P.part(() => P.hcyl(36, 92, 56, 14));
  const arm = (bx: number, by: number, ex: number, ey: number, tx: number, ty: number) => {
    P.part(() => {
      P.box(bx - 6, by - 4, 12, 8, RAMPS.dark);
      P.pipe(bx, by, ex, ey, 6, RAMPS.gold);
      P.pipe(ex, ey, tx, ty, 5, RAMPS.hull);
      P.sphere(ex, ey, 4.5, 4.5, RAMPS.dark);
      P.line(tx - 3, ty, tx - 4, ty + 5, RAMPS.dark[2]!, 1.5);
      P.line(tx + 3, ty, tx + 4, ty + 5, RAMPS.dark[2]!, 1.5);
    });
  };
  arm(16, 22, 30, 36, 44, big ? 50 : 58);
  arm(112, 22, 100, 40, 84, big ? 50 : 58);
  if (tier === 3) arm(112, 102, 106, 88, 92, 94);
  P.glow(44, big ? 54 : 62, 8, GLOW.heatHi, 0.9);
  P.glow(84, big ? 54 : 62, 6, GLOW.heat, 0.8);
  P.part(() => {
    for (const [x, y] of [[8, 8], [120, 8], [8, 116], [120, 116]] as const) P.light(x, y, GLOW.beacon);
  }, false);
};

const SkunkWorks: Draw = (P, tier) => {
  if (tier === 3)
    P.part(() => {
      P.vcyl(92, 6, 14, 30, RAMPS.dark);
      P.vcyl(108, 12, 12, 24, RAMPS.dark);
    });
  P.part(() => {
    P.box(6, 30, 116, 76);
    P.poly([6, 30, 64, 16, 122, 30], { ramp: RAMPS.hull, dir: [1, 0.3], from: 0.05, to: 0.5 });
    P.seams(8, 32, 112, 72, 9);
    P.stripe(6, 30, 116, 4);
    P.windows(10, 40, 3, 7, 4, 4, 3);
    P.windows(100, 40, 3, 7, 4, 4, 6);
  });
  P.part(() => {
    P.fill(30, 44, 68, 62, RAMPS.dark[4]!);
    P.fill(32, 46, 64, 60, 0xe9c27a);
    P.fill(32, 46, 64, 4, 0xfff0c8);
    P.fill(32, 86, 64, 20, 0x8a6a48);
    P.hazard(30, 40, 68, 4);
  });
  P.part(() => {
    P.poly([38, 76, 54, 66, 86, 66, 94, 72, 86, 80, 44, 80], { ramp: RAMPS.white, dir: [0.2, 1] });
    P.poly([60, 66, 70, 56, 76, 56, 72, 66], { ramp: RAMPS.white, dir: [0.2, 1] });
    P.stripe(60, 72, 22, 3);
    P.fill(78, 68, 6, 3, RAMPS.glass[1]!);
  });
  P.part(() => {
    P.box(40, 82, 6, 22, RAMPS.dark);
    P.box(80, 82, 6, 22, RAMPS.dark);
  });
  P.glow(52, 82, 7, GLOW.heatHi, 0.9);
  P.part(() => {
    P.light(8, 26, GLOW.beacon);
    P.light(118, 26, GLOW.beacon);
  }, false);
};

const ResearchCampus: Draw = (P, tier) => {
  P.part(() => {
    P.vcyl(6, 46, 20, 50);
    P.vcyl(102, 46, 20, 50);
    P.stripe(6, 80, 20, 4);
    P.stripe(102, 80, 20, 4);
    P.windows(10, 58, 2, 7, 3.5, 4, 2);
    P.windows(106, 58, 2, 7, 3.5, 4, 3);
  });
  pod(P, 16, 62, 96, 40, { seed: 7, rows: 2, stripe: -1 });
  const dome = (cx: number, r: number, seed: number) => {
    P.part(() => {
      P.box(cx - r - 2, 60, 2 * r + 4, 5, RAMPS.dark);
      P.sphere(cx, 62, r, r * 0.8, RAMPS.glass, 62);
    });
    P.part(() => {
      for (let i = 0; i < 4; i++) P.box(cx - r * 0.7 + i * r * 0.36, 62 - r * (0.25 + (i % 2) * 0.2), r * 0.3, r * (0.25 + (i % 2) * 0.2), RAMPS.hull);
      P.windows(cx - r * 0.6, 56, 4, r * 0.36, 2, 2, seed, 0.9);
      if (P.fine) for (let a = -0.6; a <= 0.6; a += 0.4) P.line(cx + a * r, 62 - Math.sqrt(1 - a * a) * r * 0.8, cx + a * r, 61, RAMPS.glass[0]!);
    }, false);
  };
  dome(tier === 3 ? 48 : 64, 24, 4);
  if (tier === 3) dome(86, 16, 9);
  P.part(() => P.flag(26, 46, 12, 8));
};

// ---------------------------------------------------------------- science labs

const EnergyLab: Draw = (P, tier) => {
  const l = labPod(P, tier, 74, 32, 5);
  P.part(() => {
    P.box(58, 56, 12, 20, RAMPS.dark);
    for (const x of [l.x + 10, l.x + l.w - 22]) P.vcyl(x, 58, 10, 18, RAMPS.gold);
  });
  P.part(() => P.torus(64, 38, 40 + tier * 4, 16, 9, 5, "back", RAMPS.hull, false));
  P.part(() => P.box(60, 34, 8, 8, RAMPS.dark));
  P.part(() => P.torus(64, 38, 40 + tier * 4, 16, 9, 5, "front", RAMPS.hull, false));
  P.part(() => {
    for (let a = 0; a < 6.28; a += 0.02) P.dot(64 + Math.cos(a) * (35.5 + tier * 4), 38 + Math.sin(a) * 11.5, a % 0.5 < 0.1 ? GLOW.cyanHi : GLOW.cyan);
  }, false);
  P.glow(64, 38, 7, GLOW.cyanHi, 1);
  for (const a of [0.6, 2.5, 4, 5.5]) P.glow(64 + Math.cos(a) * (35.5 + tier * 4), 38 + Math.sin(a) * 11.5, 5, GLOW.cyan, 0.6);
};

const InformationScienceLab: Draw = (P, tier) => {
  const l = labPod(P, tier, 64, 36, 6);
  P.part(() => {
    const masts = [[l.x + 8, 30], [l.x + 18, 18], [l.x + 30, 40], [l.x + 58, 24], [l.x + 70, 34], [l.x + l.w - 10, 44], [l.x + l.w - 22, 28]] as const;
    for (const [x, h] of masts) P.antenna(x, 64, h, h > 30 ? 3 : 2);
  });
  P.part(() => P.dish(l.x + 44, 50, 9, -110, 0.42));
  P.part(() => {
    P.fill(l.x + 10, 72, 40, 18, RAMPS.dark[4]!);
    for (let i = 0; i < 5; i++) {
      P.box(l.x + 12 + i * 7.6, 74, 6, 14, RAMPS.dark);
      for (let j = 0; j < 4; j++) P.dot(l.x + 14 + i * 7.6, 76 + j * 3, (i + j) % 3 ? GLOW.cyan : GLOW.green);
    }
  });
};

const LifeScienceLab: Draw = (P, tier) => {
  const l = labPod(P, tier, 46, 54, 7);
  P.part(() => {
    P.fill(l.x + 8, 56, l.w - 30, 34, RAMPS.dark[4]!);
    P.fill(l.x + 9, 57, l.w - 32, 32, RAMPS.glass[4]!);
    const n = Math.floor((l.w - 34) / 14);
    for (let i = 0; i < n; i++) {
      const tx = l.x + 12 + i * 14;
      P.vcyl(tx, 60, 10, 26, [0xd8ffe0, 0x8ae6a0, 0x5fc27a, 0x3f9a5c, 0x2b7343, 0x1d4f2e]);
      P.box(tx - 1, 84, 12, 4, RAMPS.dark);
      P.box(tx - 1, 58, 12, 3, RAMPS.dark);
      if (P.medium) {
        P.dot(tx + 3, 70, 0xd8ffe0);
        P.dot(tx + 6, 75, 0xd8ffe0);
        P.ellipse(tx + 5, 76, 2.5, 3, 0x2b7343);
      }
    }
  });
  P.part(() => {
    P.antenna(l.x + l.w - 14, 46, 14, 2);
    P.box(l.x + 20, 38, 16, 10, RAMPS.white);
    P.fill(l.x + 26, 40, 4, 6, RAMPS.red[2]!);
    P.fill(l.x + 24, 42, 8, 2, RAMPS.red[2]!);
  });
};

const MaterialsLab: Draw = (P, tier) => {
  const l = labPod(P, tier, 34, 40, 8);
  P.part(() => {
    P.vcyl(28, 70, 36, 40, RAMPS.dark);
    P.fill(36, 86, 20, 14, RAMPS.dark[5]!);
    P.fill(38, 88, 16, 12, GLOW.heat);
    P.fill(40, 90, 12, 6, GLOW.heatHi);
    P.stripe(28, 104, 36, 4);
  });
  P.glow(46, 94, 14, GLOW.heat, 0.7);
  P.part(() => {
    P.box(76, 72, 10, 8, RAMPS.dark);
    P.pipe(81, 76, 96, 92, 5, RAMPS.gold);
    P.pipe(96, 92, 108, 86, 4, RAMPS.hull);
    P.sphere(96, 92, 3.5, 3.5, RAMPS.dark);
  });
  P.part(() => P.poly([106, 88, 110, 82, 114, 88, 110, 96], { ramp: [GLOW.cyanHi, GLOW.cyan, 0x5fc2cc, 0x3e98a3, 0x2b6f78], dir: [1, 1] }));
  P.part(() => P.antenna(l.x + 16, 34, 12, 2));
};

const MilitaryScienceLab: Draw = (P, tier) => {
  const w = 82 + tier * 12, x = 64 - w / 2;
  pod(P, x, 64, w, 40, { seed: 9, ramp: RAMPS.dark, stripe: 0.1 });
  P.part(() => {
    for (let i = 0; i < Math.floor((w - 26) / 18); i++) P.box(x + 20 + i * 18, 70, 15, 28, RAMPS.dark, 0.15);
    P.hazard(x + 20, 96, w - 28, 3);
  });
  P.part(() => {
    P.box(28, 48, 22, 18, RAMPS.dark);
    P.box(48, 50, 72, 7, RAMPS.hull);
    P.box(48, 56, 72, 3, RAMPS.dark);
    for (let i = 0; i < 6; i++) P.box(54 + i * 11, 48, 4, 11, RAMPS.gold);
  });
  P.glow(122, 53, 6, GLOW.cyan, 0.8);
  P.part(() => P.antenna(36, 48, 14, 2));
};

const SocialScienceLab: Draw = (P, tier) => {
  const l = labPod(P, tier, 66, 36, 10);
  P.part(() => {
    P.pipe(30, 66, 30, 54, 3, RAMPS.dark);
    P.box(8, 18, 52, 38, RAMPS.dark);
    P.fill(11, 21, 46, 32, 0x0e1a24);
    const bars = [10, 16, 12, 22, 18, 26];
    bars.forEach((h, i) => P.fill(14 + i * 7, 50 - h, 5, h, i % 2 ? GLOW.window : GLOW.cyan));
    P.line(14, 40, 54, 26, RAMPS.white[0]!, 0.8);
  });
  P.part(() => {
    P.box(78, 62, 36, 6, RAMPS.dark);
    P.sphere(96, 64, 18, 16, RAMPS.glass, 64);
  });
  P.part(() => {
    P.fill(84, 56, 24, 7, 0x5c4a3a);
    P.windows(84, 54, 5, 5, 3, 2, 3, 0.9);
    P.ellipse(96, 58, 7, 2.5, RAMPS.ore[1]!);
  }, false);
};

const SpaceScienceLab: Draw = (P, tier) => {
  const l = labPod(P, tier, 74, 34, 11);
  P.part(() => {
    P.box(46, 64, 20, 12, RAMPS.dark);
    P.pipe(56, 66, 56, 56, 6, RAMPS.dark);
  });
  P.part(() => {
    P.pipe(30, 74, 104, 14, 22, RAMPS.white);
    P.pipe(44, 63, 66, 45, 23, RAMPS.gold);
  });
  P.part(() => {
    P.shaded(104, 14, 10, 7, (nx, ny, px, py) => (nx * nx + ny * ny > 0.55 ? RAMPS.white[2]! : P.shade(RAMPS.glass, 0.7 + ny * 0.2, px, py)));
  });
  P.part(() => P.dish(l.x + l.w - 14, 58, 12, -100, 0.45));
  P.part(() => {
    P.light(118, 6, RAMPS.white[0]!);
    P.light(122, 22, RAMPS.white[1]!);
  }, false);
};

const ClimateLab: Draw = (P, tier) => {
  P.part(() => P.truss(4, 46, 124, 46, 6));
  wing(P, 2, 20, 30, 22, 5, 3);
  wing(P, 96, 20, 30, 22, 5, 3);
  if (tier >= 2) {
    wing(P, 2, 52, 30, 18, 5, 3);
    wing(P, 96, 52, 30, 18, 5, 3);
  }
  const l = labPod(P, tier === 3 ? 2 : 1, 34, 36, 12);
  void l;
  P.part(() => {
    P.box(40, 70, 48, 20, RAMPS.gold, 0.25);
    P.seams(42, 72, 44, 16, 8, RAMPS.gold[4]!);
    P.stripe(40, 70, 48, 3);
  });
  P.part(() => {
    P.sphere(64, 92, 12, 7, RAMPS.dark, 99);
    P.ellipse(64, 96, 6, 2.5, GLOW.cyan);
  });
  P.part(() => {
    for (const dx of [-18, -6, 6, 18]) for (let y = 104; y < 124; y += 3) P.dot(64 + dx * ((y - 96) / 26), y, GLOW.cyan);
  }, false);
  P.glow(64, 97, 8, GLOW.cyan, 0.7);
};

// ---------------------------------------------------------------- power

const SolarCollector: Draw = (P, tier) => {
  const pairs = tier + 1;
  const span = 120 / pairs;
  P.part(() => P.truss(64, 4, 64, 124, 9));
  for (let i = 0; i < pairs; i++) {
    const y = 4 + i * span + 2;
    P.part(() => {
      P.pipe(26, y + span / 2 - 2, 102, y + span / 2 - 2, 2.5, RAMPS.dark);
    });
    wing(P, 4, y, 54, span - 6, 6, Math.max(2, Math.round((span - 6) / 8)));
    wing(P, 70, y, 54, span - 6, 6, Math.max(2, Math.round((span - 6) / 8)));
  }
  P.part(() => {
    P.box(54, 52, 20, 24);
    P.stripe(54, 58, 20, 5);
    P.windows(57, 66, 3, 5, 3, 3, 2);
    P.light(64, 50, GLOW.beacon);
  });
};

const SolarMirror: Draw = (P, tier) => {
  const r = tier === 1 ? 48 : tier === 2 ? 54 : 58;
  P.part(() => {
    P.pipe(64, 112, 64 - r * 0.5, 64, 3, RAMPS.dark);
    P.pipe(64, 112, 64 + r * 0.6, 70, 3, RAMPS.dark);
  });
  const sheet = (cx: number, cy: number, w: number, h: number) =>
    P.part(() => {
      P.poly([cx - w / 2, cy - h / 2 + 8, cx + w / 2, cy - h / 2, cx + w / 2 - 6, cy + h / 2 - 8, cx - w / 2 - 6, cy + h / 2], { ramp: RAMPS.mirror, dir: [0.8, 1], from: 0.05, to: 0.75 });
      if (P.medium)
        for (let i = 1; i < 4; i++) {
          const t = i / 4;
          P.line(cx - w / 2 + w * t, cy - h / 2 + 8 - 8 * t, cx - w / 2 - 6 + w * t, cy + h / 2 - 8 * t, RAMPS.mirror[4]!);
        }
    });
  if (tier === 3) {
    sheet(36, 50, 52, 76);
    sheet(94, 46, 52, 76);
  } else sheet(64, 52, r * 1.9, r * 1.4);
  P.part(() => {
    P.box(50, 106, 28, 16);
    P.stripe(50, 110, 28, 4);
    P.windows(54, 116, 4, 6, 3, 3, 2);
  });
  P.part(() => P.antenna(72, 106, 10, 1));
};

/** A reactor vessel: a vertical cylinder under a domed head, its shadow shield, hazard banding. */
function vessel(P: Painter, x: number, y: number, w: number, h: number): void {
  P.part(() => {
    P.vcyl(x, y + w * 0.3, w, h - w * 0.3, RAMPS.hull, false);
    P.sphere(x + w / 2, y + w * 0.32, w / 2, w * 0.32, RAMPS.hull, y + w * 0.34);
    P.hazard(x + 1, y + h * 0.62, w - 2, 4);
    P.stripe(x + 1, y + h - 12, w - 2, 4);
    P.seams(x + 3, y + w * 0.4, w - 6, h * 0.5, 7);
    P.windows(x + w / 2 - 2, y + h * 0.3, 1, 0, 4, 5, 1, 1);
  });
}

const FissionPile: Draw = (P, tier) => {
  const n = tier;
  P.part(() => {
    for (let i = 0; i < 4; i++) {
      P.radiator(2, 20 + i * 24, 34, 18, true, 4);
      P.radiator(92, 20 + i * 24, 34, 18, true, 4);
    }
  });
  P.part(() => {
    P.pipe(30, 30, 98, 30, 4, RAMPS.dark);
    P.pipe(30, 100, 98, 100, 4, RAMPS.dark);
  });
  const w = n === 1 ? 36 : n === 2 ? 26 : 20;
  for (let i = 0; i < n; i++) vessel(P, 64 - (n * (w + 2)) / 2 + i * (w + 2) + 1, 12 + (i % 2) * 6, w, 102);
  P.part(() => P.box(30, 112, 68, 10, RAMPS.dark));
};

const HeavyFissionPile: Draw = (P, tier) => {
  P.part(() => {
    P.poly([4, 30, 34, 40, 34, 96, 4, 106], { ramp: RAMPS.white, dir: [0, 1], from: 0.05, to: 0.5 });
    P.poly([124, 30, 94, 40, 94, 96, 124, 106], { ramp: RAMPS.white, dir: [0, 1], from: 0.2, to: 0.65 });
  });
  P.part(() => {
    if (!P.medium) return;
    for (let y = 40; y < 100; y += 6) {
      P.line(6, y - 7, 33, y, RAMPS.white[4]!);
      P.line(122, y - 7, 95, y, RAMPS.white[4]!);
    }
  }, false);
  const units = tier === 1 ? [64] : tier === 2 ? [48, 80] : [40, 64, 88];
  const w = tier === 1 ? 52 : tier === 2 ? 30 : 22;
  for (const cx of units)
    P.part(() => {
      P.vcyl(cx - w / 2, 18, w, 96, RAMPS.dark, true);
      P.fill(cx - w / 2 + 4, 44, w - 8, 30, RAMPS.dark[5]!);
      P.fill(cx - w / 2 + 6, 46, w - 12, 26, GLOW.cyan);
      for (let x = cx - w / 2 + 8; x < cx + w / 2 - 7; x += 5) P.fill(x, 48, 2, 22, GLOW.cyanHi);
      P.hazard(cx - w / 2 + 2, 84, w - 4, 4);
      P.stripe(cx - w / 2 + 2, 96, w - 4, 5);
    });
  for (const cx of units) P.glow(cx, 60, w * 0.6, GLOW.cyan, 0.5);
  P.part(() => P.box(28, 112, 72, 10, RAMPS.dark));
};

const FusionPile: Draw = (P, tier) => {
  const A = 46 + tier * 4;
  P.part(() => {
    P.box(14, 90, 100, 28);
    P.stripe(14, 96, 100, 5);
    P.windows(20, 106, 13, 7, 3.5, 4, 3);
    P.hatch(56, 104, 16, 12);
  });
  P.part(() => P.torus(64, 56, A, 28, 18, 14, "back"));
  P.part(() => P.ellipse(64, 56, A - 22, 8, 0x2a1740), false);
  P.part(() => P.torus(64, 56, A, 28, 18, 14, "front", RAMPS.hull, false));
  P.part(() => {
    for (const t of [-0.82, -0.5, -0.16, 0.16, 0.5, 0.82]) {
      const x = 64 + t * (A - 8);
      const y = 56 + Math.sqrt(1 - t * t) * 22;
      P.box(x - 3, y - 6, 6, 18, RAMPS.gold, 0.2);
    }
  }, true);
  P.part(() => {
    for (let a = Math.PI; a < Math.PI * 2; a += 0.06) P.dot(64 + Math.cos(a) * (A - 10), 56 + Math.sin(a) * 18, GLOW.violetHi);
  }, false);
  P.glow(64, 44, A * 0.7, GLOW.violet, 0.45);
};

const HeavyFusionPile: Draw = (P, tier) => {
  P.part(() => {
    P.radiator(2, 8, 22, 112, false, 5);
    P.radiator(104, 8, 22, 112, false, 5);
  });
  const beams = tier === 1 ? 4 : 8;
  P.part(() => {
    for (let i = 0; i < beams; i++) {
      const a = (i / beams) * Math.PI * 2 + Math.PI / 4;
      P.pipe(64 + Math.cos(a) * 20, 64 + Math.sin(a) * 20, 64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46, 7, RAMPS.hull);
    }
  });
  P.part(() => {
    for (let i = 0; i < beams; i++) {
      const a = (i / beams) * Math.PI * 2 + Math.PI / 4;
      P.box(64 + Math.cos(a) * 48 - 6, 64 + Math.sin(a) * 48 - 6, 12, 12, RAMPS.gold, 0.2);
    }
  });
  P.part(() => {
    P.sphere(64, 64, 26, 26);
    P.stripe(39, 76, 50, 4);
    P.fill(58, 56, 12, 12, RAMPS.dark[5]!);
    P.fill(60, 58, 8, 8, GLOW.cyanHi);
  });
  P.glow(64, 62, 16, GLOW.cyan, 0.6);
};

// ---------------------------------------------------------------- exotic

const AntimatterTrap: Draw = (P, tier) => {
  const rings = tier + 2;
  P.part(() => P.pipe(16, 56, 16, 90, 5, RAMPS.dark));
  P.part(() => P.box(4, 51, 120, 10, RAMPS.dark));
  const xs = Array.from({ length: rings }, (_, i) => 36 + (i * 76) / (rings - 1));
  for (const x of xs) {
    P.part(() =>
      P.shaded(x, 56, 12, 40, (nx, ny, px, py) => {
        const d = nx * nx + ny * ny;
        if (d < 0.42) return P.shade([GLOW.violetHi, GLOW.violet, 0x8a5cc8, 0x5a3a8a, 0x35214f], 0.35 + d * 1.6, px, py);
        return nx < 0 ? P.shade(RAMPS.hull, 0.2 + ny * 0.2, px, py) : P.shade(RAMPS.hull, 0.6 + ny * 0.15, px, py);
      }),
    );
    P.part(() => {
      for (let y = 22; y < 92; y += 10) P.box(x - 12, y, 4, 5, RAMPS.gold, 0.2);
    });
  }
  P.part(() => {
    for (let x = 6; x < 124; x += 1) {
      P.dot(x, 55, (x & 3) === 0 ? GLOW.violetHi : GLOW.violet);
      P.dot(x, 56, GLOW.violet);
    }
  }, false);
  for (const x of xs) P.glow(x, 56, 12, GLOW.violet, 0.7);
  P.part(() => {
    P.box(2, 86, 30, 30);
    P.stripe(2, 90, 30, 4);
    P.windows(6, 98, 3, 8, 4, 4, 2);
    P.hazard(2, 110, 30, 3);
  });
};

const ParticleCollider: Draw = (P, tier) => {
  const A = 50 + tier * 4, B = 30 + tier * 2;
  P.part(() => P.torus(64, 54, A, B, 9, 8, "back", RAMPS.hull, false));
  P.part(() => P.torus(64, 54, A, B, 9, 8, "front", RAMPS.hull, false));
  P.part(() => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (Math.abs(a - Math.PI / 2) < 0.4) continue;
      const x = 64 + Math.cos(a) * (A - 4.5), y = 54 + Math.sin(a) * (B - 3);
      P.box(x - 3.5, y - 3, 7, 6 + (Math.sin(a) > 0 ? 6 : 0), i % 2 ? RAMPS.gold : RAMPS.solar, 0.2);
    }
  });
  P.part(() => {
    for (let a = 0; a < Math.PI * 2; a += 0.04) P.dot(64 + Math.cos(a) * (A - 4.5), 53 + Math.sin(a) * (B - 3), GLOW.cyan);
  }, false);
  P.part(() => {
    P.box(44, 78, 40, 36);
    P.fill(52, 84, 24, 22, RAMPS.dark[5]!);
    P.ellipse(64, 95, 10, 10, RAMPS.dark[3]!);
    P.ellipse(64, 95, 6, 6, GLOW.cyan);
    P.stripe(44, 108, 40, 4);
  });
  P.glow(64, 95, 10, GLOW.cyanHi, 0.9);
};

const Helium3Mine: Draw = (P, tier) => {
  P.part(() => {
    P.poly([96, 44, 114, 18, 120, 18, 112, 48], { ramp: RAMPS.hull, dir: [1, 0] });
    P.poly([96, 84, 114, 110, 120, 110, 112, 80], { ramp: RAMPS.dark, dir: [1, 0] });
  });
  P.part(() => {
    P.poly([26, 40, 104, 46, 124, 60, 124, 68, 104, 82, 26, 88], { ramp: RAMPS.hull, dir: [0, 1], from: 0.05, to: 0.75 });
    P.seams(32, 46, 70, 36, 12);
    P.windows(64, 52, 5, 7, 4, 4, 3);
    P.stripe(38, 70, 60, 5);
  });
  if (tier >= 2) P.part(() => P.hcyl(40, 84, 50, 14));
  P.part(() => {
    P.poly([4, 24, 30, 40, 30, 88, 4, 104], { ramp: RAMPS.dark, dir: [1, 0.3], from: 0.15, to: 0.8 });
    P.poly([6, 34, 26, 46, 26, 82, 6, 94], RAMPS.dark[5]!);
  });
  P.glow(6, 64, 22, GLOW.heat, 0.7);
  P.part(() => {
    P.fill(122, 60, 4, 8, GLOW.cyanHi);
  });
  P.glow(126, 64, 6, GLOW.cyan, 0.8);
};

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

const Quarters: Draw = (P, tier) => {
  const w = tier === 1 ? 92 : 112, x = 64 - w / 2;
  if (tier === 3) {
    pod(P, x + 8, 22, w - 16, 34, { seed: 12, rows: 2 });
    P.part(() => P.box(58, 54, 12, 14, RAMPS.dark));
  }
  port(P, x + 2, 82, "left", 4, 16);
  port(P, x + w - 2, 82, "right", 4, 16);
  pod(P, x, 60, w, 46, { seed: 2, rows: 3 });
  P.part(() => P.greebles(x + 30, 52, w - 60, 8, 7));
  P.part(() => P.antenna(x + 16, tier === 3 ? 26 : 62, 12, 2));
};

const HydroponicsBay: Draw = (P, tier) => {
  const houses = tier === 3 ? [[4, 58], [66, 58]] : [[64 - (44 + tier * 10), (44 + tier * 10) * 2]];
  for (const [x, w] of houses) {
    P.part(() => {
      P.box(x!, 84, w!, 24);
      P.stripe(x!, 88, w!, 4);
      P.windows(x! + 5, 96, Math.floor((w! - 8) / 7), 7, 3.5, 4, 4);
    });
    P.part(() => {
      P.shaded(x! + w! / 2, 84, w! / 2, 44, (nx, ny, px, py) => (ny > 0 ? -1 : P.shade(RAMPS.glass, 0.65 + nx * 0.1 - ny * 0.1, px, py, 0.4)));
    });
    P.part(() => {
      for (let i = 0; i < w! - 8; i += 4) {
        const px = x! + 5 + i, h = 8 + ((i * 37) % 13);
        const top = Math.max(84 - h, 84 - 44 * Math.sqrt(Math.max(0, 1 - ((px - x! - w! / 2) / (w! / 2)) ** 2)) + 6);
        P.ellipse(px, top + 3, 3, 4, i % 8 ? RAMPS.green[2]! : RAMPS.green[1]!);
        P.fill(px - 0.5, top + 4, 1.5, 84 - top - 4, RAMPS.green[4]!);
        if (P.medium) P.dot(px - 1, top + 1, RAMPS.green[0]!);
      }
      P.fill(x! + 2, 80, w! - 4, 4, 0x5c4a3a);
      for (let a = -0.66; a <= 0.67; a += 0.33) P.line(x! + w! / 2 + a * (w! / 2), 84 - Math.sqrt(1 - a * a) * 44, x! + w! / 2 + a * (w! / 2), 83, RAMPS.hull[3]!);
      P.line(x! + 4, 62, x! + w! - 4, 62, RAMPS.hull[3]!);
      if (P.medium) for (let gx = x! + 10; gx < x! + w! - 6; gx += 14) P.fill(gx, 56, 6, 1.5, 0xff8ad8);
    }, false);
  }
};

const OrbitalHospital: Draw = (P, tier) => {
  const w = tier === 2 ? 100 : 116, x = 64 - w / 2;
  port(P, x + 2, 70, "left", 4, 16);
  pod(P, x, 44, w, 52, { seed: 3, rows: 2, ramp: RAMPS.white, stripe: 0.88 });
  const cross = (cx: number, cy: number, s: number) =>
    P.part(() => {
      P.fill(cx - s * 1.5, cy - s * 0.5, s * 3, s, RAMPS.red[2]!);
      P.fill(cx - s * 0.5, cy - s * 1.5, s, s * 3, RAMPS.red[2]!);
      P.fill(cx - s * 1.5, cy - s * 0.5, s * 3, 1.5, RAMPS.red[1]!);
      P.fill(cx - s * 0.5, cy - s * 1.5, s, 1.5, RAMPS.red[1]!);
    });
  cross(64, 70, 9);
  if (tier === 3) {
    cross(32, 70, 6);
    P.part(() => P.hcyl(80, 96, 30, 16, RAMPS.white));
  }
  P.part(() => P.antenna(96, 44, 14, 2));
  P.light(x + 6, 46, GLOW.beacon);
};

const TouristBerth: Draw = (P, tier) => {
  const w = 88 + tier * 12, x = 64 - w / 2;
  P.part(() => {
    P.hcyl(x, 36, w, 58);
    P.stripe(x + 4, 82, w - 8, 4);
    P.handrail(x + 8, x + w - 8, 42);
  });
  P.part(() => {
    P.fill(x + 8, 48, w - 16, 30, RAMPS.dark[4]!);
    P.fill(x + 9, 49, w - 18, 28, RAMPS.glass[3]!);
    P.fill(x + 9, 64, w - 18, 13, 0xe9c27a);
    P.fill(x + 9, 64, w - 18, 2, 0xfff0c8);
    for (let i = x + 20; i < x + w - 10; i += 18) {
      P.fill(i, 66, 8, 5, RAMPS.red[3]!);
      P.ellipse(i + 12, 62, 3, 4, RAMPS.green[2]!);
      P.fill(i + 11.5, 64, 1, 6, RAMPS.green[4]!);
    }
    for (let i = x + 9; i < x + w - 9; i += 14) P.fill(i, 49, 1.5, 28, RAMPS.hull[3]!);
    if (P.medium) for (let i = x + 14; i < x + w - 20; i += 23) P.line(i, 50, i + 8, 58, RAMPS.glass[0]!);
  });
  if (tier === 3)
    P.part(() => {
      P.sphere(64, 36, 22, 14, RAMPS.glass, 36);
    });
  P.part(() => {
    P.box(54, 92, 20, 10, RAMPS.dark);
    P.light(x + 4, 64, GLOW.beacon);
    P.light(x + w - 5, 64, GLOW.beacon);
  });
};

const BroadcastOutlet: Draw = (P, tier) => {
  P.part(() => {
    P.pipe(64, 82, 64, 18, 5, RAMPS.hull);
    P.line(52, 46, 76, 46, RAMPS.dark[2]!, 2);
    P.light(64, 14, GLOW.beacon);
  });
  const dishes: [number, number, number, number][] = [
    [30, 34, 22, -150],
    [98, 34, 22, -30],
  ];
  if (tier >= 2) dishes.push([24, 66, 13, 170], [104, 66, 13, 10]);
  if (tier === 3) dishes.push([64, 26, 12, -90]);
  P.part(() => {
    for (const [x, y] of dishes) P.pipe(64, y + 10, x, y, 3, RAMPS.dark);
  });
  for (const [x, y, r, a] of dishes) P.part(() => P.dish(x, y, r, a, 0.42));
  pod(P, 10, 80, 108, 38, { seed: 6, rows: 1 });
  P.part(() => {
    for (const [x, y, , a] of dishes) {
      const fx = Math.cos((a * Math.PI) / 180), fy = Math.sin((a * Math.PI) / 180);
      for (let i = 1; i <= 2; i++) P.dot(x + fx * (14 + i * 7), y + fy * (14 + i * 7), GLOW.cyan);
    }
  }, false);
};

const ListeningPost: Draw = (P, tier) => {
  const r = 38 + tier * 4;
  pod(P, 4, 88, 92, 32, { seed: 8 });
  P.part(() => {
    P.box(38, 70, 20, 20, RAMPS.dark);
    P.pipe(48, 72, 56, 56, 7, RAMPS.dark);
  });
  P.part(() => P.dish(58, 48, r, -55, 0.4));
  P.part(() => {
    for (const [x, h] of [[104, 60], [116, 44]] as const) {
      P.line(x, 120, x, 120 - h, RAMPS.dark[1]!, 1.2);
      for (let y = 120 - h + 4; y < 116; y += 6) P.line(x - 5, y, x + 5, y, RAMPS.dark[2]!);
    }
    P.light(104, 59, GLOW.beacon);
    P.light(116, 75, GLOW.beacon);
  });
  if (tier >= 2) P.part(() => P.dish(16, 74, 10, -120, 0.42));
};

const MarinePlatoonBarracks: Draw = (P, tier) => {
  const w = 92 + tier * 10, x = 64 - w / 2;
  P.part(() => P.greebles(x + 12, 22, w - 24, 8, 5));
  P.part(() => {
    P.poly([x + 6, 30, x + w - 6, 30, x + w, 38, x, 38], { ramp: RAMPS.dark, dir: [1, 0], from: 0, to: 0.4 });
    P.box(x, 38, w, 74, RAMPS.dark, 0.2);
    for (let i = 0; i < Math.floor(w / 20); i++) {
      P.box(x + 4 + i * 20, 42, 17, 30, RAMPS.dark, 0.1);
      P.box(x + 4 + i * 20, 76, 17, 32, RAMPS.dark, 0.25);
    }
    for (let i = 0; i < Math.floor(w / 20); i++) P.fill(x + 7 + i * 20, 48, 11, 2.5, GLOW.window);
    P.stripe(x, 72, w, 4);
  });
  P.part(() => {
    P.box(46, 62, 36, 50, RAMPS.hull, 0.35);
    P.fill(50, 66, 28, 44, RAMPS.hull[4]!);
    P.box(52, 68, 24, 40, RAMPS.hull, 0.45);
    P.ellipse(64, 86, 7, 7, RAMPS.gold[2]!);
    P.ellipse(64, 86, 3, 3, RAMPS.gold[4]!);
    P.hazard(46, 112, 36, 4);
    P.fill(54, 70, 20, 4, P.faction[2]!);
  });
  P.part(() => {
    P.light(x + 2, 34, GLOW.beacon);
    P.light(x + w - 3, 34, GLOW.beacon);
  }, false);
};

const PointDefenseArray: Draw = (P, tier) => {
  const turret = (cx: number, cy: number, s: number) => {
    P.part(() => {
      P.poly([cx - 26 * s, cy + 22 * s, cx + 26 * s, cy + 22 * s, cx + 18 * s, cy + 10 * s, cx - 18 * s, cy + 10 * s], { ramp: RAMPS.hull, dir: [1, 0] });
      P.box(cx - 30 * s, cy + 22 * s, 60 * s, 8 * s, RAMPS.dark);
      P.stripe(cx - 28 * s, cy + 24 * s, 56 * s, 3 * s);
    });
    P.part(() => {
      P.pipe(cx + 2 * s, cy - 6 * s, cx + 32 * s, cy - 38 * s, 5 * s, RAMPS.dark);
      P.pipe(cx + 8 * s, cy - 2 * s, cx + 38 * s, cy - 34 * s, 5 * s, RAMPS.dark);
    });
    P.part(() => {
      P.sphere(cx, cy, 20 * s, 16 * s, RAMPS.hull, cy + 10 * s);
      P.box(cx - 20 * s, cy + 2 * s, 40 * s, 9 * s, RAMPS.hull, 0.45);
      P.fill(cx - 12 * s, cy - 6 * s, 8 * s, 4 * s, GLOW.cyan);
    });
    P.glow(cx + 35 * s, cy - 37 * s, 5 * s, GLOW.heat, 0.7);
  };
  if (tier === 1) turret(54, 76, 1.25);
  else {
    turret(32, 84, 0.8);
    turret(92, 64, 0.8);
    if (tier === 3) turret(36, 40, 0.6);
  }
  P.part(() => P.dish(110, 104, 10, -110, 0.42));
};

const SpaceDock: Draw = (P, tier) => {
  P.part(() => {
    P.truss(4, 14, 124, 14, 10);
    P.truss(4, 114, 124, 114, 10);
    P.truss(8, 14, 8, 114, 10);
  });
  P.part(() => {
    for (const x of [44, 84]) P.truss(x, 18, x, 110, 6);
    P.ladder(51, 22, 84);
  }, true);
  const l = tier === 1 ? 74 : tier === 2 ? 90 : 104;
  P.part(() => {
    P.poly([18, 50, 18 + l - 18, 46, 18 + l, 64, 18 + l - 18, 82, 18, 78], { ramp: RAMPS.hull, dir: [0, 1], from: 0.05, to: 0.75 });
    P.box(14, 52, 8, 24, RAMPS.dark);
    P.seams(24, 50, l - 26, 30, 10);
    P.windows(30, 58, Math.floor((l - 34) / 7), 7, 3.5, 4, 6);
    P.stripe(26, 70, l - 32, 4);
  });
  P.part(() => {
    P.fill(12, 56, 4, 16, GLOW.heat);
  }, false);
  P.glow(12, 64, 8, GLOW.heat, 0.5);
  P.part(() => {
    for (const x of [44, 84]) {
      P.pipe(x, 22, x, 44, 3, RAMPS.gold);
      P.pipe(x, 106, x, 84, 3, RAMPS.gold);
    }
  });
  P.part(() => {
    for (const [x, y] of [[4, 10], [124, 10], [4, 118], [124, 118], [64, 10], [64, 118]] as const) P.light(x, y, GLOW.beacon);
  }, false);
};

const SupplyDepot: Draw = (P) => {
  P.part(() => P.truss(4, 112, 124, 112, 10));
  P.part(() => {
    P.pipe(30, 40, 30, 106, 3, RAMPS.dark);
    P.pipe(54, 40, 54, 106, 3, RAMPS.dark);
  });
  P.part(() => P.sphere(42, 34, 26, 26));
  P.part(() => {
    P.stripe(16, 32, 52, 4);
    P.fill(26, 40, 32, 1.5, RAMPS.gold[2]!);
  }, false);
  P.part(() => P.sphere(42, 82, 24, 22, RAMPS.gold));
  P.part(() => {
    P.box(72, 74, 26, 34);
    P.box(98, 82, 24, 26);
    P.box(78, 46, 30, 28);
    P.stripe(74, 78, 22, 4);
    P.hazard(98, 104, 24, 3);
    P.stripe(80, 50, 26, 4);
  });
  P.part(() => {
    P.seams(74, 82, 22, 24, 7);
    P.seams(80, 54, 26, 18, 8);
    P.fill(102, 88, 10, 6, RAMPS.dark[4]!);
  }, false);
  P.part(() => P.pipe(64, 84, 72, 92, 3, RAMPS.dark));
  P.light(42, 7, GLOW.beacon);
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
