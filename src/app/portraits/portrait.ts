// Procedural pixel-art councilor portraits in a JRPG anime style (SPEC 2.12: pixel portraits),
// after the reference sheet in docs/screenshots/conquest_of_sol_sample_portraits.png: head
// and shoulders on a dark card with a glow of the faction's colour, semi-realistic anime
// faces, big glossy hair and outfits that follow the councilor's profession.
//
// The simulation stores only a councilor's gender and a portrait seed. This module turns them
// into a 128×150 sprite. Shapes are written in "design units" on a 96-wide grid and rasterised
// at the sprite's real resolution. Every pixel records a material (skin, hair, cloth…), a
// light level from a simple 3D model (a sphere for the head, cylinders for hair locks and a
// rounded torso, lit from the upper left), a depth and the part that painted it. Rendering
// turns light into the material's hue-shifted colour ramp, draws line art in each material's
// own dark colour where a part overlaps one behind it, adds the anime shine ring on the hair
// and a dark outline around the figure.

import type { Gender } from "../../sim/index";

export const PORTRAIT_WIDTH = 128;
export const PORTRAIT_HEIGHT = 150;
const W = PORTRAIT_WIDTH;
const H = PORTRAIT_HEIGHT;
/** Pixels per design unit. */
const S = W / 96;
/** The figure's vertical axis in design units. */
const CX = 48;
/** The figure is drawn this much larger than its design, about a point between the eyes. */
const ZOOM = 1.12;
const ZOOM_Y = 54;
/** Design units of a pixel centre, and the pixel range covering a design-unit span. */
const toX = (px: number) => CX + ((px + 0.5) / S - CX) / ZOOM;
const toY = (py: number) => ZOOM_Y + ((py + 0.5) / S - ZOOM_Y) / ZOOM;
const pxX = (x: number) => (CX + (x - CX) * ZOOM) * S;
const pxY = (y: number) => (ZOOM_Y + (y - ZOOM_Y) * ZOOM) * S;

type Rgb = readonly [number, number, number];
type Vec3 = readonly [number, number, number];

// --- Materials and depth ------------------------------------------------------------------

/** Pixel materials. Each has a colour ramp, dark to light (see palette). */
export const Mat = {
  None: 0,
  Skin: 1,
  Hair: 2,
  Sclera: 3,
  Iris: 4,
  Ink: 5,
  Shine: 6,
  Lip: 7,
  Blush: 8,
  Stubble: 9,
  Cloth: 10,
  Shirt: 11,
  Accent: 12,
  Metal: 13,
  Frame: 14,
  Hat: 15,
  Gear: 16,
  Outline: 17,
} as const;
type Mat = (typeof Mat)[keyof typeof Mat];

// Depths, back to front.
const Z_BACK_HAIR = 1;
const Z_NECK = 2;
const Z_BODY = 3;
const Z_TRIM = 4;
const Z_CURTAIN = 5;
const Z_EARS = 6;
const Z_FACE = 7;
const Z_FEATURES = 8;
const Z_FACIAL_HAIR = 9;
const Z_GLASSES = 10;
const Z_FRONT_HAIR = 11;
const Z_HAT = 12;
const Z_GEAR = 13;

/** Light from the upper left and in front (screen y points down). */
const LIGHT: Vec3 = normalize([-0.5, -0.62, 0.6]);

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
/** Diffuse light on a surface normal, 0–1. */
const diffuse = (n: Vec3) => clamp(n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);

// --- Palettes ---------------------------------------------------------------------------

const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Skin base tones, fair to deep. */
/** Skin tones, fair to deep; Customize picks one by index. */
export const SKIN = ["#ffe3d3", "#fbd2b6", "#f0bd96", "#d9a077", "#b67c55", "#8e5a3a", "#64402a"];

/** Hair base colours; the last few are rarer anime colours. */
const HAIR = [
  "#26222e", // black
  "#4a2e22", // dark brown
  "#7a4a2c", // brown
  "#a85a2e", // chestnut
  "#d56a2c", // ginger
  "#e8c46a", // blonde
  "#e6e0d2", // platinum
  "#9a9ba4", // grey
  "#9c2a48", // crimson
  "#b48ee0", // lavender
  "#3a9ee8", // sky blue
  "#2f3f8e", // navy
  "#5b3a8a", // violet
];
const HAIR_WEIGHTS = [12, 9, 9, 7, 6, 8, 3, 5, 4, 4, 4, 4, 4];

/** Iris base colours. */
const EYES = ["#7a4424", "#a8642a", "#c88a2a", "#3f9a5a", "#3a78d0", "#7f8fa6", "#8a56d8", "#b0503a"];
const EYE_WEIGHTS = [16, 10, 8, 8, 9, 4, 3, 2];

type Clothing = "suit" | "coat" | "labcoat" | "uniform" | "fatigues" | "flightsuit" | "turtleneck" | "jacket";

const CLOTHING_BY_PROFESSION: Record<string, Clothing> = {
  executive: "suit",
  politician: "suit",
  diplomat: "suit",
  tycoon: "suit",
  kingpin: "suit",
  inspector: "coat",
  journalist: "coat",
  scientist: "labcoat",
  officer: "uniform",
  commando: "fatigues",
  astronaut: "flightsuit",
  hacker: "turtleneck",
  spy: "turtleneck",
  activist: "jacket",
  judge: "suit",
  attorney: "suit",
  evangelist: "suit",
  celebrity: "suit",
  investigator: "coat",
  fixer: "coat",
  professor: "turtleneck",
  "tech-mogul": "turtleneck",
  engineer: "jacket",
  operative: "fatigues",
  rebel: "fatigues",
};

/** Cloth base colours per clothing type, and the shirt worn under it. */
const CLOTH: Record<Clothing, { cloth: string[]; shirt: string[] }> = {
  suit: { cloth: ["#2a3346", "#3a3a42", "#4a2a34", "#2e3a34"], shirt: ["#eef1f4", "#dfe6ee", "#f3ece0"] },
  coat: { cloth: ["#a8865a", "#6d6152", "#4a5462"], shirt: ["#eef1f4", "#2a2e36"] },
  labcoat: { cloth: ["#eef2f6"], shirt: ["#3c8a5e", "#3a5e9a", "#7a3a52", "#2a2e36"] },
  uniform: { cloth: ["#22304e", "#2e3a28", "#3a3a40"], shirt: ["#eef1f4"] },
  fatigues: { cloth: ["#4e5a36", "#5e5340", "#3e4a52"], shirt: ["#2a2e26"] },
  flightsuit: { cloth: ["#e6e9ee", "#d0662a"], shirt: ["#3a3f4a"] },
  turtleneck: { cloth: ["#22252c", "#3a2e46", "#5a2a2a", "#2a3a4a"], shirt: ["#22252c"] },
  jacket: { cloth: ["#8a3a2e", "#3a5a70", "#5a6a3a", "#3e3a48"], shirt: ["#e8e4da", "#2a2e36", "#c8b48a"] },
};

type Headgear = "none" | "beanie" | "beret" | "headset" | "headphones" | "earpiece";

/** Headgear by profession, with weights; most councilors wear none. */
const HEADGEAR: Record<string, [Headgear, number][]> = {
  astronaut: [["headset", 5], ["none", 5]],
  hacker: [["headphones", 4], ["beanie", 3], ["none", 4]],
  activist: [["beanie", 3], ["none", 7]],
  commando: [["beret", 5], ["none", 5]],
  spy: [["earpiece", 4], ["none", 6]],
  journalist: [["none", 1]],
  operative: [["earpiece", 5], ["none", 5]],
  rebel: [["beanie", 4], ["beret", 2], ["none", 4]],
  celebrity: [["headphones", 2], ["none", 8]],
  engineer: [["headset", 3], ["none", 7]],
};

// --- Seeded choices -----------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted(rand: () => number, weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r < 0) return i;
  }
  return weights.length - 1;
}

export const FEMALE_HAIR = ["long", "wavy", "curly", "bob", "ponytail", "bun", "braids", "pixie", "swept"] as const;
export const MALE_HAIR = ["short", "spiky", "sidepart", "slicked", "curly", "buzz", "shaggy", "tied"] as const;
type HairStyle = (typeof FEMALE_HAIR)[number] | (typeof MALE_HAIR)[number];

/** Everything that decides how a portrait looks. Exposed so a future editor can set features. */
export interface PortraitFeatures {
  gender: Gender;
  face: number;
  skin: number;
  eyes: number;
  eyeColor: number;
  mouth: number;
  hair: HairStyle;
  hairColor: number;
  /** Mirror asymmetric hair (parting side). */
  flip: boolean;
  glasses: boolean;
  blush: boolean;
  facialHair: "none" | "stubble" | "beard" | "moustache";
  freckles: boolean;
  mole: boolean;
  earrings: boolean;
  scar: boolean;
  clothing: Clothing;
  clothColor: number;
  shirtColor: number;
  headgear: Headgear;
  /** Small per-portrait variation in lock lengths and angles. */
  jitter: number;
}

export function featuresFromSeed(seed: number, gender: Gender, professionId: string): PortraitFeatures {
  const rand = mulberry32(seed);
  const pick = (n: number) => Math.floor(rand() * n);
  const clothing = CLOTHING_BY_PROFESSION[professionId] ?? "jacket";
  const styles = gender === "female" ? FEMALE_HAIR : MALE_HAIR;
  const gear = HEADGEAR[professionId] ?? [["none", 1]];
  return {
    gender,
    face: pick(3),
    skin: pick(SKIN.length),
    eyes: pick(3),
    eyeColor: weighted(rand, EYE_WEIGHTS),
    mouth: pick(4),
    hair: styles[pick(styles.length)]!,
    hairColor: weighted(rand, HAIR_WEIGHTS),
    flip: rand() < 0.5,
    glasses: rand() < 0.16,
    blush: gender === "female" ? rand() < 0.75 : rand() < 0.05,
    facialHair: gender === "male" ? (["none", "none", "none", "stubble", "beard", "moustache"] as const)[pick(6)]! : "none",
    freckles: rand() < 0.1,
    mole: rand() < 0.1,
    earrings: gender === "female" ? rand() < 0.4 : rand() < 0.06,
    scar: gender === "male" ? rand() < 0.08 : rand() < 0.02,
    clothing,
    clothColor: pick(CLOTH[clothing].cloth.length),
    shirtColor: pick(CLOTH[clothing].shirt.length),
    headgear: gear[weighted(rand, gear.map((g) => g[1]))]![0],
    jitter: Math.floor(rand() * 1_000_000),
  };
}

/** Hair style, colour and parting from their own seed, for Customize's "Change Hair". */
export function hairFromSeed(seed: number, gender: Gender): Pick<PortraitFeatures, "hair" | "hairColor" | "flip"> {
  const rand = mulberry32(seed);
  const styles = gender === "female" ? FEMALE_HAIR : MALE_HAIR;
  return { hair: styles[Math.floor(rand() * styles.length)]!, hairColor: weighted(rand, HAIR_WEIGHTS), flip: rand() < 0.5 };
}

/**
 * A hair seed that keeps the portrait's current hair, so "Change Face" can roll a new face
 * seed without changing the hair. Searches for a seed giving the same style, colour and parting.
 */
export function keepHairSeed(seed: number, gender: Gender, professionId: string, hairSeed: number | null): number | null {
  if (hairSeed !== null) return hairSeed;
  const f = featuresFromSeed(seed, gender, professionId);
  for (let s = 0; s < 100_000; s++) {
    const h = hairFromSeed(s, gender);
    if (h.hair === f.hair && h.hairColor === f.hairColor && h.flip === f.flip) return s;
  }
  return null;
}

// --- The pixel canvas ----------------------------------------------------------------------

type Pt = readonly [number, number];

/** What a pixel test returns: a light level 0–1, or null to leave the pixel alone. */
type Shader = (x: number, y: number) => number | null;

