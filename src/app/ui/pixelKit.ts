// A small pixel-art painter over an RGBA buffer, for the hab modules' structures (moduleArt.ts).
// Drawing happens in a 128-unit design space scaled to the target size (32, 64 or 128 pixels),
// rounded to whole pixels so everything stays crisp. The style is built into the primitives, after
// anime cel painting: light from the upper left in a few flat bands from saturated, hue-shifted
// ramps (white hulls fall through periwinkle to indigo, gold foil to red-brown; highlights lean
// warm), no dithering, a hard specular streak along cylinders, a spot on spheres, reflected
// (bounce) light along the shadowed edge of curved hulls, diagonal streaks of gloss on glass
// (gloss()) and four-point glints (sparkle()). Parts are drawn one at a time (part()): what's drawn
// inside lands on a layer that is outlined and then laid over what's already there, so a part in
// front gets an outline against the parts behind it and casts a short shadow down and to the right
// onto them. From 64 px the outline is selective: each outline pixel is a dark shade of the part it
// borders, lighter on the lit upper-left side; 32 px keeps a plain dark outline to stay readable.
// Fine detail (rivets, panel lines, greebles, foil crinkles) is skipped at small sizes.

/** Colours as 0xRRGGBB. */
export type Ramp = readonly number[];

/** The outline. */
export const INK = 0x0d0b1e;

/** Shade ramps, lightest first: highlights lean warm, shadows shift hue (towards blue-violet, mostly) and stay saturated. */
export const RAMPS = {
  hull: [0xffffff, 0xe9edfb, 0xbfc9ee, 0x929cd6, 0x676bb0, 0x43437f],
  dark: [0xb0bbd8, 0x7f8bb4, 0x5a6391, 0x40456f, 0x2c2d52, 0x1c1c39],
  /** Gold foil (multi-layer insulation), reactor vessels, joints. */
  gold: [0xfff5b4, 0xffd75e, 0xf7ab33, 0xd47c26, 0x9e5026, 0x6b2f27],
  glass: [0xeafdff, 0xa8f1fb, 0x5dcff1, 0x3a9adf, 0x2c63b6, 0x1f3c82],
  solar: [0xaadeff, 0x5baaf9, 0x3479e6, 0x2451c2, 0x1c3192, 0x141c5e],
  white: [0xffffff, 0xf3f7ff, 0xd9e1f8, 0xb5c0e6, 0x8d97ca, 0x676da6],
  green: [0xdaff9c, 0xa0ea5d, 0x5dca49, 0x34a24b, 0x1f7649, 0x144b3d],
  ore: [0xe0c8a4, 0xbfa07e, 0x9a7a64, 0x765a54, 0x544046, 0x382c38],
  mirror: [0xffffff, 0xe6faff, 0xbfe9f9, 0x93cdee, 0x6ea6dc, 0x5480bf],
  red: [0xffc2aa, 0xff8269, 0xf14949, 0xc22d49, 0x8e1d45, 0x5a153d],
  /** Beige thermal blankets, as on the ISS's laboratory modules. */
  cloth: [0xfffbe9, 0xf9e9c5, 0xe9cda1, 0xc9a585, 0x9d7971, 0x6d5161],
  /** Olive armour plate. */
  armor: [0xd2daaa, 0xa6b282, 0x7a8a66, 0x5a6a52, 0x3d4b46, 0x29313a],
  /** Silvered sunshield film, pink where it catches the light. */
  shield: [0xfff1fb, 0xf5d2f1, 0xd9aae5, 0xb186d1, 0x8566b5, 0x5d4a91],
} satisfies Record<string, Ramp>;

/** Lights and glows. */
export const GLOW = {
  window: 0xffd86a,
  windowHi: 0xfff6cc,
  beacon: 0xff4a4a,
  cyan: 0x7cecf4,
  cyanHi: 0xe6fdff,
  heat: 0xff9438,
  heatHi: 0xffe89c,
  violet: 0xc68cff,
  violetHi: 0xf2deff,
  green: 0x8dffa0,
  pink: 0xff6ad5,
  pinkHi: 0xffd2f3,
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** The light's direction (towards the light) in view space: from the upper left, a little in front. */
const LIGHT: [number, number, number] = (() => {
  const v: [number, number, number] = [-0.55, -0.62, 0.56];
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
})();

function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * The shade across a cylinder, `n` from -1 (the lit edge) to 1 (the shadowed one): a specular
 * streak near the lit edge, bands falling to a core shadow, and with `bounce` light reflected
 * back along the shadowed edge.
 */
function curve(n: number, bounce: boolean): number {
  if (Math.abs(n + 0.52) < 0.1) return 0;
  const v = 0.28 + 0.5 * n + 0.22 * n * n;
  return n > 0.8 && bounce ? v - 0.3 : v;
}

/** A faction's colour as a ramp like RAMPS', lightest first; a neutral grey-blue if it isn't "#rgb" or "#rrggbb". */
export function factionRamp(color: string): Ramp {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)?.[1];
  const full = hex ? (hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex) : "8fa4b8";
  const c = parseInt(full, 16);
  // Shadows lean towards indigo rather than black, as the other ramps' do.
  return [mix(c, 0xffffff, 0.55), mix(c, 0xffffff, 0.25), c, mix(c, 0x241a52, 0.3), mix(c, 0x1c1446, 0.52), mix(c, 0x140e36, 0.7)];
}

