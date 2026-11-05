// The JSON a page load and a Log run share. Activities in the response are
// already filtered to the active save's start date, and `city` was replayed
// with `asOf`. `saves` is the short list for the resume screen (name, start,
// miles). The browser caches this object and, while a run animates, replays
// the same function locally so it does not need a new request per frame.
// Replaying three cities is the same function as replaying one. The miles
// still come only from that city's own rows.

import { getStore, storageKind } from "./db.js";
import { replay, utcToday, visibleActivities } from "./replay.js";
import { stravaConfigured } from "./strava.js";

export async function cityPayload(userId) {
  const store = getStore();
  await store.ensureUser(userId);
  const saves = await store.listSaves(userId);
  const asOf = utcToday();
  let active = null;
  let activeActivities = [];
  let activeCity = null;
  const summaries = [];
  for (const save of saves) {
    const stored = await store.listActivities(save.id);
    const activities = visibleActivities(stored, save);
    const city = replay(activities, save, asOf);
    if (save.active) {
      active = save;
      activeActivities = activities;
      activeCity = city;
    }
    summaries.push({
      id: save.id,
      name: save.name,
      slot: save.slot,
      active: Boolean(save.active),
      city: save.city,
      startMode: save.startMode,
      startDate: save.startDate,
      demo: Boolean(save.demo),
      totalRunMiles: city.summary.totalRunMiles,
      buildings: city.buildings.length,
    });
  }
  const tokens = await store.getTokens(userId);
  return {
    save: active,
    saves: summaries,
    activities: activeActivities,
    city: activeCity,
    asOf,
    connected: Boolean(tokens),
    stravaConfigured: stravaConfigured(),
    storage: storageKind(),
  };
}
