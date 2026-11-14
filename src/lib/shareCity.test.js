// The share card's words. The PNG itself needs a browser and a Pixi
// renderer, so these tests stay on the sentence, the filename, and the
// two theme palettes.

import { describe, expect, it } from "vitest";
import { cityDiamond } from "../components/game/sceneLayout.js";
import {
  SHARE_CREDIT,
  SHARE_TITLE,
  footerBandHeight,
  footerPixelScale,
  isShareCancel,
  shareBandPalette,
  shareCaption,
  shareFilename,
  shareFooter,
  shareFrame,
  shareMessage,
} from "./shareCity.js";

describe("shareCaption", () => {
  it("names the city, the miles, and the site", () => {
    expect(shareCaption({ name: "Training block", miles: 12.5 })).toBe(
      "Training block: 12.5 miles of running built this city. https://marathon-city.vercel.app",
    );
  });

  it("keeps a fractional mile and drops a trailing zero", () => {
    expect(shareCaption({ name: "Demo city", miles: 704.95 })).toContain("704.95 miles");
    expect(shareCaption({ name: "Demo city", miles: 8 })).toContain("Demo city: 8 miles");
    expect(shareCaption({ name: "Demo city", miles: 8.5 })).toContain(": 8.5 miles");
  });

  it("uses the theme when the save has no name", () => {
    expect(shareCaption({ name: "   ", theme: "Austin", miles: 0 })).toMatch(/^Austin: 0 miles/);
    expect(shareCaption({ name: "", theme: "Denver", miles: Number.NaN })).toMatch(/^Denver: 0 miles/);
    expect(shareCaption({ miles: -4 })).toMatch(/^Denver: 0 miles/);
  });
});

describe("shareFilename", () => {
  it("slugs the save name and keeps the miles-and-miles suffix", () => {
    expect(shareFilename("CJ's Denver")).toBe("cjs-denver-miles-and-miles.png");
    expect(shareFilename("Demo city")).toBe("demo-city-miles-and-miles.png");
    expect(shareFilename("Mile   High")).toBe("mile-high-miles-and-miles.png");
  });

  it("drops characters that would make a path", () => {
    expect(shareFilename("../../etc/passwd")).toBe("etc-passwd-miles-and-miles.png");
    expect(shareFilename("Austin!!!")).toBe("austin-miles-and-miles.png");
    expect(shareFilename("   ", "Austin")).toBe("austin-miles-and-miles.png");
    expect(shareFilename("")).toBe("denver-miles-and-miles.png");
    expect(shareFilename("---")).toBe("city-miles-and-miles.png");
  });
});

describe("shareFooter", () => {
  it("puts the name, the counts, and the credit on the band", () => {
    expect(shareFooter({ name: "Training block", miles: 12.5, buildings: 40, landmarks: 3 })).toEqual({
      name: "Training block",
      stats: "12.5 MI · 40 BLDG · 3 LANDMARKS",
      credit: "Miles and Miles · marathon-city.vercel.app",
    });
    expect(SHARE_CREDIT).toBe("Miles and Miles · marathon-city.vercel.app");
    expect(footerBandHeight()).toBeLessThan(120);
  });

  it("treats a missing count as zero", () => {
    expect(shareFooter({ name: "Demo city" }).stats).toBe("0 MI · 0 BLDG · 0 LANDMARKS");
    expect(shareFooter({ name: "Demo city", buildings: 2.9, landmarks: -1 }).stats).toBe(
      "0 MI · 2 BLDG · 0 LANDMARKS",
    );
  });
});

describe("shareMessage", () => {
  it("is the title, the sentence, and the file the sheet receives", () => {
    expect(SHARE_TITLE).toBe("Miles and Miles");
    expect(shareMessage({ name: "Training block", miles: 3 })).toEqual({
      title: "Miles and Miles",
      text: "Training block: 3 miles of running built this city. https://marathon-city.vercel.app",
      filename: "training-block-miles-and-miles.png",
    });
  });
});

describe("shareBandPalette", () => {
  it("uses Denver gold and Austin burnt orange", () => {
    expect(shareBandPalette("Denver")).toMatchObject({
      background: "#05143a",
      stats: "#fdd835",
      rule: "#fdd835",
    });
    expect(shareBandPalette("Austin")).toMatchObject({
      background: "#2c1810",
      name: "#f4e6c8",
      stats: "#bf5700",
      rule: "#bf5700",
    });
    expect(shareBandPalette("austin").background).toBe("#2c1810");
    expect(shareBandPalette("Boulder").background).toBe("#05143a");
    expect(shareBandPalette().rule).toBe("#fdd835");
  });
});

describe("shareFrame", () => {
  const diamond = cityDiamond();
  const frame = shareFrame(diamond);

  it("is a 4:5 portrait at an integer scale", () => {
    expect(frame.scale).toBe(1);
    expect(Number.isInteger(frame.scale)).toBe(true);
    expect(frame.height / frame.width).toBeCloseTo(5 / 4, 2);
    expect(Number.isInteger(frame.panX)).toBe(true);
    expect(Number.isInteger(frame.panY)).toBe(true);
  });

  it("fits the diamond across most of the width, with sky above and ground below", () => {
    const diamondW = diamond.right - diamond.left;
    expect((diamondW * frame.scale) / frame.width).toBeCloseTo(0.86, 2);
    const left = frame.panX + diamond.left * frame.scale;
    const right = frame.panX + diamond.right * frame.scale;
    const back = frame.panY + diamond.top * frame.scale;
    const front = frame.panY + diamond.bottom * frame.scale;
    expect(left).toBeGreaterThan(8);
    expect(right).toBeLessThan(frame.width - 8);
    expect(Math.abs(left - (frame.width - right))).toBeLessThanOrEqual(1);
    expect(back).toBe(frame.skyBand);
    expect(back).toBeGreaterThan(frame.height * 0.15);
    expect(front).toBeLessThan(frame.height - 40);
  });
});

describe("footerPixelScale", () => {
  it("grows the band by whole pixels on a wide picture", () => {
    expect(footerPixelScale(390)).toBe(1);
    expect(footerPixelScale(1200)).toBe(3);
    expect(footerBandHeight(3)).toBe(footerBandHeight(1) * 3);
    expect(footerBandHeight()).toBeLessThan(120);
  });
});

describe("isShareCancel", () => {
  it("treats a closed share sheet as a cancel", () => {
    expect(isShareCancel({ name: "AbortError" })).toBe(true);
    expect(isShareCancel("AbortError")).toBe(true);
    expect(isShareCancel(new Error("nope"))).toBe(false);
    expect(isShareCancel(null)).toBe(false);
  });
});