export class Canvas {
  readonly mat = new Uint8Array(W * H);
  readonly light = new Float32Array(W * H);
  readonly z = new Int8Array(W * H);
  readonly part = new Int32Array(W * H);
  /** Lock-local cross position (−1…1) for hair pixels, used by the shine ring. */
  readonly across = new Float32Array(W * H);
  /** Parts that never get line art (eye details, blush…). */
  readonly lineless = new Set<number>();
  private nextPart = 1;

  newPart(lines = true): number {
    const id = this.nextPart++;
    if (!lines) this.lineless.add(id);
    return id;
  }
  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < W && y < H;
  }
  at(x: number, y: number): number {
    return this.inside(x, y) ? this.mat[y * W + x]! : Mat.None;
  }
  put(px: number, py: number, mat: Mat, light: number, z: number, part: number, across = 0): void {
    if (!this.inside(px, py)) return;
    const i = py * W + px;
    this.mat[i] = mat;
    this.light[i] = light;
    this.z[i] = z;
    this.part[i] = part;
    this.across[i] = across;
  }
  /** Visits every pixel whose centre lies in the box (design units), with its centre. */
  each(x0: number, y0: number, x1: number, y1: number, visit: (px: number, py: number, x: number, y: number) => void): void {
    for (let py = Math.max(0, Math.floor(pxY(y0))); py <= Math.min(H - 1, Math.ceil(pxY(y1))); py++) {
      for (let px = Math.max(0, Math.floor(pxX(x0))); px <= Math.min(W - 1, Math.ceil(pxX(x1))); px++) visit(px, py, toX(px), toY(py));
    }
  }
  /** Paints the pixels the shader accepts. */
  fill(x0: number, y0: number, x1: number, y1: number, shader: Shader, mat: Mat, z: number, part: number): void {
    this.each(x0, y0, x1, y1, (px, py, x, y) => {
      const l = shader(x, y);
      if (l !== null) this.put(px, py, mat, l, z, part);
    });
  }
  /** Changes already painted pixels: `change` returns a new light level, or null to skip. */
  relight(x0: number, y0: number, x1: number, y1: number, change: (x: number, y: number, light: number, i: number) => number | null): void {
    this.each(x0, y0, x1, y1, (px, py, x, y) => {
      const i = py * W + px;
      if (this.mat[i] === Mat.None) return;
      const l = change(x, y, this.light[i]!, i);
      if (l !== null) this.light[i] = l;
    });
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, light: number | ((x: number, y: number) => number), mat: Mat, z: number, part: number): void {
    this.fill(cx - rx, cy - ry, cx + rx, cy + ry, (x, y) => (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 ? (typeof light === "number" ? light : light(x, y)) : null), mat, z, part);
  }

  /**
   * A tapered stroke along a cubic Bézier: hair locks, lashes, brows, straps. The shader gets
   * the pixel's position across the stroke (u, −1 on the left of its direction to +1 on the
   * right), how far along it is (t, 0–1) and the stroke's direction there.
   */
  stroke(
    p: [Pt, Pt, Pt, Pt],
    w0: number,
    w1: number,
    mat: Mat,
    z: number,
    part: number,
    shade: (u: number, t: number, dir: Pt, x: number, y: number) => number,
    taper = 1.3,
  ): void {
    const at = (t: number): Pt => {
      const m = 1 - t;
      return [
        m * m * m * p[0][0] + 3 * m * m * t * p[1][0] + 3 * m * t * t * p[2][0] + t * t * t * p[3][0],
        m * m * m * p[0][1] + 3 * m * m * t * p[1][1] + 3 * m * t * t * p[2][1] + t * t * t * p[3][1],
      ];
    };
    let length = 0;
    for (let k = 0; k < 3; k++) length += Math.hypot(p[k + 1]![0] - p[k]![0], p[k + 1]![1] - p[k]![1]);
    this.path(at, length, w0, w1, mat, z, part, shade, taper);
  }

  /** Like stroke, along any path given as a function of t (0–1) with its rough length. */
  path(
    at: (t: number) => Pt,
    length: number,
    w0: number,
    w1: number,
    mat: Mat,
    z: number,
    part: number,
    shade: (u: number, t: number, dir: Pt, x: number, y: number) => number,
    taper = 1.3,
  ): void {
    const n = Math.max(8, Math.ceil(length * S * 1.5));
    const pts: Pt[] = [];
    for (let k = 0; k <= n; k++) pts.push(at(k / n));
    const width = (t: number) => w0 + (w1 - w0) * Math.pow(t, taper);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const r = Math.max(w0, w1) / 2 + 0.5;
    for (const q of pts) {
      x0 = Math.min(x0, q[0] - r);
      y0 = Math.min(y0, q[1] - r);
      x1 = Math.max(x1, q[0] + r);
      y1 = Math.max(y1, q[1] + r);
    }
    this.each(x0, y0, x1, y1, (px, py, x, y) => {
      let best = -1;
      let bestD = Infinity;
      for (let k = 0; k <= n; k++) {
        const d = (x - pts[k]![0]) ** 2 + (y - pts[k]![1]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      const t = best / n;
      const half = width(t) / 2;
      if (bestD > half * half || half <= 0.05) return;
      const a = pts[Math.max(0, best - 1)]!;
      const b = pts[Math.min(n, best + 1)]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const dir: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      // Signed distance along the stroke's left-hand normal (−dir.y, dir.x).
      const u = clamp(((x - pts[best]![0]) * -dir[1] + (y - pts[best]![1]) * dir[0]) / half, -1, 1);
      this.put(px, py, mat, shade(u, t, dir, x, y), z, part, u);
    });
  }
}

// --- Head geometry ------------------------------------------------------------------------------

interface FaceShape {
  rx: number;
  top: number;
  cheekY: number;
  chinY: number;
  /** Half-width at 45% and 80% of the way from cheek to chin (fractions of rx), and at the chin. */
  a: number;
  b: number;
  c: number;
}

/** Semi-realistic anime proportions: an oval face, softer for women, squarer for men. */
const FACES: Record<Gender, FaceShape[]> = {
  female: [
    { rx: 18.8, top: 26, cheekY: 56, chinY: 79, a: 0.82, b: 0.47, c: 3 },
    { rx: 18.4, top: 26, cheekY: 56, chinY: 80, a: 0.79, b: 0.42, c: 2.4 },
    { rx: 19.2, top: 26, cheekY: 56, chinY: 78.5, a: 0.85, b: 0.52, c: 3.6 },
  ],
  male: [
    { rx: 19.8, top: 25, cheekY: 56, chinY: 81, a: 0.88, b: 0.6, c: 5 },
    { rx: 19.4, top: 25, cheekY: 56, chinY: 81.5, a: 0.85, b: 0.54, c: 4 },
    { rx: 20.2, top: 25, cheekY: 56, chinY: 80.5, a: 0.9, b: 0.66, c: 6.2 },
  ],
};

/** Half-width of the face at height y (design units), 0 outside it. */
function faceHw(s: FaceShape, y: number): number {
  if (y < s.top || y > s.chinY) return 0;
  if (y <= s.cheekY) {
    const d = (s.cheekY - y) / (s.cheekY - s.top);
    return s.rx * Math.sqrt(Math.max(0, 1 - d * d * d * 0.95));
  }
  const t = (y - s.cheekY) / (s.chinY - s.cheekY);
  const keys: [number, number][] = [
    [0, s.rx],
    [0.45, s.rx * s.a],
    [0.8, s.rx * s.b],
    [1, s.c],
  ];
  for (let k = 0; k < keys.length - 1; k++) {
    const [t0, v0] = keys[k]!;
    const [t1, v1] = keys[k + 1]!;
    if (t <= t1) return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0));
  }
  return s.c;
}

/** The skull the hair sits on: an ellipse a little larger than the face's top. */
const HEAD = { cx: CX, cy: 45, rx: 26, ry: 30 };

/** A sphere's normal for a point around the head, flattened out past its edge. */
function headNormal(x: number, y: number): Vec3 {
  const nx = (x - HEAD.cx) / (HEAD.rx + 6);
  const ny = (y - HEAD.cy) / (HEAD.ry + 6);
  const r2 = nx * nx + ny * ny;
  if (r2 >= 0.97) {
    const r = Math.sqrt(r2);
    return normalize([(nx / r) * 0.97, (ny / r) * 0.97, 0.25]);
  }
  return [nx, ny, Math.sqrt(1 - r2)];
}

// --- Face ---------------------------------------------------------------------------------

function drawFace(c: Canvas, f: PortraitFeatures, s: FaceShape): void {
  // Ears, behind the face edge.
  for (const side of [-1, 1]) {
    const ex = CX + side * (s.rx - 0.8);
    const ear = c.newPart();
    c.ellipse(ex, 59, 3.2, 5.6, (x) => (side < 0 ? 0.58 : 0.32) - Math.abs(x - ex) * 0.02, Mat.Skin, Z_EARS, ear);
    c.relight(ex - 2, 56, ex + 2, 62, (x, y) => (((x - ex - side * 0.6) / 1.2) ** 2 + ((y - 59.5) / 2.6) ** 2 <= 1 ? 0.18 : null));
    if (f.earrings) {
      const ring = c.newPart();
      c.ellipse(ex - side * 0.4, 65.6, 0.9, 0.9, 0.7, Mat.Metal, Z_FEATURES, ring);
      c.ellipse(ex - side * 0.4, 67.8, 1.1, 1.5, 0.55, Mat.Accent, Z_FEATURES, ring);
    }
  }
  // The face, shaded as a flattened sphere: lit on the left, a cheek shadow on the right.
  const face = c.newPart();
  c.fill(CX - s.rx - 1, s.top, CX + s.rx + 1, s.chinY + 1, (x, y) => {
    const hw = faceHw(s, y);
    if (Math.abs(x - CX) >= hw) return null;
    const nx = (x - CX) / (hw + 2.5);
    const ny = clamp((y - 52) / 34, -0.6, 0.75);
    const n = normalize([nx * 1.15, ny * 0.7, Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny * 0.5))]);
    return 0.27 + 0.4 * diffuse(n);
  }, Mat.Skin, Z_FACE, face);
}

// --- Eyes, brows, nose, mouth ----------------------------------------------------------------

interface EyeShape {
  rx: number;
  ry: number;
  /** How much the outer corner rises. */
  lift: number;
  iris: number;
  lash: number;
  wing: boolean;
  crease: boolean;
}

/** Almond eyes: wider than tall, with a strong upper lash line. */
const EYE_SHAPES: Record<Gender, EyeShape[]> = {
  female: [
    { rx: 6.2, ry: 4.4, lift: 0.9, iris: 3.9, lash: 1.5, wing: true, crease: true },
    { rx: 6.4, ry: 3.9, lift: 1.6, iris: 3.8, lash: 1.5, wing: true, crease: false },
    { rx: 5.9, ry: 4.7, lift: 0.2, iris: 4, lash: 1.3, wing: false, crease: true },
  ],
  male: [
    { rx: 5.9, ry: 3.5, lift: 0.6, iris: 3.4, lash: 1.2, wing: false, crease: true },
    { rx: 6.1, ry: 3.1, lift: 1.3, iris: 3.3, lash: 1.2, wing: false, crease: false },
    { rx: 5.7, ry: 3.8, lift: 0.1, iris: 3.5, lash: 1.1, wing: false, crease: true },
  ],
};

const EYE_Y = 56.5;
const EYE_DX = 9.2;

