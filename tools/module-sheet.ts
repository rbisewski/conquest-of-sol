// Writes a contact sheet of the hab modules' pixel art as a PNG, for checking the art outside
// the browser: one row per line of modules, its tiers (and automated variants) side by side.
//
//   pnpm tsx tools/module-sheet.ts out.png [size: 32|64|128] [scale] [line,line,…]

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { baseContent } from "../src/content/index";
import { moduleLine, paintModule } from "../src/app/ui/moduleArt";

const [out = "modules.png", sizeArg = "128", scaleArg = "1", only = ""] = process.argv.slice(2);
const size = Number(sizeArg) as 32 | 64 | 128;
const scale = Number(scaleArg);
const wanted = only ? new Set(only.split(",")) : null;

const rows = new Map<string, string[]>();
for (const m of baseContent.habModules) {
  const line = moduleLine(m.id);
  if (wanted && !wanted.has(line)) continue;
  rows.set(line, [...(rows.get(line) ?? []), m.id]);
}
const lines = [...rows.values()];
const cols = Math.max(...lines.map((ids) => ids.length));
// Two columns of rows, so the sheet stays roughly square.
const half = Math.ceil(lines.length / 2);
const cell = size * scale, gap = 4;
const sheetW = 2 * cols * (cell + gap) + gap * 3;
const sheetH = half * (cell + gap) + gap;
const sheet = Buffer.alloc(sheetW * sheetH * 4);
for (let i = 0; i < sheetW * sheetH; i++) sheet.set([8, 11, 18, 255], i * 4);
const colors = baseContent.factions.map((f) => f.color);

lines.forEach((ids, r) => {
  ids.forEach((id, c) => {
    const px = paintModule(id, colors[r % colors.length]!, size);
    const ox = gap + (r >= half ? cols * (cell + gap) + gap * 2 : 0) + c * (cell + gap);
    const oy = gap + (r % half) * (cell + gap);
    for (let y = 0; y < cell; y++)
      for (let x = 0; x < cell; x++) {
        const s = (Math.floor(y / scale) * size + Math.floor(x / scale)) * 4;
        if (px[s + 3]) sheet.set(px.subarray(s, s + 4), ((oy + y) * sheetW + ox + x) * 4);
      }
  });
});

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const b of body) crc = crcTable[(crc ^ b) & 255]! ^ (crc >>> 8);
  const head = Buffer.alloc(4), tail = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([head, body, tail]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(sheetW, 0);
header.writeUInt32BE(sheetH, 4);
header.set([8, 6, 0, 0, 0], 8);
const raw = Buffer.alloc((sheetW * 4 + 1) * sheetH);
for (let y = 0; y < sheetH; y++) sheet.copy(raw, y * (sheetW * 4 + 1) + 1, y * sheetW * 4, (y + 1) * sheetW * 4);
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
console.log(`${out}: ${lines.length} lines, ${sheetW}×${sheetH}`);
