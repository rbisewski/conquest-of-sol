// Pixel-art discs for the solar system's bodies, drawn pixel by pixel on small canvases and
// shown at a whole-number scale with nearest filtering, like the Earth's map. Each pixel of
// the disc is a point on a sphere: its colour comes from the body's style (bands, spots, ice
// caps, value noise) and its brightness from the Sun's direction in view space, in a few
// steps, so planets show phases as Terra Invicta's do. The Earth uses the globe's own map, and
// Mercury a pixel-art map made from MESSENGER's (tools/data/build_mercury.py).

/** Light direction in view space: x right, y up, z towards the viewer. */
export interface Light {
  x: number;
  y: number;
  z: number;
}

type RGB = [number, number, number];

/** The Earth's pixel map, sampled for its disc once loaded. */
export interface MapImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Bodies with a surface map (equirectangular, longitude −180° to 180° east, in public/map). */
const MAP_FILES: Record<string, string> = { Earth: "earth.png", Mercury: "mercury.png" };
const mapLoads = new Map<string, Promise<MapImage>>();

export function hasMap(id: string): boolean {
  return id in MAP_FILES;
}

/** The globe's pixel map of the Earth, loaded once. */
export function earthMap(): Promise<MapImage> {
  return bodyMap("Earth")!;
}