function drawEye(c: Canvas, f: PortraitFeatures, e: EyeShape, cx: number, cy: number, side: -1 | 1): void {
  const female = f.gender === "female";
  // Distance towards the outer corner (left for the left eye).
  const outer = (x: number) => (side === -1 ? cx - x : x - cx);
  const k = (x: number) => Math.max(0, 1 - (outer(x) / e.rx) ** 2);
  const up = (x: number) => cy - e.ry * Math.pow(k(x), 0.45) - e.lift * (outer(x) / e.rx) + 0.6;
  const lo = (x: number) => cy + e.ry * 0.55 * Math.pow(k(x), 0.7) - e.lift * 0.3 * (outer(x) / e.rx);
  const inEye = (x: number, y: number) => Math.abs(outer(x)) < e.rx && y > up(x) && y < lo(x);
  const box = [cx - e.rx - 3, cy - e.ry - 8, cx + e.rx + 3, cy + e.ry + 2] as const;
  const part = c.newPart(false);
  const paint = (test: (x: number, y: number) => boolean, mat: Mat, light: number | ((x: number, y: number) => number)) =>
    c.fill(box[0], box[1], box[2], box[3], (x, y) => (test(x, y) ? (typeof light === "number" ? light : light(x, y)) : null), mat, Z_FEATURES, part);

  // The white, in the lid's shadow at the top and toward the shaded side.
  paint(inEye, Mat.Sclera, (x, y) => (y < up(x) + 1.3 ? 0.3 : outer(x) * side > e.rx * 0.5 ? 0.55 : 0.85));
  // Iris: a tall oval cut by the lids, dark at the top, glowing toward the bottom.
  const icx = cx - side * 0.3;
  const icy = cy + 0.2;
  const ir = e.iris;
  const inIris = (x: number, y: number) => inEye(x, y) && ((x - icx) / (ir * 0.92)) ** 2 + ((y - icy) / (ir * 1.12)) ** 2 <= 1;
  paint(inIris, Mat.Iris, (x, y) => {
    const v = (y - (icy - ir)) / (2 * ir);
    const rim = ((x - icx) / (ir * 0.92)) ** 2 + ((y - icy) / (ir * 1.12)) ** 2 > 0.62;
    return rim ? 0.12 : v < 0.4 ? 0.32 : v < 0.65 ? 0.55 : 0.8;
  });
  // Pupil.
  paint((x, y) => inIris(x, y) && ((x - icx) / (ir * 0.38)) ** 2 + ((y - icy + 0.2) / (ir * 0.55)) ** 2 <= 1, Mat.Ink, 0.2);
  // Highlights: a bright block at the upper left, a small dot lower right.
  paint((x, y) => inEye(x, y) && ((x - (icx - ir * 0.42)) / 1.05) ** 2 + ((y - (icy - ir * 0.42)) / 1.15) ** 2 <= 1, Mat.Shine, 1);
  paint((x, y) => inEye(x, y) && ((x - (icx + ir * 0.45)) / 0.55) ** 2 + ((y - (icy + ir * 0.4)) / 0.55) ** 2 <= 1, Mat.Shine, 1);

  // Upper lash: a heavy line, thicker toward the outer corner, with a wing for women.
  const lashT = (x: number) => e.lash * (0.7 + 0.6 * Math.max(0, outer(x) / e.rx));
  paint((x, y) => Math.abs(outer(x)) < e.rx + 0.3 && y <= up(x) + 0.35 && y > up(x) - lashT(x), Mat.Ink, 0.15);
  const cornerX = cx + side * e.rx;
  const cornerY = up(cornerX - side * 0.2);
  if (e.wing) {
    c.stroke([[cornerX - side * 1.2, cornerY], [cornerX + side * 0.6, cornerY - 0.4], [cornerX + side * 1.5, cornerY - 0.9], [cornerX + side * 2.3, cornerY - 1.8]], 1.4, 0.4, Mat.Ink, Z_FEATURES, part, () => 0.15);
  }
  // Lower lid: a fine line under the outer half.
  paint((x, y) => outer(x) > e.rx * 0.05 && outer(x) < e.rx * 0.95 && Math.abs(y - lo(x) - 0.2) < 0.38, female ? Mat.Ink : Mat.Skin, female ? 0.35 : 0.05);
  // Crease above the lid.
  if (e.crease) c.relight(box[0], box[1], box[2], box[3], (x, y, l, i) => (c.mat[i] === Mat.Skin && outer(x) > -e.rx * 0.5 && outer(x) < e.rx * 0.95 && Math.abs(y - (up(x) - lashT(x) - 1.1)) < 0.4 ? Math.min(l, 0.1) : null));
  // The eye socket is a little shaded toward the shadow side.
  c.relight(box[0], cy - e.ry - 3, box[2], cy - e.ry + 1, (x, y, l, i) => (c.mat[i] === Mat.Skin && c.z[i] === Z_FACE && Math.abs(outer(x)) < e.rx && y < up(x) - lashT(x) ? l - 0.06 : null));

  // Brow: a tapered stroke (heavier and straighter for men).
  const innerX = cx - side * e.rx * 0.95;
  const outerX = cx + side * e.rx * 1.2;
  const top = cy - e.ry - (female ? 4.6 : 3.6);
  const brow = c.newPart(false);
  if (female) c.stroke([[innerX, top + 1.2], [cx - side * 1, top - 0.9], [cx + side * 3, top - 1.1], [outerX, top + 0.9]], 1.3, 0.5, Mat.Hair, Z_FEATURES, brow, () => 0.18);
  else c.stroke([[innerX, top + 0.6], [cx - side * 1, top - 0.5], [cx + side * 3, top - 0.6], [outerX, top + 0.8]], 2.1, 0.9, Mat.Hair, Z_FEATURES, brow, () => 0.14);
}

function drawFeatures(c: Canvas, f: PortraitFeatures, s: FaceShape): void {
  const female = f.gender === "female";
  const e = EYE_SHAPES[f.gender][f.eyes]!;
  drawEye(c, f, e, CX - EYE_DX, EYE_Y, -1);
  drawEye(c, f, e, CX + EYE_DX, EYE_Y, 1);
  const skinOnly = (i: number) => c.mat[i] === Mat.Skin && c.z[i] === Z_FACE;

  // Nose: shade down the right of the bridge, a dark nostril, light on the tip.
  const ny = female ? 66 : 67;
  c.relight(CX - 3, 58, CX + 4, ny + 2, (x, y, l, i) => {
    if (!skinOnly(i)) return null;
    if (x > CX + 0.4 && x < CX + 1.6 && y > 60 && y < ny - 0.5) return Math.min(l, 0.32);
    if (((x - (CX + 1)) / 1.8) ** 2 + ((y - (ny - 0.5)) / 1.2) ** 2 <= 1 && x > CX - 0.4) return Math.min(l, 0.3);
    if (((x - (CX - 0.8)) / 0.8) ** 2 + ((y - (ny - 1.2)) / 0.7) ** 2 <= 1) return 0.95;
    return null;
  });
  c.relight(CX, ny, CX + 3, ny + 1.5, (x, y, l, i) => (skinOnly(i) && ((x - (CX + 1.4)) / 0.8) ** 2 + ((y - (ny + 0.4)) / 0.5) ** 2 <= 1 ? 0.04 : null));

  // Mouth.
  const my = female ? 72 : 73.5;
  const mouth = c.newPart(false);
  const line = (x0: number, x1: number, yAt: (x: number) => number, mat: Mat, light: number, t = 0.42) =>
    c.fill(x0 - 1, my - 3, x1 + 1, my + 3, (x, y) => (x >= x0 && x <= x1 && Math.abs(y - yAt(x)) < t ? light : null), mat, Z_FEATURES, mouth);
  const half = female ? 3.2 : 3.8;
  // Men's portraits keep their mouths closed: the open smile reads as a grimace at this size.
  switch (!female && f.mouth === 2 ? 0 : f.mouth) {
    case 0: // gentle smile
      line(CX - half, CX + half, (x) => my - ((x - CX) / half) ** 2 * 0.9 + 0.3, Mat.Lip, 0.1);
      break;
    case 1: // closed, neutral
      line(CX - half * 0.85, CX + half * 0.85, () => my, Mat.Lip, 0.1);
      break;
    case 2: {
      // Slightly open smile showing teeth.
      const depth = (x: number) => 1.7 * Math.max(0, 1 - ((x - CX) / (half * 0.9)) ** 2);
      c.fill(CX - half, my - 1, CX + half, my + 3, (x, y) => (Math.abs(x - CX) < half * 0.9 && y >= my - 0.2 && y <= my + depth(x) ? (y < my + 0.7 ? 1 : 0.15) : null), Mat.Lip, Z_FEATURES, mouth);
      c.fill(CX - half, my - 1, CX + half, my + 3, (x, y) => (Math.abs(x - CX) < half * 0.75 && y >= my - 0.2 && y < my + 0.7 ? 1 : null), Mat.Shine, Z_FEATURES, mouth);
      line(CX - half, CX + half, (x) => my - ((x - CX) / half) ** 2 * 0.6, Mat.Lip, 0.05, 0.38);
      break;
    }
    default: // smirk
      line(CX - half * 0.8, CX + half, (x) => my - Math.max(0, x - CX) * 0.22, Mat.Lip, 0.1);
  }
  // Lips: colour for women, and a little shadow under the lower lip.
  if (female && f.mouth !== 2) {
    c.fill(CX - 3, my, CX + 3, my + 2, (x, y) => (Math.abs(x - CX) < 2.3 - (y - my - 0.5) * 0.8 && y > my + 0.45 && y < my + 1.7 ? 0.6 : null), Mat.Lip, Z_FEATURES, mouth);
  }
  c.relight(CX - 3, my + 1.5, CX + 3, my + 3.5, (x, y, l, i) => (skinOnly(i) && Math.abs(x - CX) < 1.8 && y > my + 2.1 && y < my + 2.9 ? Math.min(l, 0.32) : null));

  if (f.blush) {
    const blush = c.newPart(false);
    for (const side of [-1, 1]) {
      const bx = CX + side * 11.5;
      c.each(bx - 5, 61, bx + 5, 67, (px, py, x, y) => {
        const i = py * W + px;
        if (!skinOnly(i)) return;
        const d = ((x - bx) / 4.2) ** 2 + ((y - 64) / 1.8) ** 2;
        // Solid in the middle, dithered toward the edge.
        if (d <= 0.45 || (d <= 1 && (px + py) % 2 === 0)) c.put(px, py, Mat.Blush, c.light[i]!, Z_FACE, blush);
      });
    }
  }
  if (f.freckles) {
    const rand = mulberry32(f.jitter);
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1;
      const fx = CX + side * (4 + rand() * 9);
      const fy = 61.5 + rand() * 3.5;
      c.relight(fx - 0.6, fy - 0.6, fx + 0.6, fy + 0.6, (x, y, l, k) => (skinOnly(k) ? Math.min(l, 0.3) : null));
    }
  }
  if (f.mole) {
    const mx = CX + (f.flip ? 6 : -6);
    c.relight(mx - 0.6, my - 1.6, mx + 0.6, my - 0.4, (x, y, l, i) => (skinOnly(i) ? 0.04 : null));
  }
  if (f.scar) {
    const sx = f.flip ? -1 : 1;
    c.relight(CX + sx * 8, 48, CX + sx * 18, 62, (x, y, l, i) => (skinOnly(i) && Math.abs(y - (50 + Math.abs(x - CX - sx * 9) * 1.1)) < 0.4 && Math.abs(x - CX) > 9 && Math.abs(x - CX) < 17 ? 0.98 : null));
  }

  // Facial hair.
  if (f.facialHair === "stubble" || f.facialHair === "beard") {
    const beard = f.facialHair === "beard";
    const part = c.newPart(!beard ? false : true);
    c.each(CX - s.rx, 63, CX + s.rx, s.chinY + 3, (px, py, x, y) => {
      const i = py * W + px;
      const hw = faceHw(s, y);
      if (hw <= 0 || Math.abs(x - CX) >= hw || c.z[i] !== Z_FACE) return;
      const jaw = Math.abs(x - CX) > hw - (beard ? 3.6 + (y - 64) * 0.12 : 4.5) && y > 64;
      const chin = y > my + 2.8;
      const lip = beard && y > my - 2.6 && y < my - 1 && Math.abs(x - CX) < 4.4 - (my - 1 - y) * 0.5;
      if (!(jaw || chin || lip)) return;
      if (!beard && chin && !jaw && Math.abs(x - CX) < 2.4 && y < my + 4) return;
      if (beard) c.put(px, py, Mat.Hair, 0.18 + 0.45 * c.light[i]! + ((px * 3 + py * 5) % 7 === 0 ? -0.1 : 0), Z_FACIAL_HAIR, part);
      else if ((px + py * 2) % 3 === 0) c.put(px, py, Mat.Stubble, c.light[i]!, Z_FACE, part);
    });
    if (beard) line(CX - half * 0.8, CX + half * 0.8, () => my, Mat.Lip, 0.1);
  }
  if (f.facialHair === "moustache") {
    const part = c.newPart();
    for (const side of [-1, 1]) c.stroke([[CX, my - 2.2], [CX + side * 2.5, my - 3], [CX + side * 4.5, my - 2.2], [CX + side * 5.5, my - 0.6]], 2.4, 0.7, Mat.Hair, Z_FACIAL_HAIR, part, (u) => 0.3 - u * side * 0.15);
  }
}

