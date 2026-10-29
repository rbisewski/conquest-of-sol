// Flags for Terra Invicta's breakaway nations, drawn here as small SVGs at flag-icons' 4:3
// (640 × 480). Real flags are simplified (Texas, Quebec, Kurdistan, Biafra, West Papua…);
// nations Terra Invicta invents get original designs. Where a real flag belongs to a party
// to a current war, a puppet state or an armed group, a neutral design stands in for it.
// Scotland, Wales, Catalonia and the Basque Country use flag-icons' own (see flags.ts).

export const W = 640;
export const H = 480;

export const rect = (x: number, y: number, w: number, h: number, fill: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
export const field = (fill: string) => rect(0, 0, W, H, fill);
export const circle = (cx: number, cy: number, r: number, fill: string) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
export const ring = (cx: number, cy: number, r: number, stroke: string, width: number) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${width}"/>`;
export const poly = (points: [number, number][], fill: string) => `<polygon points="${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}" fill="${fill}"/>`;

/** Equal horizontal stripes, top to bottom. */
export function hs(...colors: string[]): string {
  const h = H / colors.length;
  return colors.map((c, i) => rect(0, i * h, W, h + 0.5, c)).join("");
}

/** Equal vertical stripes, hoist to fly. */
export function vs(...colors: string[]): string {
  const w = W / colors.length;
  return colors.map((c, i) => rect(i * w, 0, w + 0.5, H, c)).join("");
}

/** Horizontal stripes with relative heights. */
export function bands(...parts: [string, number][]): string {
  const total = parts.reduce((s, [, n]) => s + n, 0);
  let y = 0;
  return parts
    .map(([c, n]) => {
      const h = (H * n) / total;
      const out = rect(0, y, W, h + 0.5, c);
      y += h;
      return out;
    })
    .join("");
}

/** A five-pointed star (or `points`-pointed), point up unless rotated. */
export function star(cx: number, cy: number, r: number, fill: string, points = 5, rotate = 0): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = ((-90 + rotate + (180 / points) * i) * Math.PI) / 180;
    const rr = i % 2 === 0 ? r : r * 0.4;
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
  }
  return poly(pts, fill);
}

/** A crescent opening toward the fly, cut out of `bg`. */
export const crescent = (cx: number, cy: number, r: number, fill: string, bg: string) => circle(cx, cy, r, fill) + circle(cx + r * 0.3, cy, r * 0.82, bg);

/** A triangle at the hoist, reaching `depth` into the flag. */
export const hoistTriangle = (fill: string, depth = 260) => poly([[0, 0], [depth, H / 2], [0, H]], fill);

/** A Nordic cross, offset toward the hoist. */
export function nordic(cross: string, width = 80, inner?: string, innerWidth = 40): string {
  const x = 200;
  const y = H / 2;
  let out = rect(x - width / 2, 0, width, H, cross) + rect(0, y - width / 2, W, width, cross);
  if (inner) out += rect(x - innerWidth / 2, 0, innerWidth, H, inner) + rect(0, y - innerWidth / 2, W, innerWidth, inner);
  return out;
}

/** A centred cross. */
export const cross = (fill: string, width = 80) => rect(W / 2 - width / 2, 0, width, H, fill) + rect(0, H / 2 - width / 2, W, width, fill);

/** A simplified Union Jack in a box (for Hawaii's canton). */
function unionJack(x: number, y: number, w: number, h: number): string {
  const d = (a: [number, number], b: [number, number], c: string, s: number) => `<line x1="${x + a[0] * w}" y1="${y + a[1] * h}" x2="${x + b[0] * w}" y2="${y + b[1] * h}" stroke="${c}" stroke-width="${s}"/>`;
  return (
    rect(x, y, w, h, "#012169") +
    d([0, 0], [1, 1], "#fff", h * 0.2) + d([1, 0], [0, 1], "#fff", h * 0.2) +
    d([0, 0], [1, 1], "#c8102e", h * 0.07) + d([1, 0], [0, 1], "#c8102e", h * 0.07) +
    rect(x + w * 0.42, y, w * 0.16, h, "#fff") + rect(x, y + h * 0.37, w, h * 0.26, "#fff") +
    rect(x + w * 0.45, y, w * 0.1, h, "#c8102e") + rect(x, y + h * 0.41, w, h * 0.18, "#c8102e")
  );
}

