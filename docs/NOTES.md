# Notes for learning this codebase

The game rules (one story per mile, landmarks, parks, side quests) are in the [README](../README.md). This file is the map of the code: where a click goes, and which file to edit when a rule should change.

## Folder structure

```
src/lib/rules.js           The numbers. Heights, milestones, park and side-quest thresholds.
src/lib/simulate.js        Pure replay. Activities in, city out. No database, no DOM.
src/lib/replay.js          Applies the save's start date, then calls simulate.
src/lib/lighting.js        Device-clock sky, from the prototype keyframes.
src/lib/quotes.js          Reads prototype/quotes.json for the loading screen and the plane banner.
src/lib/raceDay.js         Local-calendar check for the saved race date.
src/lib/db.js              Postgres if DATABASE_URL is set, otherwise .data/store.json.
src/lib/schema.sql         Tables. `npm run migrate` applies this.
src/lib/strava.js          OAuth URL, token exchange, refresh, activity fetch.
src/lib/session.js         The httpOnly cookie that is only a user id.
src/lib/demo.js            Reads prototype/activities.txt for Demo city.
src/app/api/session        Loads the save and replays it.
src/app/api/city           Creates a save (Denver, history or a date, or demo).
src/app/api/city/reset     Deletes the save and its activities. Keeps Strava tokens.
src/app/api/sync           Log run. Strava pull, dedupe, then move last_synced_at.
src/app/api/sync/manual    A typed distance, stored like a Strava run.
src/app/api/strava/start   Redirects to Strava.
src/app/api/strava/callback  Trades the code for tokens.
src/components/game/Game.js      Screen flow and the Log run animation timer.
src/components/game/Screens.js   Title, picker, Strava, start date, loading.
src/components/game/pixelScene.js  Draws the pixel city into one small canvas.
src/components/game/CityView.js  Shows that canvas in Pixi. Crane and plane move on top.
src/app/layout.js          Font, title, viewport, Chakra provider.
src/app/page.js            Mounts Game. Stays a Server Component.
prototype/                 The original scripts and stills. The app does not execute them.
```

## How a request flows

Someone opens `/`.

1. `page.js` renders `Game`. The HTML shell (font, title, viewport) still comes from `layout.js` on the server.
2. `Game` fetches `GET /api/session`. That Route Handler reads the `mc_user` cookie, creates one if it is missing, and asks the store for the save.
3. The store is Postgres when `DATABASE_URL` is set, and `.data/store.json` otherwise. The route does not branch on that; `getStore()` does. `GET /api/health` reports which one is in use.
4. `replay()` drops activities before a chosen start date and calls `simulate()` with today's UTC date as `asOf`. Parks only count for weeks that have ended by that date.
5. The JSON comes back. `Game` keeps a copy in `sessionStorage` so the next refresh can draw before the network returns. The store is still the source of truth: the fresh response replaces the cache.
6. If there is no save, the opening screens run: Resume or New, city picker, Strava, then all-history or a date. **Demo city** skips Strava and loads the sample log.
7. The city screen mounts `CityView`, which builds a Pixi canvas in the browser. Lighting calls `lightingAt(new Date())`, so it follows the phone clock.

## Log run

`POST /api/sync` is the button. A connected city that has never synced calls it on its own, so the first sign-in does not wait for that press.

- Demo mode, or no Strava token: the response says `needsManual`, and the page asks for a distance. `POST /api/sync/manual` stores that run. The stand-in pace is 10:00 per mile so a typed distance does not pretend to be a personal record.
- Otherwise the handler refreshes the token if it is close to expiry, then asks Strava for activities after `last_synced_at` minus one hour. The first sync of a dated city starts at that date. The first sync of all-history starts at the beginning.
- Rows already stored (same Strava id) are ignored. New rows are inserted. Only then is `last_synced_at` set to now. An empty pull does not move the timestamp.
- The browser animates each new run in order: the crane moves, stories grow, a mile counter ticks, and `+1 STORY` flashes. Every 4th run longer than 5 miles then plays an 8-second plane with a random quote. Several runs play one after another. There is no webhook and no polling.

## How Strava sign-in and sync work

Connect is a full-page trip, not a fetch. `/api/strava/start` sends the browser to Strava and sets a short `mc_oauth` cookie (httpOnly, SameSite=Lax, Path=/, Secure on Vercel). Strava sends the browser back to `/api/strava/callback` with a `code`, a `state`, and the `scope` the owner actually checked. Lax is what lets that cookie come back on this redirect. The callback checks `state`, refuses the login when `activity:read_all` is missing (private runs would be left out, and the city would stay empty), exchanges the code, and stores the tokens on `strava_tokens` for the `mc_user` id. That user id is written on the redirect response itself, so the next `/api/session` is the same person who just connected. The logs for this path say `strava callback stored tokens` or `strava callback rejected`. They do not include the code or the tokens.

