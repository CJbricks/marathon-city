// Home route, "/".
// This file stays a Server Component. It does not know about Strava or the
// database. Game is a Client Component: it fetches /api/session, walks the
// opening screens, and mounts the Pixi canvas. Keeping that split means the
// document title and the font still come from layout.js on the server.

import Game from "@/components/game/Game";

export default function Home() {
  return <Game />;
}
