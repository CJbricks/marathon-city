// The celebration must cover the saved local day and no other day.
// Dates are built with the local Date constructor so the test does not
// depend on the machine's UTC offset.

import { describe, expect, it } from "vitest";
import { isRaceDay, uniqueLandmarkCount } from "./raceDay.js";

describe("isRaceDay", () => {
  const race = "2027-02-14";
  const at = (h, m, day = 14) => new Date(2027, 1, day, h, m, 0);

  it("is true for the whole local day and false the day before and after", () => {
    expect(isRaceDay(race, at(0, 0))).toBe(true);
    expect(isRaceDay(race, at(23, 59))).toBe(true);
    expect(isRaceDay(race, at(23, 59, 13))).toBe(false);
    expect(isRaceDay(race, at(0, 1, 15))).toBe(false);
  });

  it("is false when no date was saved", () => {
    expect(isRaceDay(null, at(12, 0))).toBe(false);
    expect(isRaceDay("", at(12, 0))).toBe(false);
  });
});

describe("uniqueLandmarkCount", () => {
  it("counts each landmark type once", () => {
    const city = {
      landmarks: [
        { key: "cathedral" },
        { key: "cathedral" },
        { key: "capitol" },
        { key: "unionStation" },
      ],
    };
    expect(uniqueLandmarkCount(city)).toBe(3);
    expect(uniqueLandmarkCount(null)).toBe(0);
  });
});
