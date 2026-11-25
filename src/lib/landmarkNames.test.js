// The popup must say the real place, not the short string the replay stores.
// This list is the contract. A rename edits landmarkNames.js and this file.

import { describe, expect, it } from "vitest";
import {
  describeRun,
  formatPace,
  isPopupKey,
  landmarkName,
  mappingList,
} from "./landmarkNames.js";

describe("landmark names", () => {
  it("maps every stored name to the real place", () => {
    expect(mappingList()).toEqual([
      { theme: "Denver", key: "capitol", stored: "State Capitol", name: "Colorado State Capitol", popup: true },
      { theme: "Denver", key: "unionStation", stored: "Union Station", name: "Union Station", popup: true },
      {
        theme: "Denver",
        key: "courthouse",
        stored: "Courthouse",
        name: "Byron R. White U.S. Courthouse",
        popup: true,
      },
      {
        theme: "Denver",
        key: "artMuseum",
        stored: "Denver Art Museum",
        name: "Denver Art Museum",
        popup: true,
      },
      {
        theme: "Denver",
        key: "cathedral",
        stored: "Cathedral Basilica",
        name: "Cathedral Basilica of the Immaculate Conception",
        popup: true,
      },
      { theme: "Austin", key: "capitol", stored: "State Capitol", name: "Texas State Capitol", popup: true },
      {
        theme: "Austin",
        key: "unionStation",
        stored: "Union Station",
        name: "Congress Avenue Bridge",
        popup: true,
      },
      { theme: "Austin", key: "courthouse", stored: "Courthouse", name: "UT Tower", popup: true },
      {
        theme: "Austin",
        key: "artMuseum",
        stored: "Denver Art Museum",
        name: "Blanton Museum of Art",
        popup: true,
      },
      {
        theme: "Austin",
        key: "cathedral",
        stored: "Cathedral Basilica",
        name: "Saint Mary Cathedral",
        popup: true,
      },
      {
        theme: "Austin",
        key: "lbjLibrary",
        stored: "LBJ Presidential Library",
        name: "LBJ Presidential Library",
        popup: true,
      },
      { theme: "Austin", key: "marthasGallery", stored: "Martha's Art Gallery", name: "Martha's", popup: true },
      { theme: "Austin", key: "rockmansBakery", stored: "Rockman's Bakery", name: "Rockman Coffee", popup: true },
    ]);
  });

  it("uses the theme, so the same slot is a different building", () => {
    expect(landmarkName("Denver", "capitol")).toBe("Colorado State Capitol");
    expect(landmarkName("Austin", "capitol")).toBe("Texas State Capitol");
    expect(landmarkName("Austin", "unionStation")).toBe("Congress Avenue Bridge");
    expect(landmarkName("Denver", "lbjLibrary")).toBeNull();
    expect(landmarkName("Boulder", "capitol")).toBe("Colorado State Capitol");
  });

  it("does not treat a house or a park as a landmark card", () => {
    expect(isPopupKey("capitol")).toBe(true);
    expect(isPopupKey("rowhouse")).toBe(false);
    expect(isPopupKey("Cheesman Park")).toBe(false);
    expect(isPopupKey("")).toBe(false);
  });
});

describe("describeRun", () => {
  it("formats the date, the distance, the pace, and a numeric Strava link", () => {
    expect(formatPace(8, 4000)).toBe("8:20 /MI");
    expect(
      describeRun({ date: "2024-05-12", miles: 6.2, seconds: 3120, stravaId: "12345" }),
    ).toEqual({
      linked: true,
      date: "2024-05-12",
      distance: "6.20 MI",
      pace: "8:23 /MI",
      url: "https://www.strava.com/activities/12345",
    });
  });

  it("keeps a demo or typed run and does not invent a Strava page", () => {
    const demo = describeRun({ date: "2020-01-10", miles: 10, seconds: 6000, stravaId: "demo-3" });
    expect(demo.linked).toBe(true);
    expect(demo.url).toBeNull();
    expect(demo.distance).toBe("10.00 MI");
    expect(demo.pace).toBe("10:00 /MI");
    expect(describeRun({ date: "2024-01-01", miles: 3, seconds: 0, stravaId: "manual-1" }).pace).toBeNull();
  });

  it("says nothing is linked when the landmark has no run", () => {
    expect(describeRun(null)).toEqual({ linked: false });
    expect(describeRun({})).toEqual({ linked: false });
  });
});