function drawGlasses(c: Canvas): void {
  const part = c.newPart(false);
  for (const side of [-1, 1]) {
    const gx = CX + side * EYE_DX;
    const rx = 7.2;
    const ry = 4.8;
    const d = (x: number, y: number) => Math.hypot(Math.max(0, Math.abs(x - gx) - (rx - 2.2)), Math.max(0, Math.abs(y - EYE_Y) - (ry - 2.2)));
    // A glare streak in the lens, then a rounded-rectangle frame.
    c.relight(gx - rx, EYE_Y - ry, gx + rx, EYE_Y + ry, (x, y, l, i) => (d(x, y) < 1.6 && c.mat[i] !== Mat.Ink && Math.abs(y - EYE_Y + 1 + (x - gx + side * 3) * 0.9) < 0.45 ? 1 : null));
    c.fill(gx - rx - 1, EYE_Y - ry - 1, gx + rx + 1, EYE_Y + ry + 1, (x, y) => (d(x, y) > 1.75 && d(x, y) <= 2.45 ? (y < EYE_Y ? 0.6 : 0.25) : null), Mat.Frame, Z_GLASSES, part);
  }
  c.fill(CX - 3, EYE_Y - 4, CX + 3, EYE_Y, (x, y) => (Math.abs(x - CX) < 1.8 && Math.abs(y - (EYE_Y - 2 + (x - CX) ** 2 * 0.08)) < 0.45 ? 0.5 : null), Mat.Frame, Z_GLASSES, part);
}

// --- Neck and clothes -------------------------------------------------------------------------

/** Torso half-width at height y: the neck widening into sloped shoulders. */
function torsoHw(f: PortraitFeatures, y: number): number {
  const female = f.gender === "female";
  const neck = female ? 7 : 9;
  const full = female ? 40 : 44;
  return neck + (full - neck) * smooth(clamp((y - 86) / 16));
}

/** Light on the torso: a rounded chest, the tops of the shoulders catching the light. */
function torsoLight(f: PortraitFeatures, x: number, y: number): number {
  const hw = torsoHw(f, y);
  const nx = (x - CX) / (hw + 4);
  const ny = clamp(-0.55 + (y - 86) / 30, -0.6, 0.35);
  return 0.08 + 0.85 * diffuse(normalize([nx * 1.1, ny, Math.sqrt(Math.max(0.05, 1 - nx * nx))]));
}

function drawBody(c: Canvas, f: PortraitFeatures, s: FaceShape): void {
  const female = f.gender === "female";
  const neckHw = female ? 5.6 : 7.2;
  const neckW = (y: number) => neckHw + Math.max(0, y - 84) * 0.5;
  const bottom = (ZOOM_Y + (H / S - ZOOM_Y) / ZOOM);
  // Neck: in the jaw's shadow under the chin and down its right side.
  const neck = c.newPart();
  c.fill(CX - 16, s.cheekY + 4, CX + 16, bottom, (x, y) => {
    if (Math.abs(x - CX) >= neckW(y)) return null;
    if (y < s.chinY + 4.5 - Math.abs(x - CX) * 0.25) return 0.14;
    return x - CX > neckHw * 0.35 ? 0.24 : 0.42;
  }, Mat.Skin, Z_NECK, neck);

  const top = 86;
  const cloth = c.newPart();
  const inTorso = (x: number, y: number) => y >= top && Math.abs(x - CX) < torsoHw(f, y);
  c.fill(0, top, 96, bottom, (x, y) => (inTorso(x, y) ? torsoLight(f, x, y) : null), Mat.Cloth, Z_BODY, cloth);
  // A crease or two where the arms meet the chest.
  for (const side of [-1, 1]) c.relight(0, top + 12, 96, bottom, (x, y, l, i) => (c.part[i] === cloth && Math.abs(side * (x - CX) - 27 - (y - top - 12) * 0.25) < 0.45 ? Math.min(l, 0.2) : null));

  const trim = (test: (x: number, y: number) => number | null, mat: Mat, z = Z_TRIM, part = c.newPart()) => {
    c.fill(0, top - 14, 96, bottom, test, mat, z, part);
    return part;
  };
  const vOpen = (y: number, start = top - 1) => Math.max(0, (y - start) * 0.5);
  const shirtTone = (x: number, y: number) => (x > CX + 0.8 ? 0.4 : 0.72) - Math.max(0, y - top) * 0.004;

  /** A shirt collar and tie (or a brooch), in the V of a jacket. */
  const shirtAndTie = (opening: (y: number) => number, tie: boolean) => {
    trim((x, y) => (y >= top - 1.5 && Math.abs(x - CX) < opening(y) ? shirtTone(x, y) : null), Mat.Shirt);
    for (const side of [-1, 1]) {
      trim((x, y) => {
        const d = side * (x - CX);
        return y >= top - 2.5 && y < top + 4.5 && d > (y - top + 2.5) * 0.35 && d < neckHw + 2 - (y - top) * 0.6 ? (side < 0 ? 0.85 : 0.5) : null;
      }, Mat.Shirt, Z_TRIM + 0);
    }
    if (tie) {
      const knot = c.newPart();
      trim((x, y) => (y >= top - 0.5 && y < top + 2.6 && Math.abs(x - CX) < 1.9 - (y - top) * 0.15 ? 0.45 : null), Mat.Accent, Z_TRIM, knot);
      trim((x, y) => (y >= top + 2.6 && Math.abs(x - CX) < 1.2 + (y - top - 2.6) * 0.12 ? (x > CX + 0.3 ? 0.3 : 0.6) : null), Mat.Accent, Z_TRIM);
    } else if (female) {
      // A pendant on a fine chain.
      trim((x, y) => (Math.abs(x - CX) < 4.5 && Math.abs(y - (top + 0.5 + ((x - CX) / 4.5) ** 2 * -2.5 + 2.5)) < 0.4 ? 0.8 : null), Mat.Metal, Z_TRIM + 1);
      trim((x, y) => (((x - CX) / 1.2) ** 2 + ((y - (top + 4)) / 1.5) ** 2 <= 1 ? 0.6 : null), Mat.Accent, Z_TRIM + 1);
    }
  };

  /** Lapels: bands along the jacket's opening, lit on the left, with their own edge line. */
  const lapels = (opening: (y: number) => number, width: number, depth: number) => {
    for (const side of [-1, 1]) {
      trim((x, y) => {
        const d = side * (x - CX) - opening(y);
        return d >= 0 && d < width - (y - top) * 0.12 && y >= top - 1 && y < top + depth ? (side < 0 ? 0.62 : 0.24) : null;
      }, Mat.Cloth, Z_TRIM + 1);
    }
  };

  switch (f.clothing) {
    case "suit": {
      const opening = (y: number) => Math.min(neckHw + 2, vOpen(y) + 2.2);
      shirtAndTie(opening, !female || f.jitter % 3 === 0);
      lapels(opening, 6.5, 22);
      // A pocket square in the faction's colour.
      trim((x, y) => (x > CX + 22 && x < CX + 27 && y > top + 13 && y < top + 15.5 - (x - CX - 22) * 0.3 ? 0.6 : null), Mat.Accent, Z_TRIM + 1);
      break;
    }
    case "coat": {
      // A trench coat: a high, wide collar standing up behind the neck, and big lapels.
      const opening = (y: number) => Math.min(neckHw + 3, vOpen(y) + 3);
      shirtAndTie(opening, !female);
      for (const side of [-1, 1]) {
        trim((x, y) => {
          const d = side * (x - CX);
          return y > top - 9 && y < top + 3 && d > neckHw - 1 && d < neckHw + 6 - (top - y) * 0.25 ? (side < 0 ? 0.7 : 0.3) : null;
        }, Mat.Cloth, Z_TRIM + 1);
      }
      lapels(opening, 9, 26);
      for (const side of [-1, 1]) trim((x, y) => (((x - (CX + side * 13)) / 0.9) ** 2 + ((y - (top + 22)) / 0.9) ** 2 <= 1 ? 0.5 : null), Mat.Metal, Z_TRIM + 2);
      break;
    }
    case "labcoat": {
      const opening = (y: number) => Math.min(neckHw + 2.5, vOpen(y) + 2.5);
      // Coloured scrubs or a blouse under the coat.
      trim((x, y) => (y >= top - 2 && Math.abs(x - CX) < opening(y) ? (x > CX + 0.8 ? 0.35 : 0.6) : null), Mat.Shirt);
      lapels(opening, 7, 24);
      // A stethoscope or ID badge, and a pen in the breast pocket.
      if (f.jitter % 2 === 0) {
        const tube = c.newPart();
        c.stroke([[CX - 7, top - 1], [CX - 9, top + 8], [CX - 4, top + 16], [CX + 1, top + 14]], 1.1, 1.1, Mat.Ink, Z_TRIM + 2, tube, () => 0.5, 1);
        c.ellipse(CX + 1.5, top + 14, 1.6, 1.6, 0.7, Mat.Metal, Z_TRIM + 2, tube);
      } else {
        trim((x, y) => (x > CX + 19 && x < CX + 26 && y > top + 11 && y < top + 19 ? (y < top + 13 ? 0.6 : 0.9) : null), Mat.Shirt, Z_TRIM + 2);
        trim((x, y) => (x > CX + 19 && x < CX + 26 && y > top + 11 && y < top + 13 ? 0.5 : null), Mat.Accent, Z_TRIM + 3);
      }
      trim((x, y) => (x > CX - 27 && x < CX - 19 && Math.abs(y - (top + 15)) < 0.5 ? 0.3 : null), Mat.Cloth, Z_TRIM + 2);
      trim((x, y) => (x > CX - 24 && x < CX - 22.8 && y > top + 10 && y < top + 15.2 ? 0.55 : null), Mat.Accent, Z_TRIM + 3);
      break;
    }
    case "uniform": {
      // A service jacket with gold-striped epaulettes, a shirt and tie, and ribbons.
      const opening = (y: number) => Math.min(neckHw + 1.5, vOpen(y) + 1.6);
      shirtAndTie(opening, true);
      lapels(opening, 5, 18);
      for (const side of [-1, 1]) {
        const ep = c.newPart();
        trim((x, y) => {
          const d = side * (x - CX);
          return d > 23 && d < 38 && y > top + 3.5 - (d - 23) * -0.12 && y < top + 7.5 + (d - 23) * 0.12 ? (y < top + 5 ? 0.6 : 0.3) : null;
        }, Mat.Cloth, Z_TRIM + 1, ep);
        for (let k = 0; k < 3; k++) trim((x, y) => (Math.abs(side * (x - CX) - 27.5 - k * 2.6) < 0.6 && y > top + 4 && y < top + 8.5 ? 0.75 : null), Mat.Metal, Z_TRIM + 2);
      }
      for (let i = 0; i < 3; i++) trim((x, y) => (x > CX - 26 + i * 3.4 && x < CX - 23 + i * 3.4 && y > top + 13 && y < top + 15.5 ? (i === 1 ? 0.7 : 0.5) : null), i === 1 ? Mat.Metal : Mat.Accent, Z_TRIM + 2);
      trim((x, y) => (((x - (CX + 22)) / 1.8) ** 2 + ((y - (top + 14)) / 1.8) ** 2 <= 1 ? 0.7 : null), Mat.Metal, Z_TRIM + 2);
      break;
    }
    case "fatigues": {
      // Combat fatigues: a turned-down collar over a dark T-shirt, chest pockets, a patch.
      trim((x, y) => (y >= top - 2 && Math.abs(x - CX) < neckHw + 0.5 + vOpen(y) * 0.3 ? 0.3 : null), Mat.Shirt);
      for (const side of [-1, 1]) {
        trim((x, y) => {
          const d = side * (x - CX);
          return y > top - 3 && y < top + 6 && d > neckHw - 0.5 + (y - top) * 0.3 && d < neckHw + 8 - (y - top) * 0.4 ? (side < 0 ? 0.65 : 0.28) : null;
        }, Mat.Cloth, Z_TRIM + 1);
        trim((x, y) => {
          const d = side * (x - CX);
          return d > 12 && d < 22 && y > top + 11 && y < top + 19 ? (y < top + 13 ? 0.62 : side < 0 ? 0.5 : 0.25) : null;
        }, Mat.Cloth, Z_TRIM + 1);
      }
      trim((x, y) => (x > CX + 27 && x < CX + 33 && y > top + 6 && y < top + 11 ? 0.55 : null), Mat.Accent, Z_TRIM + 2);
      break;
    }
    case "flightsuit": {
      // A pressure-suit neck ring, a zip, a mission patch and a flag-coloured stripe.
      const ring = c.newPart();
      trim((x, y) => (y > top - 4 && y < top + 2 && Math.abs(x - CX) < neckHw + 4 ? (y < top - 1.5 ? 0.8 : 0.4) : null), Mat.Metal, Z_TRIM + 1, ring);
      trim((x, y) => (y >= top + 2 && Math.abs(x - CX + 0.5) < 0.55 ? 0.3 : null), Mat.Metal, Z_TRIM);
      trim((x, y) => (((x - (CX - 21)) / 4.2) ** 2 + ((y - (top + 15)) / 4.2) ** 2 <= 1 ? 0.55 : null), Mat.Accent, Z_TRIM + 1);
      trim((x, y) => (((x - (CX - 21)) / 2.2) ** 2 + ((y - (top + 15)) / 2.2) ** 2 <= 1 ? 0.95 : null), Mat.Shirt, Z_TRIM + 2);
      trim((x, y) => (x > CX + 20 && x < CX + 31 && y > top + 9 && y < top + 12 ? 0.5 : null), Mat.Accent, Z_TRIM + 1);
      break;
    }
    case "turtleneck": {
      // A ribbed roll neck.
      const roll = c.newPart();
      trim((x, y) => (y > top - 11 && y < top + 2 && Math.abs(x - CX) < neckHw + 1.6 ? (x > CX + neckHw * 0.4 ? 0.22 : 0.5) - (Math.floor(y * S) % 3 === 0 ? 0.12 : 0) : null), Mat.Cloth, Z_TRIM, roll);
      if (!female) {
        // A blazer over it.
        const opening = (y: number) => neckHw + 1.6 + vOpen(y) * 0.35;
        c.relight(0, top, 96, (ZOOM_Y + (H / S - ZOOM_Y) / ZOOM), (x, y, l, i) => (c.part[i] === cloth && Math.abs(x - CX) < opening(y) ? l * 0.7 + 0.1 : null));
        lapels(opening, 5.5, 26);
      } else {
        trim((x, y) => (Math.abs(x - CX) < 0.6 && y > top + 2 && y < top + 11 ? 0.8 : null), Mat.Metal, Z_TRIM + 1);
        trim((x, y) => (((x - CX) / 1.5) ** 2 + ((y - (top + 12.5)) / 1.9) ** 2 <= 1 ? 0.6 : null), Mat.Accent, Z_TRIM + 1);
      }
      break;
    }
    case "jacket": {
      // An open casual jacket over a T-shirt, with a zip and a badge in the faction's colour.
      const opening = (y: number) => Math.min(neckHw + 4, vOpen(y) * 0.8 + 4);
      trim((x, y) => (y >= top - 1.5 && Math.abs(x - CX) < opening(y) ? shirtTone(x, y) : null), Mat.Shirt);
      trim((x, y) => (y > top - 1.5 && y < top + 0.6 && Math.abs(x - CX) < neckHw + 0.8 ? 0.3 : null), Mat.Shirt, Z_TRIM + 1);
      for (const side of [-1, 1]) {
        trim((x, y) => {
          const d = side * (x - CX);
          return y > top - 5 && y < top + 4 && d > neckHw && d < neckHw + 5.5 - (top - y) * 0.2 ? (side < 0 ? 0.68 : 0.3) : null;
        }, Mat.Cloth, Z_TRIM + 1);
        trim((x, y) => (y >= top && Math.abs(side * (x - CX) - opening(y)) < 0.55 ? 0.55 : null), Mat.Metal, Z_TRIM + 1);
      }
      trim((x, y) => (((x - (CX + 22)) / 2.4) ** 2 + ((y - (top + 13)) / 2.4) ** 2 <= 1 ? 0.6 : null), Mat.Accent, Z_TRIM + 1);
      break;
    }
  }
}

