// Pixel-art discs for the solar system's bodies, drawn pixel by pixel on small canvases and
// shown at a whole-number scale with nearest filtering, like the Earth's map. Each pixel of
// the disc is a point on a sphere: its colour comes from the body's style (bands, spots, ice
// caps, value noise) and its brightness from the Sun's direction in view space, in a few
// steps, so planets show phases as Terra Invicta's do. The Earth uses the globe's own map;
// Mercury, Luna, Mars, Ceres, Jupiter, the great moons of Jupiter, Saturn and Uranus, Triton and
// Pluto pixel-art maps made from spacecraft mosaics; Venus, Saturn, Uranus and Neptune made-up ones
// of their cloud tops, and Eris, Haumea and Makemake, which no spacecraft has seen, made-up ones of
// their ice (tools/data/build_body_maps.py); Phobos and Deimos from Viking's. Haumea, Phobos and
// Deimos are drawn as the stretched ellipsoids they are.

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
const MAP_FILES: Record<string, string> = {
  Earth: "earth.png",
  Mercury: "mercury.png",
  Venus: "venus.png",
  Luna: "luna.png",
  Mars: "mars.png",
  Ceres: "ceres.png",
  Jupiter: "jupiter.png",
  Io: "io.png",
  Europa: "europa.png",
  Ganymede: "ganymede.png",
  Callisto: "callisto.png",
  Saturn: "saturn.png",
  Mimas: "mimas.png",
  Enceladus: "enceladus.png",
  Tethys: "tethys.png",
  Dione: "dione.png",
  Rhea: "rhea.png",
  Titan: "titan.png",
  Iapetus: "iapetus.png",
  Uranus: "uranus.png",
  Miranda: "miranda.png",
  Ariel: "ariel.png",
  Umbriel: "umbriel.png",
  Titania: "titania.png",
  Oberon: "oberon.png",
  Neptune: "neptune.png",
  Triton: "triton.png",
  Pluto: "pluto.png",
  Eris: "eris.png",
  Haumea: "haumea.png",
  Makemake: "makemake.png",
  Phobos: "phobos.png",
  Deimos: "deimos.png",
};
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
  /** Rings: bands outwards from the centre, in the body's radii, each a colour and how opaque. */
  ring?: RingBand[];
  /** A glowing atmosphere just past the limb, this far out in radii (at least two pixels), brighter on the sunward side. */
  glow?: { color: string; reach: number };
  /** An ellipsoid's semi-axes in the body's radii, along longitude 0°, the north pole and longitude 90° west (its frame's axes); a sphere without. */
  shape?: [number, number, number];
}

interface RingBand {
  from: number;
  to: number;
  color: string;
  alpha: number;
}

/**
 * Saturn's main rings at their real radii (Saturn's equatorial radius is 60,268 km): the faint C
 * ring, the bright B ring, the Cassini Division, and the A ring with the Encke Gap.
 */
const SATURN_RINGS: RingBand[] = [
  { from: 1.239, to: 1.527, color: "#9c9282", alpha: 0.3 },
  { from: 1.527, to: 1.75, color: "#d3bf98", alpha: 0.8 },
  { from: 1.75, to: 1.951, color: "#e2d0aa", alpha: 0.95 },
  { from: 1.951, to: 2.027, color: "#5e574c", alpha: 0.12 },
  { from: 2.027, to: 2.211, color: "#c8b892", alpha: 0.65 },
  { from: 2.217, to: 2.269, color: "#c2b28c", alpha: 0.55 },
];

/**
 * Uranus's rings at their real radii (its equatorial radius is 25,559 km): narrow and nearly
 * black, so only faint; rings 6, 5 and 4, then α and β, then η, γ and δ drawn as three soft
 * bands, and the ε ring, the brightest and widest (widened a little, to show as pixels).
 */
const URANUS_RINGS: RingBand[] = [
  { from: 1.632, to: 1.67, color: "#56524e", alpha: 0.1 },
  { from: 1.745, to: 1.793, color: "#5a5652", alpha: 0.14 },
  { from: 1.843, to: 1.894, color: "#5a5652", alpha: 0.16 },
  { from: 1.99, to: 2.012, color: "#78736c", alpha: 0.4 },
];

/**
 * Neptune's rings at their real radii (its equatorial radius is 24,764 km), dark and faint: the
 * broad Galle ring, the narrow Le Verrier ring, the faint sheet of Lassell out to Arago, and the
 * narrow Adams ring (its bright arcs left out), the narrow ones widened a little to show as pixels.
 */
