// Flags for the cookies this app sets in the browser.
// SameSite=Lax is what sends the cookie back when Strava redirects here
// with a normal page load. A Strict cookie would stay behind on that hop.
// Secure is on in production so Vercel only accepts it over HTTPS.
// Path=/ means /api/session and /api/strava/callback share it.
// There is no Domain attribute, so the host that set the cookie is the
// only host that receives it.

export function browserCookie(maxAge) {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  };
}
