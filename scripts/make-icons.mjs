// Draws the app icons (a light/dark checker with a dark disc) as PNGs; run: node scripts/make-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};

function png(size) {
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);
  const cell = size / 8, c = size / 2, r = size * 0.3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dark = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 1;
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      let rgb = dark ? [0x76, 0x96, 0x56] : [0xee, 0xee, 0xd2];
      if (d < r) rgb = [0x2b, 0x2b, 0x2b];
      else if (d < r + size * 0.03) rgb = [0xf2, 0xc1, 0x4e];
      raw.set(rgb, y * stride + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [["icon-192", 192], ["icon-512", 512], ["apple-touch-icon", 180]]) {
  writeFileSync(new URL(`../public/${name}.png`, import.meta.url), png(size));
}
