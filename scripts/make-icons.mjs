// Rebuilds the App Router icon files from the 32×32 drawing.
//
// The drawing is prototype/icon32_drawn.png: the UT Tower (cream shaft,
// red roof, burnt-orange crown, black clock) beside the pink Capitol dome.
// A browser tab is 16 or 32 pixels, so the whole Austin skyline would turn
// into mud. This one drawing is the picture we scale instead.
//
// Run it from the repo root:
//   npm run icons
//
// It writes three files next to src/app/layout.js. Next.js sees those names
// and emits the <link> tags. Nothing in layout.js points at them.
//
// Scaling is nearest-neighbor. Each source pixel stays one of the original
// twelve colors. Averaging neighboring pixels was tried for the 16px size:
// the clock turned gray and the dome grew extra shades. That file is not
// how these icons are made.

import { Buffer } from "node:buffer";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { crc32, deflateSync, inflateSync } from "node:zlib";

const root = process.cwd();
const sourcePath = path.join(root, "prototype/icon32_drawn.png");

// The frame color. Apple paints any transparent pixel black when the icon
// is saved to a home screen, so a see-through edge would become a black
// fringe. The drawing is already solid. If a pixel is ever partly
// transparent, it is mixed onto this orange instead of left empty.
const FRAME = [0xbf, 0x57, 0x00];

const source = readPng(readFileSync(sourcePath));
if (source.width !== 32 || source.height !== 32) {
  throw new Error(`Expected a 32×32 drawing, got ${source.width}×${source.height}.`);
}

const palette = new Set();
let transparent = 0;
for (let i = 0; i < source.rgba.length; i += 4) {
  palette.add(`${source.rgba[i]},${source.rgba[i + 1]},${source.rgba[i + 2]}`);
  if (source.rgba[i + 3] !== 255) transparent += 1;
}

// 512 is 32 × 16. 64 is 32 × 2. Both are whole blocks, so each pixel is
// copied into a square and the edges stay on the grid.
const icon512 = scaleInteger(source, 16);
const icon64 = scaleInteger(source, 2);

// 48 is 32 × 1.5. A direct nearest resize makes some columns 1px and some
// 2px in clumps (two fat columns, then two thin ones). Scaling to 96 first
// (exactly 3×, so every pixel is a 3×3 block) and then keeping every other
// pixel of that block gives a steady thin, fat, thin, fat rhythm instead.
const icon48 = scale48(source);

// 16 keeps the source pixel under the middle of each 2×2 block. That is
// still nearest-neighbor: one of the four pixels, not a blend. 180 is the
// Apple home-screen size. 180 / 32 is not a whole number, so some pixels
// are copied 5 times and some 6. The copies are spread across the picture.
const icon16 = scaleNearest(source, 16);
const icon180 = scaleNearest(source, 180);
const icon32 = source;

for (const image of [icon16, icon32, icon48, icon64, icon180, icon512]) {
  assertKnownColors(image, palette);
}

const appDir = path.join(root, "src/app");
const png512 = writePng(toOpaqueRgb(icon512));
const png180 = writePng(toOpaqueRgb(icon180));
const ico = writeIco([
  { size: 16, png: writePng(toOpaqueRgb(icon16)) },
  { size: 32, png: writePng(toOpaqueRgb(icon32)) },
  { size: 48, png: writePng(toOpaqueRgb(icon48)) },
  { size: 64, png: writePng(toOpaqueRgb(icon64)) },
]);

writeFileSync(path.join(appDir, "favicon.ico"), ico);
writeFileSync(path.join(appDir, "icon.png"), png512);
writeFileSync(path.join(appDir, "apple-icon.png"), png180);

console.log(
  `Icons written from ${path.relative(root, sourcePath)} ` +
    `(${palette.size} colors, ${transparent} transparent pixels).`,
);
console.log("src/app/favicon.ico   16, 32, 48, 64");
console.log("src/app/icon.png      512");
console.log("src/app/apple-icon.png 180, opaque");

// --- pixel scaling -------------------------------------------------------

// Copy each source pixel into a factor×factor block. factor 2 turns the
// 32×32 drawing into 64×64. factor 16 turns it into 512×512.
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

