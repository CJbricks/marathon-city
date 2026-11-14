// Rebuilds the Open Graph and Twitter share images from the Austin close-up.
//
// The drawing is prototype/og_source.png: 488×414, a pixel-art view with
// the Texas State Capitol dome, the UT Tower, and St. Mary Cathedral in
// the middle. A link preview is one wide picture, so the whole close-up
// does not fit. This script makes the picture the preview asks for.
//
// Run it from the repo root:
//   npm run og
//
// It writes two files next to src/app/layout.js. Next.js sees those names
// and emits the og:image and twitter:image tags. Nothing in layout.js
// points at the files. Setting openGraph.images there would replace them.
//
// The alt sentences are opengraph-image.alt.txt and twitter-image.alt.txt.
// Those are words, not pixels, so this script leaves them alone.
//
// It does not write favicon.ico, icon.png, or apple-icon.png. Those come
// from scripts/make-icons.mjs. Run that script for the tab icon.
//
// Scaling is nearest-neighbor. Each source pixel stays one of the colors
// already in the close-up. Averaging neighbors was tried for the favicon
// and it invented grays. The same rule applies here.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync, inflateSync } from "node:zlib";

// 1200×630 is the wide card (about 1.91:1) that Slack, iMessage, and X
// expect for summary_large_image. A square thumbnail would letterbox.
export const SHARE_WIDTH = 1200;
export const SHARE_HEIGHT = 630;

// 3× is the integer scale that fills that card.
// 2× of 488 is 976, which is short of 1200, so the card would have empty
// bars or a second resample. 4× cannot land on 630: 630 is not divisible
// by 4, so the crop would slice a source pixel in half and the blocks
// would be uneven. 3× makes 1464×1242, and both 1200 and 630 divide by 3.
const SCALE = 3;

// Boxes measured on the 488×414 close-up. x2 and y2 are the last pixel
// of each landmark. The crop has to cover all three. The tower box is the
// red roof; the clock sits on the cream shaft just under it. The cathedral
// box is the rose window; the steeple rises above that window.
const LANDMARKS = [
  { name: "Capitol dome", x: 238, y: 122, x2: 307, y2: 231 },
  { name: "UT Tower roof", x: 206, y: 114, x2: 231, y2: 143 },
  { name: "cathedral rose window", x: 356, y: 286, x2: 367, y2: 299 },
];

// Copy each source pixel into a scale×scale block, then keep the centered
// 1200×630. The crop origin is a multiple of the scale, so the window
// starts on a source pixel and every output block is a full copy.
export function buildShareImage(source) {
  if (source.width !== 488 || source.height !== 414) {
    throw new Error(
      `Expected the 488×414 close-up, got ${source.width}×${source.height}.`,
    );
  }

  const scaledWidth = source.width * SCALE;
  const scaledHeight = source.height * SCALE;
  const cropX = (scaledWidth - SHARE_WIDTH) / 2;
  const cropY = (scaledHeight - SHARE_HEIGHT) / 2;
  if (cropX % SCALE !== 0 || cropY % SCALE !== 0) {
    throw new Error(
      "The centered crop would slice a source pixel. The blocks have to stay whole.",
    );
  }

  const originX = cropX / SCALE;
  const originY = cropY / SCALE;
  const windowWidth = SHARE_WIDTH / SCALE;
  const windowHeight = SHARE_HEIGHT / SCALE;
  const lastX = originX + windowWidth - 1;
  const lastY = originY + windowHeight - 1;

  for (const box of LANDMARKS) {
    const inside =
      box.x >= originX && box.y >= originY && box.x2 <= lastX && box.y2 <= lastY;
    if (!inside) {
      throw new Error(
        `${box.name} (${box.x},${box.y}–${box.x2},${box.y2}) falls outside the share crop ` +
          `(${originX},${originY} size ${windowWidth}×${windowHeight}).`,
      );
    }
  }

  const known = new Set();
  for (let i = 0; i < source.rgba.length; i += 4) {
    known.add(colorKey(source.rgba, i));
  }

  const rgba = Buffer.alloc(SHARE_WIDTH * SHARE_HEIGHT * 4);
  for (let y = 0; y < SHARE_HEIGHT; y += 1) {
    const sy = originY + Math.floor(y / SCALE);
    for (let x = 0; x < SHARE_WIDTH; x += 1) {
      const sx = originX + Math.floor(x / SCALE);
      const src = (sy * source.width + sx) * 4;
      const dst = (y * SHARE_WIDTH + x) * 4;
      source.rgba.copy(rgba, dst, src, src + 4);
      const key = colorKey(rgba, dst);
      if (!known.has(key)) {
        throw new Error(
          `Scaling invented a new color (${key}) at ${x},${y}. That means pixels were blended.`,
        );
      }
    }
  }

  return {
    width: SHARE_WIDTH,
    height: SHARE_HEIGHT,
    rgba,
    originX,
    originY,
    windowWidth,
    windowHeight,
  };
}

