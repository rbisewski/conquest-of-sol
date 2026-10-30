// Pixel-art discs for the solar system's bodies, drawn pixel by pixel on small canvases and
// shown at a whole-number scale with nearest filtering, like the Earth's map. Each pixel of
// the disc is a point on a sphere: its colour comes from the body's style (bands, spots, ice
// caps, value noise) and its brightness from the Sun's direction in view space, in a few
// steps, so planets show phases as Terra Invicta's do. The Earth uses the globe's own map;
// Mercury, Luna, Mars, Ceres, Vesta, Jupiter, the great moons of Jupiter, Saturn and Uranus,
// Triton, Pluto and Charon pixel-art maps made from spacecraft mosaics; Venus, Saturn, Uranus and Neptune made-up ones
// of their cloud tops, and Eris, Haumea and Makemake, which no spacecraft has seen, made-up ones of
// their ice (tools/data/build_body_maps.py); Phobos and Deimos from Viking's. Haumea, Phobos and
// Deimos are drawn as the stretched ellipsoids they are; the small asteroids 1951 Lick, 3753
// Cruithne and 52762 Khonsu, made up entirely, as lumpy shapes ray-cast from maps of their relief
// (Vesta too, from its real one),
// and the comet Arend-Rigaux's nucleus the same way, its jets, coma and tails drawn over it
// (drawCometActivity).

/** Light direction in view space: x right, y up, z towards the viewer. */
export interface Light {
  x: number;
  y: number;
  z: number;
}

type RGB = [number, number, number];
type Vec3 = [number, number, number];
const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

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
  "1951Lick": "lick.png",
  "3753Cruithne": "cruithne.png",
  "52762Asteroid": "khonsu.png",
  ArendRigaux: "arendrigaux.png",
  Charon: "charon.png",
  "4Vesta": "vesta.png",
  "433Eros": "eros.png",
  "21Lutetia": "lutetia.png",
  "253Mathilde": "mathilde.png",
  Tempel: "tempel1.png",
  Halley: "halley.png",
  Phoebe: "phoebe.png",
  Hyperion: "hyperion.png",
  Janus: "janus.png",
  Epimetheus: "epimetheus.png",
  Prometheus: "prometheus.png",
  Pandora: "pandora.png",
  Atlas: "atlas.png",
  Pan: "pan.png",
  Daphnis: "daphnis.png",
  Calypso: "calypso.png",
  Telesto: "telesto.png",
  Helene: "helene.png",
  Amalthea: "amalthea.png",
  Thebe: "thebe.png",
  Proteus: "proteus.png",
  Larissa: "larissa.png",
  Puck: "puck.png",
  Nix: "nix.png",
  Hydra: "hydra.png",
  "2Pallas": "pallas.png",
  "391Ingeborg": "ingeborg.png",
  "1866Sisyphus": "sisyphus.png",
  "2099Öpik": "opik.png",
  "4954Eric": "eric.png",
  "5731Zeus": "zeus.png",
  "7096Napier": "napier.png",
  "514041Asteroid": "awilix.png",
  Gonggong: "gonggong.png",
  Quaoar: "quaoar.png",
  "208996KBO": "achlys.png",
  "90482Orcus": "orcus.png",
  Sedna: "sedna.png",
  Salacia: "salacia.png",
  "307261KBO": "mani.png",
  "55565KBO": "aya.png",
  "532037TNO": "chiminigagua.png",
  "174567Varda": "varda.png",
  "90568KBO": "goibniu.png",
  "145452KBO": "ritona.png",
  "20000Varuna": "varuna.png",
  "2010KZ39KBO": "izanagi.png",
  "55637KBO": "uni.png",
  "2018VG18TNO": "farout.png",
  Glkunllhomdima: "gkun.png",
  "2014UZ224TNO": "deedee.png",
  "523794TNO": "rr245.png",
  "28978Ixion": "ixion.png",
  "84922KBO": "veles.png",
  "278361KBO": "marduk.png",
  "2014WP50KBO": "huracan.png",
  "19521Chaos": "chaos.png",
  "512381TNO": "st291.png",
  "2014YA50KBO": "nareau.png",
  "2010FX86KBO": "olorun.png",
  "78799KBO": "xewioso.png",
  "455502KBO": "luison.png",
  "612533KBO": "chernobog.png",
  "2017OF69KBO": "mengpo.png",
  "470308KBO": "volturnus.png",
  "470443KBO": "tagaloa.png",
  "559182KBO": "enki.png",
  "523645KBO": "mbombo.png",
  "523750KBO": "anansi.png",
  "120348KBO": "xolas.png",
  "523681KBO": "coatlicue.png",
  "202421KBO": "unkulunkulu.png",
  "482824KBO": "agudar.png",
  "440030KBO": "kuterastan.png",
  "472271KBO": "katonda.png",
  "499514KBO": "eskeri.png",
  "35671KBO": "tawa.png",
  "119951KBO": "nuwa.png",
  "556068KBO": "whiro.png",
  "2012VP113TNO": "biden.png",
  "84719KBO": "ankou.png",
  "578993KBO": "xargi.png",
  "471288KBO": "cagn.png",
  "469306KBO": "numbakulla.png",
  "38628Huya": "huya.png",
  "469372KBO": "maximon.png",
  "175113KBO": "shingon.png",
  "144897KBO": "erlik.png",
  "10Hygiea": "hygiea.png",
  "624Hektor": "hektor.png",
  "87Sylvia": "sylvia.png",
  "52Europa": "europa52.png",
  "2015QW23KBO": "nanabohzo.png",
  "556416KBO": "nzambi.png",
  "15Eunomia": "eunomia.png",
  "511Davida": "davida.png",
  "704Interamnia": "interamnia.png",
  "107Camilla": "camilla.png",
  Nereid: "nereid.png",
  "15874TNO": "tl66.png",
  "10199Chariklo": "chariklo.png",
  "2015AH281Centaur": "pylenor.png",
  "15789KBO": "anguta.png",
  "523643Centaur": "pisenor.png",
  "3Juno": "juno.png",
  "Hiʻiaka": "hiiaka.png",
  "65Cybele": "cybele.png",
  "1437Diomedes": "diomedes.png",
  "16Psyche": "psyche.png",
  "523695Centaur": "medon.png",
  "48Doris": "doris.png",
  "216Kleopatra": "kleopatra.png",
  "523727Centaur": "eurytion.png",
  "121Hermione": "hermione.png",
  "31Euphrosyne": "euphrosyne.png",
  "88Thisbe": "thisbe.png",
  "324Bamberga": "bamberga.png",
  "145453KBO": "viracocha.png",
  "309239Centaur": "ripheus.png",
  "7Iris": "iris.png",
  "41Daphne": "daphne.png",
  "22Kalliope": "kalliope.png",
  "451Patientia": "patientia.png",
  "45Eugenia": "eugenia.png",
  "95626Centaur": "demeleon.png",
  "562274Centaur": "hippasus.png",
  "19Fortuna": "fortuna.png",
  "94Aurora": "aurora.png",
  "532Herculina": "herculina.png",
  "9Metis": "metis.png",
  Leleakuhonua: "leleakuhonua.png",
  "39Laetitia": "laetitia.png",
  "2060Chiron": "chiron.png",
  "13Egeria": "egeria.png",
  "375Ursula": "ursula.png",
  "130Elektra": "elektra.png",
  "53311Deucalion": "deucalion.png",
  "423Diotima": "diotima.png",
  "54598Bienor": "bienor.png",
  Himalia: "himalia.png",
  "6Hebe": "hebe.png",
  Galatea: "galatea.png",
  "702Alauda": "alauda.png",
  "316179Centaur": "sanape.png",
  "2013KY18Centaur": "ephesos.png",
  "334Chicago": "chicago.png",
  "24Themis": "themis.png",
  "447178Centaur": "agrius.png",
  "259Aletheia": "aletheia.png",
  "5145Pholus": "pholus.png",
  "372Palma": "palma.png",
  "128Nemesis": "nemesis.png",
  "154Bertha": "bertha.png",
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
  load = loadImage(file);
  mapLoads.set(id, load);
  return load;
}

