// Fetches a few missing best-effort lists and turns the cache into the
// medal's rows. Route handlers call this. The browser does not: a client
// bundle that imported it would also import the Strava token code.
//
// One activity is fetched once. The row is kept even when the five
// distances are all absent, so the next page load does not ask again.
// A rate-limit response is not cached. That run stays pending and the
// batch stops.

import { isRunActivity } from "./replay.js";
import {
  EFFORT_BATCH,
  STRAVA_DAY_MS,
  activityInRange,
  effortsFromDetail,
  isStravaActivityId,
  readBudget,
  selectPersonalRecords,
} from "./records.js";
import { fetchActivityDetail } from "./strava.js";

export async function cachedRecords(store, activities, save, asOf) {
  const ids = [];
  for (const activity of activities || []) {
    if (!activityInRange(activity, save, asOf) || !isRunActivity(activity)) continue;
    if (isStravaActivityId(activity.stravaId)) ids.push(String(activity.stravaId));
  }
  const cache = ids.length ? await store.getEfforts(ids) : {};
  return selectPersonalRecords(activities, cache, { save, asOf });
}

function uncachedRuns(activities, save, asOf, cache) {
  const missing = [];
  for (const activity of activities || []) {
    if (!activityInRange(activity, save, asOf) || !isRunActivity(activity)) continue;
    const id = String(activity.stravaId || "");
    if (!isStravaActivityId(id) || cache[id]) continue;
    missing.push(activity);
  }
  // Longer runs first. A marathon effort cannot hide on a 2 mile jog, so
  // the panel can show the long distances before every easy run is cached.
  missing.sort((a, b) => (Number(b.miles) || 0) - (Number(a.miles) || 0) || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return missing;
}

export async function fillEfforts(store, accessToken, activities, save, asOf) {
  if (!accessToken) return { filled: 0, paused: false };
  const ids = [];
  for (const activity of activities || []) {
    if (isStravaActivityId(activity?.stravaId)) ids.push(String(activity.stravaId));
  }
  const cache = ids.length ? await store.getEfforts(ids) : {};
  const missing = uncachedRuns(activities, save, asOf, cache);
  if (!missing.length) return { filled: 0, paused: false };

  const stamps = await store.listReadStamps(Date.now() - STRAVA_DAY_MS);
  const budget = readBudget(stamps);
  const take = Math.min(EFFORT_BATCH, budget.forDetails);
  if (take <= 0) return { filled: 0, paused: true };

  let filled = 0;
  for (const activity of missing.slice(0, take)) {
    // Count the request before it leaves. Two clicks then share one
    // budget instead of both believing the window is empty.
    await store.recordRead();
    const result = await fetchActivityDetail(accessToken, activity.stravaId);
    if (result.status === "ok") {
      await store.saveEffort(activity.stravaId, effortsFromDetail(result.activity));
      filled += 1;
      continue;
    }
    if (result.status === "missing") {
      // Deleted on Strava. Remember that, or every open will ask again.
      await store.saveEffort(activity.stravaId, []);
      filled += 1;
      continue;
    }
    // 429, a refused token, or a network error. Leave this run uncached
    // and do not spend the rest of the batch.
    return { filled, paused: true };
  }
  return { filled, paused: false };
}