function colorKey(rgba, offset) {
  return `${rgba[offset]},${rgba[offset + 1]},${rgba[offset + 2]},${rgba[offset + 3]}`;
}

// --- PNG ------------------------------------------------------------------
// Same kind of reader and writer as scripts/make-icons.mjs. Kept in this
// file so changing the favicon script cannot change the share image.
// Enough for an 8-bit RGB or RGBA PNG with no interlacing.

export function readPng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) {
    throw new Error("The share-image source is not a PNG.");
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
        throw new Error("The share-image source must be an 8-bit RGB or RGBA PNG with no interlacing.");
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

// The close-up is fully opaque, so the card is written as RGB. A leftover
// alpha channel would be a pixel some apps paint black. A pixel that is
// actually transparent is kept, because mixing it onto a background would
// invent a color that is not in the drawing.
export function writePng(image) {
  let transparent = 0;
  for (let i = 3; i < image.rgba.length; i += 4) {
    if (image.rgba[i] !== 255) transparent += 1;
  }

  const channels = transparent === 0 ? 3 : 4;
  const colorType = transparent === 0 ? 2 : 6;
  const pixels = Buffer.alloc(image.width * image.height * channels);
  for (let i = 0; i < image.width * image.height; i += 1) {
    pixels[i * channels] = image.rgba[i * 4];
    pixels[i * channels + 1] = image.rgba[i * 4 + 1];
    pixels[i * channels + 2] = image.rgba[i * 4 + 2];
    if (channels === 4) pixels[i * channels + 3] = image.rgba[i * 4 + 3];
  }

  const stride = image.width * channels;
  const raw = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  // The picture is stored in git. The 3× blocks repeat, so the extra
  // compression pass is cheap and the file stays small.
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
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

function writeShareImages() {
  const root = process.cwd();
  const sourcePath = path.join(root, "prototype/og_source.png");
  const source = readPng(readFileSync(sourcePath));
  const image = buildShareImage(source);
  const png = writePng(image);

  const appDir = path.join(root, "src/app");
  // Two names, one picture. Open Graph looks for opengraph-image, and
  // Twitter looks for twitter-image. Writing both from the same buffer
  // keeps the cards from drifting apart.
  writeFileSync(path.join(appDir, "opengraph-image.png"), png);
  writeFileSync(path.join(appDir, "twitter-image.png"), png);

  const colors = new Set();
  for (let i = 0; i < source.rgba.length; i += 4) colors.add(colorKey(source.rgba, i));
  console.log(
    `Share image written from ${path.relative(root, sourcePath)} (${colors.size} colors).`,
  );
  console.log(
    `Crop is source pixels ${image.originX},${image.originY} ` +
      `size ${image.windowWidth}×${image.windowHeight}, scaled ${SCALE}×.`,
  );
  console.log("src/app/opengraph-image.png  1200×630");
  console.log("src/app/twitter-image.png    1200×630");
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry === fileURLToPath(import.meta.url)) {
  writeShareImages();
}