const NEPTUNE_RINGS: RingBand[] = [
  { from: 1.652, to: 1.732, color: "#5e5650", alpha: 0.06 },
  { from: 2.142, to: 2.156, color: "#6e6660", alpha: 0.22 },
  { from: 2.156, to: 2.306, color: "#5e5650", alpha: 0.04 },
  { from: 2.306, to: 2.316, color: "#5e5650", alpha: 0.12 },
  { from: 2.533, to: 2.549, color: "#6e6660", alpha: 0.3 },
];

/**
 * Haumea, from the 2017 stellar occultation (Ortiz et al.): an ellipsoid of 1,161 × 852 × 513 km,
 * in its 960 km mean radius, and a ring 70 km wide at 2,287 km, half opaque, in its equator.
 */
const HAUMEA_SHAPE: [number, number, number] = [1161 / 960, 513 / 960, 852 / 960];
const HAUMEA_RING: RingBand[] = [{ from: 2.346, to: 2.419, color: "#8f8a84", alpha: 0.45 }];

/**
 * The moons of Mars as ellipsoids, their long axes towards Mars, in their radii as Terra Invicta
 * gives them (13.4 and 8.04 km): Phobos 13.03 × 11.40 × 9.14 km (Willner et al. 2014's shape
 * model), Deimos 7.5 × 6.1 × 5.2 km (Thomas 1993).
 */
const PHOBOS_SHAPE: [number, number, number] = [13.03 / 13.4, 9.14 / 13.4, 11.4 / 13.4];
const DEIMOS_SHAPE: [number, number, number] = [7.5 / 8.04, 5.2 / 8.04, 6.1 / 8.04];

const STYLES: Record<string, Style> = {
  Mercury: { base: "#9a948e", spots: [{ color: "#76716c", scale: 5, threshold: 0.62 }, { color: "#b8b2aa", scale: 9, threshold: 0.7 }] },
  Venus: { base: "#e6cf9a", bands: { colors: ["#e6cf9a", "#d9bd84", "#efdcb0"], count: 5, wobble: 0.8 }, glow: { color: "#f7ecd8", reach: 0.03 } },
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
    ring: SATURN_RINGS,
  },
  Uranus: { base: "#9fd8de", bands: { colors: ["#9fd8de", "#a9e0e4", "#93cdd5"], count: 3, wobble: 0.3 }, ring: URANUS_RINGS },
  Neptune: {
    base: "#3e64c9",
    bands: { colors: ["#3e64c9", "#355ab8", "#4a71d4"], count: 5, wobble: 0.5 },
    storm: { color: "#26408c", lat: -20, lon: -30, dLat: 6, dLon: 12 },
    ring: NEPTUNE_RINGS,
  },
  Io: { base: "#e6d36a", spots: [{ color: "#c8812f", scale: 6, threshold: 0.65 }, { color: "#4a3a26", scale: 10, threshold: 0.8 }] },
  Europa: { base: "#ddd0b6", spots: [{ color: "#a77d55", scale: 8, threshold: 0.7 }] },
  Ganymede: { base: "#8f877c", spots: [{ color: "#b9b2a6", scale: 4, threshold: 0.58 }] },
  Callisto: { base: "#5e5550", spots: [{ color: "#a59b92", scale: 12, threshold: 0.74 }] },
  Titan: { base: "#d39a4a", bands: { colors: ["#d39a4a", "#c98f40", "#dca659"], count: 3, wobble: 0.3 }, glow: { color: "#e6c78e", reach: 0.06 } },
  Enceladus: { base: "#eef2f4", spots: [{ color: "#cfdbe2", scale: 6, threshold: 0.7 }] },
  Iapetus: { base: "#d9d4ca", twoTone: "#3d342c" },
  Triton: { base: "#c9b3a6", spots: [{ color: "#e2d6cf", scale: 5, threshold: 0.6 }], caps: { color: "#e9dfd9", from: 40 } },
  Pluto: { base: "#c9a27e", spots: [{ color: "#ede0cf", scale: 3, threshold: 0.62 }, { color: "#7b5a43", scale: 5, threshold: 0.68 }] },
  Charon: { base: "#9a948f", caps: { color: "#7a4f3e", from: 65 } },
  Ceres: { base: "#6e6a66", spots: [{ color: "#e6e2dc", scale: 12, threshold: 0.86 }] },
  Eris: { base: "#e7e5e2" },
  Haumea: { base: "#e1e0dc", spots: [{ color: "#9b6a5c", scale: 6, threshold: 0.82 }], ring: HAUMEA_RING, shape: HAUMEA_SHAPE },
  Makemake: { base: "#b57d5c", spots: [{ color: "#d8b393", scale: 5, threshold: 0.62 }] },
  Phobos: { base: "#6c6560", shape: PHOBOS_SHAPE },
  Deimos: { base: "#787068", shape: DEIMOS_SHAPE },
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

