// Turns the live city view into a PNG and hands it to the phone.
//
// renderer.extract.canvas draws the stage into its own texture and copies
// those pixels out. The on-screen WebGL canvas is the wrong source.
// preserveDrawingBuffer is left off on purpose: turning it on would keep a
// full extra frame in memory on every phone, and the pinch path does not
// need it. The cost is that canvas.toBlob on the on-screen canvas often
// returns a blank PNG. The browser may throw the drawing buffer away after
// it has shown the frame, and Safari does. Extract never reads that buffer.
//
// The copy is resolution 1 and antialias off. CityView points the sky and
// the grid at a 4:5 frame for this one render, at an integer scale, then
// puts the pinch back before the browser paints. The phone-sized sky fill
// is hidden for that render: it is a rectangle the size of the screen, and
// leaving it on paints a dark block over the corner of the share picture.
// The MENU button and the bottom bar are HTML, so they are not in the
// picture. The menu is closed before this runs. A footer band is painted
// under the view, in the theme's colors.
//
// Extract reads a premultiplied render texture. Opaque sky and ground
// (alpha 255) already match the pixels on screen, which is why those
// bytes are copied unchanged. A partial-alpha pixel is stored darker than
// the texel. Dividing the color by the alpha puts that edge back. Reading
// the on-screen WebGL canvas with toBlob does not: preserveDrawingBuffer
// is off, and that read comes back black.
//
// navigator.share has to be called in the same turn as the tap. iOS forgets
// the tap if the page waits on a promise first, and the sheet then fails.
// This function copies synchronously and calls share before it returns.
// Closing the sheet is AbortError, which is not shown as an error. A phone
// that cannot share files downloads the PNG instead.

import { Rectangle } from "pixi.js";
import {
  FOOTER_LINE,
  FOOTER_PAD_Y,
  FOOTER_RULE,
  SHARE_TITLE,
  footerBandHeight,
  footerPixelScale,
  isShareCancel,
  shareBandPalette,
  shareFooter,
  shareMessage,
} from "@/lib/shareCity";
import { themeClass } from "./themes/names";

function pixelFamily() {
  if (typeof document === "undefined") return '"Press Start 2P", monospace';
  // The face is loaded on <html> by next/font. Reading it here keeps the
  // footer in the same pixel type as the menu, without waiting on a font
  // promise (that wait would drop the tap before the share sheet).
  const family = getComputedStyle(document.documentElement).fontFamily;
  return family || '"Press Start 2P", monospace';
}

// The bottom bar reads these variables. Reading them again for the PNG
// means an Austin city gets cedar and burnt orange even if the stylesheet
// numbers move, and a Denver city keeps the navy and gold. The constants
// cover a document that has not applied the variables yet.
function bandColors(theme) {
  const fallback = shareBandPalette(theme);
  if (typeof document === "undefined") return fallback;
  const probe = document.createElement("div");
  const cls = themeClass(theme);
  if (cls) probe.className = cls;
  probe.style.position = "absolute";
  probe.style.left = "-9999px";
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const pick = (token, alt) => style.getPropertyValue(token).trim() || alt;
  const colors = {
    background: pick("--mc-hud", fallback.background),
    name: pick("--mc-name", fallback.name),
    stats: pick("--mc-hud-text", fallback.stats),
    credit: pick("--mc-muted", fallback.credit),
    rule: pick("--mc-border", fallback.rule),
  };
  probe.remove();
  return colors;
}

function drawCenteredLine(ctx, text, y, px, color, family, maxWidth) {
  let size = px;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.font = `${size}px ${family}`;
  // A long credit line on a narrow phone would run off the band. Stepping
  // the size down by whole pixels keeps the strokes from being resampled
  // at a fraction of the face.
  while (size > 5 && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = `${size}px ${family}`;
  }
  const width = ctx.measureText(text).width;
  const x = Math.max(0, Math.round((ctx.canvas.width - width) / 2));
  ctx.fillText(text, x, Math.round(y));
}

