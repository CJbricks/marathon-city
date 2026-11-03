// Strava OAuth and activity fetch. Tokens stay in the store, which only
// route handlers can touch. The browser receives a redirect, never the
// client secret. Every value comes from the environment.

const TOKEN_URL = "https://www.strava.com/oauth/token";
const AUTH_URL = "https://www.strava.com/oauth/authorize";
const API = "https://www.strava.com/api/v3";

export function stravaConfigured() {
  return Boolean(
    process.env.STRAVA_CLIENT_ID &&
      process.env.STRAVA_CLIENT_SECRET &&
      process.env.STRAVA_REDIRECT_URI,
  );
}

export function authorizeUrl(state) {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", process.env.STRAVA_CLIENT_ID);
  url.searchParams.set("redirect_uri", process.env.STRAVA_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "auto");
  // read plus activity:read_all so private runs are included, not just public ones.
  url.searchParams.set("scope", "read,activity:read_all");
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(body) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.message || "Strava token request failed");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(json.expires_at * 1000).toISOString(),
    athleteId: json.athlete?.id ?? null,
  };
}

export function exchangeCode(code) {
  return tokenRequest({
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
  });
}

export function refreshTokens(tokens) {
  return tokenRequest({
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
  });
}

export async function validTokens(store, userId) {
  const tokens = await store.getTokens(userId);
  if (!tokens) return null;
  const expires = new Date(tokens.expiresAt).getTime();
  if (expires - Date.now() > 5 * 60 * 1000) return tokens;
  const next = await refreshTokens(tokens);
  await store.saveTokens(userId, next);
  return next;
}

// Prefer sport_type. Strava's older `type` field says "Run" for a trail
// run, and the simulator would then miss the trail name. Both spellings
// land in rules.types.run, so the miles still build the city.
export function stravaActivityType(activity) {
  const sport = activity?.sport_type || activity?.type || "Workout";
  if (sport === "TrailRun" || sport === "Trail Run") return "TrailRun";
  return sport;
}

function localDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

// `after` is a unix second. Strava returns newest-first pages of 200.
export async function fetchActivitiesSince(accessToken, afterUnix) {
  const all = [];
  for (let page = 1; page < 50; page++) {
    const url = new URL(`${API}/athlete/activities`);
    url.searchParams.set("after", String(Math.max(0, Math.floor(afterUnix))));
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", "200");
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`Strava activities failed (${response.status})`);
    const batch = await response.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const a of batch) {
      const when = a.start_date_local || a.start_date;
      all.push({
        stravaId: String(a.id),
        type: stravaActivityType(a),
        date: localDay(when),
        miles: Math.round((a.distance / 1609.344) * 100) / 100,
        seconds: a.moving_time || 0,
        title: a.name || "",
        seq: Math.floor(new Date(a.start_date || when).getTime() / 1000),
      });
    }
    if (batch.length < 200) break;
  }
  return all;
}
