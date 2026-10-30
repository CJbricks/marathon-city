# Notes for learning this codebase

The game rules (one story per mile, landmarks, parks, side quests) are in the [README](../README.md). This file is the map of the code: where a click goes, and which file to edit when a rule should change.

## Folder structure

```
src/lib/rules.js           The numbers. Heights, milestones, park and side-quest thresholds.
src/lib/simulate.js        Pure replay. Activities in, city out. No database, no DOM.
src/lib/replay.js          Applies the save's start date, then calls simulate.
src/lib/lighting.js        Device-clock sky, from the prototype keyframes.
src/lib/quotes.js          Lines for the loading screen and the plane banner.
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
3. The store is Postgres when `DATABASE_URL` is set, and `.data/store.json` otherwise. The route does not branch on that; `getStore()` does.
4. `replay()` drops activities before a chosen start date and calls `simulate()` with today's UTC date as `asOf`. Parks only count for weeks that have ended by that date.
5. The JSON comes back. `Game` keeps a copy in `sessionStorage` so the next refresh can draw before the network returns. The store is still the source of truth: the fresh response replaces the cache.
6. If there is no save, the opening screens run: Resume or New, city picker, Strava, then all-history or a date. **Demo city** skips Strava and loads the sample log.
7. The city screen mounts `CityView`, which builds a Pixi canvas in the browser. Lighting calls `lightingAt(new Date())`, so it follows the phone clock.

## Log run

`POST /api/sync` is the button.

- Demo mode, or no Strava token: the response says `needsManual`, and the page asks for a distance. `POST /api/sync/manual` stores that run. The stand-in pace is 10:00 per mile so a typed distance does not pretend to be a personal record.
- Otherwise the handler refreshes the token if it is close to expiry, then asks Strava for activities after `last_synced_at` minus one hour. The first sync of a dated city starts at that date. The first sync of all-history starts at the beginning.
- Rows already stored (same Strava id) are ignored. New rows are inserted. Only then is `last_synced_at` set to now. An empty pull does not move the timestamp.
- The browser animates each new run in order: the crane moves, stories grow, a mile counter ticks, and `+1 STORY` flashes. Every 4th run longer than 5 miles then plays an 8-second plane with a random quote. Several runs play one after another. There is no webhook and no polling.

## Strava

`/api/strava/start` redirects to Strava with scopes `read,activity:read_all`. A random `state` is stored in a short-lived cookie and checked in `/api/strava/callback` before the code is exchanged. Tokens are columns in the store, not cookies and not `NEXT_PUBLIC_` variables.

## Server and client

Route handlers and `src/lib/db.js`, `strava.js`, `demo.js`, and `session.js` are server-only. They read secrets and files.

`simulate.js`, `rules.js`, `replay.js`, `lighting.js`, and `quotes.js` are imported by both sides. They must not import Node modules. That is what lets the animation replay a partial mile in the browser and land on the same city the server just saved.

`Game` and `CityView` are Client Components (`"use client"`). `page.js` and `layout.js` are Server Components. A Server Component may render a Client Component. The client file is where state, timers, and the canvas live.

## How to change the rules

Edit `src/lib/rules.js`. Heights, the 100-mile Union Station line, the park week rule, and the side-quest totals are all in that object. Key order inside `ringWeights` matters, because the weighted picker walks the keys in insertion order.

Limits live in the same file. `buildingTypes.museum.perCity` is how many museums the picker may start (10). Story heights stay `min` and `max`. Each milestone landmark has `max: 1`, so Union Station, the Courthouse, the Art Museum, and the Capitol cannot stack. The Cathedral is `milesPer: 200` and `max: null`: the city gets `floor(banked run miles / 200)` of them, and a number in `max` would cut that off. Set `max` back to a number if you ever want a ceiling. A 13.1 mile run does not create one early, because that would put a cathedral in a city that has not banked 200 miles.

Then run `npm test`. The demo-log test checks 704.95 miles, exactly 3 cathedrals, 1 capitol, and at most 10 museums. Another test checks 1000 miles gives 5 cathedrals, and that `max: 2` holds them there. Two replays of the same log must still match, and a partial mile still carries onto the next run. Cathedrals take lots when they unlock, so building coordinates are not identical to `prototype/city.json`.

The live city is not stored as pixels. It is rebuilt from the activity rows on each visit. Change the rules, and the next page load rebuilds every save from those rows.

## Art system

The city is not a set of flat 3D boxes redrawn every frame. `pixelScene.js` paints one 640×500 picture, the same way `prototype/render.py` does, and `CityView.js` uploads it as a single Pixi texture. Nearest-neighbor scaling keeps the pixels square when the picture is enlarged. The texture is thrown away and painted again only when a building's story count changes or the clock moves to a new lighting phase (morning, midday, dusk, night). Between those moments the GPU just moves the texture. The crane and the plane are drawn on top, because they are the only things that sway every frame.

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
npm run migrate   # only does work when DATABASE_URL is set
```

Node.js 20.9 or newer.
