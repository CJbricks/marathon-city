// GET /api/strava/start
// Sends the browser to Strava's authorize page. `state` is a random value
// stored in a cookie; the callback rejects a redirect whose state does not
// match. The cookie is set on this redirect response so it survives the
// trip to Strava and back. ?prompt=force shows the permission checkboxes
// again after a connect that left out private activities.

import { NextResponse } from "next/server";
import { browserCookie } from "@/lib/browserCookie";
import { authorizeUrl, stravaConfigured } from "@/lib/strava";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!stravaConfigured()) {
    return NextResponse.json(
      { error: "Strava keys are not set. Add them to .env.local or use Demo city." },
      { status: 400 },
    );
  }
  const force = new URL(request.url).searchParams.get("prompt") === "force";
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(authorizeUrl(state, { force }));
  response.cookies.set("mc_oauth", state, browserCookie(60 * 10));
  return response;
}