// --- Hair ---------------------------------------------------------------------------------

/** Light on a hair lock: its own round cross-section blended with the head's curve. */
function lockLight(u: number, t: number, dir: Pt, x: number, y: number, root = 0.05): number {
  const across: Vec3 = [-dir[1] * u, dir[0] * u, Math.sqrt(Math.max(0, 1 - u * u))];
  const head = headNormal(x, y);
  const n = normalize([across[0] * 0.45 + head[0] * 0.8, across[1] * 0.45 + head[1] * 0.8, across[2] * 0.45 + head[2] * 0.8]);
  // Hair is darker near its roots, where it's in the shade of the hair over it.
  return clamp(0.08 + 0.72 * diffuse(n) - root * (1 - Math.min(1, t * 3)));
}

interface HairPlan {
  /** Locks of the fringe, rooted along the hairline. */
  fringe: [Pt, Pt, Pt, Pt, number][];
  /** Locks framing the face, in front of it. */
  sides: [Pt, Pt, Pt, Pt, number][];
  /** Long hair falling in front of the shoulders, behind the face. */
  curtains: [Pt, Pt, Pt, Pt, number][];
  /** Hair behind the head and neck: how far down (0 = none) and how wide. */
  backEnd: number;
  backHw: number;
  /** Extra height of the hair above the skull. */
  volume: number;
  /** The cap's lower edge on the forehead (the hairline, for styles without a fringe). */
  hairline: number;
  curls: boolean;
}

function hairPlan(f: PortraitFeatures): HairPlan {
  const rand = mulberry32(f.jitter ^ 0x5bd1e995);
  const j = (n: number) => (rand() - 0.5) * 2 * n;
  const dir = f.flip ? -1 : 1;
  type Lock = [Pt, Pt, Pt, Pt, number];
  /** A fringe lock from a root on the hairline to a tip, swinging `swing` sideways. */
  const lock = (rx: number, ry: number, tx: number, ty: number, w: number, bend = 0.25): Lock => [
    [rx, ry],
    [rx + (tx - rx) * 0.15, ry + (ty - ry) * 0.35],
    [rx + (tx - rx) * (0.75 + bend * 0.3), ry + (ty - ry) * 0.75],
    [tx, ty],
    w,
  ];
  const row = (n: number, from: number, to: number, f2: (x: number, i: number) => Lock): Lock[] => {
    const out: Lock[] = [];
    for (let i = 0; i < n; i++) out.push(f2(from + ((to - from) * i) / Math.max(1, n - 1), i));
    return out;
  };
  /** Root y on the crown for a lock starting at x. */
  const crown = (x: number) => HEAD.cy - HEAD.ry * Math.sqrt(Math.max(0, 1 - ((x - CX) / (HEAD.rx + 2)) ** 2)) + 9;
  const alt = (i: number, n: number) => (i % 2 ? n : 0);
  /** Long locks falling from the temple past the shoulders, one side. */
  const curtain = (side: number, end: number, wave: number, count = 3): Lock[] =>
    Array.from({ length: count }, (_, k) => {
      const x0 = CX + side * (17 + k * 4);
      const xs = CX + side * (23 + k * 5);
      return [
        [x0, 36 + k * 3],
        [xs + side * (4 + wave), 60],
        [xs - side * wave + side * k * 2, 86],
        [xs + side * (3 + k * 3) + j(1.5), end - k * 5 + j(3)],
        14 - k * 2,
      ] as Lock;
    });
  /** Locks framing the face from the temples, ending at `end`. */
  const framing = (end: number, curl: number, w = 10): Lock[] =>
    [-1, 1].map(
      (side) =>
        [
          [CX + side * 15, 30],
          [CX + side * 24, 42],
          [CX + side * 23, end - 12],
          [CX + side * (20 + curl), end + j(1.5)],
          w,
        ] as Lock,
    );
  const base: HairPlan = { fringe: [], sides: [], curtains: [], backEnd: 0, backHw: 0, volume: 4, hairline: 38, curls: false };

  switch (f.hair) {
    case "long":
      return {
        ...base,
        fringe: row(5, CX - 16, CX + 16, (x, i) => lock(x, crown(x), x + (x - CX) * 0.15 + j(1), 49 - alt(i, 2.5) + j(1.2), 13)),
        sides: framing(78, -2),
        curtains: [...curtain(-1, 110, 0), ...curtain(1, 110, 0)],
        backEnd: 108,
        backHw: 35,
      };
    case "wavy":
      return {
        ...base,
        volume: 5,
        fringe: row(4, CX - 15, CX + 15, (x, i) => lock(x, crown(x), x + dir * 6 + (x - CX) * 0.1, 47 - alt(i, 3) + j(1.2), 14, 0.6)),
        sides: framing(80, 3, 9),
        curtains: [...curtain(-1, 108, 3), ...curtain(1, 108, 3)],
        backEnd: 104,
        backHw: 37,
      };
    case "curly":
      return f.gender === "female"
        ? {
            ...base,
            volume: 7,
            fringe: row(5, CX - 16, CX + 16, (x, i) => lock(x, crown(x), x + (x - CX) * 0.2 + j(1.5), 47 - alt(i, 3) + j(1.5), 12, 0.6)),
            sides: framing(70, 3, 9),
            backEnd: 104,
            backHw: 38,
          }
        : { ...base, volume: 7, backEnd: 0, hairline: 42, curls: true };
    case "bob":
      return {
        ...base,
        fringe: row(6, CX - 17, CX + 17, (x) => lock(x, crown(x), x + (x - CX) * 0.08, 48 + j(0.6), 12)),
        sides: [-1, 1].map((side) => [[CX + side * 12, 32], [CX + side * 24, 46], [CX + side * 24, 70], [CX + side * 15, 80], 13] as Lock),
        backEnd: 80,
        backHw: 33,
      };
    case "ponytail":
      return {
        ...base,
        volume: 3,
        fringe: row(4, CX - 14, CX + 12, (x, i) => lock(x, crown(x) - 1, x + dir * 10, 44 + dir * (x - CX) * 0.2 - alt(i, 2) + j(1), 12, 0.5)),
        sides: framing(66, 1, 5),
        backEnd: 0,
      };
    case "bun":
      return {
        ...base,
        volume: 2,
        fringe: row(4, CX - 12, CX + 12, (x, i) => lock(x, crown(x) - 1, x + Math.sign(x - CX + 0.01) * 8, 43 + Math.abs(x - CX) * 0.3 - alt(i, 2) + j(1), 11, 0.5)),
        sides: framing(70, 0, 4.5),
      };
    case "braids":
      return { ...base, volume: 3, hairline: 37, backEnd: 0, curtains: [] };
    case "pixie":
      return {
        ...base,
        volume: 3,
        fringe: row(4, CX - 16, CX + 14, (x, i) => lock(x, crown(x), x + dir * 9, 47 + dir * (x - CX) * 0.15 - alt(i, 2) + j(1.2), 12.5, 0.5)),
        sides: framing(60, 1, 6),
      };
    case "swept":
      return {
        ...base,
        volume: 5,
        fringe: row(4, CX - 16, CX + 16, (x, i) => lock(x, crown(x), x + dir * 14, 45 + dir * (x - CX) * 0.3 - alt(i, 2) + j(1.2), 14, 0.7)),
        sides: framing(84, 2, 8),
        curtains: [...curtain(-1, 106, 1.5), ...curtain(1, 106, 1.5)],
        backEnd: 104,
        backHw: 36,
      };
    case "short":
      return {
        ...base,
        volume: 4,
        fringe: row(4, CX - 15, CX + 15, (x, i) => lock(x, crown(x), x + dir * 3 + j(2.5), 43 - alt(i, 3) + j(1.5), 12)),
        sides: framing(57, -1, 5),
      };
    case "spiky":
      return {
        ...base,
        volume: 7,
        fringe: row(5, CX - 17, CX + 17, (x, i) => lock(x, crown(x) - 2, x + (i % 2 ? 5 : -5) + j(1.5), 51 - alt(i, 5) + j(2), 12, 0.2)),
        sides: framing(66, 2, 6),
      };
    case "sidepart":
      return {
        ...base,
        volume: 6,
        fringe: row(4, CX - 14, CX + 16, (x, i) => lock(x - dir * 4, crown(x) - 3, x + dir * 12, 42 + dir * (x - CX) * 0.18 - alt(i, 2) + j(1), 13, 0.8)),
        sides: framing(58, -1, 5),
      };
    case "slicked":
      return { ...base, volume: 5, hairline: 36, sides: framing(55, -1, 4.5) };
    case "buzz":
      return { ...base, volume: 1, hairline: 37 };
    case "shaggy":
      return {
        ...base,
        volume: 5,
        fringe: row(5, CX - 16, CX + 16, (x, i) => lock(x, crown(x), x + dir * 4 + j(3), 50 - alt(i, 3) + j(2), 12)),
        sides: framing(72, 1, 7),
        backEnd: 74,
        backHw: 29,
      };
    case "tied":
      return {
        ...base,
        volume: 4,
        hairline: 37,
        fringe: [lock(CX + dir * 2, crown(CX) - 1, CX + dir * 9, 49, 4.5, 0.6)],
        sides: framing(60, 0, 4.5),
      };
  }
}

