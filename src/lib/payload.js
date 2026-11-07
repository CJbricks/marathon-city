// The JSON a page load and a Log run share. Activities in the response are
// already filtered to the active save's start date, and `city` was replayed
// with `asOf`. `saves` is the short list for the resume screen (name, start,
// miles). The browser caches this object and, while a run animates, replays
// the same function locally so it does not need a new request per frame.
// Replaying three cities is the same function as replaying one. The miles
// still come only from that city's own rows. `code` is the five digits
// another phone can type to open this same city.

import { getStore, storageKind } from "./db.js";
import { replay, utcToday, visibleActivities } from "./replay.js";
import { stravaConfigured } from "./strava.js";

// The page needs the city, not which account owns the row. ownerId stays
// on the server so a shared city can keep two Strava clocks apart.
function forClient(save) {
  if (!save) return null;
  const { ownerId, ...rest } = save;
  return rest;
}

async function replaySave(store, save, asOf) {
  const stored = await store.listActivities(save.id);
  const activities = visibleActivities(stored, save);
  return { activities, city: replay(activities, save, asOf) };
}

export async function cityPayload(userId) {
  const store = getStore();
  await store.ensureUser(userId);
  const saves = await store.listSaves(userId);
  // getSave follows a city code. listSaves does not, because a shared city
  // is not one of this browser's three slots.
  const playing = await store.getSave(userId);
  const asOf = utcToday();
  let active = null;
  let activeActivities = [];
  let activeCity = null;
  const summaries = [];
  for (const save of saves) {
    const played = await replaySave(store, save, asOf);
    const onScreen = playing ? save.id === playing.id : save.active;
    if (onScreen) {
      active = save;
      activeActivities = played.activities;
      activeCity = played.city;
    }
    summaries.push({
      id: save.id,
      name: save.name,
      slot: save.slot,
      city: save.city,
      startMode: save.startMode,
      startDate: save.startDate,
      demo: Boolean(save.demo),
      code: save.code || null,
      totalRunMiles: played.city.summary.totalRunMiles,
      buildings: played.city.buildings.length,
      active: playing ? save.id === playing.id : Boolean(save.active),
    });
  }
  if (playing && !active) {
    const played = await replaySave(store, playing, asOf);
    active = playing;
    activeActivities = played.activities;
    activeCity = played.city;
  }
  const tokens = await store.getTokens(userId);
  return {
    save: forClient(active),
    saves: summaries,
    activities: activeActivities,
    city: activeCity,
    asOf,
    connected: Boolean(tokens),
    stravaConfigured: stravaConfigured(),
    storage: storageKind(),
  };
}