export function extractCityCanvas(application, frame) {
  const renderer = application?.renderer;
  if (!renderer || !application.stage) throw new Error("City is not ready.");
  const width = Math.round(frame?.width || application.screen.width);
  const height = Math.round(frame?.height || application.screen.height);
  if (width < 2 || height < 2) throw new Error("City is not ready.");
  // The rectangle is in stage pixels. CityView has already moved the sky
  // and the grid so this rectangle is the 4:5 picture. It does not include
  // the HTML menu or the bottom bar.
  return renderer.extract.canvas({
    target: application.stage,
    frame: new Rectangle(0, 0, width, height),
    resolution: 1,
    antialias: false,
    // Only uncovered pixels use this. The sky texture covers the frame.
    clearColor: renderer.background?.colorRgba ?? [0, 0, 0, 1],
  });
}

// Pixi stores partial coverage premultiplied, and extract does not divide
// it back out. Opaque pixels are the screen color already. Leave them
// alone so a sky sample stays byte-for-byte with the screenshot.
function straightenPartialAlpha(image) {
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0 || alpha === 255) continue;
    const scale = 255 / alpha;
    data[i] = Math.min(255, Math.round(data[i] * scale));
    data[i + 1] = Math.min(255, Math.round(data[i + 1] * scale));
    data[i + 2] = Math.min(255, Math.round(data[i + 2] * scale));
  }
  return image;
}

export function composeShareCard(source, meta) {
  const w = source.width;
  const h = source.height;
  const colors = bandColors(meta?.theme);
  const footer = shareFooter(meta);
  const ui = footerPixelScale(w);
  const band = footerBandHeight(ui);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h + band;
  // srgb so the PNG is the same bytes the screen composite uses, not a
  // display-p3 reinterpretation that dulls the sky.
  const ctx = out.getContext("2d", { colorSpace: "srgb" });
  ctx.imageSmoothingEnabled = false;
  const src = source.getContext("2d");
  const pixels = straightenPartialAlpha(src.getImageData(0, 0, w, h));
  ctx.putImageData(pixels, 0, 0);
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, h, w, band);
  ctx.fillStyle = colors.rule;
  ctx.fillRect(0, h, w, FOOTER_RULE * ui);
  const family = pixelFamily();
  const maxWidth = Math.max(8, w - 16 * ui);
  const top = h + (FOOTER_RULE + FOOTER_PAD_Y) * ui;
  const lines = [
    [footer.name, 8 * ui, colors.name],
    [footer.stats, 7 * ui, colors.stats],
    [footer.credit, 6 * ui, colors.credit],
  ];
  lines.forEach(([text, px, color], index) => {
    drawCenteredLine(ctx, text, top + index * FOOTER_LINE * ui, px, color, family, maxWidth);
  });
  return out;
}

// toBlob is a later turn. The share sheet has to be opened in this turn,
// while the tap still counts, so the PNG is encoded with toDataURL.
export function pngBlobFromCanvas(canvas) {
  const url = canvas.toDataURL("image/png");
  const comma = url.indexOf(",");
  const binary = atob(url.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

export function canShareFiles(files) {
  try {
    return typeof navigator.canShare === "function" && navigator.canShare({ files });
  } catch {
    // Some browsers throw when the files field is not supported at all.
    // That is a download, not a broken city.
    return false;
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // The click starts the download. Revoking in this turn can cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Returns { promise } that resolves to "shared", "downloaded", or
// "cancelled". The promise is started here, before this function returns,
// so the caller can await it without delaying the share() call itself.
export function beginCityShare(application, meta, frame) {
  // Do not render the screen here. The share camera is still applied, and
  // the caller restores the pinch before painting.
  const shot = extractCityCanvas(application, frame);
  const card = composeShareCard(shot, meta);
  const blob = pngBlobFromCanvas(card);
  const message = shareMessage(meta);
  const file = new File([blob], message.filename, { type: "image/png" });
  const files = [file];
  if (canShareFiles(files)) {
    let pending;
    try {
      pending = navigator.share({ files, title: SHARE_TITLE, text: message.text });
    } catch (error) {
      if (isShareCancel(error)) return { promise: Promise.resolve("cancelled") };
      downloadBlob(blob, message.filename);
      return { promise: Promise.resolve("downloaded") };
    }
    const promise = Promise.resolve(pending).then(
      () => "shared",
      (error) => {
        if (isShareCancel(error)) return "cancelled";
        // The sheet refused the file after the tap. The PNG is already
        // built, so the person still gets it.
        downloadBlob(blob, message.filename);
        return "downloaded";
      },
    );
    return { promise };
  }
  downloadBlob(blob, message.filename);
  return { promise: Promise.resolve("downloaded") };
}