function drawBackHair(c: Canvas, f: PortraitFeatures, plan: HairPlan): void {
  const dir = f.flip ? -1 : 1;
  if (plan.backEnd > 0) {
    // A mass behind the head and neck, in shadow, ending in pointed tips.
    const back = c.newPart();
    c.fill(CX - plan.backHw - 2, 26, CX + plan.backHw + 2, plan.backEnd, (x, y) => {
      // Rounded over the head, then hanging straight, ending in pointed tips.
      const top = Math.max(0, 46 - y) / 20;
      const hw = plan.backHw * Math.sqrt(Math.max(0, 1 - top * top));
      if (Math.abs(x - CX) >= hw) return null;
      const tips = plan.backEnd - 7 + Math.abs(((x * 0.5) % 2) - 1) * 7;
      return y < tips ? 0.3 + 0.12 * (1 - Math.abs(x - CX) / hw) - (y - 40) * 0.002 : null;
    }, Mat.Hair, Z_BACK_HAIR, back);
  }
  if (f.hair === "ponytail") {
    const tail = c.newPart();
    c.stroke([[CX + dir * 16, 22], [CX + dir * 38, 28], [CX + dir * 40, 70], [CX + dir * 30, 104]], 15, 2, Mat.Hair, Z_BACK_HAIR, tail, (u, t, d, x, y) => lockLight(u, t, d, x, y, 0));
    c.stroke([[CX + dir * 22, 30], [CX + dir * 38, 46], [CX + dir * 36, 80], [CX + dir * 32, 100]], 7, 1, Mat.Hair, Z_BACK_HAIR, c.newPart(), (u, t, d, x, y) => lockLight(u, t, d, x, y, 0) - 0.08);
  }
  if (f.hair === "tied") {
    c.stroke([[CX - dir * 10, 30], [CX - dir * 30, 40], [CX - dir * 30, 62], [CX - dir * 26, 82]], 9, 1.5, Mat.Hair, Z_BACK_HAIR, c.newPart(), (u, t, d, x, y) => lockLight(u, t, d, x, y, 0) - 0.05);
  }
  if (f.hair === "braids") {
    // Box braids: columns of small plaits from the crown down past the shoulders.
    for (let k = 0; k < 14; k++) {
      const side = k % 2 ? 1 : -1;
      const n = Math.floor(k / 2);
      const x0 = CX + side * (10 + n * 3.2);
      const x1 = CX + side * (19 + n * 3.6);
      const front = n < 3;
      const end = 104 - n * 2 + ((f.jitter >> k) % 4);
      plait(c, [x0, 32 + n], [x1, end], front ? Z_CURTAIN : Z_BACK_HAIR);
    }
  }
}

/** One braid: a long thin plait, its crossing strands drawn as diagonal bands of light. */
function plait(c: Canvas, from: Pt, to: Pt, z: number): void {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const bow = (to[0] - from[0]) * 0.25;
  const at = (t: number): Pt => [from[0] + (to[0] - from[0]) * t + bow * Math.sin(Math.PI * t), from[1] + (to[1] - from[1]) * t];
  c.path(at, len, 3.4, 2.2, Mat.Hair, z, c.newPart(), (u, t) => {
    const weave = ((t * len) / 2.4 + u * 0.6) % 1;
    const round = Math.sqrt(Math.max(0, 1 - u * u));
    return clamp(0.12 + 0.5 * round + (weave < 0.45 ? 0.14 : -0.08) - 0.12 * Math.max(0, u));
  }, 1);
}

/** The crown the cap's clumps fan out from, behind and above the parting. */
function crownPoint(f: PortraitFeatures): Pt {
  return [CX + (f.flip ? 7 : -7), 8];
}

/** Which clump of the cap a point is in, and where across it (−1…1). */
function capClump(f: PortraitFeatures, x: number, y: number): { id: number; u: number; angle: number } {
  const [ox, oy] = crownPoint(f);
  const angle = Math.atan2(y - oy, x - ox);
  const width = 0.3;
  const offset = (f.jitter % 100) / 100;
  const k = angle / width + offset;
  const id = Math.floor(k);
  return { id, u: (k - id) * 2 - 1, angle };
}

/** Light for the hair cap: big glossy clumps fanning from the crown, each rounded across. */
function capLight(f: PortraitFeatures, x: number, y: number): number {
  const { u, angle } = capClump(f, x, y);
  const radial: Pt = [Math.cos(angle), Math.sin(angle)];
  const across: Vec3 = [-radial[1] * u, radial[0] * u, Math.sqrt(Math.max(0, 1 - u * u))];
  const head = headNormal(x, y);
  const n = normalize([across[0] * 0.5 + head[0] * 0.8, across[1] * 0.5 + head[1] * 0.8, across[2] * 0.5 + head[2] * 0.8]);
  // A thin dark parting between clumps.
  const seam = Math.abs(u) > 0.9 ? 0.11 : 0;
  return clamp(0.08 + 0.72 * diffuse(n) - seam);
}

/** A pointed bump on the cap's outline, so the silhouette breaks into tufts (0–1). */
function capBump(f: PortraitFeatures, x: number, y: number): number {
  const { u } = capClump(f, x, y);
  return y < HEAD.cy ? 1 - Math.abs(u) : 0;
}

function drawFrontHair(c: Canvas, f: PortraitFeatures, s: FaceShape, plan: HairPlan): void {
  const dir = f.flip ? -1 : 1;
  const Z = Z_FRONT_HAIR;
  const capRx = HEAD.rx + plan.volume * 0.7;
  const capRy = HEAD.ry + plan.volume * 0.7;
  const capCy = HEAD.cy;
  const short = plan.fringe.length === 0;
  const temples = short ? 52 : 60;
  // The cap over the crown: down to the hairline over the forehead, and down beside the face
  // to the temples.
  const inCap = (x: number, y: number) => {
    const bump = f.hair === "spiky" ? 0.14 : f.hair === "buzz" || f.hair === "slicked" ? 0 : 0.055;
    const r = 1 + bump * capBump(f, x, y) - (f.hair === "buzz" || f.hair === "slicked" ? 0.04 : 0);
    if (((x - CX) / capRx) ** 2 + ((y - capCy) / capRy) ** 2 > r * r) return false;
    if (y < plan.hairline - Math.abs(x - CX) * (short ? 0.06 : 0.12)) return true;
    return Math.abs(x - CX) > faceHw(s, y) - 0.6 && y < temples;
  };

  if (plan.curls) {
    drawCurls(c, f, capRx, capRy, plan);
    return;
  }
  const cap = c.newPart(false);
  c.fill(CX - capRx * 1.1, capCy - capRy * 1.1, CX + capRx * 1.1, capCy + 16, (x, y) => (inCap(x, y) ? capLight(f, x, y) : null), Mat.Hair, Z, cap);
  if (f.hair === "buzz") {
    c.relight(CX - capRx, 0, CX + capRx, 60, (x, y, l, i) => (c.part[i] === cap && (Math.floor(x * S) + Math.floor(y * S)) % 2 === 0 ? l - 0.12 : null));
  }
  if (f.hair === "slicked" || f.hair === "tied" || f.hair === "ponytail" || f.hair === "bun") {
    // Combed back: strong lines sweeping from the forehead over the crown.
    for (let k = -4; k <= 4; k++) {
      c.relight(CX - capRx, 0, CX + capRx, plan.hairline + 2, (x, y, l, i) =>
        c.part[i] === cap && Math.abs(x - (CX + k * (4.2 + (plan.hairline - y) * 0.16) + dir * 2)) < 0.42 && y > 18 ? l - 0.2 : null,
      );
    }
  }
  if (f.hair === "slicked") {
    // A loose lock falling over the brow.
    c.stroke([[CX + dir * 4, 30], [CX + dir * 12, 34], [CX + dir * 13, 42], [CX + dir * 10, 47]], 4.5, 0.6, Mat.Hair, Z, c.newPart(), (u, t, d, x, y) => lockLight(u, t, d, x, y));
  }
  if (f.hair === "braids") {
    // Parting lines and the front plaits.
    for (const k of [-10, 0, 10]) c.relight(CX - capRx, 0, CX + capRx, 40, (x, y, l, i) => (c.part[i] === cap && Math.abs(x - CX - k - (y - 30) * k * 0.02) < 0.45 ? 0.05 : null));
  }
  if (f.hair === "bun") {
    const bun = c.newPart();
    const bx = CX + dir * 4;
    const by = capCy - capRy + 4;
    c.ellipse(bx, by, 10, 8.5, (x, y) => {
      const l = 0.1 + 0.85 * diffuse(normalize([(x - bx) / 9, (y - by) / 8, 0.55]));
      return Math.abs(Math.sin(Math.atan2(y - by, x - bx) * 5 + Math.hypot(x - bx, y - by) * 0.6)) < 0.16 ? l - 0.16 : l;
    }, Mat.Hair, Z + 1, bun);
  }

  // Fringe and the locks framing the face.
  for (const [p0, p1, p2, p3, w] of plan.sides) c.stroke([p0, p1, p2, p3], w, 0.6, Mat.Hair, Z, c.newPart(), (u, t, d, x, y) => lockLight(u, t, d, x, y), 0.9);
  for (const [p0, p1, p2, p3, w] of plan.fringe) c.stroke([p0, p1, p2, p3], w, 0.4, Mat.Hair, Z, c.newPart(), (u, t, d, x, y) => lockLight(u, t, d, x, y), 0.75);

}

