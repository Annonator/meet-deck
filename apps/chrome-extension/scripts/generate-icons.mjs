import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";

const SIZES = [16, 32, 48, 128];
const GLYPHS = {
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"]
};

export async function generateIcons(outputRoot) {
  const iconRoot = path.join(outputRoot, "icons");
  await mkdir(iconRoot, { recursive: true });
  await Promise.all(
    SIZES.map((size) => writeFile(path.join(iconRoot, `icon-${size}.png`), renderIcon(size)))
  );
}

function renderIcon(size) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  const radius = size * 0.22;
  const glyphScale = Math.max(1, Math.floor(size / 16));
  const glyphWidth = 5 * glyphScale;
  const gap = glyphScale;
  const textWidth = glyphWidth * 2 + gap;
  const textHeight = 7 * glyphScale;
  const textX = Math.floor((size - textWidth) / 2);
  const textY = Math.floor((size - textHeight) / 2);

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1);
    rows[rowOffset] = 0;
    for (let x = 0; x < size; x += 1) {
      const pixelOffset = rowOffset + 1 + x * 4;
      if (!insideRoundedSquare(x + 0.5, y + 0.5, size, radius)) {
        rows[pixelOffset + 3] = 0;
        continue;
      }

      const blend = (x + y) / Math.max(1, 2 * size - 2);
      rows[pixelOffset] = Math.round(47 + 84 * blend);
      rows[pixelOffset + 1] = Math.round(119 - 45 * blend);
      rows[pixelOffset + 2] = Math.round(233 + 4 * blend);
      rows[pixelOffset + 3] = 255;

      if (
        glyphPixel("M", x - textX, y - textY, glyphScale) ||
        glyphPixel("D", x - textX - glyphWidth - gap, y - textY, glyphScale)
      ) {
        rows[pixelOffset] = 255;
        rows[pixelOffset + 1] = 255;
        rows[pixelOffset + 2] = 255;
      }
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    signature,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(rows, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function insideRoundedSquare(x, y, size, radius) {
  const nearestX = Math.max(radius, Math.min(size - radius, x));
  const nearestY = Math.max(radius, Math.min(size - radius, y));
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 <= radius ** 2;
}

function glyphPixel(glyph, x, y, scale) {
  if (x < 0 || y < 0) {
    return false;
  }
  const column = Math.floor(x / scale);
  const row = Math.floor(y / scale);
  return row < 7 && column < 5 && GLYPHS[glyph][row]?.[column] === "1";
}

function pngChunk(type, data) {
  const kind = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  kind.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([kind, data])), data.length + 8);
  return chunk;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
