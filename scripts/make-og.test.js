// The committed share images have to be the picture the script would
// write today. A smoothed rescale invents colors. A crop that moves off
// the Capitol, the UT Tower, or the cathedral throws inside buildShareImage.
// The two card files have to stay the same picture.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SHARE_HEIGHT, SHARE_WIDTH, buildShareImage, readPng } from "./make-og.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const ALT =
  "Pixel-art Austin, with the Texas State Capitol dome, the UT Tower, and St. Mary Cathedral.";

describe("share image", () => {
  it("is a 1200×630 nearest-neighbor crop of the Austin close-up", () => {
    const source = readPng(readFileSync(join(root, "prototype/og_source.png")));
    const built = buildShareImage(source);
    expect(built.width).toBe(SHARE_WIDTH);
    expect(built.height).toBe(SHARE_HEIGHT);

    for (const name of ["opengraph-image.png", "twitter-image.png"]) {
      const committed = readPng(readFileSync(join(root, "src/app", name)));
      expect(committed.width).toBe(SHARE_WIDTH);
      expect(committed.height).toBe(SHARE_HEIGHT);
      expect(Buffer.compare(committed.rgba, built.rgba)).toBe(0);
    }
  });

  it("names the picture for a screen reader", () => {
    // Exact bytes. A trailing newline becomes part of og:image:alt,
    // because Next copies the file into the tag as it is.
    const og = readFileSync(join(root, "src/app/opengraph-image.alt.txt"), "utf8");
    const twitter = readFileSync(join(root, "src/app/twitter-image.alt.txt"), "utf8");
    expect(og).toBe(ALT);
    expect(twitter).toBe(ALT);
  });
});
