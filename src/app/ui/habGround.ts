// The ground under a base and the sky round a station, in pixel art, for the hab pictures
// (HabScene). A base's ground takes its colours from the body's map round the site (or the body's
// colour where it has no map or the site no place on it): stepped light, mottling, craters lit
// from the upper left and scattered boulders. A station's sky is stars over the limb of its body,
// drawn from the body's map, lit from the upper left. Everything is seeded, so a hab always looks
// the same.

import type { MapImage } from "../solar/bodyArt";

type RGB = [number, number, number];

export interface Backdrop {
  kind: "base" | "station";
  /** The body's colour where its map can't give one. */
  color: string;
  /** Its map, once loaded. */
  map: MapImage | null;
  /** The site, degrees (longitude east); null for a small body's site or a station. */
  lat: number | null;
  lon: number | null;
  /** The body's atmosphere glow for a station's limb, or null. */
  glow: string | null;
  seed: number;
}

const rgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/** A seed from a string (FNV-1a). */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A small seeded generator (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise in [0, 1). */
function noise(x: number, y: number, seed: number): number {
  const hash = (i: number, j: number) => {
    let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = hash(xi, yi) + (hash(xi + 1, yi) - hash(xi, yi)) * sx;
  const bottom = hash(xi, yi + 1) + (hash(xi + 1, yi + 1) - hash(xi, yi + 1)) * sx;
  return top + (bottom - top) * sy;
}

const fbm = (x: number, y: number, seed: number) => 0.55 * noise(x, y, seed) + 0.3 * noise(x * 2.1, y * 2.1, seed + 1) + 0.15 * noise(x * 4.3, y * 4.3, seed + 2);

/** The map's colour at (u, v) in map pixels, bilinear, wrapping in longitude. */
function sample(map: MapImage, u: number, v: number): RGB {
  const x0 = Math.floor(u - 0.5);
  const y0 = Math.max(0, Math.min(map.height - 2, Math.floor(v - 0.5)));
  const fx = u - 0.5 - x0;
  const fy = Math.max(0, Math.min(1, v - 0.5 - y0));
  const at = (x: number, y: number, c: number) => map.data[(y * map.width + (((x % map.width) + map.width) % map.width)) * 4 + c]!;
  const out: RGB = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const top = at(x0, y0, c) + (at(x0 + 1, y0, c) - at(x0, y0, c)) * fx;
    const bottom = at(x0, y0 + 1, c) + (at(x0 + 1, y0 + 1, c) - at(x0, y0 + 1, c)) * fx;
    out[c] = top + (bottom - top) * fy;
  }
  return out;
}

/** The map's mean colour, for a small body's ground. */
function meanColor(map: MapImage): RGB {
  let [r, g, b, n] = [0, 0, 0, 0];
  for (let i = 0; i < map.data.length; i += 4 * 37) {
    if (map.data[i + 3] === 0) continue;
    r += map.data[i]!;
    g += map.data[i + 1]!;
    b += map.data[i + 2]!;
    n++;
  }
  return n ? [r / n, g / n, b / n] : [128, 128, 128];
}

/** Light in steps, as the pixel art's shading. */
const step = (k: number, steps = 10) => Math.round(k * steps) / steps;

/** Paints the backdrop into an image of art pixels. */
export function paintBackdrop(image: ImageData, b: Backdrop): void {
  if (b.kind === "base") paintGround(image, b);
  else paintSky(image, b);
}

function paintGround(image: ImageData, b: Backdrop): void {
  const { width: w, height: h, data } = image;
  const random = rng(b.seed);
  // The map round the site: a window a twenty-fourth of the map's width, so each map pixel spans several art pixels.
  const map = b.map;
  const span = map ? map.width / 24 : 1;
  const u0 = map && b.lon !== null ? (((b.lon + 540) % 360) / 360) * map.width - span / 2 : 0;
  // Near a pole the map's rows are smeared out along longitude: take colours from no nearer than 65°.
  const lat = b.lat === null ? null : Math.max(-65, Math.min(65, b.lat));
  const v0 = map && lat !== null ? ((90 - lat) / 180) * map.height - (span * h) / w / 2 : 0;
  const flat = map && b.lat === null ? meanColor(map) : rgb(b.color);
  const craters = Array.from({ length: Math.round((w * h) / 1500) }, () => ({ x: random() * w, y: random() * h, r: 3 + 26 * random() ** 3 }));
  const boulders = new Set<number>();
  for (let i = 0; i < (w * h) / 220; i++) boulders.add(Math.floor(random() * w) + Math.floor(random() * h) * w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const base = map && b.lat !== null ? sample(map, u0 + (x / w) * span, Math.max(0.5, Math.min(map.height - 0.5, v0 + (y / w) * span))) : flat;
      let k = 0.78 + 0.34 * fbm(x / 22, y / 22, b.seed);
      for (const c of craters) {
        const ox = x + 0.5 - c.x;
        const oy = y + 0.5 - c.y;
        const d = Math.hypot(ox, oy) / c.r;
        if (d >= 1.25) continue;
        // Light from the upper left: a bowl's far (lower-right) wall is lit, its rim's near side too.
        const facing = (ox + oy) / (c.r * Math.SQRT2);
        k *= d < 1 ? 0.84 + 0.32 * facing * d : 1 - 0.16 * facing;
      }
      const i = y * w + x;
      if (boulders.has(i)) k *= 1.22;
      else if (x > 0 && y > 0 && boulders.has(i - w - 1)) k *= 0.72;
      // A gentle vignette, so the modules stand out in the middle.
      const vx = (x / w) * 2 - 1;
      const vy = (y / h) * 2 - 1;
      k = step(k * (0.9 - 0.18 * (vx * vx + vy * vy)));
      const o = i * 4;
      data[o] = Math.min(255, base[0] * k);
      data[o + 1] = Math.min(255, base[1] * k);
      data[o + 2] = Math.min(255, base[2] * k);
      data[o + 3] = 255;
    }
  }
}

