// POST /api/city/reset
// Forgets the save and its activities after the owner confirms. The Strava
// connection stays, so the next city does not have to ask for permission again.

import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { cityPayload } from "@/lib/payload";
import { getUserId } from "@/lib/session";

export async function POST() {
  const userId = await getUserId();
  const store = getStore();
  await store.ensureUser(userId);
  await store.clearCity(userId);
  return NextResponse.json(await cityPayload(userId));
}
