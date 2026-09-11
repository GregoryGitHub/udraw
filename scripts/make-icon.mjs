// Generates a placeholder 1024x1024 PNG source for `tauri icon`.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const S = 1024;
const px = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const t = y / S;
    // rounded-corner mask
    const r = 180;
    const dx = Math.min(x, S - 1 - x);
    const dy = Math.min(y, S - 1 - y);
    const outside =
      dx < r && dy < r && (r - dx) ** 2 + (r - dy) ** 2 > r * r;
    px[i] = Math.round(99 + 40 * t);
    px[i + 1] = Math.round(102 + 30 * t);
    px[i + 2] = Math.round(241 - 20 * t);
    px[i + 3] = outside ? 0 : 255;
  }
}
// white "u" glyph block
for (let y = 380; y < 660; y++) {
  for (let x = 330; x < 694; x++) {
    const inStem = (x < 420 || x > 604) && y < 600;
    const inBowl = y >= 560 && y < 650;
    if (!inStem && !inBowl) continue;
    const i = (y * S + x) * 4;
    px[i] = px[i + 1] = px[i + 2] = 255;
    px[i + 3] = 255;
  }
}

const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crcTable = (chunk.table ??= (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let c = -1;
  for (const b of body) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  const crc = Buffer.alloc(4);
  crc.writeInt32BE(c ^ -1);
  return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;
ihdr[9] = 6;

writeFileSync(
  process.argv[2] ?? "app-icon.png",
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);
console.log("wrote", process.argv[2] ?? "app-icon.png");
