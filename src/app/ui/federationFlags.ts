// Flags for federations, at flag-icons' 4:3 (640 × 480). Real organisations use flag-icons'
// own (European Union, Arab League, ASEAN, East African Community); historical unions are
// simplified (Central America, Gran Colombia, the Amazigh flag for Tamazgha); the rest of
// Terra Invicta's union names get original designs. Any other federation gets a generic
// design whose colours come from its name.

import { bands, circle, crescent, field, H, hoistTriangle, hs, nordic, poly, rect, ring, star, svgFlagUrl, vs, W } from "./breakawayFlags";

/** Federation name → flag-icons file code. */
const OFFICIAL: Record<string, string> = {
  "European Union": "eu",
  "United Arab League": "arab",
  "Southeast Asian Alliance": "asean",
  "East African Federation": "eac",
};

const files = import.meta.glob<string>("/node_modules/flag-icons/flags/4x3/{eu,arab,asean,eac}.svg", { eager: true, query: "?url", import: "default" });

/** `count` stars evenly around a circle, the first at the top. */
function starRing(cx: number, cy: number, r: number, count: number, size: number, fill: string): string {
  return Array.from({ length: count }, (_, i) => {
    const a = (2 * Math.PI * i) / count - Math.PI / 2;
    return star(cx + r * Math.cos(a), cy + r * Math.sin(a), size, fill);
  }).join("");
}

const wave = (y: number, fill: string) => `<path d="M0 ${y} Q160 ${y - 50} 320 ${y} T640 ${y} L640 ${y + 60} Q480 ${y + 10} 320 ${y + 60} T0 ${y + 60} Z" fill="${fill}"/>`;

