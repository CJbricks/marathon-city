// The JSON a page load and a Log run share. Activities in the response are
// already filtered to the save's start date, and `city` was replayed with
// `asOf`. The browser caches this object and, while a run animates, replays
// the same function locally so it does not need a new request per frame.

import { getStore, storageKind } from "./db.js";
import { replay, utcToday, visibleActivities } from "./replay.js";
import { stravaConfigured } from "./strava.js";

export async function cityPayload(userId) {
  const store = getStore();
  await store.ensureUser(userId);
  const save = await store.getSave(userId);
  const stored = save ? await store.listActivities(userId) : [];
  const asOf = utcToday();
  const activities = save ? visibleActivities(stored, save) : [];
  const tokens = await store.getTokens(userId);
  return {
    save,
    activities,
    city: save ? replay(activities, save, asOf) : null,
    asOf,
    connected: Boolean(tokens),
    stravaConfigured: stravaConfigured(),
    storage: storageKind(),
  };
}