export class Painter {
  /** Pixels per design unit. */
  readonly k: number;
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  /** The faction's ramp, for trim, stripes and flags. */
  readonly faction: Ramp;
  /** The part being drawn: a colour per pixel, -1 where clear. */
  private readonly layer: Int32Array;
  private minX = Infinity;
  private minY = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;

  constructor(
    readonly size: number,
    factionColor: string,
  ) {
    this.k = size / 128;
    this.data = new Uint8ClampedArray(size * size * 4);
    this.layer = new Int32Array(size * size).fill(-1);
    this.faction = factionRamp(factionColor);
  }

  /** Whether details this fine are drawn: 128 px gets everything, 64 px the medium ones. */
  get fine(): boolean {
    return this.size >= 128;
  }
  get medium(): boolean {
    return this.size >= 64;
  }

  /** A design-space coordinate in pixels. */
  p(u: number): number {
    return Math.round(u * this.k);
  }

  // ---- layers ----

  private set(x: number, y: number, c: number): void {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    this.layer[y * this.size + x] = c;
    if (x < this.minX) this.minX = x;
    if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y;
    if (y > this.maxY) this.maxY = y;
  }
  private layerAt(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.size || y >= this.size ? -1 : this.layer[y * this.size + x]!;
  }
  private write(x: number, y: number, c: number): void {
    const o = (y * this.size + x) * 4;
    this.data[o] = (c >> 16) & 255;
    this.data[o + 1] = (c >> 8) & 255;
    this.data[o + 2] = c & 255;
    this.data[o + 3] = 255;
  }

  /** Draws a part: everything drawn in `draw` is outlined in INK (unless `outline` is false) and laid over what's there. */
  part(draw: () => void, outline = true): void {
    draw();
    this.commit(outline);
  }