/** The shade steps under a thick, hazy atmosphere: a gentler fall to the terminator, in five small steps. */
function hazeShade(lambert: number): number {
  return lambert > 0 ? 0.62 + 0.38 * (Math.round(Math.min(1, lambert / 0.55) * 5) / 5) : 0.2;
}

/** Pixels a body's glowing atmosphere reaches past its limb at art radius r. */
function glowReach(style: Style, r: number): number {
  return style.glow ? Math.max(2, Math.ceil(r * style.glow.reach)) : 0;
}

/** How far a body's drawing reaches, in its radii: its rings' outer edge, or its longest axis (1 for a sphere). */
export function bodyReach(id: string): number {
  const style = STYLES[id] ?? MOON_STYLE;
  return Math.max(style.ring ? style.ring[style.ring.length - 1]!.to : 1, ...(style.shape ?? [1]));
}

/** Canvas size for a body of art radius r (pixels), leaving room for Saturn's rings or an atmosphere's glow. */
export function canvasSize(id: string, r: number): number {
  const style = STYLES[id] ?? MOON_STYLE;
  return 2 * Math.ceil(r * bodyReach(id)) + 2 + 2 * glowReach(style, r);
}

/** The ring band at a distance from the centre (in radii), if any. */
function ringBand(ring: RingBand[], d: number): RingBand | null {
  for (const band of ring) if (d >= band.from && d < band.to) return band;
  return null;
}

/** Where a pole points in view space when none is given (the panel's portrait): tilted 27° towards the viewer, so rings are seen from a little above. */
const DEFAULT_POLE: [number, number, number] = [0, Math.cos((27 * Math.PI) / 180), Math.sin((27 * Math.PI) / 180)];

/** The portrait's frame for an ellipsoid: its pole along DEFAULT_POLE, its long axis across. */
const PORTRAIT_ORIENT: Orient = ([x, y, z]) => [x, DEFAULT_POLE[1] * y + DEFAULT_POLE[2] * z, -DEFAULT_POLE[2] * y + DEFAULT_POLE[1] * z];

/**
 * Where a view ray (from the pixel at dx, dy towards the viewer) first meets an ellipsoid of
 * semi-axes s in the body's frame: the hit's view z, the surface normal in view space, and the
 * direction of the hit from the centre in view space (for the map). r and rt take view space to
 * the body's frame and back.
 */
function hitEllipsoid(dx: number, dy: number, s: [number, number, number], r: Orient, rt: Orient): { z: number; normal: [number, number, number]; dir: [number, number, number] } | null {
  const o = r([dx, dy, 0]);
  const d = r([0, 0, 1]);
  let a = 0;
  let b = 0;
  let c = -1;
  for (let i = 0; i < 3; i++) {
    const k = 1 / (s[i]! * s[i]!);
    a += d[i]! * d[i]! * k;
    b += 2 * o[i]! * d[i]! * k;
    c += o[i]! * o[i]! * k;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b + Math.sqrt(disc)) / (2 * a);
  const p = [0, 1, 2].map((i) => o[i]! + t * d[i]!) as [number, number, number];
  const n = rt(p.map((v, i) => v / (s[i]! * s[i]!)) as [number, number, number]);
  const nl = Math.hypot(...n);
  const pl = Math.hypot(...p);
  return { z: t, normal: [n[0] / nl, n[1] / nl, n[2] / nl], dir: rt([p[0] / pl, p[1] / pl, p[2] / pl]) };
}

/**
 * Draws a lit body of art radius r into a canvas of canvasSize(id, r), from its surface map when
 * given (the body's own; orient turns view space into the map's frame). Rings lie in the plane
 * square to the pole (view space): each pixel's ray meets that plane, and the ring there shows
 * where it is in front of the planet or clear of it, lit on whichever face the Sun is, darkened
 * in the planet's shadow; the rings shadow the planet in turn. An ellipsoid (Haumea) is ray-cast
 * in its own frame, lit by its true normals.
 */
