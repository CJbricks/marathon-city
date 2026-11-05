// GET /api/strava/callback
// Strava redirects the browser here after the owner approves. The code is
// exchanged for tokens on the server and stored under the same user id the
// rest of the site uses. The user id cookie is written onto this redirect.
// Relying only on cookies().set() can drop the Set-Cookie header when the
// handler returns a redirect, and the next /api/session would then be a
// different person with no tokens and an empty city.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { browserCookie } from "@/lib/browserCookie";
import { getStore } from "@/lib/db";
import { getUserId, USER_MAX_AGE } from "@/lib/session";
import { exchangeCode, hasActivityReadAll } from "@/lib/strava";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectHome(origin, query, userId) {
  const response = NextResponse.redirect(new URL(`/?${query}`, origin));
  response.cookies.set("mc_user", userId, browserCookie(USER_MAX_AGE));
  // maxAge 0 deletes the one-time state cookie. The Path and Secure flag
  // have to match the cookie that was set, or the browser keeps it.
  response.cookies.set("mc_oauth", "", browserCookie(0));
  return response;
}

export async function GET(request) {
  const url = new URL(request.url);
  const userId = await getUserId();
  if (url.searchParams.get("error")) {
    console.log("strava callback denied");
    return redirectHome(url.origin, "strava=denied", userId);
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = (await cookies()).get("mc_oauth")?.value;
  if (!code || !state || state !== expected) {
    console.error("strava callback rejected", !code ? "missing code" : "state mismatch");
    return redirectHome(url.origin, "strava=error", userId);
  }
  // Strava puts the boxes the owner left checked in `scope`. A missing
  // parameter is not the same as an unchecked box: only a present scope
  // that leaves out activity:read_all is refused.
  const scope = url.searchParams.get("scope");
  if (scope != null && !hasActivityReadAll(scope)) {
    console.error("strava callback missing activity:read_all");
    return redirectHome(url.origin, "strava=scope", userId);
  }
  try {
    const store = getStore();
    await store.ensureUser(userId);
    const tokens = await exchangeCode(code);
    await store.saveTokens(userId, tokens);
    console.log("strava callback stored tokens");
  } catch {
    console.error("strava callback token exchange failed");
    return redirectHome(url.origin, "strava=error", userId);
  }
  return redirectHome(url.origin, "strava=connected", userId);
}