/** A body's pixel map, loaded once; null if it has none. */
export function bodyMap(id: string): Promise<MapImage> | null {
  const file = MAP_FILES[id];
  if (!file) return null;
  let load = mapLoads.get(id);
  if (load) return load;
  load = (async () => {
    const image = new Image();
    image.src = `${import.meta.env.BASE_URL}map/${file}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0);
    return { width: image.width, height: image.height, data: ctx.getImageData(0, 0, image.width, image.height).data };
  })();
  mapLoads.set(id, load);
  return load;
}

interface Style {
  base: string;
  /** Colours cycled across latitude, wobbled by noise (gas giants). */
  bands?: { colors: string[]; count: number; wobble: number };
  /** Patches where noise at this scale passes the threshold. */
  spots?: { color: string; scale: number; threshold: number }[];
  /** Polar ice beyond this latitude, degrees. */
  caps?: { color: string; from: number };
  /** An oval storm: latitude and longitude of its centre and half-sizes, degrees. */
  storm?: { color: string; lat: number; lon: number; dLat: number; dLon: number };
  /** One hemisphere (longitude < 0) this colour instead (Iapetus). */
  twoTone?: string;
  ring?: { color: string; gap: string; inner: number; outer: number };
}

const STYLES: Record<string, Style> = {
  Mercury: { base: "#9a948e", spots: [{ color: "#76716c", scale: 5, threshold: 0.62 }, { color: "#b8b2aa", scale: 9, threshold: 0.7 }] },
  Venus: { base: "#e6cf9a", bands: { colors: ["#e6cf9a", "#d9bd84", "#efdcb0"], count: 5, wobble: 0.8 } },
  Earth: { base: "#2c5d9e", caps: { color: "#e8eef2", from: 70 } },
  Luna: { base: "#a7a7a5", spots: [{ color: "#7d7d7c", scale: 3, threshold: 0.6 }, { color: "#c2c2bf", scale: 9, threshold: 0.72 }] },
  Mars: { base: "#c1532f", spots: [{ color: "#8e3b22", scale: 3.5, threshold: 0.6 }, { color: "#d27a4c", scale: 7, threshold: 0.68 }], caps: { color: "#f1ebe4", from: 72 } },
  Jupiter: {
    base: "#d9b48a",
    bands: { colors: ["#efe0c6", "#c58f5e", "#e8d2ae", "#a8754f", "#f0e4cc", "#c99a6c"], count: 9, wobble: 0.6 },
    storm: { color: "#b5523b", lat: -22, lon: 35, dLat: 7, dLon: 16 },
  },
  Saturn: {
    base: "#e3cf9a",
    bands: { colors: ["#ead9a8", "#cdb27a", "#e3cf9a", "#d6bf88"], count: 7, wobble: 0.4 },
    ring: { color: "#d8c79a", gap: "#8f8466", inner: 1.3, outer: 2.2 },
  },
  Uranus: { base: "#9fd8de", bands: { colors: ["#9fd8de", "#a9e0e4", "#93cdd5"], count: 3, wobble: 0.3 } },
  Neptune: {
    base: "#3e64c9",
    bands: { colors: ["#3e64c9", "#355ab8", "#4a71d4"], count: 5, wobble: 0.5 },
    storm: { color: "#26408c", lat: -20, lon: -30, dLat: 6, dLon: 12 },
  },
  Io: { base: "#e6d36a", spots: [{ color: "#c8812f", scale: 6, threshold: 0.65 }, { color: "#4a3a26", scale: 10, threshold: 0.8 }] },
  Europa: { base: "#ddd0b6", spots: [{ color: "#a77d55", scale: 8, threshold: 0.7 }] },
  Ganymede: { base: "#8f877c", spots: [{ color: "#b9b2a6", scale: 4, threshold: 0.58 }] },
  Callisto: { base: "#5e5550", spots: [{ color: "#a59b92", scale: 12, threshold: 0.74 }] },
  Titan: { base: "#d39a4a", bands: { colors: ["#d39a4a", "#c98f40", "#dca659"], count: 3, wobble: 0.3 } },
  Enceladus: { base: "#eef2f4", spots: [{ color: "#cfdbe2", scale: 6, threshold: 0.7 }] },
  Iapetus: { base: "#d9d4ca", twoTone: "#3d342c" },
  Triton: { base: "#c9b3a6", spots: [{ color: "#e2d6cf", scale: 5, threshold: 0.6 }], caps: { color: "#e9dfd9", from: 40 } },
  Pluto: { base: "#c9a27e", spots: [{ color: "#ede0cf", scale: 3, threshold: 0.62 }, { color: "#7b5a43", scale: 5, threshold: 0.68 }] },
  Charon: { base: "#9a948f", caps: { color: "#7a4f3e", from: 65 } },
  Ceres: { base: "#6e6a66", spots: [{ color: "#e6e2dc", scale: 12, threshold: 0.86 }] },
  Eris: { base: "#e7e5e2" },
  Haumea: { base: "#e1e0dc", spots: [{ color: "#9b6a5c", scale: 6, threshold: 0.82 }] },
  Makemake: { base: "#b57d5c", spots: [{ color: "#d8b393", scale: 5, threshold: 0.62 }] },
};

const MOON_STYLE: Style = { base: "#a39c94", spots: [{ color: "#827b74", scale: 5, threshold: 0.6 }, { color: "#c3bdb5", scale: 9, threshold: 0.72 }] };

export function hasStyle(id: string): boolean {
  return id in STYLES;
}

const rgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

// 3D value noise, fixed layout (no simulation RNG).
function hash(x: number, y: number, z: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function noise(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz, seed);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), s(fx)), lerp(c(0, 1, 0), c(1, 1, 0), s(fx)), s(fy)),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), s(fx)), lerp(c(0, 1, 1), c(1, 1, 1), s(fx)), s(fy)),
    s(fz),
  );
}

function seedOf(id: string): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 10007;
}

/** A view-space point of the unit sphere turned into the body's own frame (the globe's for the Earth). */
export type Orient = (p: [number, number, number]) => [number, number, number];

/** The surface colour at a point of the unit sphere (y up, longitude 0 facing the viewer). */
function surface(style: Style, id: string, p: [number, number, number], map: MapImage | null, orient: Orient | null): RGB {
  const seed = seedOf(id);
  if (map) {
    // The globe's convention: (cos lat cos lon, sin lat, −cos lat sin lon).
    const q = orient ? orient(p) : p;
    const mapLat = (Math.asin(Math.max(-1, Math.min(1, q[1]))) * 180) / Math.PI;
    const mapLon = (Math.atan2(-q[2], q[0]) * 180) / Math.PI;
    const x = Math.min(map.width - 1, Math.floor(((mapLon + 180) / 360) * map.width));
    const y = Math.min(map.height - 1, Math.floor(((90 - mapLat) / 180) * map.height));
    const o = (y * map.width + x) * 4;
    return [map.data[o]!, map.data[o + 1]!, map.data[o + 2]!];
  }
  const lat = (Math.asin(Math.max(-1, Math.min(1, p[1]))) * 180) / Math.PI;
  const lon = (Math.atan2(p[0], p[2]) * 180) / Math.PI;
  let color = style.base;
  if (style.twoTone && lon < 0) color = style.twoTone;
  if (style.bands) {
    const { colors, count, wobble } = style.bands;
    const t = ((p[1] + 1) / 2) * count + (noise(p[0] * 3, p[1] * 3, p[2] * 3, seed) - 0.5) * wobble;
    color = colors[((Math.floor(t) % colors.length) + colors.length) % colors.length]!;
  }
  for (const spot of style.spots ?? []) {
    if (noise(p[0] * spot.scale + 11, p[1] * spot.scale + 7, p[2] * spot.scale + 3, seed + spot.scale) > spot.threshold) color = spot.color;
  }
  if (id === "Earth") {
    // Before the map loads: rough continents from noise.
    if (noise(p[0] * 2.2, p[1] * 2.2, p[2] * 2.2, seed) > 0.55) color = noise(p[0] * 6, p[1] * 6, p[2] * 6, seed + 1) > 0.5 ? "#5f8f3e" : "#b59a5a";
  }
  if (style.storm) {
    const s = style.storm;
    if (((lat - s.lat) / s.dLat) ** 2 + ((lon - s.lon) / s.dLon) ** 2 < 1) color = s.color;
  }
  if (style.caps && Math.abs(lat) > style.caps.from) color = style.caps.color;
  return rgb(color);
}

/** Shade steps by how squarely the Sun lights a pixel, the terminator where its rays graze (as on the globe); the night side stays faintly visible. */
function shade(lambert: number): number {
  return lambert > 0.4 ? 1 : lambert > 0.12 ? 0.8 : lambert > 0 ? 0.55 : 0.2;
}

/** Canvas size for a body of art radius r (pixels), leaving room for Saturn's rings. */
export function canvasSize(id: string, r: number): number {
  const ring = (STYLES[id] ?? MOON_STYLE).ring;
  return 2 * Math.ceil(r * (ring ? ring.outer : 1)) + 2;
}

/** Draws a lit body of art radius r into a canvas of canvasSize(id, r), from its surface map when given (the body's own; orient turns view space into the map's frame). */
export function drawBody(ctx: CanvasRenderingContext2D, id: string, r: number, light: Light, map: MapImage | null = null, orient: Orient | null = null): void {
  const style = STYLES[id] ?? MOON_STYLE;
  const size = ctx.canvas.width;
  const c = size / 2;
  const image = ctx.createImageData(size, size);
  const put = (x: number, y: number, [cr, cg, cb]: RGB, k: number) => {
    const o = (y * size + x) * 4;
    image.data[o] = Math.round(cr * k);
    image.data[o + 1] = Math.round(cg * k);
    image.data[o + 2] = Math.round(cb * k);
    image.data[o + 3] = 255;
  };
  const ring = style.ring;
  // The rings, seen from a little above: an ellipse a third as tall as it is wide.
  const ringAt = (dx: number, dy: number) => {
    if (!ring) return null;
    const d = Math.hypot(dx, dy / 0.34);
    if (d < ring.inner || d > ring.outer) return null;
    return d > ring.inner + (ring.outer - ring.inner) * 0.62 && d < ring.inner + (ring.outer - ring.inner) * 0.7 ? rgb(ring.gap) : rgb(ring.color);
  };
  // Rings catch the light from either side; dimmer when we look at their unlit face.
  const ringLight = light.z > -0.2 ? 0.95 : 0.6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - c) / r;
      const dy = -(y + 0.5 - c) / r;
      const d2 = dx * dx + dy * dy;
      const ringColor = ringAt(dx, dy);
      // The far half of the ring is behind the planet, the near half in front.
      if (ringColor && (dy < 0 || d2 > 1)) {
        put(x, y, ringColor, ringLight);
        continue;
      }
      if (d2 > 1) continue;
      const z = Math.sqrt(1 - d2);
      const lambert = dx * light.x + dy * light.y + z * light.z;
      // A slightly darker limb rounds the disc off.
      const limb = z < 0.35 ? 0.88 : 1;
      put(x, y, surface(style, id, [dx, dy, z], map, orient), shade(lambert) * limb);
    }
  }
  ctx.putImageData(image, 0, 0);
}

/** Art pixels across one cell of the small-body atlas. */
export const ROCK_CELL = 8;
/** The small bodies' art radii (pixels), smallest asteroids to the small dwarf planets, and the shapes drawn of each. */
const ROCK_RADII = [1.2, 1.8, 2.4, 3.0];
const DWARF_RADIUS = 3.4;
const SHAPES = 3;

/** A small body's cell in the atlas and its art radius: a lumpy rock sized by its radius, or a round, icy dwarf planet. */
export function rockCell(id: string, type: string, radiusKm: number): { cell: number; radius: number } {
  const shape = seedOf(id) % SHAPES;
  if (type === "dwarf") return { cell: ROCK_RADII.length * SHAPES + shape, radius: DWARF_RADIUS };
  const size = radiusKm < 20 ? 0 : radiusKm < 60 ? 1 : radiusKm < 150 ? 2 : 3;
  return { cell: size * SHAPES + shape, radius: ROCK_RADII[size]! };
}

/**
 * The small bodies' atlas: a row of ROCK_CELL-pixel cells, each a shape in grey (albedo,
 * tinted per body and lit in the shader; alpha marks the shape). Rocks are lumpy, darker in
 * their craters; the dwarf planets round, with frost patches.
 */
export function rockAtlas(): HTMLCanvasElement {
  const cells = (ROCK_RADII.length + 1) * SHAPES;
  const canvas = document.createElement("canvas");
  canvas.width = cells * ROCK_CELL;
  canvas.height = ROCK_CELL;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(canvas.width, canvas.height);
  const c = ROCK_CELL / 2;
  for (let cell = 0; cell < cells; cell++) {
    const icy = cell >= ROCK_RADII.length * SHAPES;
    const r = icy ? DWARF_RADIUS : ROCK_RADII[Math.floor(cell / SHAPES)]!;
    const seed = 101 + cell * 17;
    for (let y = 0; y < ROCK_CELL; y++) {
      for (let x = 0; x < ROCK_CELL; x++) {
        const dx = x + 0.5 - c;
        const dy = y + 0.5 - c;
        const angle = Math.atan2(dy, dx);
        // An outline wobbling round the angle; rocks much more than the near-round dwarfs.
        const wobble = noise(Math.cos(angle) * 1.6 + 4, Math.sin(angle) * 1.6 + 4, cell, seed);
        const edge = r * (icy ? 0.92 + 0.12 * wobble : 0.75 + 0.45 * wobble);
        const core = Math.abs(dx) < 1 && Math.abs(dy) < 1;
        if (Math.hypot(dx, dy) > edge && !core) continue;
        let v = 0.84 + 0.16 * noise(dx * 0.9 + 9, dy * 0.9 + 9, 3, seed);
        if (icy) v = noise(dx * 0.8 + 2, dy * 0.8 + 2, 5, seed) > 0.6 ? 1 : v * 0.86;
        else if (r > 1.5 && noise(dx * 1.4 + 5, dy * 1.4 + 5, 7, seed) > 0.68) v = 0.6;
        const o = (y * canvas.width + cell * ROCK_CELL + x) * 4;
        image.data.set([Math.round(v * 255), Math.round(v * 255), Math.round(v * 255), 255], o);
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Asteroid tints by kind (carbonaceous, stony, metallic), the small dwarf planets' (icy, reddish, pale), and comets'. */
const ROCK_TINTS = ["#9a948c", "#c4a682", "#b4b6bd"];
const DWARF_TINTS = ["#dcd6cf", "#cfa088", "#ece8e2"];
const COMET_TINT = "#c9d6de";

/** A small body's tint, the same in the Solar System view and the Celestial Body panel. */
export function smallBodyTint(id: string, type: string): string {
  if (type === "comet") return COMET_TINT;
  const look = ROCK_LOOKS[id]?.tint;
  if (look) return look;
  const palette = type === "dwarf" ? DWARF_TINTS : ROCK_TINTS;
  return palette[Math.floor(seedOf(id) / SHAPES) % palette.length]!;
}

interface RockLook {
  /** Overrides the tint by kind. */
  tint?: string;
  /** The outline stretched across and squashed up and down (an elongated body), and how lumpy it is, 0–1. */
  stretch?: [number, number];
  lumps?: number;
  /** How pitted: the noise level above which a pixel is crater (lower, more craters), and the scale of the craters. */
  pits?: number;
  pitScale?: number;
  /** One great crater: centre and radius in the outline's radii, and its rim's tint (fresher, bluer material). */
  crater?: { u: number; v: number; r: number; rim: string };
  /** A family of long, narrow parallel grooves: how many across, and their slope, degrees. */
  grooves?: { count: number; angle: number };
}

/**
 * The real moons of Mars. Phobos (27 × 22 × 18 km) is dark grey, elongated, dominated by
 * Stickney (9 km, near one end; bluer at its rim) and scored by families of parallel grooves
 * among many small craters. Deimos is smaller, lumpy and smooth: a blanket of regolith has
 * filled most of its craters, leaving it nearly featureless with a few faint pits.
 */
const ROCK_LOOKS: Record<string, RockLook> = {
  Phobos: { tint: "#7a736c", stretch: [1, 0.8], lumps: 0.22, pits: 0.72, pitScale: 6, crater: { u: -0.48, v: 0.06, r: 0.38, rim: "#7c8794" }, grooves: { count: 7, angle: 12 } },
  Deimos: { tint: "#887e74", stretch: [1, 0.84], lumps: 0.4, pits: 0.86, pitScale: 3.5 },
};

/**
 * Paints a lit, lumpy rock of art radius r centred at (cx, cy) into an image: an outline
 * wobbling round the angle, its surface tilted by noise so it reads as knobbly inside the
 * outline too, mottled and pitted with craters, in the discs' shade steps. A look (ROCK_LOOKS)
 * can stretch it, smooth it, or carve a great crater and grooves into it.
 */
function paintRock(image: ImageData, cx: number, cy: number, r: number, id: string, light: Light, tint: string, look: RockLook = {}): void {
  const seed = seedOf(id);
  const [tr, tg, tb] = rgb(look.tint ?? tint);
  const [sx, sy] = look.stretch ?? [1, 1];
  const lumps = look.lumps ?? 1;
  const pits = look.pits ?? 0.7;
  const pitScale = look.pitScale ?? 4.5;
  const rim = look.crater ? rgb(look.crater.rim) : null;
  const groove = look.grooves ? { ca: Math.cos((look.grooves.angle * Math.PI) / 180), sa: Math.sin((look.grooves.angle * Math.PI) / 180) } : null;
  const reach = Math.ceil(r);
  for (let y = Math.max(0, Math.floor(cy - reach)); y < Math.min(image.height, Math.ceil(cy + reach)); y++) {
    for (let x = Math.max(0, Math.floor(cx - reach)); x < Math.min(image.width, Math.ceil(cx + reach)); x++) {
      // In the outline's own frame, where it is round before the wobble.
      const ex = (x + 0.5 - cx) / sx;
      const ey = -(y + 0.5 - cy) / sy;
      const angle = Math.atan2(ey, ex);
      const [ca, sa] = [Math.cos(angle), Math.sin(angle)];
      const wobble = 0.6 * noise(ca * 1.6 + 4, sa * 1.6 + 4, 0, seed) + 0.4 * noise(ca * 4 + 9, sa * 4 + 9, 1, seed);
      const edge = r * (1 - 0.34 * lumps * (1 - wobble));
      const q = Math.hypot(ex, ey) / edge;
      if (q > 1) continue;
      const u = ex / edge;
      const v = ey / edge;
      // Knobbly: the ellipsoid's normal tilted by low-frequency noise.
      let nx = u / sx + 0.45 * lumps * (noise(u * 2.2 + 3, v * 2.2 + 3, 2, seed) - 0.5);
      let ny = v / sy + 0.45 * lumps * (noise(u * 2.2 + 7, v * 2.2 + 7, 3, seed) - 0.5);
      let nz = Math.sqrt(Math.max(0, 1 - q * q));
      let albedo = 0.84 + 0.16 * noise(u * 5 + 9, v * 5 + 9, 4, seed);
      let color: RGB = [tr, tg, tb];
      // Shading the bowl of a great crater directly, as the shade steps would flatten a tilted normal.
      let bowl = 1;
      const big = look.crater ? Math.hypot(u - look.crater.u, v - look.crater.v) / look.crater.r : Infinity;
      if (big < 1.12) {
        // Its walls face in: the wall towards the Sun is in shadow, the far one and its rim lit.
        const toSun = big > 0 ? ((u - look.crater!.u) * light.x + (v - look.crater!.v) * light.y) / (look.crater!.r * big * Math.hypot(light.x, light.y)) : 0;
        if (big < 1) bowl = toSun > 0.2 && big > 0.35 ? 0.62 : toSun < -0.3 && big > 0.7 ? 1.05 : 0.88;
        else bowl = toSun > 0 ? 1.08 : 0.88;
        // Fresher, bluer material on its rim and walls.
        if (big > 0.55) color = rim!.map((c, i) => (c + color[i]!) / 2) as RGB;
      } else {
        const pit = noise(u * pitScale + 5, v * pitScale + 5, 5, seed);
        if (pit > pits) albedo *= 0.7;
        else if (pit > pits - 0.05) albedo *= 1.07;
        if (groove) {
          // Grooves: dark lines along the slope, broken up by noise.
          const across = (u * groove.sa - v * groove.ca) * look.grooves!.count + 0.6 * noise(u * 3 + 1, v * 3 + 1, 6, seed);
          if (across - Math.floor(across) < 0.14 && noise(u * 1.2 + 8, v * 1.2 + 8, 7, seed) > 0.35) albedo *= 0.82;
        }
      }
      const n = Math.hypot(nx, ny, nz) || 1;
      [nx, ny, nz] = [nx / n, ny / n, nz / n];
      const k = shade(nx * light.x + ny * light.y + nz * light.z) * (q > 0.85 ? 0.9 : 1) * albedo * bowl;
      const o = (y * image.width + x) * 4;
      image.data[o] = Math.min(255, Math.round(color[0] * k));
      image.data[o + 1] = Math.min(255, Math.round(color[1] * k));
      image.data[o + 2] = Math.min(255, Math.round(color[2] * k));
      image.data[o + 3] = 255;
    }
  }
}

/** Draws an asteroid's or asteroidal moon's lumpy portrait, art radius r, centred in the canvas. */
export function drawRock(ctx: CanvasRenderingContext2D, id: string, type: string, r: number, light: Light): void {
  const image = ctx.createImageData(ctx.canvas.width, ctx.canvas.height);
  paintRock(image, ctx.canvas.width / 2, ctx.canvas.height / 2, r, id, light, smallBodyTint(id, type), ROCK_LOOKS[id]);
  ctx.putImageData(image, 0, 0);
}

/**
 * A comet's portrait at a time in seconds (redrawn a few times a second): a small lumpy
 * nucleus in the corner towards the Sun, in a faint dithered coma, shedding a sparse stream of
 * pixels away from the Sun: blue for the straight ion tail, whiter and fanning out for the dust.
 * r is the canvas's art radius; the nucleus is a little under half of it.
 */
export function drawComet(ctx: CanvasRenderingContext2D, id: string, r: number, light: Light, t: number): void {
  const size = ctx.canvas.width;
  const image = ctx.createImageData(size, ctx.canvas.height);
  const seed = seedOf(id);
  // Away from the Sun on the canvas (y down).
  const away = Math.hypot(light.x, light.y) || 1;
  const ux = -light.x / away;
  const uy = light.y / away;
  const nucleus = r * 0.42;
  const cx = size / 2 - ux * r * 0.42;
  const cy = size / 2 - uy * r * 0.42;
  const blend = (x: number, y: number, [cr, cg, cb]: RGB, a: number) => {
    if (x < 0 || y < 0 || x >= size || y >= image.height || a <= 0) return;
    const o = (y * size + x) * 4;
    const prev = image.data[o + 3]! / 255;
    const out = a + prev * (1 - a);
    image.data[o] = Math.round((cr * a + image.data[o]! * prev * (1 - a)) / out);
    image.data[o + 1] = Math.round((cg * a + image.data[o + 1]! * prev * (1 - a)) / out);
    image.data[o + 2] = Math.round((cb * a + image.data[o + 2]! * prev * (1 - a)) / out);
    image.data[o + 3] = Math.round(out * 255);
  };
  // Coma: a faint glow round the nucleus, ordered-dithered into a few steps.
  const coma = rgb("#cfe4ff");
  const comaReach = nucleus * 1.9;
  for (let y = Math.floor(cy - comaReach); y < cy + comaReach; y++) {
    for (let x = Math.floor(cx - comaReach); x < cx + comaReach; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / comaReach;
      const glow = 0.42 * (1 - d) + 0.18 * BAYER[(y & 3) * 4 + (x & 3)]!;
      if (glow > 0.08) blend(x, y, coma, Math.round(glow * 4) / 4);
    }
  }
  // The tails: pixels streaming off the nucleus, each on its own loop along the tail.
  const ion = rgb("#8cc4ff");
  const dust = rgb("#eef2f6");
  const length = r * 1.6;
  for (let k = 0; k < 44; k++) {
    const isIon = k % 2 === 0;
    const speed = 0.12 + 0.1 * hash(k, 1, 0, seed);
    const s = (hash(k, 0, 0, seed) + t * speed) % 1;
    const along = nucleus * 0.6 + s * length;
    // Ion pixels keep to a narrow line; dust fans out and curves off to one side.
    const spread = (hash(k, 2, 0, seed) - 0.5) * (isIon ? 1.2 + along * 0.06 : 2 + along * 0.3);
    const side = isIon ? spread : spread + (along * along) / (length * 3.2);
    const x = Math.floor(cx + ux * along - uy * side);
    const y = Math.floor(cy + uy * along + ux * side);
    blend(x, y, isIon ? ion : dust, (1 - s) * (isIon ? 0.85 : 0.7));
  }
  paintRock(image, cx, cy, nucleus, id, light, COMET_TINT);
  ctx.putImageData(image, 0, 0);
}

/** How far past its radius the Sun's flames and prominences can reach, in radii. */
export const SUN_REACH = 1.9;

/** Canvas size for the Sun at an art radius, with room for its flames and prominences. */
export function sunCanvasSize(r: number): number {
  return Math.ceil(r * SUN_REACH) * 2;
}

/** The Sun's palette, white-hot to deep red. */
const SUN_PALETTE: RGB[] = ["#fffef2", "#fff4c0", "#ffe489", "#ffc94f", "#ffa733", "#f57c22", "#d9531a", "#a83212"].map(rgb);
/** Flame pixels grow fainter towards the tips, by palette step. */
const FLAME_ALPHA = [255, 255, 255, 255, 245, 225, 195, 150];
/** 4 × 4 ordered dither, −0.5 to 0.5. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);

interface SunEvent {
  angle: number;
  /** How far through its life, 0–1. */
  u: number;
  /** Two rolls 0–1 for its size and spread. */
  size: number;
  spread: number;
}

/**
 * Flares or prominences alive at a time. Time is cut into slots `period` seconds long; slot k
 * (its rolls from the hash, so the same at every redraw) holds one event if its roll passes
 * `chance`, starting somewhere in the slot and lasting between life[0] and life[1] seconds.
 */
function sunEvents(t: number, period: number, life: [number, number], chance: number, seed: number): SunEvent[] {
  const events: SunEvent[] = [];
  for (let k = Math.floor((t - life[1]) / period) - 1; k <= Math.floor(t / period); k++) {
    if (hash(k, 0, 0, seed) > chance) continue;
    const start = (k + hash(k, 1, 0, seed)) * period;
    const u = (t - start) / (life[0] + (life[1] - life[0]) * hash(k, 2, 0, seed));
    if (u < 0 || u >= 1) continue;
    events.push({ angle: hash(k, 3, 0, seed) * 2 * Math.PI, u, size: hash(k, 4, 0, seed), spread: hash(k, 5, 0, seed) });
  }
  return events;
}

/**
 * The Sun at a time in seconds (it is redrawn a few times a second): a churning disc, darker
 * and redder at the limb, with a sunspot or two; tongues of flame licking up off the limb;
 * flares, a white flash on the disc that throws the flames near it high; and prominences,
 * arches of glowing plasma that rise from the limb, hang and fade. Canvas sized by sunCanvasSize.
 */
export function drawSun(ctx: CanvasRenderingContext2D, r: number, t = 0): void {
  const size = ctx.canvas.width;
  const c = size / 2;
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const flares = sunEvents(t, 2.6, [1.4, 2.6], 0.6, 77);
  const flareAt = flares.map((f) => {
    const at = 0.55 + 0.4 * f.size;
    return { x: Math.cos(f.angle) * at, y: Math.sin(f.angle) * at, glow: Math.sin(Math.PI * f.u) };
  });
  const prominences = sunEvents(t, 3.4, [4.5, 8], 0.85, 91).map((p) => {
    const rise = Math.min(1, p.u / 0.35);
    return {
      angle: p.angle,
      /** Height of the arch's top and its half-width (radians), growing as it rises. */
      top: (0.22 + 0.3 * p.size) * (0.3 + 0.7 * rise * (2 - rise)),
      half: 0.12 + 0.14 * p.spread,
      /** It fades by dithering pixels away, so the art stays solid. */
      fade: p.u > 0.7 ? (1 - p.u) / 0.3 : 1,
      seed: Math.floor(p.angle * 1000),
    };
  });
  // At least a pixel and a half thick, so a small Sun's prominences still show as arches.
  const tube = Math.max(0.06, 1.5 / r);
  const set = (o: number, color: RGB, alpha: number) => {
    data[o] = color[0];
    data[o + 1] = color[1];
    data[o + 2] = color[2];
    data[o + 3] = alpha;
  };
  const step = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(v)));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - c) / r;
      const dy = (y + 0.5 - c) / r;
      const d = Math.hypot(dx, dy);
      const dither = BAYER[(y & 3) * 4 + (x & 3)]!;
      const o = (y * size + x) * 4;
      if (d < 1) {
        // Granulation churning at two scales, darker towards the limb.
        const granules = noise(dx * 5 + 9, dy * 5 + 9, t * 0.7, 42) * 0.65 + noise(dx * 11 + 3, dy * 11 + 3, t * 1.3, 43) * 0.35;
        let heat = 0.84 - 0.45 * d * d * d + (granules - 0.5) * 0.3;
        // Small sunspots drifting slowly across: a dark core in a lighter ring.
        const spot = noise(dx * 6 + t * 0.02, dy * 6, 5, 44);
        if (spot > 0.87) heat -= spot > 0.91 ? 0.55 : 0.25;
        for (const f of flareAt) {
          const near = 1 - Math.hypot(dx - f.x, dy - f.y) / (0.08 + 0.12 * f.glow);
          if (near > 0) heat += 0.9 * f.glow * near;
        }
        set(o, SUN_PALETTE[step((1 - heat) * 7 + dither, 0, 7)]!, 255);
        continue;
      }
      const angle = Math.atan2(dy, dx);
      // Prominences: a tube along the arch 1 + top·sin(πs) over the angle between its feet,
      // its thickness flickering; the distance is corrected for the arch's slope so its legs
      // are as thick as its top.
      let plasma = -1;
      for (const p of prominences) {
        const off = Math.atan2(Math.sin(angle - p.angle), Math.cos(angle - p.angle));
        if (Math.abs(off) > p.half) continue;
        const s = (off / p.half + 1) / 2;
        const slope = (p.top * Math.PI * Math.cos(Math.PI * s)) / (2 * p.half * d);
        // Lumpy and writhing, not a neat loop.
        const lump = 0.8 + 0.4 * noise(s * 4, t * 0.8, 1, p.seed);
        const gap = Math.abs(d - 1 - p.top * lump * Math.sin(Math.PI * s)) / Math.sqrt(1 + slope * slope);
        const width = tube * (0.6 + 0.9 * noise(s * 9, t * 1.5, 0, p.seed));
        if (gap < width && dither + 0.5 <= p.fade) plasma = Math.max(plasma, 1 - gap / width);
      }
      if (plasma >= 0) {
        set(o, SUN_PALETTE[plasma > 0.45 ? 3 : plasma > 0.15 ? 5 : 6]!, 255);
        continue;
      }
      // Flames: an outline that shifts slowly round the limb, with tongues rising through it.
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      let height = 0.12 + 0.32 * noise(ca * 3 + 20, sa * 3 + 20, t * 0.35, 45);
      for (const f of flares) {
        const off = Math.atan2(Math.sin(angle - f.angle), Math.cos(angle - f.angle));
        height += (0.3 + 0.35 * f.size) * Math.exp(-((off / 0.2) ** 2)) * Math.sin(Math.PI * f.u);
      }
      const tongue = noise(ca * 9 + 40, sa * 9 + 40, (d - 1) * 5 - t * 1.6, 46);
      const q = (d - 1) / (height * (0.35 + 1.3 * tongue));
      if (q < 1) {
        const i = step(3.4 + q * 4.4 + dither * 1.5, 3, 7);
        set(o, SUN_PALETTE[i]!, FLAME_ALPHA[i]!);
      } else if (d < 1 + height + 0.2 && dither > 0.1) set(o, SUN_PALETTE[7]!, 60);
    }
  }
  ctx.putImageData(image, 0, 0);
}
