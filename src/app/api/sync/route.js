// POST /api/sync
// Log run. Pulls Strava activities that started after last_synced_at minus
// one hour, drops any id already stored, then moves last_synced_at to now.
// The hour of overlap is what keeps a run that was still uploading from
// being missed; the primary key is what keeps the overlap from building it twice.
// An empty pull does not move the timestamp, and the client asks for a distance.

import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { cityPayload } from "@/lib/payload";
import { getUserId } from "@/lib/session";
import { fetchActivitiesSince, validTokens } from "@/lib/strava";

function sortNew(rows) {
  return [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq));
}

export async function POST() {
  const userId = await getUserId();
  const store = getStore();
  await store.ensureUser(userId);
  const save = await store.getSave(userId);
  if (!save) return NextResponse.json({ error: "No city yet." }, { status: 400 });

  if (save.demo) {
    const payload = await cityPayload(userId);
    return NextResponse.json({ ...payload, needsManual: true, newActivities: [] });
  }

  const tokens = await validTokens(store, userId);
  if (!tokens) {
    const payload = await cityPayload(userId);
    return NextResponse.json({ ...payload, needsManual: true, newActivities: [] });
  }

  let after = 0;
  if (save.lastSyncedAt) {
    after = Math.floor(new Date(save.lastSyncedAt).getTime() / 1000) - 60 * 60;
  } else if (save.startMode === "date" && save.startDate) {
    after = Math.floor(new Date(`${save.startDate}T00:00:00Z`).getTime() / 1000);
  }

  let fetched;
  try {
    fetched = await fetchActivitiesSince(tokens.accessToken, after);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
  if (save.startMode === "date" && save.startDate) {
    fetched = fetched.filter((a) => a.date >= save.startDate);
  }
  const fresh = sortNew(await store.addActivities(userId, fetched));
  if (fresh.length === 0) {
    const payload = await cityPayload(userId);
    return NextResponse.json({ ...payload, needsManual: true, newActivities: [] });
  }

  // Timestamp moves only after the new rows are stored. A failed request
  // above never reaches this line, so the next press covers the same window.
  save.lastSyncedAt = new Date().toISOString();
  await store.saveCity(userId, save);
  const payload = await cityPayload(userId);
  return NextResponse.json({ ...payload, needsManual: false, newActivities: fresh });
}