The callback does not download runs. The start date is chosen on the next screen. When that city is saved, and again when a connected city has never synced (`lastSyncedAt` is empty), the page calls `POST /api/sync`. Log run calls the same route later. The route refreshes the token if it is close to expiry, then pages through Strava `/athlete/activities` (200 at a time). `sport_type` `TrailRun` is stored as a run. Rows already stored under that Strava id are skipped. `last_synced_at` moves only after the new rows are in the database. A handful of new runs animate in. A long history is drawn as the finished city, with a note of how many runs came in, because playing every past run looks like a blank skyline. A failure shows that same note in red. Vercel logs `strava sync stored N of M` or `strava sync fetch failed`.

## Strava

`/api/strava/start` redirects to Strava with scopes `read,activity:read_all`. A random `state` is stored in a short-lived cookie and checked in `/api/strava/callback` before the code is exchanged. Tokens are columns in the store, not cookies and not `NEXT_PUBLIC_` variables. `?prompt=force` shows the checkboxes again after a connect that left out all-activity access.

## Server and client

Route handlers and `src/lib/db.js`, `strava.js`, `demo.js`, and `session.js` are server-only. They read secrets and files.

`simulate.js`, `rules.js`, `replay.js`, `lighting.js`, and `quotes.js` are imported by both sides. They must not import Node modules. That is what lets the animation replay a partial mile in the browser and land on the same city the server just saved.

`Game` and `CityView` are Client Components (`"use client"`). `page.js` and `layout.js` are Server Components. A Server Component may render a Client Component. The client file is where state, timers, and the canvas live.

## How the database gets set up on Vercel

Neon is hosted Postgres. CJ attached it to the Vercel project, so Vercel injects the connection strings into Production and Preview. They are sensitive. The build can read them. A person should not copy them into the repo or into a chat log.

Two strings matter:

- `DATABASE_URL` is the pooled URL. The host name contains `-pooler`. The running app uses this one. A serverless function lives for one request, and the pooler lets many of those requests share a few real database connections. The driver turns prepared statements off for that host (`prepare: false` in `src/lib/pgClient.mjs`) because the pooler does not keep the session a prepared statement belongs to. SSL is required. Neon refuses a plain connection.
- `DATABASE_URL_UNPOOLED` is the direct URL. `scripts/migrate.mjs` prefers it, and uses `DATABASE_URL` only when the unpooled one is absent. Creating tables wants a direct connection. The script logs which variable name it used, not the value.

`src/lib/schema.sql` is the migration. It creates `users`, `strava_tokens`, `activities`, and `city_saves` if they are missing, and adds the race-day columns if an older database does not have them. Nothing in that file deletes rows. Every statement is written so running it again is a no-op, which is why it is safe on every deploy.

The migration runs at build time, from the `vercel-build` script in `package.json`: migrate, then `next build`. Vercel already has the URL in the build environment, so the tables exist before the new deployment starts serving traffic. Nobody has to open a database console and paste SQL. If `DATABASE_URL` is unset, the script prints one line and exits successfully. `npm run build` on a laptop does not call the migration. `npm run migrate` still does, and it skips the same way when the URL is empty.

`GET /api/health` is the check after a deploy. The JSON is only `ok`, `storage` (`postgres`, `file`, or `demo`), and `dbReachable`. `demo` means this process is on Vercel and no database URL was set, so there is nowhere durable to write a save. `file` is the laptop JSON store. A Postgres deploy that migrated cleanly looks like `{ "ok": true, "storage": "postgres", "dbReachable": true }`.

## How to change the rules

Edit `src/lib/rules.js`. Heights, the 100-mile Union Station line, the park week rule, and the side-quest lists are all in that object. Key order inside `ringWeights` matters, because the weighted picker walks the keys in insertion order.

`types.run` includes `TrailRun` and `Trail Run` next to `Run`. The simulator looks the activity name up in that list and then runs the same mile loop, so a trail run builds stories and can unlock Union Station, the Capitol, a cathedral, the courthouse, an art-museum PR, and a park. `stravaActivityType` in `src/lib/strava.js` prefers Strava's `sport_type` over `type`, because a trail run often arrives with `type: "Run"` and `sport_type: "TrailRun"`.

`sideQuests.halfMarathon` and `sideQuests.fullMarathon` are ordered name lists with a single-run mile line. The replay counts how many of that kind are already on the map and awards the next name when one run clears the line. A 26.2 mile run clears both lines, so it earns one half and one full. Further runs walk the rest of the list. When the list is used up, later runs of that distance add nothing from it. Walks stay on `sideQuests.walk` as year-to-date miles. Rides and weight sessions do not read a quest list.

