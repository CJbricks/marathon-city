// The five-digit code and the guess limit. These stay pure so a wrong
// code cannot be checked a thousand times just because the test has no
// database.
import { describe, expect, it } from "vitest";
import {
  CODE_ERROR,
  attemptKeys,
  clearAttempt,
  normalizeCityCode,
  peekAttempt,
  randomCityCode,
  recordFailure,
  takeCityCode,
} from "./cityCode.js";

describe("normalizeCityCode", () => {
  it("keeps five digits and drops spaces", () => {
    expect(normalizeCityCode("04821")).toBe("04821");
    expect(normalizeCityCode(" 04 821 ")).toBe("04821");
    expect(normalizeCityCode("00000")).toBe("00000");
  });

  it("refuses a short, long, or empty code", () => {
    expect(normalizeCityCode("4821")).toBeNull();
    expect(normalizeCityCode("048211")).toBeNull();
    expect(normalizeCityCode("")).toBeNull();
    expect(normalizeCityCode(null)).toBeNull();
  });
});

describe("takeCityCode", () => {
  it("pads to five digits and skips a code that is taken", () => {
    expect(randomCityCode(() => 0.04821)).toBe("04821");
    const used = new Set(["04821"]);
    let n = 0;
    const code = takeCityCode(used, () => {
      n += 1;
      return n === 1 ? 0.04821 : 0.10001;
    });
    expect(code).toBe("10001");
    expect(used.has("10001")).toBe(true);
  });
});

describe("attempt keys", () => {
  it("limits the device and the IP together", () => {
    const header = (name) => (name === "x-forwarded-for" ? "203.0.113.4, 10.0.0.1" : "");
    expect(attemptKeys(header, "user-a")).toEqual(["user:user-a", "ip:203.0.113.4"]);
    expect(attemptKeys(() => "", "user-a")).toEqual(["user:user-a"]);
  });
});

describe("guess limit", () => {
  it("allows a few tries, then waits, and the wait grows", () => {
    let state = null;
    const start = 1_000_000;
    for (let i = 0; i < 4; i += 1) {
      expect(peekAttempt(state, start + i * 1000).allowed).toBe(true);
      state = recordFailure(state, start + i * 1000);
      expect(state.lockedUntil).toBe(0);
    }
    expect(peekAttempt(state, start + 5000).allowed).toBe(true);
    state = recordFailure(state, start + 5000);
    expect(state.failures).toBe(5);
    expect(state.lockedUntil).toBe(start + 5000 + 30_000);
    expect(peekAttempt(state, start + 10_000).allowed).toBe(false);

    const after = state.lockedUntil + 10;
    expect(peekAttempt(state, after).allowed).toBe(true);
    const again = recordFailure(state, after);
    expect(again.lockedUntil - after).toBe(60_000);
  });

  it("starts over after a long quiet stretch and clears on a success", () => {
    const locked = recordFailure(
      { failures: 5, windowStart: 0, lockedUntil: 50_000 },
      50_000 + 15 * 60 * 1000 + 1,
    );
    expect(locked.failures).toBe(1);
    expect(locked.lockedUntil).toBe(0);
    expect(clearAttempt(60_000)).toEqual({ failures: 0, windowStart: 60_000, lockedUntil: 0 });
    expect(CODE_ERROR).toMatch(/did not work/);
  });
});
