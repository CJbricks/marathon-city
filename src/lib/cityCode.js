// City codes. A save can be opened on another phone by typing the five
// digits shown in the menu. This file only checks the shape of a code and
// decides when to stop guessing. It does not talk to the database.
// The route and the store call these functions so both stay in agreement.

export const CODE_LENGTH = 5;
export const CODE_ERROR = "That code did not work.";

// Five wrong tries inside a minute, then a wait that doubles.
// 100,000 codes is small enough to guess, so the wait is the real lock.
const MAX_FAILS = 5;
const WINDOW_MS = 60 * 1000;
const BACKOFF_BASE_MS = 30 * 1000;
const BACKOFF_CAP_MS = 15 * 60 * 1000;

// "04 821" and "04821" both become "04821". Anything that is not exactly
// five digits is refused. A short code must not match a city by accident.
export function normalizeCityCode(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length !== CODE_LENGTH) return null;
  return digits;
}

export function randomCityCode(random = Math.random) {
  return String(Math.floor(random() * 100000)).padStart(CODE_LENGTH, "0");
}

export function takeCityCode(used, random = Math.random) {
  for (let i = 0; i < 50; i += 1) {
    const code = randomCityCode(random);
    if (!used.has(code)) {
      used.add(code);
      return code;
    }
  }
  return null;
}

// One key per device (the user id cookie) and one per IP when we have one.
// Guessing from a new browser on the same network still hits the IP key.
export function attemptKeys(header, userId) {
  const forwarded = header("x-forwarded-for") || "";
  const ip = (forwarded.split(",")[0] || header("x-real-ip") || "").trim();
  const keys = [`user:${userId}`];
  if (ip) keys.push(`ip:${ip}`);
  return keys;
}

export function peekAttempt(state, now) {
  if (state?.lockedUntil && state.lockedUntil > now) {
    return { allowed: false, retryAt: state.lockedUntil };
  }
  return { allowed: true };
}

// A quiet stretch longer than the cap starts the count over, so a person
// who typed a code wrong yesterday is not still locked out.
export function recordFailure(state, now) {
  const quiet = !state || now - (state.lockedUntil || state.windowStart || 0) > BACKOFF_CAP_MS;
  const inWindow = !quiet && state.windowStart && now - state.windowStart < WINDOW_MS;
  const continuing = !quiet && state.lockedUntil && now >= state.lockedUntil && now - state.lockedUntil < WINDOW_MS;
  let failures = 1;
  let windowStart = now;
  if (inWindow) {
    failures = (state.failures || 0) + 1;
    windowStart = state.windowStart;
  } else if (continuing) {
    failures = (state.failures || 0) + 1;
  }
  let lockedUntil = 0;
  if (failures >= MAX_FAILS) {
    const steps = failures - MAX_FAILS;
    const wait = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** steps);
    lockedUntil = now + wait;
  }
  return { failures, windowStart, lockedUntil };
}

export function clearAttempt(now) {
  return { failures: 0, windowStart: now, lockedUntil: 0 };
}