/** Curly hair: a cloud of small, round, separately shaded curls. */
function drawCurls(c: Canvas, f: PortraitFeatures, capRx: number, capRy: number, plan: HairPlan): void {
  const rand = mulberry32(f.jitter ^ 0x1b873593);
  const female = f.gender === "female";
  // One part for the whole mass, so only its outline is inked; each curl is shaded on its own.
  const part = c.newPart();
  c.fill(CX - capRx, HEAD.cy - capRy, CX + capRx, 56, (x, y) => {
    if (((x - CX) / capRx) ** 2 + ((y - HEAD.cy) / capRy) ** 2 > 1) return null;
    if (y > plan.hairline - Math.abs(x - CX) * 0.1 && Math.abs(x - CX) < faceHw(FACES[f.gender][f.face]!, y) + 0.5) return null;
    return 0.2;
  }, Mat.Hair, Z_FRONT_HAIR, part);
  const curl = (x: number, y: number, r: number, z: number) => {
    c.ellipse(x, y, r, r * 0.92, (px, py) => {
      const n = normalize([(px - x) / (r * 1.2), (py - y) / (r * 1.2), 0.65]);
      const head = headNormal(px, py);
      const l = clamp(0.1 + 0.68 * diffuse(normalize([n[0] + head[0] * 0.6, n[1] + head[1] * 0.6, n[2] + head[2] * 0.4])));
      // A dark rim where curls meet.
      return ((px - x) / r) ** 2 + ((py - y) / (r * 0.92)) ** 2 > 0.72 ? Math.min(l, 0.22) : l;
    }, Mat.Hair, z, part);
  };
  // Over the crown and down to the hairline, outside the face.
  const r = female ? 3.4 : 2.3;
  for (let y = HEAD.cy - capRy + r * 0.6; y < (female ? 98 : 54); y += r * 1.25) {
    for (let x = CX - capRx - 4; x <= CX + capRx + 4; x += r * 1.35) {
      const xx = x + (rand() - 0.5) * r * 0.8 + ((Math.round(y) % 2) * r) / 2;
      const yy = y + (rand() - 0.5) * r * 0.6;
      const inHead = ((xx - CX) / (capRx + 1)) ** 2 + ((yy - HEAD.cy) / (capRy + 1)) ** 2 <= 1;
      const overFace = yy > plan.hairline - Math.abs(xx - CX) * 0.1 && Math.abs(xx - CX) < 17;
      if (female) {
        // Long curls: the head, then a widening mane down to the shoulders.
        const mane = yy > HEAD.cy && Math.abs(xx - CX) < capRx + 8 - (yy - HEAD.cy) * 0.05 && Math.abs(xx - CX) > 15;
        if ((inHead && !overFace) || mane) curl(xx, yy, r * (0.85 + rand() * 0.3), yy > 66 ? Z_CURTAIN : Z_FRONT_HAIR);
      } else if (inHead && !overFace) curl(xx, yy, r * (0.85 + rand() * 0.3), Z_FRONT_HAIR);
    }
  }
  // A few curls falling over the forehead.
  for (let k = 0; k < (female ? 4 : 3); k++) curl(CX - 9 + k * 6 + (rand() - 0.5) * 2, plan.hairline + 1 + rand() * 2, r * 0.9, Z_FRONT_HAIR);
}

/** Long hair in front of the shoulders. Drawn before the face so the face covers its inner edge. */
/** Long ringlets: narrow locks that wave tightly as they fall, from temple to shoulder. */
function drawRinglets(c: Canvas, f: PortraitFeatures): void {
  const rand = mulberry32(f.jitter ^ 0x68e31da4);
  for (const side of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const x0 = CX + side * (14 + k * 3.2);
      const y0 = 30 + k * 4;
      const x1 = CX + side * (20 + k * 4.6);
      const y1 = 98 + rand() * 10 - k * 3;
      const phase = rand() * 6;
      const at = (t: number): Pt => {
        const bulge = Math.sin(Math.PI * Math.min(1, t * 1.6)) * 5;
        return [x0 + (x1 - x0) * t + side * bulge + Math.sin(t * 15 + phase) * 2.2 * t, y0 + (y1 - y0) * t];
      };
      c.path(at, y1 - y0 + 10, 7, 2.2, Mat.Hair, k < 2 ? Z_FRONT_HAIR : Z_CURTAIN, c.newPart(), (u, t, d, x, y) => {
        const across: Vec3 = [-d[1] * u, d[0] * u, Math.sqrt(Math.max(0, 1 - u * u))];
        return clamp(0.1 + 0.66 * diffuse(normalize([across[0] * 0.8, across[1] * 0.8 + 0.1, across[2] * 0.8 + 0.4])) - 0.05 * t);
      }, 1.1);
    }
  }
}

function drawCurtains(c: Canvas, plan: HairPlan): void {
  for (const [p0, p1, p2, p3, w] of plan.curtains) {
    c.stroke([p0, p1, p2, p3], w, 1, Mat.Hair, Z_CURTAIN, c.newPart(), (u, t, d, x, y) => {
      // Below the head the hair hangs flat, facing us, a little darker as it falls.
      if (y < HEAD.cy + 8) return lockLight(u, t, d, x, y, 0);
      const across: Vec3 = [-d[1] * u, d[0] * u, Math.sqrt(Math.max(0, 1 - u * u))];
      return clamp(0.12 + 0.62 * diffuse(normalize([across[0] * 0.6, across[1] * 0.6 + 0.1, across[2] * 0.6 + 0.6])) - 0.06 * t);
    }, 0.6);
  }
}

// --- Headgear -------------------------------------------------------------------------------

function drawHeadgear(c: Canvas, f: PortraitFeatures, s: FaceShape, plan: HairPlan): void {
  const dir = f.flip ? -1 : 1;
  const capRy = HEAD.ry + plan.volume;
  const top = HEAD.cy - capRy;
  switch (f.headgear) {
    case "beanie": {
      // A knitted cap pulled down to the brow, with a folded rim.
      const part = c.newPart();
      const rx = HEAD.rx + 3;
      c.fill(CX - rx - 1, top - 2, CX + rx + 1, 44, (x, y) => {
        const inDome = ((x - CX) / rx) ** 2 + ((y - 40) / (40 - top + 1)) ** 2 <= 1 && y < 41;
        if (!inDome) return null;
        const l = 0.08 + 0.85 * diffuse(normalize([(x - CX) / (rx + 3), (y - 40) / 30, 0.6]));
        return Math.floor(x * S) % 3 === 0 && y < 35 ? l - 0.12 : l;
      }, Mat.Hat, Z_HAT, part);
      const rim = c.newPart();
      c.fill(CX - rx - 1, 33, CX + rx + 1, 43, (x, y) => (y > 35 && y < 41 && Math.abs(x - CX) < rx + 0.5 - (y - 35) * 0.1 ? 0.25 + 0.5 * diffuse(normalize([(x - CX) / (rx + 4), -0.2, 0.7])) - (Math.floor(x * S) % 2 ? 0.08 : 0) : null), Mat.Hat, Z_HAT, rim);
      break;
    }
    case "beret": {
      // Tilted to one side, with a badge in the faction's colour.
      const part = c.newPart();
      const bx = CX - dir * 4;
      c.fill(CX - 34, top - 4, CX + 34, 38, (x, y) => {
        const d = ((x - bx) / 31) ** 2 + ((y - (top + 11 - (x - CX) * dir * 0.12)) / 11) ** 2;
        return d <= 1 ? 0.12 + 0.8 * diffuse(normalize([(x - bx) / 30, (y - top - 8) / 12, 0.6])) : null;
      }, Mat.Hat, Z_HAT, part);
      c.ellipse(CX + dir * 9, top + 13, 2.2, 2.4, 0.6, Mat.Accent, Z_HAT + 1, c.newPart());
      break;
    }
    case "headset": {
      // Over the head, an earcup on one side and a boom mic toward the mouth.
      const part = c.newPart();
      const ex = CX + dir * (s.rx + 1);
      c.stroke([[CX - dir * (HEAD.rx + 2), 52], [CX - dir * (HEAD.rx + 4), top - 2], [CX + dir * (HEAD.rx + 4), top - 2], [ex, 52]], 2.2, 2.2, Mat.Gear, Z_GEAR, part, (u) => 0.45 - u * 0.2, 1);
      c.ellipse(ex, 58, 3.6, 5, (x) => 0.35 + (x - ex) * -dir * 0.05, Mat.Gear, Z_GEAR, part);
      c.stroke([[ex, 62], [ex - dir * 2, 70], [CX + dir * 8, 73], [CX + dir * 4.5, 73]], 1.2, 1.2, Mat.Gear, Z_GEAR, part, () => 0.3, 1);
      c.ellipse(CX + dir * 4, 73, 1.4, 1.2, 0.6, Mat.Accent, Z_GEAR, part);
      break;
    }
    case "earpiece": {
      const ex = CX + dir * (s.rx - 0.5);
      const part = c.newPart();
      c.ellipse(ex, 59, 1.2, 1.3, 0.4, Mat.Gear, Z_GEAR, part);
      c.stroke([[ex, 60], [ex + dir * 0.8, 66], [ex + dir * 1.2, 74], [ex + dir * 1.5, 84]], 0.7, 0.7, Mat.Gear, Z_GEAR, part, () => 0.65, 1);
      break;
    }
    case "headphones": {
      // Round headphones resting around the neck.
      const part = c.newPart();
      for (const side of [-1, 1]) c.ellipse(CX + side * 12, 88, 4.6, 5.4, (x) => 0.25 + (side < 0 ? 0.3 : 0) - (x - CX - side * 12) * 0.03, Mat.Gear, Z_GEAR, part);
      for (const side of [-1, 1]) c.ellipse(CX + side * 12, 88, 2.6, 3.4, 0.55, Mat.Accent, Z_GEAR, part);
      c.stroke([[CX - 12, 84], [CX - 8, 98], [CX + 8, 98], [CX + 12, 84]], 2, 2, Mat.Gear, Z_GEAR - 1, part, () => 0.3, 1);
      break;
    }
    case "none":
      break;
  }
}

// --- Finishing ----------------------------------------------------------------------------------

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Materials that get line art where they overlap something behind them. */
const LINED = new Set<number>([Mat.Skin, Mat.Hair, Mat.Cloth, Mat.Shirt, Mat.Accent, Mat.Hat, Mat.Gear, Mat.Metal]);
const LINE = -1;