const FLAGS: Record<string, string> = {
  // Eurasian Union (original): blue over white with a gold ring and star.
  "Eurasian Union": bands(["#1c4f9c", 2], ["#fff", 1]) + ring(320, 170, 95, "#e9bd4c", 22) + star(320, 170, 48, "#e9bd4c"),
  // African Union (original): green with a gold sun and a green star.
  "African Union": field("#1d7a3a") + circle(320, 240, 130, "#f2c200") + star(320, 240, 80, "#1d7a3a"),
  // Central American Confederation: the Federal Republic of Central America's blue and white, its emblem as a green triangle.
  "Central American Confederation": hs("#0b5fb0", "#fff", "#0b5fb0") + poly([[320, 175], [380, 285], [260, 285]], "#3d9b35"),
  // Central Asian Union (original): sky blue with a red bar at the hoist and a rayed gold sun.
  "Central Asian Union": field("#00a3dd") + rect(0, 0, 110, H, "#c8102e") + star(375, 240, 125, "#f2c200", 16) + circle(375, 240, 65, "#f2c200"),
  // Gran Colombia: the 1821 yellow, blue and red, with three stars for its founding states.
  "Gran Colombia": bands(["#fcd116", 2], ["#003893", 1], ["#ce1126", 1]) + [220, 320, 420].map((x) => star(x, 300, 26, "#fff")).join(""),
  // Great Bantu Free State (original): green, black and gold with a white star.
  "Great Bantu Free State": vs("#1d7a3a", "#000", "#f2c200") + star(320, 240, 72, "#fff"),
  // Nigerian Confederation (original): green with a white band and a green ring.
  "Nigerian Confederation": field("#008751") + rect(0, 170, W, 140, "#fff") + ring(320, 240, 52, "#008751", 18),
  // Nordic Federation (original): forest green with a white and red Nordic cross.
  "Nordic Federation": field("#14532d") + nordic("#fff", 80, "#c8102e", 40),
  // Pacific Defense League (original): navy with a red sun over a white wave.
  "Pacific Defense League": field("#0b2545") + circle(320, 190, 95, "#c8102e") + wave(330, "#fff"),
  // Pan-Asian Combine (original): red with a gold star ringed by five smaller ones.
  "Pan-Asian Combine": field("#b81d24") + star(320, 240, 85, "#f2c200") + starRing(320, 240, 165, 5, 26, "#f2c200"),
  // Peruvian Confederation (original): red with a white disc and three red stars.
  "Peruvian Confederation": field("#c8102e") + circle(320, 240, 120, "#fff") + [250, 320, 390].map((x) => star(x, 240, 28, "#c8102e")).join(""),
  // Republic of the Southern Cross (original): navy with the Southern Cross over a gold band.
  "Republic of the Southern Cross":
    field("#0b2a5b") + star(320, 90, 34, "#fff", 7) + star(320, 330, 38, "#fff", 7) + star(230, 200, 30, "#fff", 7) + star(410, 180, 30, "#fff", 7) + star(360, 250, 16, "#fff", 5) + rect(0, 410, W, 70, "#e9bd4c"),
  // Slavic Commonwealth (original): the pan-Slavic blue, white and red with a gold ring.
  "Slavic Commonwealth": hs("#1c4f9c", "#fff", "#c8102e") + ring(320, 240, 90, "#e9bd4c", 24),
  // South American Union (original): green, gold and blue with a white star.
  "South American Union": bands(["#0b6e4f", 1], ["#f2c200", 1], ["#1c4f9c", 1]) + star(320, 240, 75, "#fff"),
  // Tamazgha: the Amazigh flag, blue, green and yellow with a red yaz.
  Tamazgha:
    bands(["#0090da", 1], ["#38a800", 1], ["#ffe500", 1]) +
    `<path d="M320 110 V370 M245 140 Q320 215 395 140 M245 340 Q320 265 395 340" stroke="#e1001a" stroke-width="30" fill="none" stroke-linecap="round"/>`,
  // Turkestan (original): teal with a white crescent and star.
  Turkestan: field("#2a7d8c") + crescent(270, 240, 105, "#fff", "#2a7d8c") + star(375, 240, 42, "#fff"),
  // United Malay Nation (original): red and white with a navy canton, a gold crescent and star.
  "United Malay Nation": hs("#c8102e", "#fff", "#c8102e", "#fff") + rect(0, 0, 280, 240, "#0b2a5b") + crescent(110, 120, 70, "#f2c200", "#0b2a5b") + star(185, 120, 32, "#f2c200"),
  // United States of North America (original): seven stripes and a navy canton with a ring of stars.
  "United States of North America": hs("#b22234", "#fff", "#b22234", "#fff", "#b22234", "#fff", "#b22234") + rect(0, 0, 300, 260, "#3c3b6e") + starRing(150, 130, 80, 13, 14, "#fff"),
  // Sahel Confederation (original): ochre, terracotta and green with a gold sun.
  "Sahel Confederation": bands(["#d4a017", 1], ["#c1440e", 1], ["#1d7a3a", 1]) + circle(320, 240, 70, "#f2c200") + ring(320, 240, 70, "#7a2e0e", 10),
  // Southern Africa Federation (original): green with gold and black at the hoist and a white star.
  "Southern Africa Federation": field("#007a4d") + hoistTriangle("#f2c200", 300) + hoistTriangle("#000", 240) + star(80, 240, 40, "#fff"),
};

const PALETTE: [string, string][] = [
  ["#1c4f9c", "#e9bd4c"],
  ["#14532d", "#fff"],
  ["#7a1f2b", "#e9bd4c"],
  ["#0b2545", "#9ec5e8"],
  ["#4b2a7b", "#fff"],
  ["#00616b", "#f2c200"],
];

/** A federation with no flag of its own: a field, a band and a ring of 5–8 stars, chosen by its name. */
function generic(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const [bg, fg] = PALETTE[hash % PALETTE.length]!;
  return field(bg) + rect(0, H - 110, W, 70, fg) + starRing(W / 2, 175, 105, 5 + ((hash >>> 8) % 4), 24, fg);
}

/** URL of a federation's flag (4:3). */
export function federationFlagUrl(name: string): string {
  const official = OFFICIAL[name];
  const url = official ? files[`/node_modules/flag-icons/flags/4x3/${official}.svg`] : undefined;
  return url ?? svgFlagUrl(`federation:${name}`, FLAGS[name] ?? generic(name));
}