`transit` is the ultra rule. `overMiles` is the marathon line, and a run counts only when its miles are greater than that number, so 26.2 stays a marathon and 26.3 lays the first piece. `types` is the cycle (`bike`, `bus`, `lightRail`) and it wraps with no cap. Each entry is stored on the city as `{ mode, index, date, miles }`. `CityView` draws it in its own Pixi graphics object, in scene coordinates, along a road chosen from `index`. `sceneSignature` ignores transit, so the ticker can move the bus and the train without calling `paintScene`.

Limits live in the same file. `buildingTypes.museum.perCity` is how many museums the picker may start (10). Story heights stay `min` and `max`. Each milestone landmark has `max: 1`, so Union Station, the Courthouse, the Art Museum, and the Capitol cannot stack. The Cathedral is `milesPer: 200` and `max: null`: the city gets `floor(banked run miles / 200)` of them, and a number in `max` would cut that off. Set `max` back to a number if you ever want a ceiling. A 13.1 mile run does not create one early, because that would put a cathedral in a city that has not banked 200 miles.

`raceDay` in that same file only tunes the celebration: how many confetti bits, and how long one parade loop takes. The date itself is not a rule. It is `raceDate` and `raceName` on the city save, written by the opening question and by the menu. `isRaceDay` in `src/lib/raceDay.js` compares that date to the device's local calendar day, not UTC, so the parade lasts from local midnight to the next local midnight. The parade and confetti are a Pixi layer on top of the cached city texture. They do not call `paintScene`, so the skyline is not redrawn every frame. `?raceday=1` forces the overlay for a screenshot.

Then run `npm test`. The demo-log test checks 704.95 miles, exactly 3 cathedrals, 1 capitol, and at most 10 museums. The same replay keeps the three walk quests and leaves transit empty, because the sample log's longest run is under a half marathon. Another test checks 1000 miles gives 5 cathedrals, and that `max: 2` holds them there. Trail, half, full, and ultra tests check Coors Field at 13.1 miles, the bear at 26.2, a bike route at 26.3, and an empty city for rides and weight sessions. Two replays of the same log must still match, and a partial mile still carries onto the next run. Cathedrals take lots when they unlock, so building coordinates are not identical to `prototype/city.json`.

The live city is not stored as pixels. It is rebuilt from the activity rows on each visit. Change the rules, and the next page load rebuilds every save from those rows.

## Art system

The city is not a set of flat 3D boxes redrawn every frame. `pixelScene.js` paints one 640×500 picture, the same way `prototype/render.py` does, and `CityView.js` uploads it as a single Pixi texture. Nearest-neighbor scaling keeps the pixels square when the picture is enlarged. The texture is thrown away and painted again only when a building's story count changes or the clock moves to a new lighting phase (morning, midday, dusk, night). Between those moments the GPU just moves the texture. The crane, the plane, the race-day parade, and the transit lines are drawn on top, because those are the pieces that move every frame.

The isometric placement is `x = (u - v) * 12`, `y = (u + v) * 6`, with the origin near the middle of the canvas. A lot with a larger `u + v` is closer to the camera, so it is painted later and covers the lots behind it. Every building is three faces: the left face is darker, the right face is mid, the top is lighter. That is the whole shading model. Windows are single pixels on those faces. At dusk and night (`windowLight` from `lighting.js`) those pixels switch to a warm yellow, and the sky and mountains use that phase's colors.

To add or change a sprite, edit `pixelScene.js`:

- A new ordinary type goes in `drawBuilding`. Give it a base color, call `box` for the three faces, then `windows` for the dots. `stories` is already the height. Use `b.variant` as the seed if two buildings of the same type should not match.
- A civic landmark goes in `drawLandmark`, keyed by `unionStation`, `courthouse`, `artMuseum`, or `cathedral`. Every cathedral uses the `cathedral` key, so the second and third get the same twin-spire sprite rather than a copy of some other building. The Capitol is a building (`type === "capitol"`), not a separate landmark sprite, because it has a story count. Museum buildings are the `museum` type: a gallery and one shard, not the cathedral spires.
- A side-quest block goes in `drawQuest`, matched on the quest name from `rules.js`.
- Parks go in `drawPark`. Washington Park and City Park get the lake; every park gets trees and a path.

`?flyover=1` on the city page, or the F key, plays the 8-second plane and quote banner without logging a run. `?time=22:00` (or any `HH:MM`) previews that hour's sky instead of the device clock. Neither one writes a run.

## Commands

```bash
cp .env.example .env.local
npm install
npm run dev       # http://localhost:3000
npm test
npm run lint
npm run build
npm run migrate   # skips with a log line when DATABASE_URL is unset
                  # Vercel runs this automatically via vercel-build
```

Node.js 20.9 or newer.