  private commit(outline: boolean): void {
    if (this.minX > this.maxX) return;
    const s = this.size;
    const inLayer = (x: number, y: number) => this.layerAt(x, y) >= 0;
    const edge = (x: number, y: number) => !inLayer(x, y) && (inLayer(x - 1, y) || inLayer(x + 1, y) || inLayer(x, y - 1) || inLayer(x, y + 1));
    // The part's shadow on what's behind it, before the part and its outline cover their own pixels.
    const reach = this.fine ? 2 : 1;
    if (outline && this.medium)
      for (let y = Math.max(0, this.minY + 1); y <= Math.min(s - 1, this.maxY + reach + 1); y++)
        for (let x = Math.max(0, this.minX + 1); x <= Math.min(s - 1, this.maxX + reach + 1); x++) {
          const o = (y * s + x) * 4;
          if (this.data[o + 3] === 0 || inLayer(x, y) || edge(x, y)) continue;
          let shadow = false;
          for (let d = 2; d <= reach + 1 && !shadow; d++) shadow = inLayer(x - d, y - d) || inLayer(x - d + 1, y - d) || inLayer(x - d, y - d + 1);
          if (shadow) this.write(x, y, mix(this.under(o), INK, 0.4));
        }
    const x0 = Math.max(0, this.minX - 1), x1 = Math.min(s - 1, this.maxX + 1);
    const y0 = Math.max(0, this.minY - 1), y1 = Math.min(s - 1, this.maxY + 1);
    if (outline)
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          if (!edge(x, y)) continue;
          if (!this.medium) {
            this.write(x, y, INK);
            continue;
          }
          // Selective outline: on the lit side (the part lies below or to the right) a dark shade of
          // the part's own colour, elsewhere nearly ink.
          const lit = inLayer(x + 1, y) || inLayer(x, y + 1);
          const c = this.layerAt(x + 1, y) >= 0 ? this.layerAt(x + 1, y) : this.layerAt(x, y + 1) >= 0 ? this.layerAt(x, y + 1) : this.layerAt(x - 1, y) >= 0 ? this.layerAt(x - 1, y) : this.layerAt(x, y - 1);
          this.write(x, y, mix(c, INK, lit ? 0.66 : 0.88));
        }
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const c = this.layer[y * s + x]!;
        if (c >= 0) {
          this.write(x, y, c);
          this.layer[y * s + x] = -1;
        }
      }
    this.minX = this.minY = Infinity;
    this.maxX = this.maxY = -Infinity;
  }

  /** The colour already on the image at byte offset `o`. */
  private under(o: number): number {
    return (this.data[o]! << 16) | (this.data[o + 1]! << 8) | this.data[o + 2]!;
  }

  /** The finished image (any part still open is committed, outlined). */
  finish(): Uint8ClampedArray<ArrayBuffer> {
    this.commit(true);
    return this.data;
  }

  /** A shade from a ramp: `v` 0 is the lightest, 1 the darkest, in flat bands. */
  shade(ramp: Ramp, v: number): number {
    return ramp[Math.round(clamp01(v) * (ramp.length - 1))]!;
  }

  /** Pixel bounds of a design-space box, at least a pixel each way. */
  private span(x: number, y: number, w: number, h: number): [number, number, number, number] {
    const x0 = this.p(x), y0 = this.p(y);
    return [x0, y0, Math.max(x0 + 1, this.p(x + w)), Math.max(y0 + 1, this.p(y + h))];
  }

  // ---- primitives ----

  /** A flat rectangle. */
  fill(x: number, y: number, w: number, h: number, c: number): void {
    const [x0, y0, x1, y1] = this.span(x, y, w, h);
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) this.set(px, py, c);
  }

  /** A single pixel at a design-space point. */
  dot(x: number, y: number, c: number): void {
    this.set(this.p(x), this.p(y), c);
  }

  /** A slab of hull lit from the upper left: highlight on top and left, shadow on right and bottom, banded between. */
  box(x: number, y: number, w: number, h: number, ramp: Ramp = RAMPS.hull, light = 0.3): void {
    const [x0, y0, x1, y1] = this.span(x, y, w, h);
    const e = this.size >= 128 ? 2 : 1;
    const n = ramp.length - 1;
    for (let py = y0; py < y1; py++)
      for (let px = x0; px < x1; px++) {
        let c: number;
        if (py < y0 + e && y1 - y0 > 2 * e) c = ramp[0]!;
        else if (py >= y1 - e && y1 - y0 > 2 * e) c = ramp[Math.min(n, 4)]!;
        else if (px < x0 + e && x1 - x0 > 2 * e) c = ramp[1]!;
        else if (px >= x1 - e && x1 - x0 > 2 * e) c = ramp[Math.min(n, 3)]!;
        else c = this.shade(ramp, light + ((py - y0) / (y1 - y0)) * 0.3);
        this.set(px, py, c);
      }
  }

  /**
   * A horizontal cylinder: bands from a specular streak near the top to shadow underneath. `round`
   * is how far its ends are rounded, as a share of its height: 0 square, 0.5 hemispheres.
   */
  hcyl(x: number, y: number, w: number, h: number, ramp: Ramp = RAMPS.hull, round = 0.22): void {
    const [x0, y0, x1, y1] = this.span(x, y, w, h);
    const hh = y1 - y0, cap = round > 0 ? Math.max(1, Math.round(Math.min(hh * round, (x1 - x0) / 2))) : 0;
    for (let px = x0; px < x1; px++) {
      const d = px < x0 + cap ? (x0 + cap - px - 0.5) / cap : px >= x1 - cap ? (px - (x1 - cap) + 0.5) / cap : 0;
      const half = Math.sqrt(Math.max(0, 1 - d * d));
      for (let py = y0; py < y1; py++) {
        const n = ((py + 0.5 - y0) / hh) * 2 - 1;
        if (Math.abs(n) > half + 0.02) continue;
        this.set(px, py, this.shade(ramp, curve(n, hh >= 8) + (px >= x1 - cap ? 0.15 : 0)));
      }
    }
  }

  /** A cone section on its side, centred on `cy`: from diameter `d0` at `x` to `d1` at `x + w`, banded like a cylinder. */
  hcone(x: number, cy: number, w: number, d0: number, d1: number, ramp: Ramp = RAMPS.hull): void {
    const x0 = this.p(x), x1 = Math.max(x0 + 1, this.p(x + w)), mid = cy * this.k;
    for (let px = x0; px < x1; px++) {
      const t = (px + 0.5 - x0) / (x1 - x0);
      const half = Math.max(0.5, ((d0 + (d1 - d0) * t) * this.k) / 2);
      // Facing away from the light where it narrows to the right.
      const turn = d1 < d0 ? 0.12 : -0.04;
      for (let py = Math.round(mid - half); py < Math.round(mid + half); py++) this.set(px, py, this.shade(ramp, curve((py + 0.5 - mid) / half, half >= 4) + turn));
    }
  }

  /** A vertical cylinder in a slight 3/4 view: its top an ellipse, banded from lit left to shaded right. */
  vcyl(x: number, y: number, w: number, h: number, ramp: Ramp = RAMPS.hull, lid = true): void {
    const [x0, y0, x1, y1] = this.span(x, y, w, h);
    const ww = x1 - x0, cap = Math.max(1, Math.round(ww * 0.14));
    for (let px = x0; px < x1; px++) {
      const n = ((px + 0.5 - x0) / ww) * 2 - 1;
      const bulge = Math.round(cap * Math.sqrt(Math.max(0, 1 - n * n)));
      const v = curve(n, ww >= 8);
      for (let py = y0 + cap; py < y1 - cap + bulge; py++) this.set(px, py, this.shade(ramp, v));
      if (lid) for (let py = y0 + cap - bulge; py < y0 + cap + bulge; py++) this.set(px, py, this.shade(ramp, 0.12 + 0.25 * (n + 1) * 0.5));
      else for (let py = y0 + cap - bulge; py < y0 + cap; py++) this.set(px, py, this.shade(ramp, v));
    }
  }

  /** A flat ellipse. */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number): void {
    this.shaded(cx, cy, rx, ry, () => c);
  }

  /** A sphere (or, with `clipBelow`, a dome cut off at that height), banded from a spot highlight at the upper left. */
  sphere(cx: number, cy: number, rx: number, ry: number, ramp: Ramp = RAMPS.hull, clipBelow = Infinity): void {
    const cut = this.p(clipBelow);
    this.shaded(cx, cy, rx, ry, (nx, ny, _px, py) => {
      if (py >= cut) return -1;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const l = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
      if (l > 0.94) return ramp[0]!;
      // A rim of bounced light on the lower right.
      const rim = nx * 0.6 + ny * 0.8 > 0.78 && rx * this.k >= 5 ? 0.25 : 0;
      return this.shade(ramp, 0.95 - l * 0.85 - rim);
    });
  }

  /** Fills an ellipse, colouring each pixel from its position in the ellipse (-1..1 each way); -1 leaves it clear. */
  shaded(cx: number, cy: number, rx: number, ry: number, colour: (nx: number, ny: number, px: number, py: number) => number): void {
    const x0 = this.p(cx - rx), x1 = this.p(cx + rx), y0 = this.p(cy - ry), y1 = this.p(cy + ry);
    const pcx = cx * this.k, pcy = cy * this.k, prx = Math.max(0.5, rx * this.k), pry = Math.max(0.5, ry * this.k);
    for (let py = y0; py <= y1; py++)
      for (let px = x0; px <= x1; px++) {
        const nx = (px + 0.5 - pcx) / prx, ny = (py + 0.5 - pcy) / pry;
        if (nx * nx + ny * ny > 1) continue;
        const c = colour(nx, ny, px, py);
        if (c >= 0) this.set(px, py, c);
      }
  }

  /** A polygon (x, y pairs), flat or shaded along `dir` from `from` (lit end) to `to` on the ramp. */
  poly(pts: number[], fill: number | { ramp: Ramp; dir: [number, number]; from?: number; to?: number }): void {
    const xs = pts.filter((_, i) => i % 2 === 0).map((v) => v * this.k);
    const ys = pts.filter((_, i) => i % 2 === 1).map((v) => v * this.k);
    const n = xs.length;
    const top = Math.floor(Math.min(...ys)), bottom = Math.ceil(Math.max(...ys));
    let lo = Infinity, hi = -Infinity;
    if (typeof fill !== "number")
      for (let i = 0; i < n; i++) {
        const d = xs[i]! * fill.dir[0] + ys[i]! * fill.dir[1];
        lo = Math.min(lo, d);
        hi = Math.max(hi, d);
      }
    for (let py = top; py < bottom; py++) {
      const cy = py + 0.5;
      const cross: number[] = [];
      for (let i = 0; i < n; i++) {
        const ax = xs[i]!, ay = ys[i]!, bx = xs[(i + 1) % n]!, by = ys[(i + 1) % n]!;
        if (ay <= cy !== by <= cy) cross.push(ax + ((cy - ay) / (by - ay)) * (bx - ax));
      }
      cross.sort((a, b) => a - b);
      for (let i = 0; i + 1 < cross.length; i += 2)
        for (let px = Math.round(cross[i]!); px < Math.round(cross[i + 1]!); px++) {
          if (typeof fill === "number") this.set(px, py, fill);
          else {
            const t = hi > lo ? ((px + 0.5) * fill.dir[0] + cy * fill.dir[1] - lo) / (hi - lo) : 0;
            const from = fill.from ?? 0.1, to = fill.to ?? 0.8;
            this.set(px, py, this.shade(fill.ramp, from + (to - from) * t));
          }
        }
    }
  }

  /** A straight line, `width` design units thick (at least a pixel). */
  line(x0: number, y0: number, x1: number, y1: number, c: number, width = 0): void {
    const a = [this.p(x0), this.p(y0)], b = [this.p(x1), this.p(y1)];
    const w = Math.max(1, Math.round(width * this.k));
    const steps = Math.max(Math.abs(b[0]! - a[0]!), Math.abs(b[1]! - a[1]!));
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      const px = Math.round(a[0]! + (b[0]! - a[0]!) * t), py = Math.round(a[1]! + (b[1]! - a[1]!) * t);
      for (let dy = 0; dy < w; dy++) for (let dx = 0; dx < w; dx++) this.set(px + dx - (w >> 1), py + dy - (w >> 1), c);
    }
  }

  /** A pipe or strut: a thick segment shaded across its width, lit side up-left, round ends. */
  pipe(x0: number, y0: number, x1: number, y1: number, width: number, ramp: Ramp = RAMPS.hull): void {
    const k = this.k, r = Math.max(0.5, (width * k) / 2);
    const ax = x0 * k, ay = y0 * k, bx = x1 * k, by = y1 * k;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    let nx = -dy, ny = dx;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    if (nx + ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    if (r < 1) return this.line(x0, y0, x1, y1, ramp[2]!);
    const minX = Math.floor(Math.min(ax, bx) - r), maxX = Math.ceil(Math.max(ax, bx) + r);
    const minY = Math.floor(Math.min(ay, by) - r), maxY = Math.ceil(Math.max(ay, by) + r);
    for (let py = minY; py <= maxY; py++)
      for (let px = minX; px <= maxX; px++) {
        const cx = px + 0.5, cy = py + 0.5;
        const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / l2));
        const qx = cx - (ax + t * dx), qy = cy - (ay + t * dy);
        if (qx * qx + qy * qy > r * r) continue;
        const s = (qx * nx + qy * ny) / r;
        this.set(px, py, this.shade(ramp, 0.35 + 0.45 * s));
      }
  }

  /** A lattice beam between two points: two chords and diagonal bracing, `width` units across. */
  truss(x0: number, y0: number, x1: number, y1: number, width: number, ramp: Ramp = RAMPS.dark): void {
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len, nx = -uy * (width / 2), ny = ux * (width / 2);
    if (width * this.k < 4) {
      this.pipe(x0, y0, x1, y1, width, ramp);
      return;
    }
    const chord = Math.max(1.2, width * 0.16);
    const bays = Math.max(1, Math.round(len / width));
    for (let i = 0; i < bays; i++) {
      const a = i / bays, b = (i + 1) / bays;
      const ax = x0 + (x1 - x0) * a, ay = y0 + (y1 - y0) * a, bx = x0 + (x1 - x0) * b, by = y0 + (y1 - y0) * b;
      const s = i % 2 ? 1 : -1;
      this.line(ax + nx * s, ay + ny * s, bx - nx * s, by - ny * s, ramp[3]!, chord * 0.7);
      this.line(ax + nx, ay + ny, ax - nx, ay - ny, ramp[2]!, chord * 0.7);
    }
    this.line(x1 + nx, y1 + ny, x1 - nx, y1 - ny, ramp[2]!, chord * 0.7);
    this.pipe(x0 + nx, y0 + ny, x1 + nx, y1 + ny, chord, ramp);
    this.pipe(x0 - nx, y0 - ny, x1 - nx, y1 - ny, chord, ramp);
  }

  /**
   * A radiator panel: fins along its length (vertical or horizontal), a header pipe at its root.
   * `hot` (0–1) makes it glow from its root (its top, or its left if horizontal), cooling in steps.
   */
  radiator(x: number, y: number, w: number, h: number, vertical = true, fin = 4, hot = 0): void {
    const [x0, y0, x1, y1] = this.span(x, y, w, h);
    const f = Math.max(2, Math.round(fin * this.k));
    for (let py = y0; py < y1; py++)
      for (let px = x0; px < x1; px++) {
        const along = vertical ? px - x0 : py - y0;
        const edge = along % f === f - 1;
        const across = vertical ? (py - y0) / (y1 - y0) : (px - x0) / (x1 - x0);
        const c = edge ? RAMPS.white[4]! : this.shade(RAMPS.white, 0.1 + across * 0.35 + (along % f === 0 ? -0.1 : 0.1));
        const heat = Math.round(clamp01(1 - across * 1.7) * hot * 4) / 4;
        this.set(px, py, heat > 0 ? mix(c, heat > 0.7 ? GLOW.heatHi : GLOW.heat, Math.min(0.85, heat)) : c);
      }
  }

  /** A grid of solar cells: dark frame, cell gaps, a diagonal glint. */
  solar(x: number, y: number, w: number, h: number, cols: number, rows: number, ramp: Ramp = RAMPS.solar): void {
    const [x0, y0, x1, y1] = this.span(x, y, w, h);
    const pw = x1 - x0, ph = y1 - y0;
    const lines = pw / cols >= 3 && ph / rows >= 3;
    for (let py = y0; py < y1; py++)
      for (let px = x0; px < x1; px++) {
        const u = (px - x0) / pw, v = (py - y0) / ph;
        const frame = px === x0 || py === y0 || px === x1 - 1 || py === y1 - 1;
        const gap = lines && (Math.floor((px - x0) * cols / pw) !== Math.floor((px + 1 - x0) * cols / pw) || Math.floor((py - y0) * rows / ph) !== Math.floor((py + 1 - y0) * rows / ph));
        const glint = Math.abs(((u - v) * 3 + 0.4) % 1.6) < 0.14;
        this.set(px, py, frame ? RAMPS.dark[3]! : gap ? ramp[5]! : this.shade(ramp, (glint ? 0 : 0.34) + (u + v) * 0.2));
      }
  }

  /** A round fan of solar gores (as an UltraFlex array): a polygon of `gores` wedges round a gold hub. */
  fan(cx: number, cy: number, r: number, gores = 10, ramp: Ramp = RAMPS.solar): void {
    const step = (Math.PI * 2) / gores;
    const pr = r * this.k;
    this.shaded(cx, cy, r, r, (nx, ny) => {
      const d = Math.hypot(nx, ny), a = Math.atan2(ny, nx) + Math.PI;
      const g = Math.floor(a / step), off = a - (g + 0.5) * step;
      const edge = (d * Math.cos(off)) / Math.cos(step / 2);
      if (edge > 1) return -1;
      if (d * pr < Math.max(1.2, pr * 0.14)) return RAMPS.gold[2]!;
      if ((1 - edge) * pr < 1 || (step / 2 - Math.abs(off)) * d * pr < 0.55) return RAMPS.dark[3]!;
      if (this.medium && pr >= 12 && Math.abs(((edge * 3.5) % 1) - 0.5) > 0.5 - 0.6 / pr * 3.5) return ramp[5]!;
      return this.shade(ramp, 0.3 + (nx + ny) * 0.16 + (g % 2 ? 0.14 : 0) - (edge > 0.45 && edge < 0.62 && g % 3 === 0 ? 0.3 : 0));
    });
  }

  /** Crinkled foil (multi-layer insulation) over a rectangle: facets catching the light at odds with their neighbours. */
  foil(x: number, y: number, w: number, h: number, ramp: Ramp = RAMPS.gold): void {
    const [x0, y0, x1, y1] = this.span(x, y, w, h);
    const s = Math.max(2, Math.round(5 * this.k));
    for (let py = y0; py < y1; py++)
      for (let px = x0; px < x1; px++) {
        const base = 0.22 + ((py - y0) / (y1 - y0)) * 0.3;
        const r = this.medium ? hash(Math.floor((px + py * 0.6) / s), Math.floor((py - px * 0.4) / s)) : 0.5;
        this.set(px, py, this.shade(ramp, base + (r < 0.28 ? -0.22 : r > 0.74 ? 0.26 : 0)));
      }
  }

  /** A row of `n` windows `step` apart: lit ones warm (a brighter corner), the odd one a screen's cyan, a few dark (by `seed`); framed in dark hull from 64 px. */
  windows(x: number, y: number, n: number, step: number, w: number, h: number, seed = 0, lit = 0.8): void {
    for (let i = 0; i < n; i++) {
      const [x0, y0, x1, y1] = this.span(x + i * step, y, w, h);
      const on = hash(i + seed * 31, seed) < lit;
      const screen = hash(i * 13 + seed, 7) < 0.14;
      if (this.medium) {
        for (let px = x0 - 1; px <= x1; px++) {
          this.set(px, y0 - 1, RAMPS.hull[5]!);
          this.set(px, y1, RAMPS.hull[3]!);
        }
        for (let py = y0; py < y1; py++) {
          this.set(x0 - 1, py, RAMPS.hull[5]!);
          this.set(x1, py, RAMPS.hull[4]!);
        }
      }
      for (let py = y0; py < y1; py++)
        for (let px = x0; px < x1; px++) {
          const corner = px === x0 && py === y0 && x1 - x0 > 1;
          const low = py === y1 - 1 && y1 - y0 > 2;
          this.set(px, py, !on ? (corner ? RAMPS.glass[2]! : RAMPS.glass[5]!) : screen ? (corner ? GLOW.cyanHi : low ? RAMPS.glass[3]! : GLOW.cyan) : corner ? GLOW.windowHi : low ? 0xf09a3c : GLOW.window);
        }
    }
  }

  /** A row of `n` round portholes `step` apart, radius `r`, as on Russian modules: lit or dark as windows(). */
  portholes(x: number, y: number, n: number, step: number, r: number, seed = 0, lit = 0.8): void {
    for (let i = 0; i < n; i++) {
      const cx = x + i * step, on = hash(i + seed * 31, seed) < lit;
      if (this.medium) this.ellipse(cx, y, r + 1 / this.k, r + 1 / this.k, RAMPS.hull[5]!);
      this.ellipse(cx, y, r, r, on ? GLOW.window : RAMPS.glass[5]!);
      if (this.medium) this.set(this.p(cx - r * 0.4), this.p(y - r * 0.4), on ? GLOW.windowHi : RAMPS.glass[2]!);
    }
  }

  /** A band round a horizontal hull (a reinforcing ring, or a colour band): `w` wide, shaded like the hull's curve but darker, a bright lip on its left and a groove on its right. */
  ring(x: number, y: number, w: number, h: number, ramp: Ramp = RAMPS.hull): void {
    const [x0, y0, x1, y1] = this.span(x, y, w, h);
    const hh = y1 - y0;
    for (let px = x0; px < x1; px++)
      for (let py = y0; py < y1; py++) {
        const n = ((py + 0.5 - y0) / hh) * 2 - 1;
        const body = 0.5 + 0.38 * n + 0.12 * n * n;
        const v = px === x0 ? body - 0.4 : px === x1 - 1 ? body + 0.25 : body;
        this.set(px, py, this.shade(ramp, v));
      }
  }

  /** A parabolic dish facing `angle` (degrees, 0 = right, -90 = up): rim, concave bowl, feed on struts. With `mesh`, an open mesh reflector. */
  dish(cx: number, cy: number, r: number, angle: number, depth = 0.42, ramp: Ramp = RAMPS.white, mesh = false): void {
    const a = (angle * Math.PI) / 180;
    const fx = Math.cos(a), fy = Math.sin(a), qx = -fy, qy = fx;
    const bx = cx - fx * r * 0.22, by = cy - fy * r * 0.22;
    const inside = (px: number, py: number, ox: number, oy: number, rr: number): [number, number] | null => {
      const dx = px / this.k - ox, dy = py / this.k - oy;
      const u = (dx * qx + dy * qy) / rr, w = (dx * fx + dy * fy) / (rr * depth);
      return u * u + w * w <= 1 ? [u, w] : null;
    };
    const x0 = this.p(cx - r * 1.3), x1 = this.p(cx + r * 1.3), y0 = this.p(cy - r * 1.3), y1 = this.p(cy + r * 1.3);
    for (let py = y0; py <= y1; py++)
      for (let px = x0; px <= x1; px++) {
        const front = inside(px + 0.5, py + 0.5, cx, cy, r);
        if (front) {
          const [u, w] = front;
          const rim = u * u + w * w > 0.78;
          const lit = 0.55 - 0.35 * (u * (qx * LIGHT[0] + qy * LIGHT[1]) + w * 0.2);
          const rib = mesh && this.medium && Math.abs(((u * 2.5 + 8) % 1) - 0.5) < 0.05;
          this.set(px, py, rim || rib ? ramp[1]! : mesh ? ((px + py) % 2 ? RAMPS.dark[4]! : ramp[u + w < -0.2 ? 2 : 3]!) : this.shade(ramp, lit));
        } else if (inside(px + 0.5, py + 0.5, bx, by, r * 0.98)) this.set(px, py, this.shade(ramp, 0.85));
      }
    const hx = cx + fx * r * 0.85, hy = cy + fy * r * 0.85;
    if (this.size >= 64) {
      this.line(cx + qx * r * 0.8, cy + qy * r * 0.8, hx, hy, RAMPS.dark[2]!);
      this.line(cx - qx * r * 0.8, cy - qy * r * 0.8, hx, hy, RAMPS.dark[2]!);
    } else this.line(cx, cy, hx, hy, RAMPS.dark[2]!);
    this.fill(hx - r * 0.1, hy - r * 0.1, r * 0.2, r * 0.2, RAMPS.gold[2]!);
  }

  /** A mast with crossbars and a red light at its tip. */
  antenna(x: number, y: number, h: number, bars = 2): void {
    this.line(x, y, x, y - h, RAMPS.dark[1]!, 1.2);
    for (let i = 1; i <= bars; i++) {
      const by = y - (h * i) / (bars + 1), bw = 2 + (bars + 1 - i) * 1.5;
      this.line(x - bw, by, x + bw, by, RAMPS.dark[2]!, 1);
    }
    this.light(x, y - h - 1, GLOW.beacon);
  }

  /** A small light: a pixel, a little cross of it at 128 px. */
  light(x: number, y: number, c: number): void {
    const px = this.p(x), py = this.p(y);
    this.set(px, py, c);
    if (this.fine) {
      this.set(px + 1, py, c);
      this.set(px, py + 1, c);
      this.set(px + 1, py + 1, mix(c, 0xffffff, 0.5));
    }
  }

  /** A torus seen at an angle, its far half ("back") or near half and outer wall ("front"), so a hub can go between. */
  torus(cx: number, cy: number, A: number, B: number, width: number, wall: number, half: "back" | "front", ramp: Ramp = RAMPS.hull, windows = true): void {
    const a = A - width, b = B - (width * B) / A;
    const ins = (x: number, y: number, rx: number, ry: number, oy = 0) => ((x - cx) / rx) ** 2 + ((y - cy - oy) / ry) ** 2 <= 1;
    const x0 = this.p(cx - A) - 1, x1 = this.p(cx + A) + 1, y0 = this.p(cy - B) - 1, y1 = this.p(cy + B + wall) + 1;
    const win = Math.max(2, Math.round(6 * this.k));
    for (let py = y0; py <= y1; py++)
      for (let px = x0; px <= x1; px++) {
        const x = (px + 0.5) / this.k, y = (py + 0.5) / this.k;
        const deck = ins(x, y, A, B) && !ins(x, y, a, b);
        if (half === "back") {
          if (deck && y < cy) this.set(px, py, this.shade(ramp, 0.42 + ((cy - y) / B) * 0.2));
          else if (y < cy + 1 && ins(x, y, a, b) && !ins(x, y, a, b, wall)) {
            const mid = ins(x, y, a, b, wall * 0.5) !== ins(x, y, a, b, wall * 0.5 + 1 / this.k);
            this.set(px, py, windows && mid && px % win === 0 ? GLOW.window : this.shade(ramp, 0.82));
          }
        } else {
          if (deck && y >= cy) this.set(px, py, this.shade(ramp, 0.08 + ((y - cy) / B) * 0.3));
          else if (y >= cy - 1 && ins(x, y, A, B, wall) && !ins(x, y, A, B)) {
            const mid = ins(x, y, A, B, wall * 0.55) !== ins(x, y, A, B, wall * 0.55 - 1 / this.k);
            this.set(px, py, windows && mid && px % win === 1 ? GLOW.window : this.shade(ramp, 0.5 + (Math.abs(x - cx) / A) * 0.3));
          }
        }
      }
  }

  /** A hatch: a framed door, darker within, a gold wheel. */
  hatch(x: number, y: number, w: number, h: number): void {
    this.fill(x, y, w, h, RAMPS.dark[3]!);
    this.fill(x + 1, y + 1, w - 2, h - 2, RAMPS.dark[2]!);
    if (this.medium) {
      this.fill(x + 1, y + 1, w - 2, 1, RAMPS.dark[1]!);
      this.ellipse(x + w / 2, y + h / 2, Math.min(w, h) * 0.22, Math.min(w, h) * 0.22, RAMPS.gold[2]!);
      this.dot(x + w / 2, y + h / 2, RAMPS.gold[4]!);
    }
  }

  /** A ladder going down from (x, y). */
  ladder(x: number, y: number, h: number): void {
    if (!this.medium) return;
    this.line(x, y, x, y + h, RAMPS.dark[2]!);
    this.line(x + 3, y, x + 3, y + h, RAMPS.dark[2]!);
    if (this.fine) for (let r = y + 2; r < y + h; r += 3) this.line(x, r, x + 3, r, RAMPS.dark[1]!);
  }

  /** A handrail along a hull, from x0 to x1 at height y. */
  handrail(x0: number, x1: number, y: number): void {
    if (!this.fine) return;
    this.line(x0, y, x1, y, RAMPS.gold[3]!);
    for (let x = x0; x <= x1; x += 6) this.dot(x, y + 1, RAMPS.gold[4]!);
  }

  /** Panel seams every `step` units across a hull area, darker than the hull. */
  seams(x: number, y: number, w: number, h: number, step: number, c = RAMPS.hull[3]!): void {
    if (!this.medium) return;
    for (let sx = x + step; sx < x + w - 1; sx += step) this.line(sx, y, sx, y + h - 1, c);
  }

  /** Rivets in a row. */
  rivets(x0: number, x1: number, y: number, step = 4): void {
    if (!this.fine) return;
    for (let x = x0; x <= x1; x += step) this.dot(x, y, RAMPS.hull[4]!);
  }

  /** Small machinery on a surface: boxes, pipes and vents, seeded so each part looks its own. */
  greebles(x: number, y: number, w: number, h: number, seed: number): void {
    if (!this.medium) return;
    let cx = x;
    for (let i = 0; cx < x + w - 3; i++) {
      const gw = 3 + Math.floor(hash(i, seed) * 6), gh = 2 + Math.floor(hash(seed, i) * (h - 2));
      if (cx + gw > x + w) break;
      if (hash(i * 7, seed) < 0.7) this.box(cx, y + h - gh, gw, gh, RAMPS.dark, 0.2);
      cx += gw + 1 + Math.floor(hash(i, seed * 3) * 3);
    }
  }

  /** A band of the faction's colour, shaded like the hull it wraps. */
  stripe(x: number, y: number, w: number, h: number): void {
    const [x0, y0, x1, y1] = this.span(x, y, w, h);
    for (let py = y0; py < y1; py++)
      for (let px = x0; px < x1; px++) this.set(px, py, this.shade(this.faction, 0.2 + ((py - y0) / Math.max(1, y1 - y0 - 1)) * 0.5));
  }

  /** Yellow-and-black hazard stripes. */
  hazard(x: number, y: number, w: number, h: number): void {
    const [x0, y0, x1, y1] = this.span(x, y, w, h);
    const p = Math.max(2, Math.round(3 * this.k));
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) this.set(px, py, Math.floor((px + py) / p) % 2 ? RAMPS.dark[4]! : RAMPS.gold[1]!);
  }

  /** The faction's flag on a short pole at (x, y) (the pole's foot). */
  flag(x: number, y: number, w = 10, h = 7): void {
    this.line(x, y, x, y - h - 6, RAMPS.dark[1]!);
    this.fill(x + 1, y - h - 6, w, h, this.faction[2]!);
    this.fill(x + 1, y - h - 6, w, Math.max(1, h / 3), this.faction[1]!);
    this.fill(x + 1, y - 7, w, 1, this.faction[4]!);
    if (this.medium) this.fill(x + 1 + w * 0.3, y - h - 6 + h * 0.3, w * 0.35, h * 0.4, RAMPS.white[1]!);
  }

  /**
   * Streaks of gloss over what the open part has drawn inside a box (glass, mostly): a broad and a
   * narrow diagonal band, lightened towards `c`.
   */
  gloss(x: number, y: number, w: number, h: number, strength = 0.5, c = 0xffffff): void {
    const [x0, y0, x1, y1] = this.span(x, y, w, h);
    const period = x1 - x0 + (y1 - y0);
    for (let py = Math.max(0, y0); py < Math.min(this.size, y1); py++)
      for (let px = Math.max(0, x0); px < Math.min(this.size, x1); px++) {
        const under = this.layer[py * this.size + px]!;
        if (under < 0) continue;
        const s = (px - x0 + (y1 - 1 - py)) / period;
        if ((s > 0.3 && s < 0.42) || (s > 0.47 && s < 0.51)) this.layer[py * this.size + px] = mix(under, c, strength);
      }
  }

  /**
   * A four-point glint straight onto the image (whatever part is open is committed first), its
   * arms `r` long, fading; a single pixel at 32 px.
   */
  sparkle(x: number, y: number, r: number, c = 0xffffff): void {
    this.commit(true);
    const px = this.p(x), py = this.p(y);
    const put = (dx: number, dy: number, t: number) => {
      const X = px + dx, Y = py + dy;
      if (X < 0 || Y < 0 || X >= this.size || Y >= this.size) return;
      const o = (Y * this.size + X) * 4;
      this.write(X, Y, this.data[o + 3] ? mix(this.under(o), c, t) : mix(INK, c, t * 0.85));
    };
    put(0, 0, 1);
    if (!this.medium) return;
    const arm = Math.max(1, Math.round(r * this.k));
    for (let i = 1; i <= arm; i++) {
      const t = 1 - (i / (arm + 1)) * 0.75;
      put(i, 0, t);
      put(-i, 0, t);
      put(0, i, t);
      put(0, -i, t);
    }
    if (this.fine && arm >= 3) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) put(dx, dy, 0.45);
  }

  /**
   * A glow straight onto the image (whatever part is open is committed first): `c` blended in
   * over the opaque pixels, fading from the centre in steps; over clear pixels, dithered in.
   */
  glow(cx: number, cy: number, r: number, c: number, strength = 0.8): void {
    this.commit(true);
    const x0 = this.p(cx - r), x1 = this.p(cx + r), y0 = this.p(cy - r), y1 = this.p(cy + r);
    const pr = r * this.k;
    for (let py = Math.max(0, y0); py <= Math.min(this.size - 1, y1); py++)
      for (let px = Math.max(0, x0); px <= Math.min(this.size - 1, x1); px++) {
        const d = Math.hypot(px + 0.5 - cx * this.k, py + 0.5 - cy * this.k) / pr;
        if (d >= 1) continue;
        const o = (py * this.size + px) * 4;
        if (this.data[o + 3] === 0) {
          if (Math.round((1 - d) * strength * 4 + BAYER[(py & 3) * 4 + (px & 3)]!) / 4 >= 0.5) this.write(px, py, mix(c, INK, 0.4));
          continue;
        }
        const t = Math.round((1 - d) * strength * 4) / 4;
        if (t > 0) this.write(px, py, mix(this.under(o), c, Math.min(1, t)));
      }
  }
}