/** A simple conifer, for Cascadia and New England. */
const tree = (cx: number, base: number, h: number, fill: string) =>
  [0, 1, 2].map((i) => poly([[cx, base - h + (i * h) / 4], [cx - (h / 4) * (1 + i * 0.35), base - h / 2 + (i * h) / 4], [cx + (h / 4) * (1 + i * 0.35), base - h / 2 + (i * h) / 4]], fill)).join("") + rect(cx - h / 30, base - h / 4, h / 15, h / 4, fill);

/** Stripes radiating from a point, alternating two colours (Tibet's rays). */
function rays(cx: number, cy: number, count: number, a: string, b: string): string {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const t0 = Math.PI + (Math.PI * i) / count;
    const t1 = Math.PI + (Math.PI * (i + 1)) / count;
    const R = 900;
    out.push(poly([[cx, cy], [cx + R * Math.cos(t0), cy + R * Math.sin(t0)], [cx + R * Math.cos(t1), cy + R * Math.sin(t1)]], i % 2 ? b : a));
  }
  return out.join("");
}

const FLAGS: Record<string, string> = {
  // Aceh: red with black-and-white bands, a white crescent and star.
  ace: bands(["#000", 6], ["#fff", 2], ["#d21034", 32], ["#fff", 2], ["#000", 6]) + crescent(300, 240, 70, "#fff", "#d21034") + star(370, 240, 30, "#fff"),
  // Alaska: the Big Dipper and the North Star in gold on blue.
  aka: field("#0f204b") + [[110, 330], [170, 300], [215, 330], [270, 350], [300, 420], [390, 410], [400, 340]].map(([x, y]) => star(x!, y!, 18, "#ffb612")).join("") + star(510, 110, 30, "#ffb612"),
  // Ambazonia: blue and white stripes with a blue canton and a ring of stars.
  amb: hs("#1b3b8b", "#fff", "#1b3b8b", "#fff", "#1b3b8b", "#fff", "#1b3b8b", "#fff", "#1b3b8b") + rect(0, 0, 260, 213, "#1b3b8b") + Array.from({ length: 13 }, (_, i) => star(130 + 75 * Math.cos((i / 13) * 2 * Math.PI), 107 + 75 * Math.sin((i / 13) * 2 * Math.PI), 10, "#fff")).join(""),
  // Arewa (original): green with a white band and a green star.
  arw: hs("#0a7b3e", "#fff", "#0a7b3e") + star(320, 240, 55, "#0a7b3e"),
  // Assam (original): green, a red band, a white disc.
  asm: bands(["#1d7a3a", 2], ["#c8102e", 1], ["#1d7a3a", 2]) + circle(320, 240, 70, "#fff"),
  // Atlantic Union (original): navy with a white Nordic cross and a gold star.
  atl: field("#0b2a5b") + nordic("#fff", 70) + star(200, 240, 32, "#f2b632"),
  // Aztlán (original): deep red with a gold sun.
  atz: field("#7a1f1f") + circle(320, 240, 110, "#e8a33d") + circle(320, 240, 80, "#7a1f1f") + circle(320, 240, 55, "#e8a33d"),
  // Azawad: green, red and yellow with a black triangle at the hoist.
  aza: hs("#0a8f3c", "#d21034", "#f7d116") + hoistTriangle("#000", 240),
  // Azores: blue at the hoist, white, with an arc of nine gold stars.
  azo: field("#fff") + rect(0, 0, 250, H, "#0c4da2") + Array.from({ length: 9 }, (_, i) => star(445 + 120 * Math.cos(Math.PI * (0.15 + (0.7 * i) / 8) + Math.PI), 260 + 120 * Math.sin(Math.PI * (0.15 + (0.7 * i) / 8) + Math.PI), 14, "#e8b800")).join(""),
  // Bavaria: white and blue lozenges.
  bav: field("#fff") + Array.from({ length: 70 }, (_, i) => {
    const col = i % 10;
    const row = Math.floor(i / 10);
    const cx = col * 72 + (row % 2) * 36;
    const cy = row * 72;
    return poly([[cx, cy - 36], [cx + 36, cy], [cx, cy + 36], [cx - 36, cy]], "#0098d4");
  }).join(""),
  // Balochistan: red over blue, a green triangle with a white star.
  bch: hs("#d21034", "#1a4fa0") + hoistTriangle("#0a8f3c", 250) + star(85, 240, 40, "#fff"),
  // Beja Congress (original): blue, yellow and green with a white crescent.
  bej: hs("#1b5fa8", "#f0c419", "#21883e") + crescent(140, 240, 60, "#fff", "#f0c419"),
  // Bengal (original): green with an orange disc toward the hoist.
  bgl: field("#106b3c") + circle(280, 240, 120, "#f28c28"),
  // Biafra: red, black and green, a rising yellow sun on the black.
  bia: hs("#e00000", "#000", "#008751") + `<path d="M210 320 A110 110 0 0 1 430 320 Z" fill="#ffd700"/>` + Array.from({ length: 11 }, (_, i) => {
    const a = Math.PI + (Math.PI * (i + 0.5)) / 11;
    return poly([[320 + 118 * Math.cos(a - 0.07), 320 + 118 * Math.sin(a - 0.07)], [320 + 150 * Math.cos(a), 320 + 150 * Math.sin(a)], [320 + 118 * Math.cos(a + 0.07), 320 + 118 * Math.sin(a + 0.07)]], "#ffd700");
  }).join(""),
  // Borneo (original): green, yellow and blue with a white star.
  bor: hs("#147a3b", "#f2c200", "#1d5ba8") + star(320, 240, 50, "#fff"),
  // Brittany: the Gwenn-ha-du, black and white stripes with an ermine canton.
  brt: hs("#000", "#fff", "#000", "#fff", "#000", "#fff", "#000", "#fff", "#000") + rect(0, 0, 300, 213, "#fff") + [[50, 50], [130, 50], [210, 50], [90, 140], [170, 140], [250, 140]].map(([x, y]) => poly([[x!, y! - 25], [x! + 15, y! + 25], [x! - 15, y! + 25]], "#000")).join(""),
  // Buryatia: blue, white and yellow with a yellow emblem on the blue.
  bur: bands(["#0b6ab7", 2], ["#fff", 1], ["#f2c200", 1]) + circle(110, 120, 40, "#f2c200") + crescent(110, 60, 25, "#f2c200", "#0b6ab7"),
  // California: the Bear Flag, simplified.
  cal: field("#fff") + rect(0, 400, W, 80, "#b22234") + star(80, 80, 45, "#b22234") + `<path d="M180 330 Q190 270 260 260 Q330 230 400 250 Q440 240 460 270 L470 300 Q440 300 430 330 L400 330 L395 300 L300 300 L290 330 L260 330 L255 300 L220 330 Z" fill="#5a3a1a"/>` + rect(180, 340, 300, 10, "#6b8e23"),
  // Cape Republic (original): teal sky, a white Table Mountain, navy sea.
  cap: bands(["#1c8a8a", 3], ["#0c2c55", 2]) + poly([[80, 288], [180, 170], [460, 170], [560, 288]], "#fff"),
  // Chhattisgarh (original): saffron over green with a white disc.
  cha: hs("#f28c28", "#1d7a3a") + circle(320, 240, 75, "#fff"),
  // Caliphate (original, neutral): green with a white crescent and star, a gold border.
  cph: field("#c9a227") + rect(24, 24, W - 48, H - 48, "#0b6b3a") + crescent(290, 240, 110, "#fff", "#0b6b3a") + star(390, 240, 40, "#fff"),
  // Crimea: white, a wide blue band, red.
  crm: bands(["#fff", 1], ["#0057b7", 4], ["#d21034", 1]),
  // Canary Islands: white, blue and yellow.
  cry: vs("#fff", "#0768a9", "#fecb00"),
  // Dominion of America (original): navy with a large white star and red and white bars.
  csa: field("#13284f") + rect(0, 380, W, 50, "#fff") + rect(0, 430, W, 50, "#b22234") + star(320, 190, 120, "#fff"),
  // Cascadia: the "Doug" flag, blue, white and green with a fir tree.
  csd: hs("#00a3e0", "#fff", "#2e8b3a") + tree(320, 420, 340, "#2d2a26"),
  // Cyrenaica: black with a white crescent and star.
  cye: field("#000") + crescent(300, 240, 95, "#fff", "#000") + star(385, 240, 38, "#fff"),
  // Darfur (original): gold with a green band and a green star.
  dar: bands(["#c8902e", 2], ["#2e7d32", 1], ["#c8902e", 2]) + star(110, 100, 45, "#2e7d32"),
  // Donetsk (neutral): coal black under a steel-blue sky, with a gold star.
  don: bands(["#46637f", 3], ["#1c1c1c", 2]) + star(320, 160, 60, "#e8b400"),
  // Dravida Nadu: black over red.
  dvd: hs("#000", "#d21034"),
  // East Turkestan: sky blue with a white crescent and star.
  etk: field("#55a5d9") + crescent(260, 240, 120, "#fff", "#55a5d9") + star(360, 240, 50, "#fff"),
  // Free Amazonas (original): green with a winding blue river and a yellow star.
  fam: field("#1a7f37") + `<path d="M0 300 Q160 200 320 300 T640 300 L640 360 Q480 260 320 360 T0 360 Z" fill="#2f78c4"/>` + star(500, 130, 50, "#f4d03f"),
  // First Nation (original): turquoise with a red sun.
  fnt: field("#1b9aaa") + circle(320, 240, 110, "#c0392b") + ring(320, 240, 140, "#fff", 12),
  // Fujian (original): red with a white wave and a gold star.
  fuj: field("#c8102e") + `<path d="M0 330 Q160 280 320 330 T640 330 L640 380 Q480 330 320 380 T0 380 Z" fill="#fff"/>` + star(320, 170, 70, "#ffd100"),
  // Guangxi (original): green with a gold bronze drum.
  gax: field("#1e7b44") + ring(320, 240, 120, "#e3b23c", 20) + ring(320, 240, 70, "#e3b23c", 14) + star(320, 240, 35, "#e3b23c", 12),
  // Greenland: white over red with a counterchanged disc.
  grl: hs("#fff", "#d00c33") + `<path d="M145 240 A105 105 0 0 1 355 240 Z" fill="#d00c33"/><path d="M145 240 A105 105 0 0 0 355 240 Z" fill="#fff"/>`,
  // Liangguang (original): red over blue with a white kapok flower.
  gua: hs("#c8102e", "#1d3f8f") + star(320, 240, 85, "#fff", 5) + circle(320, 240, 25, "#c8102e"),
  // Gujarat (original): saffron with a green bar and a white disc.
  guj: field("#f39c12") + rect(0, 380, W, 100, "#1d7a3a") + circle(320, 200, 80, "#fff"),
  // Gwalior (original): orange over red with a yellow sun.
  gwa: hs("#f28c28", "#b3261e") + star(320, 240, 90, "#ffd54f", 16),
  // Hawaii: the Union Jack canton and eight white, red and blue stripes.
  haw: hs("#fff", "#c8102e", "#012169", "#fff", "#c8102e", "#012169", "#fff", "#c8102e") + unionJack(0, 0, 300, 240),
  // Hong Kong: red with a white bauhinia.
  hko: field("#de2910") + Array.from({ length: 5 }, (_, i) => `<ellipse cx="320" cy="170" rx="38" ry="75" fill="#fff" transform="rotate(${i * 72} 320 240)"/>`).join("") + circle(320, 240, 14, "#de2910"),
  // Hunan (original): yellow with a red flower.
  hnn: field("#f2c200") + star(320, 240, 110, "#c8102e", 6) + circle(320, 240, 40, "#f2c200"),
  // Hyderabad (original): yellow with a white disc.
  hyd: field("#e8c300") + circle(320, 240, 110, "#fff") + circle(320, 240, 60, "#e8c300"),
  // Ingria: yellow with a blue Nordic cross and a red one inside it.
  ing: field("#ffd100") + nordic("#0057b7", 120, "#d21034", 50),
  // Jaipur: the five-coloured Panchranga.
  jai: hs("#c8102e", "#ffd100", "#1d7a3a", "#1d4fa0", "#000"),
  // Jefferson: green with a gold double X.
  jef: field("#1d6b3a") + `<g stroke="#e3b23c" stroke-width="40"><line x1="170" y1="140" x2="290" y2="340"/><line x1="290" y1="140" x2="170" y2="340"/><line x1="350" y1="140" x2="470" y2="340"/><line x1="470" y1="140" x2="350" y2="340"/></g>`,
  // Kachin-Arakan (original): red over green with a white diamond.
  kac: hs("#c8102e", "#1d7a3a") + poly([[320, 140], [400, 240], [320, 340], [240, 240]], "#fff"),
  // Kaliningrad (original): blue with a white wave and a gold crown.
  kal: field("#1d4fa0") + rect(0, 290, W, 60, "#fff") + poly([[240, 230], [250, 140], [290, 190], [320, 120], [350, 190], [390, 140], [400, 230]], "#e8b400"),
  // Karelia: red, blue and green.
  kar: hs("#d21034", "#0057b7", "#0a8f3c"),
  // Katanga: red with a white diagonal and a green corner.
  kat: field("#d21034") + poly([[640, 0], [640, 300], [340, 0]], "#008751") + `<line x1="0" y1="480" x2="640" y2="0" stroke="#fff" stroke-width="110"/>`,
  // Keo Deudai (original): ochre with a black band and a yellow sun.
  keo: bands(["#000", 1], ["#b5532b", 2]) + circle(320, 240, 90, "#ffd100"),
  // Khalistan (simplified): saffron with a blue emblem.
  kha: field("#ff9933") + ring(320, 240, 90, "#0b3d91", 22) + rect(305, 110, 30, 260, "#0b3d91"),
  // Khuzestan (original): white, green and red with a white star on the green.
  khu: hs("#fff", "#0a8f3c", "#d21034") + star(320, 240, 50, "#fff"),
  // Komi: blue, green and white.
  kom: hs("#0057b7", "#0a8f3c", "#fff"),
  // Kurdistan: red, white and green with a golden sun of 21 rays.
  krd: hs("#ed2024", "#fff", "#278e43") + star(320, 240, 95, "#febd11", 21) + circle(320, 240, 45, "#febd11"),
  // Karakalpakstan: blue, yellow and green with a white crescent and stars.
  krk: hs("#0099b5", "#f2c200", "#1eb53a") + crescent(70, 80, 40, "#fff", "#0099b5") + [140, 180, 220, 260, 300].map((x) => star(x, 80, 12, "#fff")).join(""),
  // Jammu and Kashmir: red with three white bars at the hoist.
  ksh: field("#c8102e") + [50, 110, 170].map((x) => rect(x, 0, 30, H, "#fff")).join("") + `<path d="M330 300 L520 300 L470 340 L360 340 Z" fill="#fff"/>`,
  // Lunda-Tchokwé (original): brown with white stars.
  lnt: field("#7b4b2a") + star(200, 240, 55, "#fff") + star(320, 240, 55, "#fff") + star(440, 240, 55, "#fff"),
  // Logone (original): green over blue with a yellow river.
  log: hs("#1d7a3a", "#1d4fa0") + `<path d="M0 250 Q160 200 320 250 T640 250 L640 230 Q480 180 320 230 T0 230 Z" fill="#ffd100"/>`,
  // Maharashtra: saffron (the Bhagwa).
  mah: field("#ff7f00") + poly([[640, 0], [640, 480], [520, 240]], "#fff"),
  // Mordovia: red, white and blue with a red sun.
  mrd: hs("#b3261e", "#fff", "#0b4ea2") + star(320, 240, 60, "#b3261e", 8),
  // Mindanao (original): green with a white crescent and a red band.
  min: field("#0b7a3b") + rect(0, 360, W, 60, "#c8102e") + crescent(300, 200, 90, "#fff", "#0b7a3b") + star(380, 200, 35, "#fff"),
  // Manchuria (original): yellow with a blue band and a white star.
  mnc: field("#f2c200") + rect(0, 180, W, 120, "#1d4fa0") + star(320, 240, 50, "#fff"),
  // Mombasa Republic (original): blue, white and green.
  mom: hs("#1d6fb8", "#fff", "#1d7a3a") + poly([[280, 260], [360, 260], [340, 290], [300, 290]], "#c8102e"),
  // Mysore: yellow over red, the Kannada flag.
  mso: hs("#ffd700", "#c8102e"),
  // North Caucasus Federation (original): green with a white band and a ring of gold stars.
  ncf: field("#1a6b3a") + rect(0, 210, W, 60, "#fff") + Array.from({ length: 7 }, (_, i) => star(320 + 150 * Math.cos((i / 7) * 2 * Math.PI - Math.PI / 2), 240 + 150 * Math.sin((i / 7) * 2 * Math.PI - Math.PI / 2), 20, "#e8b400")).join(""),
  // New Caledonia: the Kanak flag, blue, red and green with a yellow disc.
  ncl: hs("#0035ad", "#e4003b", "#00a259") + circle(240, 240, 120, "#000") + circle(240, 240, 108, "#ffd700") + rect(232, 160, 16, 160, "#000"),
  // Northern Assembly (original): green with a white rose.
  nen: field("#1e5631") + star(320, 240, 100, "#fff", 5) + circle(320, 240, 45, "#fff") + circle(320, 240, 18, "#e8b400"),
  // Nubia (original): gold with a blue Nile.
  nub: field("#c79a3a") + `<path d="M260 0 Q360 120 280 240 T320 480 L380 480 Q340 360 340 240 T320 0 Z" fill="#1f5fa8"/>`,
  // Occitania: red with the gold cross of Toulouse.
  oct: field("#d21034") + cross("#fcd116", 60) + [[320, 60], [320, 420], [140, 240], [500, 240]].map(([x, y]) => circle(x!, y!, 30, "#fcd116")).join("") + star(560, 80, 30, "#fcd116", 7),
  // Odisha (original): saffron with a white wheel.
  odi: field("#f39c12") + ring(320, 240, 100, "#fff", 18) + star(320, 240, 100, "#fff", 12) + circle(320, 240, 25, "#f39c12"),
  // Ogaden (original): light blue over green, a red triangle and a white star.
  oga: hs("#3d9be9", "#1d7a3a") + hoistTriangle("#d21034", 220) + star(80, 240, 40, "#fff"),
  // Padania: white with the green Sun of the Alps.
  pad: field("#fff") + ring(320, 240, 140, "#009246", 22) + Array.from({ length: 6 }, (_, i) => `<ellipse cx="320" cy="180" rx="28" ry="60" fill="#009246" transform="rotate(${i * 60} 320 240)"/>`).join(""),
  // Patagonia (original): light blue with white mountains and the Southern Cross.
  pat: field("#6cace4") + poly([[0, 480], [180, 280], [280, 380], [420, 220], [640, 480]], "#fff") + [[480, 70], [540, 120], [480, 160], [430, 115], [505, 125]].map(([x, y], i) => star(x!, y!, i === 4 ? 10 : 18, "#fff")).join(""),
  // Pacific Federation (original): blue with a white wave and gold stars.
  pcf: field("#123d7a") + `<path d="M0 330 Q160 270 320 330 T640 330 L640 400 Q480 340 320 400 T0 400 Z" fill="#fff"/>` + [180, 320, 460].map((x) => star(x, 170, 40, "#e8b400")).join(""),
  // Péyi Guyane: yellow over green on the diagonal, with a red star.
  pgn: field("#078930") + poly([[0, 0], [640, 0], [0, 480]], "#fcdd09") + star(320, 240, 80, "#da121a"),
  // Puerto Rico: red and white stripes, a blue triangle with a white star.
  pro: hs("#ed0000", "#fff", "#ed0000", "#fff", "#ed0000") + hoistTriangle("#0050f0", 360) + star(115, 240, 55, "#fff"),
  // Quebec: the Fleurdelisé, white cross and lilies on blue.
  qub: field("#003da5") + cross("#fff", 96) + [[160, 120], [480, 120], [160, 360], [480, 360]].map(([x, y]) => poly([[x!, y! - 50], [x! + 22, y!], [x!, y! + 40], [x! - 22, y!]], "#fff") + rect(x! - 35, y! + 8, 70, 12, "#fff")).join(""),
  // Rio Bravo (original): green and white with a blue river.
  rio: hs("#1d7a3a", "#fff") + `<path d="M0 260 Q160 210 320 260 T640 260 L640 300 Q480 250 320 300 T0 300 Z" fill="#1f5fa8"/>`,
  // Lakota: red with a white ring of tipis.
  rlk: field("#b3261e") + Array.from({ length: 7 }, (_, i) => {
    const a = (i / 7) * 2 * Math.PI - Math.PI / 2;
    const x = 320 + 140 * Math.cos(a);
    const y = 240 + 140 * Math.sin(a);
    return poly([[x, y - 30], [x + 22, y + 22], [x - 22, y + 22]], "#fff");
  }).join(""),
  // Republic of the South Moluccas: blue, white and green stripes at the hoist, then red.
  rmo: field("#d21034") + rect(0, 0, 60, H, "#0b4ea2") + rect(60, 0, 60, H, "#fff") + rect(120, 0, 60, H, "#0a8f3c"),
  // New Afrika: red, black and green.
  rna: hs("#c8102e", "#000", "#008751"),
  // New England: red with a green pine in a white canton.
  rne: field("#c8102e") + rect(0, 0, 250, 220, "#fff") + tree(125, 205, 180, "#1d6b3a"),
  // Ainu (original): blue with a white chevron and a red bar.
  roa: field("#1d4fa0") + poly([[200, 330], [320, 150], [440, 330], [400, 330], [320, 210], [240, 330]], "#fff") + rect(220, 360, 200, 24, "#c8102e"),
  // Rostovskaya: blue, yellow and red.
  ros: vs("#1d4fa0", "#ffd100", "#c8102e"),
  // West Papua: the Morning Star, blue and white stripes with a red hoist and a white star.
  rwp: hs("#fff", "#0b4ea2", "#fff", "#0b4ea2", "#fff", "#0b4ea2", "#fff", "#0b4ea2", "#fff", "#0b4ea2", "#fff", "#0b4ea2", "#fff") + rect(0, 0, 200, H, "#d21034") + star(100, 240, 60, "#fff"),
  // Ryukyu (original): white with a blue wave and a red sun.
  ryu: field("#fff") + `<path d="M0 360 Q160 300 320 360 T640 360 L640 480 L0 480 Z" fill="#1d4fa0"/>` + circle(320, 200, 90, "#c8102e"),
  // Sahrawi: black, white and green, a red triangle, a red crescent and star.
  sah: hs("#000", "#fff", "#007a3d") + hoistTriangle("#c4111b", 240) + crescent(320, 240, 50, "#c4111b", "#fff") + star(350, 240, 22, "#c4111b"),
  // Sakha: light blue with a white sun and thin white, red and green bands.
  sak: bands(["#6cace4", 30], ["#fff", 2], ["#d21034", 2], ["#0a8f3c", 6]) + circle(320, 170, 85, "#fff"),
  // São Paulo: black and white stripes with a red canton and a white disc.
  sao: hs("#000", "#fff", "#000", "#fff", "#000", "#fff", "#000", "#fff", "#000", "#fff", "#000", "#fff", "#000") + rect(0, 0, 260, 222, "#c8102e") + circle(130, 111, 70, "#fff") + circle(130, 111, 40, "#1d4fa0"),
  // Sichuan (original): red with a gold ring of 18 stars.
  sch: field("#c8102e") + Array.from({ length: 18 }, (_, i) => star(320 + 150 * Math.cos((i / 18) * 2 * Math.PI), 240 + 150 * Math.sin((i / 18) * 2 * Math.PI), 13, "#ffd100")).join("") + circle(320, 240, 60, "#ffd100"),
  // Shaangan (original): yellow over red with a black star.
  shg: hs("#f2c200", "#b3261e") + star(320, 240, 70, "#000"),
  // Siberia: white over green on the diagonal.
  sib: field("#0a8f3c") + poly([[0, 0], [640, 0], [0, 480]], "#fff"),
  // Sicily: red and yellow on the diagonal with a white disc.
  sic: field("#fcdd09") + poly([[0, 0], [640, 0], [0, 480]], "#d21034") + circle(320, 240, 90, "#fff") + star(320, 240, 60, "#d21034", 3),
  // Upper Silesia: yellow over blue.
  sil: hs("#ffd100", "#0b4ea2"),
  // Sindh (original): red with a blue bar and a white crescent and star.
  sin: field("#b3261e") + rect(0, 0, 140, H, "#0b3d91") + crescent(350, 240, 90, "#fff", "#b3261e") + star(440, 240, 35, "#fff"),
  // South Peru (original): sky blue with a gold sun.
  spe: field("#6cace4") + star(320, 240, 120, "#e8b400", 16) + circle(320, 240, 70, "#e8b400"),
  // Rio Grande do Sul (Sul Brazil): green, red and yellow on the diagonal.
  sub: field("#ffd100") + poly([[0, 0], [400, 0], [0, 300]], "#009c3b") + `<line x1="0" y1="480" x2="640" y2="0" stroke="#d21034" stroke-width="110"/>`,
  // Sumatra (original): green, yellow and red.
  sum: hs("#1d7a3a", "#f2c200", "#c8102e"),
  // Republic of Vietnam: yellow with three red stripes.
  rvn: field("#ffd100") + rect(0, 180, W, 30, "#da251d") + rect(0, 225, W, 30, "#da251d") + rect(0, 270, W, 30, "#da251d"),
  // Tatarstan: green, a thin white band, red.
  tar: bands(["#0a8f3c", 7], ["#fff", 1], ["#d21034", 7]),
  // Tibet (simplified): red and blue rays from a white mountain, a yellow sun and border.
  tbt: field("#ffd100") + `<g transform="translate(24 24) scale(0.925 0.9)">${field("#0b4ea2")}${rays(320, 330, 12, "#d21034", "#0b4ea2")}${poly([[120, 480], [320, 300], [520, 480]], "#fff")}${star(320, 250, 60, "#ffd100", 16)}${circle(320, 250, 35, "#ffd100")}</g>`,
  // Te Waipounamu (original): blue with white mountains and red stars of the Southern Cross.
  tew: field("#0b3d91") + poly([[0, 480], [160, 300], [260, 390], [400, 240], [640, 480]], "#fff") + [[470, 70], [530, 120], [470, 165], [420, 115]].map(([x, y]) => star(x!, y!, 20, "#c8102e")).join(""),
  // Texas: blue at the hoist with a white star, white over red.
  tex: hs("#fff", "#bf0a30") + rect(0, 0, 213, H, "#002868") + star(107, 240, 80, "#fff"),
  // Tigray: red with a yellow star and band.
  tig: field("#d21034") + rect(0, 300, W, 50, "#ffd100") + star(160, 150, 70, "#ffd100"),
  // Transylvania: blue, red and yellow.
  tra: hs("#0b4ea2", "#d21034", "#ffd100"),
  // United Northeast Brazil (after Pernambuco's flag): blue over white, a rainbow, a star and a cross.
  unb: hs("#0b4ea2", "#fff") + `<path d="M230 200 A90 90 0 0 1 410 200" fill="none" stroke="#e8b400" stroke-width="14"/><path d="M245 200 A75 75 0 0 1 395 200" fill="none" stroke="#0a8f3c" stroke-width="14"/><path d="M260 200 A60 60 0 0 1 380 200" fill="none" stroke="#d21034" stroke-width="14"/>` + star(320, 110, 30, "#e8b400") + rect(310, 280, 20, 120, "#d21034") + rect(270, 310, 100, 20, "#d21034"),
  // Ural Republic (original): dark green, white and dark green with a gold star.
  url: bands(["#1d5a3a", 2], ["#fff", 1], ["#1d5a3a", 2]) + star(110, 100, 50, "#e8b400"),
  // Waziristan (original): green over black with a white crescent.
  waz: hs("#1d7a3a", "#000") + crescent(300, 240, 90, "#fff", "#1d7a3a"),
  // Western Canada (original): blue with gold and green bands.
  wca: bands(["#1d4fa0", 3], ["#e8b400", 1], ["#1d7a3a", 1]) + star(320, 150, 60, "#fff"),
  // Westralia (original): blue with a gold disc and a black swan.
  wes: field("#0b3d91") + circle(440, 240, 120, "#ffd100") + `<path d="M380 300 Q420 250 470 280 Q500 240 480 200 Q470 180 490 175 Q500 210 500 260 Q480 320 380 300 Z" fill="#000"/>`,
  // West Germany (original): the Hanseatic red and white with a black bar.
  wga: hs("#c8102e", "#fff") + rect(0, 220, W, 40, "#000"),
  // Huanan / Wu (original): blue with a white wave and a red sun.
  wur: field("#1d4fa0") + `<path d="M0 330 Q160 280 320 330 T640 330 L640 390 Q480 340 320 390 T0 390 Z" fill="#fff"/>` + circle(320, 180, 80, "#d21034"),
  // Yucatán: green at the hoist with five white stars, red, white and red.
  yuc: hs("#ce1126", "#fff", "#ce1126") + rect(0, 0, 220, H, "#006341") + [96, 168, 240, 312, 384].map((y) => star(110, y, 26, "#fff")).join(""),
  // Yungui (original): green and yellow on the diagonal with a red star.
  yun: field("#f2c200") + poly([[0, 0], [640, 0], [0, 480]], "#1d7a3a") + star(320, 240, 70, "#c8102e"),
  // Zanzibar: blue, black and green with a small canton.
  zan: bands(["#1eb4e8", 3], ["#000", 1], ["#1d7a3a", 3]) + rect(0, 0, 180, 135, "#1d7a3a") + poly([[0, 135], [180, 0], [180, 135]], "#1eb4e8") + `<line x1="0" y1="135" x2="180" y2="0" stroke="#000" stroke-width="22"/>`,
};

const urls = new Map<string, string>();

/** A data URL for a flag drawn at 640 × 480, cached by key. */
export function svgFlagUrl(key: string, body: string): string {
  let url = urls.get(key);
  if (!url) {
    url = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${body}</svg>`)}`;
    urls.set(key, url);
  }
  return url;
}

/** A data URL for a breakaway nation's flag, or null if it has none drawn here. */
export function breakawayFlagUrl(nationId: string): string | null {
  const body = FLAGS[nationId];
  return body ? svgFlagUrl(nationId, body) : null;
}
