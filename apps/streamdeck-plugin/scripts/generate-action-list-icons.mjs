import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIRECTORY = path.resolve(SCRIPT_DIRECTORY, "../dev.annonator.meet-deck.sdPlugin");
const SUPERSAMPLING = 8;

function roundedRectangle(x, y, left, top, right, bottom, radius) {
  const closestX = Math.max(left + radius, Math.min(right - radius, x));
  const closestY = Math.max(top + radius, Math.min(bottom - radius, y));
  return Math.hypot(x - closestX, y - closestY) <= radius;
}

function distanceToSegment(x, y, startX, startY, endX, endY) {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const amount =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((x - startX) * deltaX + (y - startY) * deltaY) / lengthSquared));
  return Math.hypot(x - (startX + amount * deltaX), y - (startY + amount * deltaY));
}

function strokePolyline(x, y, points, width) {
  return points.some(
    ([startX, startY], index) =>
      index < points.length - 1 &&
      distanceToSegment(x, y, startX, startY, points[index + 1][0], points[index + 1][1]) <=
        width / 2
  );
}

function polygon(x, y, points) {
  let inside = false;
  for (
    let current = 0, previous = points.length - 1;
    current < points.length;
    previous = current++
  ) {
    const [currentX, currentY] = points[current];
    const [previousX, previousY] = points[previous];
    if (
      currentY > y !== previousY > y &&
      x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function microphone(x, y) {
  const cup = [
    [0.25, 0.42],
    [0.25, 0.56]
  ];
  for (let step = 1; step <= 16; step += 1) {
    const angle = Math.PI - (Math.PI * step) / 16;
    cup.push([0.5 + Math.cos(angle) * 0.25, 0.56 + Math.sin(angle) * 0.24]);
  }
  cup.push([0.75, 0.42]);

  return (
    roundedRectangle(x, y, 0.36, 0.08, 0.64, 0.61, 0.14) ||
    strokePolyline(x, y, cup, 0.075) ||
    roundedRectangle(x, y, 0.46, 0.76, 0.54, 0.9, 0.04) ||
    roundedRectangle(x, y, 0.3, 0.86, 0.7, 0.95, 0.045)
  );
}

function camera(x, y) {
  return (
    roundedRectangle(x, y, 0.08, 0.27, 0.68, 0.74, 0.09) ||
    polygon(x, y, [
      [0.64, 0.4],
      [0.92, 0.25],
      [0.92, 0.76],
      [0.64, 0.61]
    ])
  );
}

function hand(x, y) {
  return (
    roundedRectangle(x, y, 0.27, 0.42, 0.76, 0.88, 0.14) ||
    distanceToSegment(x, y, 0.34, 0.52, 0.34, 0.2) <= 0.064 ||
    distanceToSegment(x, y, 0.46, 0.48, 0.46, 0.14) <= 0.064 ||
    distanceToSegment(x, y, 0.58, 0.5, 0.58, 0.18) <= 0.064 ||
    distanceToSegment(x, y, 0.7, 0.57, 0.7, 0.27) <= 0.064 ||
    distanceToSegment(x, y, 0.35, 0.65, 0.16, 0.48) <= 0.08
  );
}

function presentation(x, y) {
  const outerScreen = roundedRectangle(x, y, 0.08, 0.12, 0.92, 0.66, 0.08);
  const innerScreen = roundedRectangle(x, y, 0.18, 0.22, 0.82, 0.51, 0.025);
  return (
    (outerScreen && !innerScreen) ||
    polygon(x, y, [
      [0.27, 0.62],
      [0.5, 0.38],
      [0.73, 0.62],
      [0.64, 0.7],
      [0.55, 0.6],
      [0.55, 0.92],
      [0.45, 0.92],
      [0.45, 0.6],
      [0.36, 0.7]
    ])
  );
}

function category(x, y) {
  const outerCamera = roundedRectangle(x, y, 0.07, 0.13, 0.68, 0.63, 0.09);
  const innerCamera = roundedRectangle(x, y, 0.17, 0.23, 0.57, 0.52, 0.025);
  const lens = polygon(x, y, [
    [0.66, 0.29],
    [0.93, 0.16],
    [0.93, 0.62],
    [0.66, 0.49]
  ]);
  const deckKeys = [0.16, 0.39, 0.62].some((left) =>
    roundedRectangle(x, y, left, 0.74, left + 0.13, 0.88, 0.035)
  );
  return (outerCamera && !innerCamera) || lens || deckKeys;
}

function makeCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
}

const CRC_TABLE = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
  return chunk;
}

function renderPng(size, contains) {
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let pixelY = 0; pixelY < size; pixelY += 1) {
    const rowOffset = pixelY * (size * 4 + 1);
    rows[rowOffset] = 0;
    for (let pixelX = 0; pixelX < size; pixelX += 1) {
      let coveredSamples = 0;
      for (let sampleY = 0; sampleY < SUPERSAMPLING; sampleY += 1) {
        for (let sampleX = 0; sampleX < SUPERSAMPLING; sampleX += 1) {
          const x = (pixelX + (sampleX + 0.5) / SUPERSAMPLING) / size;
          const y = (pixelY + (sampleY + 0.5) / SUPERSAMPLING) / size;
          coveredSamples += contains(x, y) ? 1 : 0;
        }
      }
      const offset = rowOffset + 1 + pixelX * 4;
      rows[offset] = 255;
      rows[offset + 1] = 255;
      rows[offset + 2] = 255;
      rows[offset + 3] = Math.round((coveredSamples * 255) / (SUPERSAMPLING * SUPERSAMPLING));
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(rows, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

const icons = [
  ["imgs/plugin/category-icon", category, 28],
  ["imgs/actions/microphone/icon", microphone, 20],
  ["imgs/actions/camera/icon", camera, 20],
  ["imgs/actions/hand/icon", hand, 20],
  ["imgs/actions/presentation/icon", presentation, 20]
];

for (const [relativePath, contains, size] of icons) {
  const destination = path.join(PLUGIN_DIRECTORY, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(`${destination}.png`, renderPng(size, contains));
  await writeFile(`${destination}@2x.png`, renderPng(size * 2, contains));
}

console.log(`Generated ${icons.length * 2} monochrome action-list PNGs.`);