function finish(c: Canvas): void {
  const isHairFront = (x: number, y: number) => c.inside(x, y) && c.mat[y * W + x] === Mat.Hair && c.z[y * W + x]! >= Z_FACIAL_HAIR;
  const next = c.light.slice();

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const mat = c.mat[i]!;
      if (mat === Mat.None) continue;
      // Hair shades the skin just below it: the forehead under the fringe, the cheeks beside it.
      if ((mat === Mat.Skin || mat === Mat.Blush) && c.z[i]! <= Z_FACE) {
        let shadow = false;
        for (let d = 1; d <= 3 && !shadow; d++) shadow = isHairFront(x, y - d) || isHairFront(x + d, y - d) || (d <= 2 && isHairFront(x - d, y));
        if (shadow) next[i] = Math.min(c.light[i]!, 0.26);
      }
      if (!LINED.has(mat) || c.lineless.has(c.part[i]!)) continue;
      // Line art where this part overlaps a different part behind it.
      const line = NEIGHBORS.some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        if (!c.inside(nx, ny)) return false;
        const j = ny * W + nx;
        if (c.mat[j] === Mat.None || c.part[j] === c.part[i]) return false;
        if (c.lineless.has(c.part[j]!) && c.z[j]! > c.z[i]!) return false;
        return c.z[j]! < c.z[i]! || (c.z[j] === c.z[i] && c.part[j]! < c.part[i]!);
      });
      if (line) next[i] = LINE;
    }
  }
  c.light.set(next);

  // The anime shine ring across the hair: a band around the crown, on the lit side of locks,
  // broken into streaks.
  const ringR = (x: number, y: number) => Math.hypot((x - HEAD.cx) / (HEAD.rx + 4), (y - HEAD.cy + 4) / (HEAD.ry + 4));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (c.mat[i] !== Mat.Hair || c.light[i]! < 0.38 || c.z[i]! < Z_CURTAIN) continue;
      const dx = toX(x);
      const dy = toY(y);
      const r = ringR(dx, dy);
      const streak = Math.abs(((dx * 0.55 + c.part[i]! * 1.7) % 3) - 1.5) / 1.5; // 0..1
      const band = 0.64 + 0.05 * streak;
      if (dy < HEAD.cy && Math.abs(r - band) < 0.022 + 0.035 * (1 - streak) && streak < 0.8 && c.across[i]! < 0.5 && dx < CX + 20) c.light[i] = 1;
    }
  }

  // Dark outline around the whole figure.
  const add: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (c.at(x, y) !== Mat.None) continue;
      if (NEIGHBORS.some(([dx, dy]) => c.at(x + dx, y + dy) !== Mat.None)) add.push(y * W + x);
    }
  }
  for (const i of add) {
    c.mat[i] = Mat.Outline;
    c.light[i] = 0;
  }
}

export function paint(f: PortraitFeatures): Canvas {
  const c = new Canvas();
  const s = FACES[f.gender][f.face]!;
  const plan = hairPlan(f);
  drawBackHair(c, f, plan);
  drawBody(c, f, s);
  drawCurtains(c, plan);
  if (f.hair === "curly" && f.gender === "female") drawRinglets(c, f);
  drawFace(c, f, s);
  drawFeatures(c, f, s);
  if (f.glasses) drawGlasses(c);
  if (f.headgear !== "beanie" && f.headgear !== "beret") drawFrontHair(c, f, s, plan);
  else drawHatHair(c, f, s, plan);
  drawHeadgear(c, f, s, plan);
  finish(c);
  return c;
}

/** Under a hat only the hair below the rim shows: the fringe and the sides. */
function drawHatHair(c: Canvas, f: PortraitFeatures, s: FaceShape, plan: HairPlan): void {
  if (plan.curls) {
    drawCurls(c, f, HEAD.rx + plan.volume * 0.8, HEAD.ry + plan.volume, plan);
    return;
  }
  const cap = c.newPart();
  const rx = HEAD.rx + plan.volume * 0.5;
  const ry = HEAD.ry + plan.volume * 0.5;
  c.fill(CX - rx, 40, CX + rx, 60, (x, y) => (((x - CX) / rx) ** 2 + ((y - HEAD.cy) / ry) ** 2 <= 1 && Math.abs(x - CX) > faceHw(s, y) - 0.6 && y < 58 ? capLight(f, x, y) : null), Mat.Hair, Z_FRONT_HAIR, cap);
  for (const [p0, p1, p2, p3, w] of plan.sides) c.stroke([p0, p1, p2, p3], w, 0.6, Mat.Hair, Z_FRONT_HAIR, c.newPart(), (u, t, d, x, y) => lockLight(u, t, d, x, y));
  for (const [p0, p1, p2, p3, w] of plan.fringe) {
    if (p3[1] < 42) continue;
    c.stroke([[p0[0], Math.max(p0[1], 40)], [p1[0], Math.max(p1[1], 40)], p2, p3], w, 0.5, Mat.Hair, Z_FRONT_HAIR, c.newPart(), (u, t, d, x, y) => lockLight(u, t, d, x, y));
  }
}

// --- Rendering ------------------------------------------------------------------------------

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}

function toHsl([r, g, b]: Rgb): [number, number, number] {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): Rgb {
  h = ((h % 360) + 360) % 360;
  s = clamp(s);
  l = clamp(l);
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Moves a hue part of the way toward another, the short way round. */
function towardHue(h: number, target: number, amount: number): number {
  const d = ((target - h + 540) % 360) - 180;
  return h + d * amount;
}

/**
 * A pixel-art colour ramp around a base colour, dark to light: shadows drift toward a cool
 * (or, for skin, a rosy) hue and gain saturation; highlights drift toward warm yellow.
 */
function ramp(base: string, below: number, above: number, shadowHue = 255, step = 0.12, saturate = 0.06): Rgb[] {
  const [h, s, l] = toHsl(hex(base));
  const out: Rgb[] = [];
  for (let k = below; k >= 1; k--) out.push(fromHsl(towardHue(h, shadowHue, 0.12 * k), s + saturate * k, l - step * k * (l > 0.75 ? 1.2 : 1)));
  out.push(hex(base));
  // Highlights get smaller steps as they near white, so pale colours don't wash out.
  for (let k = 1; k <= above; k++) out.push(fromHsl(towardHue(h, 50, 0.1 * k), s - 0.05 * k, l + step * 0.9 * k * (1 - l) * 2.2));
  return out;
}

/** The colour ramp of every material for one portrait. */
function palette(f: PortraitFeatures, accent: string): Rgb[][] {
  const skin = SKIN[f.skin]!;
  // Skin shadows drift rosy but lose a little saturation, so fair skin doesn't turn orange.
  const skinRamp = ramp(skin, 2, 2, 350, 0.08, -0.12);
  const hair = HAIR[f.hairColor]!;
  const hairRamp = ramp(hair, 3, 2, 260, 0.11);
  const cloth = CLOTH[f.clothing];
  const ink = hex("#1a1018");
  const out: Rgb[][] = [];
  out[Mat.None] = [[0, 0, 0]];
  out[Mat.Skin] = skinRamp;
  // The top step is the shine ring's sheen, which nothing else reaches.
  out[Mat.Hair] = [...hairRamp, mix(hairRamp[hairRamp.length - 1]!, hex("#ffffff"), 0.5)];
  out[Mat.Sclera] = [hex("#8f8aa6"), hex("#cfd3e6"), hex("#ffffff")];
  out[Mat.Iris] = ramp(EYES[f.eyeColor]!, 2, 2, 260, 0.14);
  out[Mat.Ink] = [mix(hex(hair), ink, 0.85), mix(hex(hair), ink, 0.7)];
  out[Mat.Shine] = [hex("#ffffff")];
  out[Mat.Lip] = [mix(skinRamp[0]!, hex("#5a1424"), 0.55), mix(hex(skin), hex("#d8606e"), 0.55), mix(hex(skin), hex("#f08a90"), 0.45)];
  // Rosier on fair skin; on deep skin a warm red, so it doesn't turn muddy.
  out[Mat.Blush] = skinRamp.map((c) => mix(c, hex(f.skin >= 4 ? "#e0465a" : "#ff7088"), f.skin >= 4 ? 0.22 : 0.3));
  out[Mat.Stubble] = skinRamp.map((c) => mix(c, hairRamp[1]!, 0.35));
  out[Mat.Cloth] = ramp(cloth.cloth[f.clothColor]!, 2, 2, 250, f.clothing === "labcoat" || f.clothing === "flightsuit" ? 0.1 : 0.08);
  out[Mat.Shirt] = ramp(cloth.shirt[f.shirtColor]!, 2, 1, 250, 0.09);
  out[Mat.Accent] = ramp(accent, 2, 2, 250, 0.12);
  out[Mat.Metal] = ramp("#d8b45a", 2, 2, 20, 0.13);
  out[Mat.Frame] = [hex("#16141c"), hex("#3a3640"), hex("#6a6470")];
  out[Mat.Hat] = ramp(f.headgear === "beret" ? "#3a3f2e" : cloth.cloth[(f.clothColor + 1) % cloth.cloth.length]!, 2, 2, 250, 0.09);
  out[Mat.Gear] = ramp("#3a3d46", 2, 2, 250, 0.1);
  out[Mat.Outline] = [hex("#0c0910")];
  return out;
}

/** Each material's line-art colour: its darkest shade pulled toward ink. */
function lineColor(colors: Rgb[]): Rgb {
  return mix(colors[0]!, hex("#120a14"), 0.55);
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** The head crop used in lists: a square around the face, in pixels. */
export const HEAD_CROP = { x: 22, y: 20, size: 84 };

/**
 * The portrait as RGBA pixels (W × H × 4) on its card: a dark backdrop with a glow of the
 * faction's colour, and (with `frame`) a border in that colour. Needs no DOM, so tools can use it.
 */
export function renderPortrait(
  seed: number,
  gender: Gender,
  professionId: string,
  accent: string,
  frame = true,
  skin: number | null = null,
  hairSeed: number | null = null,
): Uint8ClampedArray {
  const f = featuresFromSeed(seed, gender, professionId);
  if (skin !== null && skin >= 0 && skin < SKIN.length) f.skin = skin;
  if (hairSeed !== null) Object.assign(f, hairFromSeed(hairSeed, gender));
  const c = paint(f);
  const colors = palette(f, accent);
  const lines = colors.map((r) => lineColor(r));
  const data = new Uint8ClampedArray(W * H * 4);
  const glow = hex(accent);
  const dark = hex("#07080d");
  const deep = hex("#141826");
  // The glow sits behind the head and a little to the lit side.
  const gx = (CX - 10) * S;
  const gy = 44 * S;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const o = i * 4;
      const threshold = BAYER[(y % 4) * 4 + (x % 4)]! / 16 - 0.5;
      const mat = c.mat[i]!;
      let rgb: Rgb;
      if (mat !== Mat.None) {
        const light = c.light[i]!;
        const r = colors[mat]!;
        if (light === LINE) rgb = lines[mat]!;
        else rgb = r[clamp(Math.floor(light * r.length + threshold * 0.12), 0, r.length - 1)]!;
      } else {
        // Backdrop: near-black, a soft stepped glow of the faction's colour, a vignette.
        const d = Math.hypot((x - gx) / (W * 0.75), (y - gy) / (H * 0.62));
        const level = clamp(Math.round((1 - d) * 5 + threshold * 0.9), 0, 5) / 5;
        rgb = mix(dark, deep, clamp(1 - y / H + 0.2));
        rgb = mix(rgb, mix(glow, dark, 0.35), level * 0.55);
      }
      data[o] = rgb[0];
      data[o + 1] = rgb[1];
      data[o + 2] = rgb[2];
      data[o + 3] = 255;
    }
  }
  if (frame) {
    // A card border: dark edge, the faction's colour, a darker inner line.
    const border = mix(glow, hex("#ffffff"), 0.1);
    const inner = mix(glow, dark, 0.55);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = Math.min(x, y, W - 1 - x, H - 1 - y);
        if (d > 3) continue;
        const rgb = d === 0 ? hex("#05060a") : d <= 2 ? (d === 1 ? border : mix(border, dark, 0.25)) : inner;
        const o = (y * W + x) * 4;
        data[o] = rgb[0];
        data[o + 1] = rgb[1];
        data[o + 2] = rgb[2];
      }
    }
  }
  return data;
}
