// Writes a contact sheet of councilor portraits as a PPM image, for checking the art outside
// the browser (convert with any image tool).
//
//   pnpm tsx tools/portrait-sheet.ts out.ppm [columns] [rows] [scale]

import { writeFileSync } from "node:fs";
import { baseContent } from "../src/content/index";
import { PORTRAIT_HEIGHT as H, PORTRAIT_WIDTH as W, renderPortrait } from "../src/app/portraits/portrait";

const [out = "portraits.ppm", colArg = "4", rowArg = "3", scaleArg = "2"] = process.argv.slice(2);
const cols = Number(colArg);
const rows = Number(rowArg);
const scale = Number(scaleArg);
const gap = 4;
const sheetW = cols * (W * scale + gap) + gap;
const sheetH = rows * (H * scale + gap) + gap;
const sheet = Buffer.alloc(sheetW * sheetH * 3, 8);
const professions = baseContent.professions.map((p) => p.id);
const colors = baseContent.factions.map((f) => f.color);

for (let i = 0; i < cols * rows; i++) {
  const seed = ((i + Number(process.env.SEED ?? 0) * 101) * 2654435761) >>> 1;
  const px = renderPortrait(seed, i % 2 ? "male" : "female", professions[i % professions.length]!, colors[i % colors.length]!);
  const ox = gap + (i % cols) * (W * scale + gap);
  const oy = gap + Math.floor(i / cols) * (H * scale + gap);
  for (let y = 0; y < H * scale; y++) {
    for (let x = 0; x < W * scale; x++) {
      const s = (Math.floor(y / scale) * W + Math.floor(x / scale)) * 4;
      const d = ((oy + y) * sheetW + ox + x) * 3;
      sheet[d] = px[s]!;
      sheet[d + 1] = px[s + 1]!;
      sheet[d + 2] = px[s + 2]!;
    }
  }
}
writeFileSync(out, Buffer.concat([Buffer.from(`P6 ${sheetW} ${sheetH} 255\n`), sheet]));
