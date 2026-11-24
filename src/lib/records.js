// Personal records for the medal in the corner.
//
// Strava's activity list (the one Log run already stores) does not include
// best efforts. Those arrive only on the detailed activity, and only for
// runs. This file does not call Strava. It decides which cached efforts
// count for the city on screen, and it decides when another detail request
// would cross Strava's rate limit.
//
// The five distances are the ones CJ asked for. A best effort with any
// other name (a 10 mile, a 400m, a segment) is ignored. The activity's own
// moving time is not a stand-in: a 5 mile run is not a 1 mile personal
// record. pr_rank is ignored too. That rank is Strava's all-time mark, and
// this city may have started on a later date.

import { isRunActivity } from "./replay.js";

// Names are matched after trimming and lowercasing. "Half Marathon" is
// accepted because a hyphen is the only difference from Strava's
// "Half-Marathon". "10 mile" is not a marathon, and "1/2 mile" is not a half.
export const RECORD_DISTANCES = [
  { key: "mile", label: "Mile", names: ["1 mile"] },
  { key: "5k", label: "5K", names: ["5k"] },
  { key: "10k", label: "10K", names: ["10k"] },
  { key: "half", label: "Half Marathon", names: ["half-marathon", "half marathon"] },
  { key: "marathon", label: "Marathon", names: ["marathon"] },
];

const NAME_TO_KEY = new Map();
for (const distance of RECORD_DISTANCES) {
  for (const name of distance.names) NAME_TO_KEY.set(name, distance.key);
}

// Strava's default app limit, shared by every person using this app.
// Detail fetches stop ten short of it so Log run can still page the
// activity list and refresh a token in the same window.
export const STRAVA_QUARTER_LIMIT = 100;
export const STRAVA_DAY_LIMIT = 1000;
export const STRAVA_QUARTER_MS = 15 * 60 * 1000;
export const STRAVA_DAY_MS = 24 * 60 * 60 * 1000;
export const STRAVA_READ_RESERVE = 10;

// A few activities per click. The rest wait for the next open, which is
// what keeps one city from spending the whole 15-minute budget.
export const EFFORT_BATCH = 5;

export function distanceKey(name) {
  return NAME_TO_KEY.get(String(name || "").trim().toLowerCase()) || null;
}

// Summary activities use ids like "demo-3" and "manual-…". Those are not
// Strava activities, so asking /activities/{id} for them would 404 and
// burn a request. Only a string of digits is fetched.
export function isStravaActivityId(id) {
  return /^\d+$/.test(String(id || ""));
}

export function stravaActivityUrl(stravaId) {
  if (!isStravaActivityId(stravaId)) return null;
  return `https://www.strava.com/activities/${stravaId}`;
}

// Under an hour is m:ss, so a 5K reads 19:40. An hour or more is h:mm:ss,
// so a marathon reads 3:15:00. Zero and anything that is not a number are
// refused: the caller drops that row instead of printing a placeholder.
export function formatRecordTime(seconds) {
  const total = Math.round(Number(seconds));
  if (!Number.isFinite(total) || total <= 0) return null;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const ss = String(secs).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  return `${minutes}:${ss}`;
}

// Same window the skyline uses. A dated city starts on its start date.
// All-history and demo have no start. asOf is today, so a row dated in
// the future (a clock skew, a bad import) does not become a record.
export function activityInRange(activity, save, asOf) {
  const date = activity?.date;
  if (!date || typeof date !== "string") return false;
  if (asOf && date > asOf) return false;
  if (save && save.startMode === "date" && save.startDate && date < save.startDate) return false;
  return true;
}

// Pull the five distances off a detailed activity. elapsed_time is the
// number Strava shows for that effort. moving_time is not copied in when
// elapsed_time is missing. segment_efforts is a different list and is
// not read.
export function effortsFromDetail(detail) {
  const list = Array.isArray(detail?.best_efforts) ? detail.best_efforts : [];
  const efforts = [];
  for (const effort of list) {
    const key = distanceKey(effort?.name);
    if (!key) continue;
    const seconds = Math.round(Number(effort?.elapsed_time));
    if (!Number.isFinite(seconds) || seconds <= 0) continue;
    const distance = RECORD_DISTANCES.find((row) => row.key === key);
    efforts.push({ name: distance.names[0], seconds });
  }
  return efforts;
}

function betterRecord(next, current) {
  if (next.seconds !== current.seconds) return next.seconds < current.seconds;
  if (next.date !== current.date) return next.date < current.date;
  return String(next.stravaId) < String(current.stravaId);
}

// cache is { [stravaId]: { efforts } }. A missing key on a real Strava id
// means "not fetched yet", which sets pending and does not invent a time.
// An empty efforts array means we asked and this run had none of the five.
// Demo and manual ids are not pending: there is nothing to fetch.
export function selectPersonalRecords(activities, cache = {}, { save, asOf } = {}) {
  const runs = [];
  for (const activity of activities || []) {
    if (!activityInRange(activity, save, asOf)) continue;
    if (!isRunActivity(activity)) continue;
    runs.push(activity);
  }

  const best = new Map();
  let pending = false;
  let cached = 0;
  for (const activity of runs) {
    const id = String(activity.stravaId || "");
    const entry = cache[id];
    if (isStravaActivityId(id) && !entry) {
      pending = true;
      continue;
    }
    cached += 1;
    const efforts = Array.isArray(entry?.efforts) ? entry.efforts : [];
    for (const effort of efforts) {
      const key = distanceKey(effort?.name);
      if (!key) continue;
      const seconds = Math.round(Number(effort?.seconds));
      if (!Number.isFinite(seconds) || seconds <= 0) continue;
      const candidate = {
        key,
        seconds,
        date: activity.date,
        title: typeof activity.title === "string" ? activity.title : "",
        stravaId: id,
      };
      const current = best.get(key);
      if (!current || betterRecord(candidate, current)) best.set(key, candidate);
    }
  }

  const rows = [];
  for (const distance of RECORD_DISTANCES) {
    const won = best.get(distance.key);
    if (!won) continue;
    const time = formatRecordTime(won.seconds);
    if (!time) continue;
    rows.push({
      key: distance.key,
      label: distance.label,
      seconds: won.seconds,
      time,
      date: won.date,
      title: won.title,
      stravaId: won.stravaId,
      url: stravaActivityUrl(won.stravaId),
    });
  }
  return { rows, pending, runs: runs.length, cached };
}

// stamps are instants (ms or ISO) of detail requests already made.
// forDetails is how many more this process may send right now.
export function readBudget(stamps, now = Date.now()) {
  let quarter = 0;
  let day = 0;
  for (const stamp of stamps || []) {
    const t = typeof stamp === "number" ? stamp : new Date(stamp).getTime();
    if (!Number.isFinite(t)) continue;
    const age = now - t;
    if (age >= 0 && age < STRAVA_DAY_MS) day += 1;
    if (age >= 0 && age < STRAVA_QUARTER_MS) quarter += 1;
  }
  const room = Math.max(0, Math.min(STRAVA_QUARTER_LIMIT - quarter, STRAVA_DAY_LIMIT - day));
  return {
    quarter,
    day,
    room,
    forDetails: Math.max(0, room - STRAVA_READ_RESERVE),
  };
}