async function loadImage(file: string): Promise<MapImage> {
  const image = new Image();
  image.src = `${import.meta.env.BASE_URL}map/${file}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  return { width: image.width, height: image.height, data: ctx.getImageData(0, 0, image.width, image.height).data };
}

/**
 * A lumpy body's relief: how far its surface lies from its centre (in its radii) in each
 * direction, on a cube map (six faces of size × size, x+, x−, y+, y−, z+, z−, in its frame), so a
 * direction is looked up with a division rather than trigonometry; and the farthest it reaches.
 */
export interface Relief {
  size: number;
  data: Float32Array;
  reach: number;
}

const reliefLoads = new Map<string, Promise<Relief>>();

export function hasRelief(id: string): boolean {
  return !!STYLES[id]?.lumpy;
}

/** A lumpy body's relief, loaded once from <map>_shape.png (16 bits, high byte red, low green, 0 to 2 radii) and laid on a cube map; null for any other body. */
export function bodyRelief(id: string): Promise<Relief> | null {
  if (!hasRelief(id)) return null;
  let load = reliefLoads.get(id);
  if (load) return load;
  load = loadImage(MAP_FILES[id]!.replace(".png", "_shape.png")).then((map) => {
    const size = 96;
    const data = new Float32Array(6 * size * size);
    const at = (x: number, y: number) => {
      const o = (y * map.width + x) * 4;
      return ((map.data[o]! * 256 + map.data[o + 1]!) / 65535) * 2;
    };
    let reach = 0;
    for (let f = 0; f < 6; f++) {
      for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
          const u = ((i + 0.5) / size) * 2 - 1;
          const v = ((j + 0.5) / size) * 2 - 1;
          const s = f & 1 ? -1 : 1;
          const [x, y, z] = f < 2 ? [s, u, v] : f < 4 ? [u, s, v] : [u, v, s];
          const lat = Math.atan2(y, Math.hypot(x, z));
          const lon = Math.atan2(-z, x);
          // Bilinear in the map, wrapping in longitude.
          const fx = ((lon + Math.PI) / (2 * Math.PI)) * map.width - 0.5;
          const fy = Math.min(map.height - 1, Math.max(0, ((Math.PI / 2 - lat) / Math.PI) * map.height - 0.5));
          const x0 = Math.floor(fx);
          const y0 = Math.floor(fy);
          const y1 = Math.min(map.height - 1, y0 + 1);
          const [tx, ty] = [fx - x0, fy - y0];
          const wrap = (n: number) => ((n % map.width) + map.width) % map.width;
          const r =
            (at(wrap(x0), y0) * (1 - tx) + at(wrap(x0 + 1), y0) * tx) * (1 - ty) + (at(wrap(x0), y1) * (1 - tx) + at(wrap(x0 + 1), y1) * tx) * ty;
          data[(f * size + j) * size + i] = r;
          reach = Math.max(reach, r);
        }
      }
    }
    return { size, data, reach };
  });
  reliefLoads.set(id, load);
  return load;
}

/** The relief's radius in a direction (any length), bilinear on its cube face. Called millions of times a frame, so written plainly (no arrays made). */
function reliefAt(relief: Relief, x: number, y: number, z: number): number {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  let f: number;
  let u: number;
  let v: number;
  if (ax >= ay && ax >= az) {
    f = x > 0 ? 0 : 1;
    u = y / ax;
    v = z / ax;
  } else if (ay >= az) {
    f = y > 0 ? 2 : 3;
    u = x / ay;
    v = z / ay;
  } else {
    f = z > 0 ? 4 : 5;
    u = x / az;
    v = y / az;
  }
  const n = relief.size;
  const fi = Math.min(n - 1.001, Math.max(0, (u + 1) * 0.5 * n - 0.5));
  const fj = Math.min(n - 1.001, Math.max(0, (v + 1) * 0.5 * n - 0.5));
  const i = fi | 0;
  const j = fj | 0;
  const ti = fi - i;
  const tj = fj - j;
  const o = (f * n + j) * n + i;
  const d = relief.data;
  return (d[o]! * (1 - ti) + d[o + 1]! * ti) * (1 - tj) + (d[o + n]! * (1 - ti) + d[o + n + 1]! * ti) * tj;
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
  /** A lumpy body, ray-cast from its relief (bodyRelief) once loaded, reaching this far out in its radii (the ellipsoid shape stands in till then). */
  lumpy?: { reach: number };
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
/** Chariklo's two rings (Braga-Ribas et al. 2014), about 7 and 3.4 km wide at 391 and 405 km, in Terra Invicta's 167 km radius. */
const CHARIKLO_RING: RingBand[] = [
  { from: 2.318, to: 2.36, color: "#6f665f", alpha: 0.4 },
  { from: 2.414, to: 2.434, color: "#6f665f", alpha: 0.12 },
];

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
  "1951Lick": { base: "#706055", shape: [1.35, 0.82, 1], lumpy: { reach: 1.62 } },
  "3753Cruithne": { base: "#96938e", shape: [1.6, 0.85, 1], lumpy: { reach: 1.88 } },
  "52762Asteroid": { base: "#76695e", shape: [1.2, 0.88, 1], lumpy: { reach: 1.34 } },
  ArendRigaux: { base: "#3a3532", shape: [1.45, 0.86, 1], lumpy: { reach: 1.63 } },
  // Vesta's relief is Dawn's real shape model; 286.3 × 278.6 × 223.2 km stands in till it loads.
  "4Vesta": { base: "#968f86", shape: [1, 0.78, 0.973], lumpy: { reach: 1.03 } },
  // Small bodies drawn from published shape models (or, for the last nine, their measured sizes),
  // their relief made by build_body_maps.py; how far each reaches, for its canvas.
  "433Eros": { base: "#8c867e", lumpy: { reach: 1.04 } },
  "21Lutetia": { base: "#8c867e", lumpy: { reach: 1.06 } },
  "253Mathilde": { base: "#8c867e", lumpy: { reach: 1.26 } },
  Tempel: { base: "#8c867e", lumpy: { reach: 1.0 } },
  Halley: { base: "#8c867e", lumpy: { reach: 1.16 } },
  Phoebe: { base: "#8c867e", lumpy: { reach: 1.12 } },
  Hyperion: { base: "#8c867e", lumpy: { reach: 1.03 } },
  Janus: { base: "#8c867e", lumpy: { reach: 1.06 } },
  Epimetheus: { base: "#8c867e", lumpy: { reach: 1.17 } },
  Prometheus: { base: "#8c867e", lumpy: { reach: 1.08 } },
  Pandora: { base: "#8c867e", lumpy: { reach: 1.1 } },
  Atlas: { base: "#8c867e", lumpy: { reach: 1.18 } },
  Pan: { base: "#8c867e", lumpy: { reach: 1.21 } },
  Daphnis: { base: "#8c867e", lumpy: { reach: 1.15 } },
  Calypso: { base: "#8c867e", lumpy: { reach: 1.1 } },
  Telesto: { base: "#8c867e", lumpy: { reach: 1.05 } },
  Helene: { base: "#8c867e", lumpy: { reach: 1.01 } },
  Amalthea: { base: "#8c867e", lumpy: { reach: 1.16 } },
  Thebe: { base: "#8c867e", lumpy: { reach: 1.29 } },
  Proteus: { base: "#8c867e", lumpy: { reach: 1.21 } },
  Larissa: { base: "#8c867e", lumpy: { reach: 1.21 } },
  Puck: { base: "#8c867e", lumpy: { reach: 1.19 } },
  Nix: { base: "#8c867e", lumpy: { reach: 1.23 } },
  Hydra: { base: "#8c867e", lumpy: { reach: 0.96 } },
  // Asteroids with no shape model or map at all, made up at their measured sizes.
  "2Pallas": { base: "#8c867e", lumpy: { reach: 1.15 } },
  "391Ingeborg": { base: "#8c867e", lumpy: { reach: 1.13 } },
  "1866Sisyphus": { base: "#8c867e", lumpy: { reach: 1.1 } },
  "2099Öpik": { base: "#8c867e", lumpy: { reach: 1.33 } },
  "4954Eric": { base: "#8c867e", lumpy: { reach: 1.33 } },
  "5731Zeus": { base: "#8c867e", lumpy: { reach: 1.41 } },
  "7096Napier": { base: "#8c867e", lumpy: { reach: 1.34 } },
  "514041Asteroid": { base: "#8c867e", lumpy: { reach: 1.46 } },
  // Dwarf planets no spacecraft has seen, made up after their colours; five are measurably not round.
  Gonggong: { base: "#964c34" },
  Quaoar: { base: "#805846", shape: [620.7 / 555, 511.5 / 555, 546.5 / 555] },
  "208996KBO": { base: "#707072", shape: [470 / 470, 245 / 470, 383 / 470] },
  "90482Orcus": { base: "#9ca0a6" },
  Sedna: { base: "#ba5c3e" },
  Salacia: { base: "#34312f" },
  "307261KBO": { base: "#605a54" },
  "55565KBO": { base: "#7a6252" },
  "532037TNO": { base: "#907664" },
  "174567Varda": { base: "#765a4c", shape: [389 / 358, 248 / 358, 353 / 358] },
  "90568KBO": { base: "#5e5046" },
  "145452KBO": { base: "#7a6050" },
  "20000Varuna": { base: "#7c6656", shape: [1.52, 0.686, 0.958] },
  "2010KZ39KBO": { base: "#82766c" },
  "55637KBO": { base: "#78645a" },
  "2018VG18TNO": { base: "#ae7e7c" },
  Glkunllhomdima: { base: "#8a5a48" },
  "2014UZ224TNO": { base: "#826454" },
  "523794TNO": { base: "#80807e" },
  "28978Ixion": { base: "#82624e" },
  "84922KBO": { base: "#7a6252", shape: [339 / 313.5, 226 / 313.5, 235 / 313.5] },
  "278361KBO": { base: "#786054" },
  "2014WP50KBO": { base: "#805c4c" },
  "19521Chaos": { base: "#7a5e50" },
  "512381TNO": { base: "#7c6e68" },
  "2014YA50KBO": { base: "#8e9296" },
  "2010FX86KBO": { base: "#88624e" },
  "78799KBO": { base: "#888a8c" },
  "455502KBO": { base: "#707276" },
  "612533KBO": { base: "#444446" },
  "2017OF69KBO": { base: "#848a90" },
  "470308KBO": { base: "#545250" },
  "470443KBO": { base: "#846856" },
  "559182KBO": { base: "#66605a" },
  "523645KBO": { base: "#6a625a" },
  "523750KBO": { base: "#626060" },
  "120348KBO": { base: "#7c6a60" },
  "523681KBO": { base: "#8e6450" },
  "202421KBO": { base: "#a46046" },
  "482824KBO": { base: "#806458" },
  "440030KBO": { base: "#866452" },
  "472271KBO": { base: "#7e6458" },
  "499514KBO": { base: "#886654" },
  "35671KBO": { base: "#766258" },
  "119951KBO": { base: "#86888a" },
  "556068KBO": { base: "#5a5048" },
  "2012VP113TNO": { base: "#866454" },
  "84719KBO": { base: "#443e3a" },
  "578993KBO": { base: "#564e48" },
  "471288KBO": { base: "#6a584e" },
  "469306KBO": { base: "#806658" },
  "38628Huya": { base: "#6c5448" },
  "469372KBO": { base: "#5c5854" },
  "175113KBO": { base: "#78665c" },
  "144897KBO": { base: "#82685a" },
  // Larger asteroids, centaurs and small moons, ray-cast from made-up relief at their measured sizes.
  "10Hygiea": { base: "#464646", lumpy: { reach: 1.05 } },
  "624Hektor": { base: "#48322a", lumpy: { reach: 1.08 } },
  "87Sylvia": { base: "#3c3734", lumpy: { reach: 0.99 } },
  "52Europa": { base: "#3e3b38", lumpy: { reach: 1.11 } },
  "2015QW23KBO": { base: "#3e3b38", lumpy: { reach: 1.26 } },
  "556416KBO": { base: "#786254", lumpy: { reach: 1.2 } },
  "15Eunomia": { base: "#96846e", lumpy: { reach: 1.01 } },
  "511Davida": { base: "#3e3b38", lumpy: { reach: 1.04 } },
  "704Interamnia": { base: "#4c4c50", lumpy: { reach: 1.11 } },
  "107Camilla": { base: "#3c3734", lumpy: { reach: 1.09 } },
  Nereid: { base: "#848686", lumpy: { reach: 1.11 } },
  "15874TNO": { base: "#6a6a6c", lumpy: { reach: 1.24 } },
  "10199Chariklo": { base: "#3e302a", ring: CHARIKLO_RING, lumpy: { reach: 0.91 } },
  "2015AH281Centaur": { base: "#3e3b38", lumpy: { reach: 1.21 } },
  "15789KBO": { base: "#5c3226", lumpy: { reach: 1.15 } },
  "523643Centaur": { base: "#3e3b38", lumpy: { reach: 1.17 } },
  "3Juno": { base: "#96846e", lumpy: { reach: 0.97 } },
  "Hiʻiaka": { base: "#d6dade", lumpy: { reach: 1.36 } },
  "65Cybele": { base: "#3c3734", lumpy: { reach: 1.05 } },
  "1437Diomedes": { base: "#48322a", lumpy: { reach: 1.09 } },
  "16Psyche": { base: "#8a8680", lumpy: { reach: 1.08 } },
  "523695Centaur": { base: "#3e3b38", lumpy: { reach: 1.16 } },
  "48Doris": { base: "#3e3b38", lumpy: { reach: 0.96 } },
  "216Kleopatra": { base: "#88847e", lumpy: { reach: 1.03 } },
  "523727Centaur": { base: "#3e3b38", lumpy: { reach: 1.17 } },
  "121Hermione": { base: "#3e3b38", lumpy: { reach: 1.15 } },
  "31Euphrosyne": { base: "#3e3b38", lumpy: { reach: 1.2 } },
  "88Thisbe": { base: "#42464c", lumpy: { reach: 1.02 } },
  "324Bamberga": { base: "#3e3b38", lumpy: { reach: 1.08 } },
  "145453KBO": { base: "#b4b8bc", lumpy: { reach: 1.39 } },
  "309239Centaur": { base: "#625e5a", lumpy: { reach: 1.22 } },
  "7Iris": { base: "#96846e", lumpy: { reach: 1.14 } },
  "41Daphne": { base: "#3e3b38", lumpy: { reach: 1.08 } },
  "22Kalliope": { base: "#84807a", lumpy: { reach: 1.06 } },
  "451Patientia": { base: "#3e3b38", lumpy: { reach: 1.26 } },
  "45Eugenia": { base: "#48443e", lumpy: { reach: 1.06 } },
  "95626Centaur": { base: "#543e36", lumpy: { reach: 1.67 } },
  "562274Centaur": { base: "#3e3b38", lumpy: { reach: 1.21 } },
  "19Fortuna": { base: "#48443e", lumpy: { reach: 1.18 } },
  "94Aurora": { base: "#3c3734", lumpy: { reach: 1.05 } },
  "532Herculina": { base: "#96846e", lumpy: { reach: 1.04 } },
  "9Metis": { base: "#74685a", lumpy: { reach: 1.03 } },
  Leleakuhonua: { base: "#8c6c5c", lumpy: { reach: 1.21 } },
  "39Laetitia": { base: "#96846e", lumpy: { reach: 1.06 } },
  "2060Chiron": { base: "#625e5a", lumpy: { reach: 1.21 } },
  "13Egeria": { base: "#48443e", lumpy: { reach: 1.17 } },
  "375Ursula": { base: "#3c3734", lumpy: { reach: 1.15 } },
  "130Elektra": { base: "#48443e", lumpy: { reach: 1.27 } },
  "53311Deucalion": { base: "#6a5c54", lumpy: { reach: 0.94 } },
  "423Diotima": { base: "#3e3b38", lumpy: { reach: 1.06 } },
  "54598Bienor": { base: "#625e5a", lumpy: { reach: 1.26 } },
  Himalia: { base: "#3e3b38", lumpy: { reach: 1.08 } },
  "6Hebe": { base: "#96846e", lumpy: { reach: 1.18 } },
  Galatea: { base: "#48443e", lumpy: { reach: 1.19 } },
  "702Alauda": { base: "#42464c", lumpy: { reach: 1.13 } },
  "316179Centaur": { base: "#3e3b38", lumpy: { reach: 1.07 } },
  "2013KY18Centaur": { base: "#3e3b38", lumpy: { reach: 1.26 } },
  "334Chicago": { base: "#3c3734", lumpy: { reach: 1.19 } },
  "24Themis": { base: "#42464c", lumpy: { reach: 1.24 } },
  "447178Centaur": { base: "#3e3b38", lumpy: { reach: 1.11 } },
  "259Aletheia": { base: "#3c3734", lumpy: { reach: 1.09 } },
  "5145Pholus": { base: "#84422e", lumpy: { reach: 0.63 } },
  "372Palma": { base: "#42464c", lumpy: { reach: 1.1 } },
  "128Nemesis": { base: "#3e3b38", lumpy: { reach: 1.05 } },
  "154Bertha": { base: "#3e3b38", lumpy: { reach: 1.24 } },
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

/** How far a body's surface reaches, in its radii: its farthest lump, its longest axis, or 1 for a sphere. */
export function surfaceReach(id: string): number {
  const style = STYLES[id] ?? MOON_STYLE;
  return Math.max(style.lumpy?.reach ?? 1, ...(style.shape ?? [1]));
}

/** How far a body's drawing reaches, in its radii: its rings' outer edge, or its surface's. */
export function bodyReach(id: string): number {
  const ring = (STYLES[id] ?? MOON_STYLE).ring;
  return Math.max(ring ? ring[ring.length - 1]!.to : 1, surfaceReach(id));
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
 * How far to step along a ray from a lumpy surface's gap: a fraction of it (its slopes are steep
 * in places, so a full step could pass through a lump), never less than LUMPY_MIN_STEP radii (a
 * ray grazing the outline would otherwise creep along it; only slivers thinner than that are
 * missed, and halving the last step finds the surface exactly), and at most LUMPY_STEPS of them.
 */
const LUMPY_STRIDE = 0.6;
const LUMPY_MIN_STEP = 0.03;
const LUMPY_STEPS = 64;

/**
 * Where a view ray (from the pixel at dx, dy towards the viewer) first meets a lumpy surface: it
 * steps in from the front of the bounding sphere, each step a part of the gap between the point's
 * distance from the centre and the relief's radius there (long strides through empty space,
 * short ones near the surface) till it is inside, then halves its last step to the surface. The
 * normal is the slope of the relief there (the gradient of distance less radius); shadowed is
 * whether a lump stands between that point and the Sun (light, in the body's frame), found the
 * same way. r and rt take view space to the body's frame and back.
 */
function hitLumpy(dx: number, dy: number, relief: Relief, r: Orient, rt: Orient, light: Vec3): { z: number; normal: Vec3; dir: Vec3; shadowed: boolean } | null {
  const reach = relief.reach * 1.01;
  const d2 = dx * dx + dy * dy;
  if (d2 >= reach * reach) return null;
  const top = Math.sqrt(reach * reach - d2);
  const o = r([dx, dy, 0]);
  const w = r([0, 0, 1]);
  const gap = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z) - reliefAt(relief, x, y, z);
  const gapAt = (t: number) => gap(o[0] + t * w[0], o[1] + t * w[1], o[2] + t * w[2]);
  let out = top;
  let t = top;
  let found = false;
  for (let k = 0; k < LUMPY_STEPS && t > -top; k++) {
    const g = gapAt(t);
    if (g < 0) {
      found = true;
      break;
    }
    out = t;
    t -= Math.max(g * LUMPY_STRIDE, LUMPY_MIN_STEP);
  }
  if (!found) return null;
  for (let k = 0; k < 4; k++) {
    const mid = (out + t) / 2;
    if (gapAt(mid) < 0) t = mid;
    else out = mid;
  }
  const p: Vec3 = [o[0] + t * w[0], o[1] + t * w[1], o[2] + t * w[2]];
  // One-sided differences: the gap at the surface itself is nearly nothing.
  const e = 0.02;
  const g0 = gap(p[0], p[1], p[2]);
  const g: Vec3 = [gap(p[0] + e, p[1], p[2]) - g0, gap(p[0], p[1] + e, p[2]) - g0, gap(p[0], p[1], p[2] + e) - g0];
  const n = rt(g);
  const nl = Math.hypot(...n) || 1;
  const pl = Math.hypot(...p);
  // Towards the Sun from just off the surface, till clear of the bounding sphere.
  let shadowed = false;
  if (dot3(g, light) < 0) shadowed = true;
  else {
    let s = 0.04;
    for (let k = 0; k < LUMPY_STEPS && s < 2 * reach; k++) {
      const x = p[0] + light[0] * s;
      const y = p[1] + light[1] * s;
      const z = p[2] + light[2] * s;
      if (x * x + y * y + z * z > reach * reach) break;
      const h = gap(x, y, z);
      if (h < 0) {
        shadowed = true;
        break;
      }
      s += Math.max(h * LUMPY_STRIDE, LUMPY_MIN_STEP);
    }
  }
  return { z: t, normal: [n[0] / nl, n[1] / nl, n[2] / nl], dir: rt([p[0] / pl, p[1] / pl, p[2] / pl]), shadowed };
}

/**
 * Draws a lit body of art radius r into a canvas of canvasSize(id, r), from its surface map when
 * given (the body's own; orient turns view space into the map's frame). Rings lie in the plane
 * square to the pole (view space): each pixel's ray meets that plane, and the ring there shows
 * where it is in front of the planet or clear of it, lit on whichever face the Sun is, darkened
 * in the planet's shadow; the rings shadow the planet in turn. An ellipsoid (Haumea) is ray-cast
 * in its own frame, lit by its true normals; a lumpy body (once its relief is given) ray-marched
 * the same way, its lumps and crater walls shadowing it.
 */
export function drawBody(
  ctx: CanvasRenderingContext2D,
  id: string,
  r: number,
  light: Light,
  map: MapImage | null = null,
  orient: Orient | null = null,
  pole: [number, number, number] = DEFAULT_POLE,
  relief: Relief | null = null,
): void {
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
  // For an ellipsoid or a lumpy body: view space to its frame (the portrait's own if none is given) and back.
  const toBody = shape || relief ? (orient ?? PORTRAIT_ORIENT) : null;
  const columns = toBody ? [toBody([1, 0, 0]), toBody([0, 1, 0]), toBody([0, 0, 1])] : null;
  const toView: Orient | null = columns
    ? (p) => columns.map((col) => col[0]! * p[0] + col[1]! * p[1] + col[2]! * p[2]) as [number, number, number]
    : null;
  const sunInBody = relief ? toBody!([light.x, light.y, light.z]) : null;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - c) / r;
      const dy = -(y + 0.5 - c) / r;
      const d2 = dx * dx + dy * dy;
      const hit = relief ? hitLumpy(dx, dy, relief, toBody!, toView!, sunInBody!) : toBody ? hitEllipsoid(dx, dy, shape!, toBody, toView!) : null;
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
      const lambert = hit && "shadowed" in hit && hit.shadowed ? -1 : mx * light.x + my * light.y + mz * light.z;
      // A slightly darker limb rounds the disc off (not under an atmosphere's soft haze).
      const limb = mz < 0.35 && !glow ? 0.88 : 1;
      let k = (glow ? hazeShade(lambert) : shade(lambert)) * limb;
      // A lumpy body's lumps would flatten out in the brightest step under a high Sun: shade
      // them a little more by their slope, still in steps.
      if (relief && lambert > 0) k *= 0.7 + 0.3 * (Math.round(Math.min(1, lambert) * 10) / 10);
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
 * r is the canvas's art radius; the nucleus is a little under half of it, a lumpy rock unless one
 * drawn from its maps is given (centred on the nucleus's place).
 */
export function drawComet(ctx: CanvasRenderingContext2D, id: string, r: number, light: Light, t: number, nucleusArt: HTMLCanvasElement | null = null): void {
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
  if (!nucleusArt) paintRock(image, cx, cy, nucleus, id, light, COMET_TINT);
  ctx.putImageData(image, 0, 0);
  if (nucleusArt) ctx.drawImage(nucleusArt, Math.round(cx - nucleusArt.width / 2), Math.round(cy - nucleusArt.height / 2));
}

/** How far a comet's close-up tails reach on their canvas, in its nucleus's radii. */
export const COMET_TAIL_REACH = 9;

/** The canvas for a comet's activity drawn over a nucleus of art radius r. */
export function cometCanvasSize(r: number): number {
  return 2 * Math.ceil(r * COMET_TAIL_REACH) + 2;
}

/** The close-up tails' colours, brightest first: the ion tail's blues and the dust's creams (as the sprites'), and the coma's and jets' pale blue-white. */
const ION_STEPS: RGB[] = ["#e6f6ff", "#9ed3ff", "#4f88c6"].map(rgb);
const DUST_STEPS: RGB[] = ["#fff7e0", "#dbd1b8", "#8c8475"].map(rgb);
const COMA = rgb("#cfe4ff");
const JET_STEPS: RGB[] = [COMA, ION_STEPS[1]!, ION_STEPS[2]!];

/** The coma last drawn, kept as long as its size, activity and the Sun's direction hold. */
let comaCache: { key: string; image: ImageData; x: number; y: number } | null = null;

/**
 * A comet's activity close up at a time in seconds, drawn on its own canvas (cometCanvasSize)
 * over its nucleus of art radius r, centred: activity 0–1 (smallBodies.ts cometActivity), light
 * the Sun's direction in view space, orient view space to the nucleus's frame. All in single art
 * pixels and ordered-dithered steps, as the far sprite's tails:
 * - a coma, a faint dithered haze brighter towards the Sun, thinned over the nucleus so it shows;
 * - jets from a few fixed vents on the nucleus that turn with it, erupting while their ground is
 *   in sunlight, their grains flung out and then swept back away from the Sun;
 * - the ion tail, blue pixels streaming fast and straight away from the Sun, rippling a little;
 * - the dust tail, cream pixels drifting slower, fanning out and curving off to one side.
 * The tails are shortened as the far sprite's are when the Sun is behind or in front, and hidden
 * where they pass behind the nucleus. A faint comet still shows them all, fainter and shorter,
 * so it reads as a comet close up as it does far away.
 */
export function drawCometActivity(ctx: CanvasRenderingContext2D, id: string, r: number, light: Light, activity: number, t: number, orient: Orient | null = null): void {
  const size = ctx.canvas.width;
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);
  if (activity <= 0) return;
  const seed = seedOf(id);
  const across = Math.hypot(light.x, light.y);
  const [ax, ay] = across > 1e-4 ? [-light.x / across, -light.y / across] : [0, -1];
  const tail = (COMET_TAIL_REACH - 1) * Math.min(1, Math.max(0.5, across * 1.6)) * (0.35 + 0.65 * activity);
  // Faint or not, a comet close up shows its activity.
  const shown = 0.35 + 0.65 * activity;
  // A tail pixel along the tail (radii; the tail runs away from the Sun, into the view when the Sun is in front) hides behind the nucleus.
  const behind = (x: number, y: number, along: number) => light.z > 0 && x * x + y * y < 1.3 && along * light.z > 0.2;
  const px = (x: number, y: number, color: RGB, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
    ctx.fillRect(Math.floor(c + x * r), Math.floor(c - y * r), 1, 1);
  };
  const step = (v: number, steps: RGB[]) => steps[v > 0.66 ? 0 : v > 0.33 ? 1 : 2]!;

  // The coma: dithered into three steps of a pale haze, off-centre towards the Sun.
  const reach = 1.8 + 2.2 * activity;
  const key = `${r}:${Math.round(activity * 20)}:${Math.round(light.x * 20)},${Math.round(light.y * 20)}`;
  if (comaCache?.key !== key) {
    const half = Math.ceil(reach * r) + 2;
    const image = new ImageData(2 * half, 2 * half);
    const [ox, oy] = [light.x * 0.35, light.y * 0.35];
    for (let y = 0; y < 2 * half; y++) {
      for (let x = 0; x < 2 * half; x++) {
        const qx = (x + 0.5 - half) / r;
        const qy = -(y + 0.5 - half) / r;
        const d = Math.hypot(qx - ox, qy - oy) / reach;
        if (d >= 1) continue;
        // Thin over the nucleus, so its shape shows through.
        const over = Math.hypot(qx, qy) < 1.1 ? 0.35 : 1;
        const level = Math.floor(((1 - d) ** 2 * 0.9 * shown * over + 0.35 * (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5)) * 3) / 3;
        if (level <= 0.34) continue;
        const o = (y * 2 * half + x) * 4;
        image.data[o] = COMA[0];
        image.data[o + 1] = COMA[1];
        image.data[o + 2] = COMA[2];
        image.data[o + 3] = Math.round((level - 0.33) * 190);
      }
    }
    comaCache = { key, image, x: Math.round(c - half), y: Math.round(c - half) };
  }
  ctx.putImageData(comaCache.image, comaCache.x, comaCache.y);

  // Jets: vents fixed on the nucleus, erupting while the Sun is on them.
  const toBody = orient ?? PORTRAIT_ORIENT;
  const columns = [toBody([1, 0, 0]), toBody([0, 1, 0]), toBody([0, 0, 1])];
  const toView = (p: Vec3): Vec3 => [dot3(columns[0]!, p), dot3(columns[1]!, p), dot3(columns[2]!, p)];
  const sunward: Vec3 = [light.x, light.y, light.z];
  for (let v = 0; v < 3; v++) {
    const vent = sunPoint((hash(v, 0, 0, seed) - 0.5) * 140, hash(v, 1, 0, seed) * 360);
    const out = toView(vent);
    const sunlit = dot3(out, sunward);
    if (sunlit < 0.1) continue;
    const strength = Math.min(1, sunlit * 1.5) * shown;
    for (let k = 0; k < 46; k++) {
      const age = (hash(k, v, 2, seed) + t * (0.35 + 0.2 * hash(k, v, 3, seed))) % 1;
      // Flung out along the vent's normal in a narrow cone, then swept back from the Sun.
      const spread = 0.18 * (hash(k, v, 4, seed) - 0.5);
      const fly = 0.3 + age * 2.4;
      const sweep = age * age * 2.2;
      const x = out[0] * (1.05 + fly) + spread * out[1] - sunward[0] * sweep;
      const y = out[1] * (1.05 + fly) - spread * out[0] - sunward[1] * sweep;
      const z = out[2] * (1.05 + fly) - sunward[2] * sweep;
      // Hidden behind the nucleus.
      if (z < 0 && x * x + y * y < 1.2) continue;
      const alpha = (1 - age) * strength;
      if (alpha < 0.12) continue;
      px(x, y, step(alpha, JET_STEPS), Math.min(1, alpha * 1.3));
    }
  }

  // The ion tail: fast, straight, a little rippling.
  for (let k = 0; k < 150; k++) {
    const s = (hash(k, 0, 5, seed) + t * (0.22 + 0.1 * hash(k, 1, 5, seed))) % 1;
    const along = 1 + s * tail;
    const side = (hash(k, 2, 5, seed) - 0.5) * (0.25 + along * 0.05) + 0.12 * Math.sin(along * 1.3 - t * 2.5);
    const fade = (1 - s) * (0.55 + 0.45 * activity);
    const [x, y] = [ax * along - ay * side, ay * along + ax * side];
    if (fade < 0.1 || behind(x, y, along)) continue;
    px(x, y, step(fade, ION_STEPS), Math.min(1, fade * 1.2));
  }

  // The dust tail: slower, wider, curving off to one side of the ion tail.
  const [bx, by] = [ax * 0.94 - ay * 0.34, ax * 0.34 + ay * 0.94];
  const dustLength = tail * 0.7;
  for (let k = 0; k < 230; k++) {
    const s = (hash(k, 0, 6, seed) + t * (0.07 + 0.05 * hash(k, 1, 6, seed))) % 1;
    const along = 1 + s * dustLength;
    const side = (hash(k, 2, 6, seed) - 0.5) * (0.35 + along * 0.32) - (along * along) / (dustLength * 4 + 1);
    const fade = (1 - s) * 0.85;
    const [x, y] = [bx * along - by * side, by * along + bx * side];
    if (fade < 0.1 || behind(x, y, along)) continue;
    px(x, y, step(fade, DUST_STEPS), Math.min(1, fade * 1.1));
  }
  ctx.globalAlpha = 1;
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

/** The rate the Sun's frame turns (the IAU's, Carrington's), degrees a day. */
const CARRINGTON = 14.1844;

/** The Sun's turn at a latitude (its sine), degrees a day (Snodgrass & Ulrich 1990): the equator in about 25 days, the poles in about 35. */
function sunSpin(latSin: number): number {
  const s2 = latSin * latSin;
  return 14.713 - 2.396 * s2 - 1.787 * s2 * s2;
}

/**
 * The 11-year sunspot cycle at a time (Julian years after J2000): activity 0–1, rising over
 * about four years to maximum and falling over seven, and the latitude new spot groups appear
 * at, drifting from 30° towards the equator through each cycle (Spörer's law; the butterfly
 * diagram). Cycle 25 began in December 2019.
 */
export function solarCycle(years: number): { activity: number; latitude: number } {
  const phase = ((((years + 2000 - 2019.95) / 11) % 1) + 1) % 1;
  const activity = phase < 0.4 ? Math.sin(((phase / 0.4) * Math.PI) / 2) ** 2 : Math.cos((((phase - 0.4) / 0.6) * Math.PI) / 2) ** 2;
  return { activity, latitude: 30 - 23 * phase };
}


/** A point of the Sun's frame (the globe's convention, as the maps'), from latitude and longitude in degrees. */
function sunPoint(lat: number, lon: number): Vec3 {
  const [la, lo] = [(lat * Math.PI) / 180, (lon * Math.PI) / 180];
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)];
}

interface Sunspot {
  at: Vec3;
  /** Squared angular radii (radians²) of the dark umbra and the penumbra round it. */
  umbra: number;
  penumbra: number;
}

interface SunspotGroup {
  at: Vec3;
  /** The cosine of the angle out to which it has spots, and out to which its bright faculae reach. */
  spotReach: number;
  faculaReach: number;
  spots: Sunspot[];
}

const SPOT_SEED = 53;

/**
 * The sunspot groups on the Sun at a time (Julian years after J2000; game time, not the
 * animation's). Time is cut into slots a day and a half long; each may start a group, more often
 * the more active the cycle, at its latitude in either hemisphere, which lives 8 to 50 days,
 * growing quickly and fading slowly. A group is a big leading spot, a smaller following one
 * further from the equator (Joy's law) and a few pores between, drifting with the Sun's turn at
 * their latitude against its frame. Their sizes are made a little larger than life, to show.
 */
function sunspotGroups(years: number): SunspotGroup[] {
  const days = years * 365.25;
  const period = 1.5;
  const longest = 50;
  const groups: SunspotGroup[] = [];
  for (let k = Math.floor((days - longest) / period) - 1; k <= Math.floor(days / period); k++) {
    const born = (k + hash(k, 1, 0, SPOT_SEED)) * period;
    const cycle = solarCycle(born / 365.25);
    if (hash(k, 0, 0, SPOT_SEED) > 0.08 + 0.8 * cycle.activity) continue;
    const life = 8 + (longest - 8) * hash(k, 2, 0, SPOT_SEED) ** 1.5;
    const u = (days - born) / life;
    if (u < 0 || u >= 1) continue;
    const grown = u < 0.15 ? u / 0.15 : (1 - u) / 0.85;
    const size = (0.6 + 0.8 * hash(k, 3, 0, SPOT_SEED)) * Math.sqrt(grown);
    const side = hash(k, 4, 0, SPOT_SEED) < 0.5 ? 1 : -1;
    const lat = side * (cycle.latitude + (hash(k, 5, 0, SPOT_SEED) - 0.5) * 10);
    const lon = hash(k, 6, 0, SPOT_SEED) * 360 + (sunSpin(Math.sin((lat * Math.PI) / 180)) - CARRINGTON) * (days - born);
    const spread = 2 + 3 * hash(k, 7, 0, SPOT_SEED);
    const tilt = side * 0.25 * spread;
    // (east, poleward offset in degrees, umbra radius in degrees): leader, follower, pores.
    const parts: [number, number, number][] = [
      [spread, -tilt, 1.6 * size],
      [-spread, tilt, 1.1 * size],
      [0.6 * (hash(k, 8, 0, SPOT_SEED) - 0.5) * spread, 0.5 * tilt, 0.45 * size],
      [-0.5 * spread, 1.6 * tilt, 0.35 * size],
    ];
    const rad2 = (deg: number) => ((deg * Math.PI) / 180) ** 2;
    groups.push({
      at: sunPoint(lat, lon),
      spotReach: Math.cos(((spread + 4.2 * size + 1) * Math.PI) / 180),
      faculaReach: Math.cos(((spread + 4.2 * size + 7) * Math.PI) / 180),
      spots: parts.map(([e, n, umbra]) => ({ at: sunPoint(lat + n, lon + e), umbra: rad2(umbra), penumbra: rad2(umbra * 2.3) })),
    });
  }
  return groups;
}


/** The portrait's Sun frame: its pole up, turning as the IAU's prime meridian does. */
function sunPortraitOrient(years: number): Orient {
  const w = (((84.176 + CARRINGTON * years * 365.25) % 360) * Math.PI) / 180;
  const [c, s] = [Math.cos(w), Math.sin(w)];
  return ([x, y, z]) => [x * c - z * s, y, x * s + z * c];
}

/**
 * The Sun at a time in seconds (it is redrawn a few times a second), on its own turning globe:
 * game time (Julian years after J2000) sets its turn and its sunspots, orient turns view space
 * into its frame (bodyFrames.ts; the portrait's own if none is given). The disc churns with
 * granulation, darker and redder at the limb, with sunspot groups (dark umbrae in lighter
 * penumbrae, bright faculae round them towards the limb) as many as the cycle brings; tongues of
 * flame lick up off the limb; flares, a white flash in an active region that throws the flames
 * near it high when it is near the limb; and prominences, arches of glowing plasma that rise from
 * the limb, hang and fade. All in the palette's steps with ordered dithering, as pixel art.
 * Canvas sized by sunCanvasSize.
 */
export function drawSun(ctx: CanvasRenderingContext2D, r: number, t = 0, years = 30, orient: Orient | null = null): void {
  const size = ctx.canvas.width;
  const c = size / 2;
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const toBody = orient ?? sunPortraitOrient(years);
  const columns = [toBody([1, 0, 0]), toBody([0, 1, 0]), toBody([0, 0, 1])];
  const toView = (p: Vec3): Vec3 => [dot3(columns[0]!, p), dot3(columns[1]!, p), dot3(columns[2]!, p)];
  const groups = sunspotGroups(years);
  // Flares go off in the active regions we can see (or just past the limb), else anywhere.
  const shown = groups.map((g) => toView(g.at)).filter((v) => v[2] > -0.35);
  const flares = sunEvents(t, 2.6, [1.4, 2.6], 0.6, 77).map((f) => {
    let at: Vec3;
    if (shown.length) at = shown[Math.floor(f.spread * shown.length)]!;
    else {
      const rim = 0.55 + 0.4 * f.size;
      at = [Math.cos(f.angle) * rim, Math.sin(f.angle) * rim, Math.sqrt(1 - rim * rim)];
    }
    const glow = Math.sin(Math.PI * f.u);
    // Flames thrown up where the flare is near the limb (seen from the side), none from mid-disc.
    const limb = Math.max(0, Math.min(1, 1 - at[2] / 0.7)) * Math.max(0, Math.min(1, (at[2] + 0.35) / 0.35));
    return { x: at[0], y: at[1], z: at[2], angle: Math.atan2(at[1], at[0]), glow, throw: (0.3 + 0.35 * f.size) * glow * limb };
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
  // Nothing reaches past this (in radii): the flames' tallest outline with their tallest tongue,
  // or a prominence's top; the rest of the canvas is skipped.
  const flameTop = 0.44 + Math.max(0, ...flares.map((f) => f.throw));
  const reach = 1 + Math.max(flameTop * 1.65, flameTop + 0.2, ...prominences.map((p) => p.top * 1.2 + tube * 1.5));
  // Granulation churns: two layouts of the noise blended as time slides from one to the next.
  // Finer cells join in on a big, close disc, so its pixels stay busy.
  const churn = t * 0.7;
  const slice = Math.floor(churn);
  const blend = churn - slice;
  const fine = Math.max(0, Math.min(1, (r - 30) / 90));
  const cells = (p: Vec3, k: number) =>
    noise(p[0] * 5 + k * 17.3, p[1] * 5 + k * 5.1, p[2] * 5 + k * 9.7, 42) * 0.65 +
    noise(p[0] * 11 + k * 7.7, p[1] * 11 + k * 3.3, p[2] * 11 + k * 1.9, 43) * 0.35 +
    (fine > 0 ? fine * 0.3 * (noise(p[0] * 26 + k * 2.9, p[1] * 26 + k * 6.1, p[2] * 26 + k * 4.3, 47) - 0.5) : 0);
  // Flames grow finer tongues on a big disc too.
  const tongueFine = Math.max(0, Math.min(0.35, (r - 30) / 260));
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
      const dy = -(y + 0.5 - c) / r;
      const d = Math.hypot(dx, dy);
      if (d > reach) continue;
      const dither = BAYER[(y & 3) * 4 + (x & 3)]!;
      const o = (y * size + x) * 4;
      if (d < 1) {
        const mu = Math.sqrt(1 - d * d);
        const p = toBody([dx, dy, mu]);
        const granules = cells(p, slice) * (1 - blend) + cells(p, slice + 1) * blend;
        let heat = 0.84 - 0.45 * d * d * d + (granules - 0.5) * 0.3;
        for (const g of groups) {
          const near = dot3(p, g.at);
          if (near < g.faculaReach) continue;
          // Faculae: bright, showing towards the limb.
          heat += 0.2 * (1 - mu) * (0.6 + 0.4 * noise(p[0] * 30, p[1] * 30, p[2] * 30, 48));
          if (near < g.spotReach) continue;
          for (const spot of g.spots) {
            const chord = 2 * (1 - dot3(p, spot.at));
            if (chord < spot.umbra) heat -= 0.75;
            else if (chord < spot.penumbra) heat -= 0.3;
          }
        }
        for (const f of flares) {
          if (f.z <= 0) continue;
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
        if (f.throw <= 0) continue;
        const off = Math.atan2(Math.sin(angle - f.angle), Math.cos(angle - f.angle));
        height += f.throw * Math.exp(-((off / 0.2) ** 2));
      }
      let tongue = noise(ca * 9 + 40, sa * 9 + 40, (d - 1) * 5 - t * 1.6, 46);
      if (tongueFine > 0) tongue = tongue * (1 - tongueFine) + tongueFine * noise(ca * 23 + 60, sa * 23 + 60, (d - 1) * 12 - t * 2.4, 49);
      const q = (d - 1) / (height * (0.35 + 1.3 * tongue));
      if (q < 1) {
        const i = step(3.4 + q * 4.4 + dither * 1.5, 3, 7);
        set(o, SUN_PALETTE[i]!, FLAME_ALPHA[i]!);
      } else if (d < 1 + height + 0.2 && dither > 0.1) set(o, SUN_PALETTE[7]!, 60);
    }
  }
  ctx.putImageData(image, 0, 0);
}
