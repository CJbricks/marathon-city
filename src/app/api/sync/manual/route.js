// POST /api/sync/manual
// Used when Strava had nothing new, or when there is no connection. The
// typed distance becomes an ordinary run and goes through the same replay
// as a synced one. 10:00 per mile is a stand-in pace: the form only asks
// for distance, and a made-up sprint would unlock the Art Museum by accident.
// There is no startLocal either. Inventing 5:59am would unlock Rockman's
// Bakery on an Austin save. A typed run has no watch time, so it does not count.

import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { cityPayload } from "@/lib/payload";
import { utcToday } from "@/lib/replay";
import { getUserId } from "@/lib/session";

export async function POST(request) {
  const userId = await getUserId();
  const body = await request.json().catch(() => ({}));
  const miles = Number(body.miles);
  if (!(miles > 0) || miles > 200) {
    return NextResponse.json({ error: "Enter a distance in miles." }, { status: 400 });
  }
  const store = getStore();
  await store.ensureUser(userId);
  const save = await store.getSave(userId);
  if (!save) return NextResponse.json({ error: "No city yet." }, { status: 400 });

  const now = new Date();
  const activity = {
    stravaId: `manual-${now.getTime()}`,
    type: "Run",
    date: body.date || utcToday(),
    miles: Math.round(miles * 100) / 100,
    seconds: Math.round(miles * 10 * 60),
    title: "Manual run",
    seq: Math.floor(now.getTime() / 1000),
  };
  const fresh = await store.addActivities(userId, save.id, [activity]);
  save.lastSyncedAt = now.toISOString();
  await store.saveCity(userId, save);
  const payload = await cityPayload(userId);
  return NextResponse.json({ ...payload, needsManual: false, newActivities: fresh });
}