function paintSky(image: ImageData, b: Backdrop): void {
  const { width: w, height: h, data } = image;
  const random = rng(b.seed);
  for (let i = 0; i < w * h; i++) {
    const y = Math.floor(i / w);
    const t = y / h;
    data[i * 4] = 5 + 6 * t;
    data[i * 4 + 1] = 8 + 8 * t;
    data[i * 4 + 2] = 14 + 12 * t;
    data[i * 4 + 3] = 255;
  }
  for (let n = 0; n < (w * h) / 160; n++) {
    const o = (Math.floor(random() * h) * w + Math.floor(random() * w)) * 4;
    const v = 90 + 140 * random() ** 3;
    data[o] = v * 0.9;
    data[o + 1] = v * 0.93;
    data[o + 2] = v;
  }
  // The body's limb low on the right, lit from the upper left.
  const r = Math.min(h * 0.8, w * 0.32);
  const cx = w - r * 0.55;
  const cy = h + r * 0.4;
  const light = [-0.55, -0.55, 0.63];
  const flat = rgb(b.color);
  const glow = b.glow ? rgb(b.glow) : null;
  for (let y = Math.max(0, Math.floor(cy - r - 4)); y < h; y++) {
    for (let x = Math.max(0, Math.floor(cx - r - 4)); x < Math.min(w, Math.ceil(cx + r + 4)); x++) {
      const nx = (x + 0.5 - cx) / r;
      const ny = (y + 0.5 - cy) / r;
      const q = nx * nx + ny * ny;
      const o = (y * w + x) * 4;
      if (q > 1) {
        // A thin haze past the limb, for bodies with air.
        const past = (Math.sqrt(q) - 1) * r;
        if (glow && past < 3) {
          const a = 0.5 * (1 - past / 3);
          for (let c = 0; c < 3; c++) data[o + c] = data[o + c]! * (1 - a) + glow[c]! * a;
        }
        continue;
      }
      const nz = Math.sqrt(1 - q);
      let color = flat;
      if (b.map) {
        // Seen from above the equator: latitude from the height, longitude round the axis.
        const lat = Math.asin(-ny);
        const lon = Math.atan2(nx, nz) + 1.1;
        color = sample(b.map, ((lon / (2 * Math.PI) + 0.5) % 1) * b.map.width, (0.5 - lat / Math.PI) * b.map.height);
      }
      const lit = nx * light[0]! + ny * light[1]! + nz * light[2]!;
      const k = step(Math.max(0.06, 0.15 + 0.95 * lit), 8);
      for (let c = 0; c < 3; c++) data[o + c] = Math.min(255, color[c]! * k);
    }
  }
}
