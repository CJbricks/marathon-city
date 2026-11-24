// GET  /api/records — the medal's rows from the cache. No Strava call.
// POST /api/records — the same rows, after a short batch of detail
// requests when this browser has its own Strava token.
//
// A city code on a phone that never connected Strava still gets the
// cache. That request does not use the city owner's token. The owner's
// rate limit is spent only when the owner syncs or opens the medal.

import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { cachedRecords, fillEfforts } from "@/lib/effortFill";
import { utcToday } from "@/lib/replay";
import { getUserId } from "@/lib/session";
import { validTokens } from "@/lib/strava";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function load(userId) {
  const store = getStore();
  await store.ensureUser(userId);
  const save = await store.getSave(userId);
  if (!save) return { store, save: null, activities: [], asOf: utcToday() };
  const activities = await store.listActivities(save.id);
  return { store, save, activities, asOf: utcToday() };
}

export async function GET() {
  const userId = await getUserId();
  const { store, save, activities, asOf } = await load(userId);
  if (!save) return NextResponse.json({ error: "No city yet." }, { status: 400 });
  const records = await cachedRecords(store, activities, save, asOf);
  const tokens = await store.getTokens(userId);
  return NextResponse.json({ records, filled: 0, paused: false, connected: Boolean(tokens) });
}

export async function POST() {
  const userId = await getUserId();
  const { store, save, activities, asOf } = await load(userId);
  if (!save) return NextResponse.json({ error: "No city yet." }, { status: 400 });

  let connected = false;
  let filled = 0;
  let paused = false;
  let authError = null;
  try {
    const tokens = await validTokens(store, userId);
    if (tokens) {
      connected = true;
      const batch = await fillEfforts(store, tokens.accessToken, activities, save, asOf);
      filled = batch.filled;
      paused = batch.paused;
    }
  } catch (error) {
    // Refresh can fail closed. The cache is still shown. The message is
    // the one validTokens already chose; it does not include the token.
    authError = error?.message || "Strava login expired. Connect again.";
    console.error("strava effort refresh failed");
  }

  const records = await cachedRecords(store, activities, save, asOf);
  return NextResponse.json({ records, filled, paused, connected, authError });
}
