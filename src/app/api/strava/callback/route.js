// GET /api/strava/callback
// Strava redirects here with ?code= after the owner approves. The code is
// exchanged for tokens on the server and stored. The browser is then sent
// back to the opening flow, which continues at the start-date screen.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { exchangeCode } from "@/lib/strava";

function home(origin, query) {
  return NextResponse.redirect(new URL(`/?${query}`, origin));
}

export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get("error")) {
    return home(url.origin, "strava=denied");
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get("mc_oauth")?.value;
  jar.delete("mc_oauth");
  if (!code || !state || state !== expected) {
    return home(url.origin, "strava=error");
  }
  try {
    const userId = await getUserId();
    const store = getStore();
    await store.ensureUser(userId);
    const tokens = await exchangeCode(code);
    await store.saveTokens(userId, tokens);
  } catch {
    return home(url.origin, "strava=error");
  }
  return home(url.origin, "strava=connected");
}