export function drawBody(ctx: CanvasRenderingContext2D, id: string, r: number, light: Light, map: MapImage | null = null, orient: Orient | null = null, pole: [number, number, number] = DEFAULT_POLE): void {
  const style = STYLES[id] ?? MOON_STYLE;
  const size = ctx.canvas.width;
  const c = size / 2;
  const image = ctx.createImageData(size, size);
  const put = (x: number, y: number, [cr, cg, cb]: RGB, k: number, alpha = 1) => {
    const o = (y * size + x) * 4;
    image.data[o] = Math.round(cr * k);
    image.data[o + 1] = Math.round(cg * k);
    image.data[o + 2] = Math.round(cb * k);
    image.data[o + 3] = Math.round(alpha * 255);
  };
  const ring = style.ring;
  const [nx, ny] = pole;
  // Edge-on, the rings would vanish; keep them a hair open.
  const nz = Math.abs(pole[2]) < 0.03 ? (pole[2] < 0 ? -0.03 : 0.03) : pole[2];
  const sunOnRing = light.x * nx + light.y * ny + light.z * nz;
  // Lit from the face we see, or glowing through from behind (dimmer).
  const ringFace = sunOnRing * nz > 0 ? 1 : 0.55;
  const glow = style.glow ? rgb(style.glow.color) : null;
  const glowPixels = glowReach(style, r);
  const shape = style.shape;
  // For an ellipsoid: view space to its frame (the portrait's own if none is given) and back.
  const toBody = shape ? (orient ?? PORTRAIT_ORIENT) : null;
  const columns = toBody ? [toBody([1, 0, 0]), toBody([0, 1, 0]), toBody([0, 0, 1])] : null;
  const toView: Orient | null = columns
    ? (p) => columns.map((col) => col[0]! * p[0] + col[1]! * p[1] + col[2]! * p[2]) as [number, number, number]
    : null;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - c) / r;
      const dy = -(y + 0.5 - c) / r;
      const d2 = dx * dx + dy * dy;
      const hit = toBody ? hitEllipsoid(dx, dy, shape!, toBody, toView!) : null;
      const sphereZ = toBody ? (hit ? hit.z : -Infinity) : d2 <= 1 ? Math.sqrt(1 - d2) : -Infinity;
      // The ring where this pixel's ray crosses the ring plane, if it is in front of the planet.
      let band: RingBand | null = null;
      let ringShade = ringFace;
      if (ring) {
        const rz = -(dx * nx + dy * ny) / nz;
        if (rz > sphereZ) {
          band = ringBand(ring, Math.sqrt(d2 + rz * rz));
          // In the planet's shadow: the point lies behind the planet as seen from the Sun.
          const towardSun = dx * light.x + dy * light.y + rz * light.z;
          if (band && towardSun < 0 && d2 + rz * rz - towardSun * towardSun < 1) ringShade *= 0.22;
        }
      }
      if (sphereZ === -Infinity) {
        if (band) {
          put(x, y, rgb(band.color), ringShade, band.alpha);
          continue;
        }
        if (!glow) continue;
        // The atmosphere: fading outwards in steps, lit where the limb faces the Sun.
        const d = Math.sqrt(d2);
        const out = ((d - 1) * r) / glowPixels;
        if (out >= 1) continue;
        const sunward = Math.max(0, Math.min(1, ((dx / d) * light.x + (dy / d) * light.y) * 0.9 + 0.3));
        const alpha = Math.round((1 - out) * 3) / 3;
        if (alpha <= 0 || sunward <= 0) continue;
        const o = (y * size + x) * 4;
        image.data[o] = glow[0];
        image.data[o + 1] = glow[1];
        image.data[o + 2] = glow[2];
        image.data[o + 3] = Math.round(alpha * sunward * 150);
        continue;
      }
      const z = sphereZ;
      // The surface's normal: the point itself on a unit sphere.
      const [mx, my, mz] = hit ? hit.normal : [dx, dy, z];
      const lambert = mx * light.x + my * light.y + mz * light.z;
      // A slightly darker limb rounds the disc off (not under an atmosphere's soft haze).
      const limb = mz < 0.35 && !glow ? 0.88 : 1;
      let k = (glow ? hazeShade(lambert) : shade(lambert)) * limb;
      if (ring && lambert > 0 && sunOnRing !== 0) {
        // The rings' shadow: follow the light from this point to the ring plane.
        const t = -(dx * nx + dy * ny + z * nz) / sunOnRing;
        if (t > 0) {
          const sx = dx + t * light.x;
          const sy = dy + t * light.y;
          const sz = z + t * light.z;
          const shadow = ringBand(ring, Math.sqrt(sx * sx + sy * sy + sz * sz));
          if (shadow) k *= 1 - 0.65 * shadow.alpha;
        }
      }
      const ground = hit ? surface(style, id, hit.dir, map, toBody) : surface(style, id, [dx, dy, z], map, orient);
      if (band) {
        // The ring in front, over the planet.
        const bc = rgb(band.color);
        const a = band.alpha;
        put(x, y, [0, 1, 2].map((i) => ground[i]! * k * (1 - a) + bc[i]! * ringShade * a) as RGB, 1);
      } else put(x, y, ground, k);
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
  const palette = type === "dwarf" ? DWARF_TINTS : ROCK_TINTS;
  return palette[Math.floor(seedOf(id) / SHAPES) % palette.length]!;
}

