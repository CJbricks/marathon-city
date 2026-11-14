// Rebuilds the share-card pictures from the Austin close-up.
//
// The drawing is prototype/og_source.png: 488×414, a pixel-art look at
// the pink Capitol dome, the cream UT Tower, and a cathedral spire.
// A link preview wants 1200×630, which is wider than that drawing, so
// the card is a window cut out of a larger copy.
//
// Run it from the repo root:
//   npm run og
//
// It writes two files next to src/app/layout.js. Next.js sees those
// names and emits og:image and twitter:image. Nothing in layout.js
// points at the files. The alt sentences are the .alt.txt files beside
// them. This script does not touch those sentences, and it does not
// touch the favicon. The favicon is a different drawing. See
// scripts/make-icons.mjs.
//
// Scaling is nearest-neighbor. Each source pixel is copied into a 3×3
// block. 3 × 488 is 1464 and 3 × 414 is 1242, so the blocks land on
// whole pixels. Averaging neighbors was the thing the icon script
// already rejected: it invents colors the drawing does not have, and
// the dome stops looking like granite.

import { Buffer } from "node:buffer";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { crc32, deflateSync, inflateSync } from "node:zlib";

const root = process.cwd();
const sourcePath = path.join(root, "prototype/og_source.png");

// 1200×630 is the wide card (about 1.91:1) that X, Slack, and iMessage
// expect for summary_large_image. Both numbers divide by 3, so the card
// is exactly 400×210 source pixels and no block is sliced in half.
const SCALE = 3;
const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
const SOURCE_WIDTH = 488;
const SOURCE_HEIGHT = 414;

// Where the 400×210 window sits on the drawing. 72 in and 96 down.
// That is the window that still holds all three landmarks:
//   the tower's orange crown starts near y 104,
//   the dome and its cream lantern sit just under y 112,
//   the cathedral spire starts near y 188 and its rose window ends
//   near y 299.
// A higher window clips the rose window. A lower one clips the crown.
const CROP_X = 72;
const CROP_Y = 96;

// Pixels in the drawing that are the landmarks, not the towers around
// them. After the crop, each one has to still be this color. If the
// window moves off the dome, or a scale blends two pixels, this fails.
const LANDMARKS = [
  { name: "UT Tower crown", x: 223, y: 105, rgb: [178, 93, 34] },
  { name: "Capitol dome", x: 268, y: 145, rgb: [207, 162, 150] },
  { name: "cathedral spire", x: 366, y: 220, rgb: [243, 238, 227] },
  { name: "cathedral rose window", x: 360, y: 292, rgb: [70, 105, 150] },
];

const source = readPng(readFileSync(sourcePath));
if (source.width !== SOURCE_WIDTH || source.height !== SOURCE_HEIGHT) {
  throw new Error(
    `Expected a ${SOURCE_WIDTH}×${SOURCE_HEIGHT} drawing, got ${source.width}×${source.height}.`,
  );
}

const palette = new Set();
for (let i = 0; i < source.rgba.length; i += 4) {
  if (source.rgba[i + 3] !== 255) {
    throw new Error("The share drawing has a transparent pixel. The card is opaque.");
  }
  palette.add(`${source.rgba[i]},${source.rgba[i + 1]},${source.rgba[i + 2]}`);
}

for (const mark of LANDMARKS) {
  const got = pixel(source, mark.x, mark.y);
  if (!sameRgb(got, mark.rgb)) {
    throw new Error(
      `${mark.name} at ${mark.x},${mark.y} is ${got.join(",")}, not ${mark.rgb.join(",")}. The drawing changed.`,
    );
  }
  const inside =
    mark.x >= CROP_X &&
    mark.y >= CROP_Y &&
    mark.x < CROP_X + CARD_WIDTH / SCALE &&
    mark.y < CROP_Y + CARD_HEIGHT / SCALE;
  if (!inside) {
    throw new Error(`${mark.name} at ${mark.x},${mark.y} falls outside the card.`);
  }
}

const scaled = scaleInteger(source, SCALE);
if (scaled.width !== SOURCE_WIDTH * SCALE || scaled.height !== SOURCE_HEIGHT * SCALE) {
  throw new Error(`3× scale should be ${SOURCE_WIDTH * SCALE}×${SOURCE_HEIGHT * SCALE}.`);
}

const card = crop(scaled, CROP_X * SCALE, CROP_Y * SCALE, CARD_WIDTH, CARD_HEIGHT);
assertKnownColors(card, palette);

for (const mark of LANDMARKS) {
  const outX = (mark.x - CROP_X) * SCALE;
  const outY = (mark.y - CROP_Y) * SCALE;
  // The whole 3×3 block has to be the one source color. One mixed pixel
  // in the block would mean the scale sampled between two colors.
  for (let dy = 0; dy < SCALE; dy += 1) {
    for (let dx = 0; dx < SCALE; dx += 1) {
      const got = pixel(card, outX + dx, outY + dy);
      if (!sameRgb(got, mark.rgb)) {
        throw new Error(`${mark.name} was blended at output ${outX + dx},${outY + dy}.`);
      }
    }
  }
}

