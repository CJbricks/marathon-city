// The mapper is pure so a trail run can be checked without calling Strava.
import { describe, expect, it } from "vitest";
import { stravaActivityType } from "./strava.js";

describe("stravaActivityType", () => {
  it("prefers sport_type and stores a trail run under the run list", () => {
    expect(stravaActivityType({ sport_type: "TrailRun", type: "Run" })).toBe("TrailRun");
    expect(stravaActivityType({ sport_type: "Trail Run", type: "Run" })).toBe("TrailRun");
    expect(stravaActivityType({ type: "TrailRun" })).toBe("TrailRun");
    expect(stravaActivityType({ sport_type: "Ride", type: "Run" })).toBe("Ride");
    expect(stravaActivityType({ type: "Run" })).toBe("Run");
    expect(stravaActivityType({})).toBe("Workout");
  });
});