/**
 * Paints a lit, lumpy rock of art radius r centred at (cx, cy) into an image: an outline
 * wobbling round the angle, its surface tilted by noise so it reads as knobbly inside the
 * outline too, mottled and pitted with craters, in the discs' shade steps.
 */
function paintRock(image: ImageData, cx: number, cy: number, r: number, id: string, light: Light, tint: string): void {
  const seed = seedOf(id);
  const [tr, tg, tb] = rgb(tint);
  const reach = Math.ceil(r);
  for (let y = Math.max(0, Math.floor(cy - reach)); y < Math.min(image.height, Math.ceil(cy + reach)); y++) {
    for (let x = Math.max(0, Math.floor(cx - reach)); x < Math.min(image.width, Math.ceil(cx + reach)); x++) {
      // In the outline's own frame, where it is round before the wobble.
      const ex = x + 0.5 - cx;
      const ey = -(y + 0.5 - cy);
      const angle = Math.atan2(ey, ex);
      const [ca, sa] = [Math.cos(angle), Math.sin(angle)];
      const wobble = 0.6 * noise(ca * 1.6 + 4, sa * 1.6 + 4, 0, seed) + 0.4 * noise(ca * 4 + 9, sa * 4 + 9, 1, seed);
      const edge = r * (1 - 0.34 * (1 - wobble));
      const q = Math.hypot(ex, ey) / edge;
      if (q > 1) continue;
      const u = ex / edge;
      const v = ey / edge;
      // Knobbly: the sphere's normal tilted by low-frequency noise.
      let nx = u + 0.45 * (noise(u * 2.2 + 3, v * 2.2 + 3, 2, seed) - 0.5);
      let ny = v + 0.45 * (noise(u * 2.2 + 7, v * 2.2 + 7, 3, seed) - 0.5);
      let nz = Math.sqrt(Math.max(0, 1 - q * q));
      let albedo = 0.84 + 0.16 * noise(u * 5 + 9, v * 5 + 9, 4, seed);
      const pit = noise(u * 4.5 + 5, v * 4.5 + 5, 5, seed);
      if (pit > 0.7) albedo *= 0.7;
      else if (pit > 0.65) albedo *= 1.07;
      const n = Math.hypot(nx, ny, nz) || 1;
      [nx, ny, nz] = [nx / n, ny / n, nz / n];
      const k = shade(nx * light.x + ny * light.y + nz * light.z) * (q > 0.85 ? 0.9 : 1) * albedo;
      const o = (y * image.width + x) * 4;
      image.data[o] = Math.min(255, Math.round(tr * k));
      image.data[o + 1] = Math.min(255, Math.round(tg * k));
      image.data[o + 2] = Math.min(255, Math.round(tb * k));
      image.data[o + 3] = 255;
    }
  }
}

/** Draws an asteroid's or asteroidal moon's lumpy portrait, art radius r, centred in the canvas. */
export function drawRock(ctx: CanvasRenderingContext2D, id: string, type: string, r: number, light: Light): void {
  const image = ctx.createImageData(ctx.canvas.width, ctx.canvas.height);
  paintRock(image, ctx.canvas.width / 2, ctx.canvas.height / 2, r, id, light, smallBodyTint(id, type));
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