const png = writePng(toRgb(card));
const appDir = path.join(root, "src/app");
const outputs = ["opengraph-image.png", "twitter-image.png"];
for (const name of outputs) {
  writeFileSync(path.join(appDir, name), png);
}

console.log(
  `Share image written from ${path.relative(root, sourcePath)} ` +
    `(${palette.size} colors, 3× to ${scaled.width}×${scaled.height}, ` +
    `crop ${CROP_X * SCALE},${CROP_Y * SCALE} → ${CARD_WIDTH}×${CARD_HEIGHT}).`,
);
for (const name of outputs) {
  console.log(`src/app/${name}`);
}

// --- pixel scaling -------------------------------------------------------

function pixel(image, x, y) {
  const i = (y * image.width + x) * 4;
  return [image.rgba[i], image.rgba[i + 1], image.rgba[i + 2]];
}

function sameRgb(got, want) {
  return got[0] === want[0] && got[1] === want[1] && got[2] === want[2];
}

// Copy each source pixel into a factor×factor block.
function scaleInteger(image, factor) {
  const width = image.width * factor;
  const height = image.height * factor;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const src = (y * image.width + x) * 4;
      for (let dy = 0; dy < factor; dy += 1) {
        for (let dx = 0; dx < factor; dx += 1) {
          const dst = ((y * factor + dy) * width + (x * factor + dx)) * 4;
          image.rgba.copy(rgba, dst, src, src + 4);
        }
      }
    }
  }
  return { width, height, rgba };
}

// Keep a rectangle of the scaled picture. x and y are already in the
// scaled pixel grid, on a block boundary.
function crop(image, x0, y0, width, height) {
  if (x0 < 0 || y0 < 0 || x0 + width > image.width || y0 + height > image.height) {
    throw new Error(
      `Crop ${x0},${y0} ${width}×${height} does not fit in ${image.width}×${image.height}.`,
    );
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const src = ((y0 + y) * image.width + x0) * 4;
    image.rgba.copy(rgba, y * width * 4, src, src + width * 4);
  }
  return { width, height, rgba };
}

function assertKnownColors(image, known) {
  for (let i = 0; i < image.rgba.length; i += 4) {
    const key = `${image.rgba[i]},${image.rgba[i + 1]},${image.rgba[i + 2]}`;
    if (!known.has(key)) {
      throw new Error(`Scaling invented a new color (${key}). That means pixels were blended.`);
    }
  }
}

function toRgb(image) {
  const rgb = Buffer.alloc(image.width * image.height * 3);
  for (let i = 0; i < image.width * image.height; i += 1) {
    rgb[i * 3] = image.rgba[i * 4];
    rgb[i * 3 + 1] = image.rgba[i * 4 + 1];
    rgb[i * 3 + 2] = image.rgba[i * 4 + 2];
  }
  return { width: image.width, height: image.height, rgb };
}

// --- PNG -----------------------------------------------------------------

// Reads the kind of PNG this repo stores: 8-bit, not interlaced, RGBA or
// RGB. Enough for the close-up. It is not a general image library.
function readPng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) {
    throw new Error("The share source is not a PNG.");
  }

  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      colorType = data[9];
      const interlace = data[12];
      if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error("The share source must be an 8-bit RGB or RGBA PNG with no interlacing.");
      }
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const rgba = Buffer.alloc(width * height * 4);
  // Each row starts with a filter byte that tells us how that row was
  // stored relative to the row above. We undo that, then store RGBA.
  let previous = Buffer.alloc(stride);
  let rawAt = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawAt];
    rawAt += 1;
    const row = Buffer.from(raw.subarray(rawAt, rawAt + stride));
    rawAt += stride;
    unfilter(filter, row, previous, channels);
    for (let x = 0; x < width; x += 1) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      rgba[dst] = row[src];
      rgba[dst + 1] = row[src + 1];
      rgba[dst + 2] = row[src + 2];
      rgba[dst + 3] = channels === 4 ? row[src + 3] : 255;
    }
    previous = row;
  }
  return { width, height, rgba };
}

function unfilter(filter, row, previous, channels) {
  for (let i = 0; i < row.length; i += 1) {
    const left = i >= channels ? row[i - channels] : 0;
    const up = previous[i];
    const upLeft = i >= channels ? previous[i - channels] : 0;
    if (filter === 1) row[i] = (row[i] + left) & 255;
    else if (filter === 2) row[i] = (row[i] + up) & 255;
    else if (filter === 3) row[i] = (row[i] + Math.floor((left + up) / 2)) & 255;
    else if (filter === 4) row[i] = (row[i] + paeth(left, up, upLeft)) & 255;
    else if (filter !== 0) throw new Error(`Unknown PNG filter ${filter}.`);
  }
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const dl = Math.abs(estimate - left);
  const du = Math.abs(estimate - up);
  const dul = Math.abs(estimate - upLeft);
  if (dl <= du && dl <= dul) return left;
  if (du <= dul) return up;
  return upLeft;
}

// Writes an 8-bit RGB PNG. The card has no transparent pixels, so there
// is no alpha channel for a preview app to paint black.
function writePng(image) {
  const { width, height, rgb } = image;
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    rgb.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([header, body, crc]);
}