// 32 → 96 (3× blocks), then one pixel from every 2×2 of that 96 image.
// The sample sits on the odd coordinate (1, 3, 5, …), which lands inside
// a 3×3 block rather than between two colors, so no new color appears.
function scale48(image) {
  const big = scaleInteger(image, 3);
  const rgba = Buffer.alloc(48 * 48 * 4);
  for (let y = 0; y < 48; y += 1) {
    for (let x = 0; x < 48; x += 1) {
      const src = ((y * 2 + 1) * big.width + (x * 2 + 1)) * 4;
      big.rgba.copy(rgba, (y * 48 + x) * 4, src, src + 4);
    }
  }
  return { width: 48, height: 48, rgba };
}

// Nearest-neighbor to a square of `size` pixels. The source pixel is the
// one under the center of the output pixel.
function scaleNearest(image, size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const sy = Math.min(image.height - 1, Math.floor(((y + 0.5) * image.height) / size));
    for (let x = 0; x < size; x += 1) {
      const sx = Math.min(image.width - 1, Math.floor(((x + 0.5) * image.width) / size));
      const src = (sy * image.width + sx) * 4;
      rgba.set(image.rgba.subarray(src, src + 4), (y * size + x) * 4);
    }
  }
  return { width: size, height: size, rgba };
}

function assertKnownColors(image, known) {
  for (let i = 0; i < image.rgba.length; i += 4) {
    const key = `${image.rgba[i]},${image.rgba[i + 1]},${image.rgba[i + 2]}`;
    if (!known.has(key)) {
      throw new Error(`Scaling invented a new color (${key}) at ${image.width}px. That means pixels were blended.`);
    }
  }
}

// Drop the alpha channel. A pixel that is not fully opaque is mixed onto
// the burnt-orange frame so the file iOS saves has no holes.
function toOpaqueRgb(image) {
  const rgb = Buffer.alloc(image.width * image.height * 3);
  for (let i = 0; i < image.width * image.height; i += 1) {
    const r = image.rgba[i * 4];
    const g = image.rgba[i * 4 + 1];
    const b = image.rgba[i * 4 + 2];
    const a = image.rgba[i * 4 + 3];
    if (a === 255) {
      rgb[i * 3] = r;
      rgb[i * 3 + 1] = g;
      rgb[i * 3 + 2] = b;
    } else {
      const cover = a / 255;
      rgb[i * 3] = Math.round(r * cover + FRAME[0] * (1 - cover));
      rgb[i * 3 + 1] = Math.round(g * cover + FRAME[1] * (1 - cover));
      rgb[i * 3 + 2] = Math.round(b * cover + FRAME[2] * (1 - cover));
    }
  }
  return { width: image.width, height: image.height, rgb };
}

// --- PNG and ICO ---------------------------------------------------------

// Reads the kind of PNG this repo stores: 8-bit, not interlaced, RGBA or
// RGB. Enough for the 32×32 master. It is not a general image library.
function readPng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) {
    throw new Error("The icon source is not a PNG.");
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
        throw new Error("The icon source must be an 8-bit RGB or RGBA PNG with no interlacing.");
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

// Writes an 8-bit RGB PNG. Color type 2 has no alpha channel, which is
// what we want for the home-screen icon.
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

// One .ico file can hold several PNGs. Browsers pick the entry closest to
// the slot they are painting (a tab is often 16 or 32; Windows also asks
// for 48). The bytes after the directory are ordinary PNG files.
function writeIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const directory = Buffer.alloc(16 * count);
  const pngs = [];
  let dataOffset = 6 + directory.length;
  for (let i = 0; i < count; i += 1) {
    const { size, png } = images[i];
    const at = i * 16;
    // A size of 256 is stored as 0. Ours are all smaller than that.
    directory.writeUInt8(size, at);
    directory.writeUInt8(size, at + 1);
    directory.writeUInt16LE(1, at + 4);
    directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(png.length, at + 8);
    directory.writeUInt32LE(dataOffset, at + 12);
    dataOffset += png.length;
    pngs.push(png);
  }
  return Buffer.concat([header, directory, ...pngs]);
}
