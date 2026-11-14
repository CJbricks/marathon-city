// Words for the shared city picture.
//
// Share my city copies the Pixi view, then either opens the phone's share
// sheet or downloads a PNG. The sentence, the filename, and the footer
// lines are decided here, with no canvas and no Pixi, so a test can lock
// them without a browser. The pixel copy lives in shareCapture.js.
//
// The colors are the same hex values as the Denver and Austin blocks in
// globals.css. The capture prefers the live CSS variables when it can
// read them. These are the backup, and they are what the tests check. An
// unknown theme uses Denver's band, the same way an unknown theme paints
// Denver.

export const SHARE_TITLE = "Miles and Miles";
export const SHARE_SITE_HOST = "marathon-city.vercel.app";
export const SHARE_SITE_URL = `https://${SHARE_SITE_HOST}`;
// The footer prints this line in small type. The middle dot is the one
// the menu copy uses, not a hyphen and not a bullet.
export const SHARE_CREDIT = `Miles and Miles · ${SHARE_SITE_HOST}`;

// The band is short on purpose: a rule, three lines, and a little air.
// shareCapture.js uses these numbers so the PNG footer does not cover
// the skyline. It sits under the picture.
export const FOOTER_RULE = 4;
export const FOOTER_PAD_Y = 8;
export const FOOTER_LINE = 18;

// The band is designed at phone size. A 4:5 share picture is wider than
// the phone, so the type is scaled by a whole number. A fraction would
// resample the pixel font. 390 is the phone width that size was written for.
export function footerPixelScale(pictureWidth) {
  const width = Number(pictureWidth);
  if (!Number.isFinite(width) || width <= 0) return 1;
  return Math.max(1, Math.round(width / 390));
}

export function footerBandHeight(pixelScale = 1) {
  const scale = Math.max(1, Math.round(Number(pixelScale) || 1));
  return (FOOTER_RULE + FOOTER_PAD_Y + FOOTER_LINE * 3 + FOOTER_PAD_Y) * scale;
}

// The share picture is not the pinched phone view. The diamond is wide
// and short, and a tall phone fit leaves most of the file as the near
// ground, which reads as a dark muddy field. This frame is a 4:5 portrait
// at an integer scale, with the diamond filling most of the width and a
// band of sky above the back corner. panX/panY are the container position
// for `screen = pan + scene * scale`. The caller puts the pinch back
// after the copy.
export function shareFrame(bounds, options = {}) {
  const scale = Math.max(1, Math.round(Number(options.scale) || 1));
  const widthFill = Math.min(0.95, Math.max(0.5, Number(options.widthFill) || 0.86));
  const aspect = Number(options.aspect) > 0 ? Number(options.aspect) : 5 / 4;
  const left = Number(bounds?.left) || 0;
  const right = Number(bounds?.right) || 0;
  const top = Number(bounds?.top) || 0;
  const bottom = Number(bounds?.bottom) || 0;
  const diamondW = Math.max(1, right - left);
  const width = Math.max(1, Math.round((diamondW * scale) / widthFill));
  const height = Math.max(1, Math.round(width * aspect));
  const panX = Math.round((width - (left + right) * scale) / 2);
  // Scene y=0 is the top sky stop, the same flat color as the top of the
  // phone. Starting the frame lower steps into the gradient, and a sky
  // sample then disagrees with a screenshot even though nothing was tinted.
  const panY = 0;
  const skyBand = Math.round(top * scale);
  return { width, height, scale, panX, panY, skyBand };
}

export function formatShareMiles(miles) {
  const n = Number(miles);
  if (!Number.isFinite(n) || n < 0) return "0";
  // Hundredths, then drop the trailing zeros. 704.95 stays 704.95.
  // 12 stays 12, not 12.00. The simulator already stores hundredths.
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

// The save's typed name is the city name on the card. A blank name falls
// back to the theme, so an Austin city does not introduce itself as Denver.
export function shareCityName(name, theme) {
  const trimmed = String(name ?? "").replace(/\s+/g, " ").trim();
  if (trimmed) return trimmed;
  return String(theme || "").toLowerCase() === "austin" ? "Austin" : "Denver";
}

export function shareCaption({ name, miles, theme } = {}) {
  const city = shareCityName(name, theme);
  const distance = formatShareMiles(miles);
  return `${city}: ${distance} miles of running built this city. ${SHARE_SITE_URL}`;
}

// "CJ's Denver" becomes cjs-denver-miles-and-miles.png. Apostrophes drop
// out. Everything else that is not a letter or a digit becomes one hyphen,
// so a slash cannot turn the download into a path.
export function shareFilename(name, theme) {
  const slug = shareCityName(name, theme)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "city"}-miles-and-miles.png`;
}

export function shareFooter({ name, miles, buildings, landmarks, theme } = {}) {
  const built = Math.max(0, Math.floor(Number(buildings) || 0));
  const marks = Math.max(0, Math.floor(Number(landmarks) || 0));
  return {
    name: shareCityName(name, theme),
    stats: `${formatShareMiles(miles)} MI · ${built} BLDG · ${marks} LANDMARKS`,
    credit: SHARE_CREDIT,
  };
}

export function shareMessage(meta = {}) {
  return {
    title: SHARE_TITLE,
    text: shareCaption(meta),
    filename: shareFilename(meta.name, meta.theme),
  };
}

export function shareBandPalette(theme) {
  if (String(theme || "").toLowerCase() === "austin") {
    return {
      background: "#2c1810",
      name: "#f4e6c8",
      stats: "#bf5700",
      credit: "#e7c9a0",
      rule: "#bf5700",
    };
  }
  return {
    background: "#05143a",
    name: "#ffffff",
    stats: "#fdd835",
    credit: "#c9d6f2",
    rule: "#fdd835",
  };
}

// Closing the share sheet is not a failure. iOS rejects the promise with
// AbortError. A string of the same name is treated the same way, in case
// a browser does not hand back an Error object.
export function isShareCancel(error) {
  const name = error && (typeof error === "string" ? error : error.name);
  return name === "AbortError";
}
