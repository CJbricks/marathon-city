// POST /api/city/code
// Opens the city that wears this five-digit code. The browser keeps its
// own user id, so Strava on this phone is a separate login from the
// owner's phone. A wrong code and a locked-out guesser get the same
// sentence. The lookup does not run while the guesser is locked.

import { NextResponse } from "next/server";
import {
  CODE_ERROR,
  attemptKeys,
  clearAttempt,
  normalizeCityCode,
  peekAttempt,
  recordFailure,
} from "@/lib/cityCode";
import { getStore } from "@/lib/db";
import { cityPayload } from "@/lib/payload";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function blocked(store, keys, now) {
  for (const key of keys) {
    const state = await store.getCodeAttempt(key);
    if (!peekAttempt(state, now).allowed) return true;
  }
  return false;
}

async function fail(store, keys, now) {
  for (const key of keys) {
    const state = await store.getCodeAttempt(key);
    await store.setCodeAttempt(key, recordFailure(state, now));
  }
}

export async function POST(request) {
  const userId = await getUserId();
  const store = getStore();
  await store.ensureUser(userId);
  const now = Date.now();
  const keys = attemptKeys((name) => request.headers.get(name), userId);
  if (await blocked(store, keys, now)) {
    return NextResponse.json({ error: CODE_ERROR }, { status: 429 });
  }
  const body = await request.json().catch(() => ({}));
  const code = normalizeCityCode(body.code);
  if (!code) {
    await fail(store, keys, now);
    return NextResponse.json({ error: CODE_ERROR }, { status: 400 });
  }
  const save = await store.claimCode(userId, code);
  if (!save) {
    await fail(store, keys, now);
    return NextResponse.json({ error: CODE_ERROR }, { status: 400 });
  }
  for (const key of keys) await store.setCodeAttempt(key, clearAttempt(now));
  return NextResponse.json(await cityPayload(userId));
}
