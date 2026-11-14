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
src/lib/saves.js           Save name, 3-slot cap, and the resume-list label.
src/lib/cityCode.js        Five-digit city code and the guess limit.
src/lib/db.js              Postgres if DATABASE_URL is set, otherwise .data/store.json.
src/lib/schema.sql         Tables. `npm run migrate` applies this.
src/lib/strava.js          OAuth URL, token exchange, refresh, activity fetch.
src/lib/session.js         The httpOnly cookie that is only a user id.
src/lib/demo.js            Reads prototype/activities.txt for Demo city.
src/app/api/session        Loads the save and replays it.
src/app/api/city           Creates one named save (Denver, history or a date, or demo).
src/app/api/city/open      Switches which of the three saves is on screen.
src/app/api/city/code      Opens a city by its five-digit code.
src/app/api/city/reset     Deletes the save on screen and its activities. Keeps the others and the Strava tokens.
src/app/api/sync           Log run. Strava pull, dedupe, then move last_synced_at.
src/app/api/sync/manual    A typed distance, stored like a Strava run.
src/app/api/strava/start   Redirects to Strava.
src/app/api/strava/callback  Trades the code for tokens.
src/components/game/Game.js      Screen flow and the Log run animation timer.
src/components/game/Screens.js   Title, picker, Strava, start date, loading.
src/components/game/sceneLayout.js  Picture size and the isometric lot math (1280×1000).
src/components/game/pixelPen.js    The shared pixel pen every theme draws with.
src/components/game/streets.js     Sidewalks, curbs, and asphalt. Colors come from the theme.
src/components/game/themes/        One folder per city. Denver and Austin. names.js is the allow-list.
src/components/game/overlaySprites.js  Cars, people, crane, transit. Same pixel scale as the city.
src/components/game/pixelScene.js  Paints the backdrop and the grid, then asks the theme to draw.
src/components/game/gridFit.js    Opening scale, pinch focal point, and the pan clamp.
src/components/game/dust.js      Pixel specks at the base of a building that is going up.
src/components/game/CityView.js  Shows the canvas in Pixi. The sky stays put. The grid moves.
src/app/layout.js          Font, title, viewport, Chakra provider.
src/app/favicon.ico        Tab icon. 16, 32, 48, and 64, from the 32×32 drawing.
src/app/icon.png           512×512 icon. Same drawing, each pixel copied 16 times.
src/app/apple-icon.png     180×180 home-screen icon. Solid, no transparent pixels.
src/app/page.js            Mounts Game. Stays a Server Component.
prototype/                 The original scripts and stills. The app does not execute them.
prototype/icon32_drawn.png The 32×32 drawing every icon size is scaled from.
scripts/make-icons.mjs     Rebuilds favicon.ico, icon.png, and apple-icon.png.
docs/austin-theme-screenshot.png  The Austin scene that drawing came from. Not served.
```

## How a request flows

Someone opens `/`.

1. `page.js` renders `Game`. The HTML shell (font, title, viewport) still comes from `layout.js` on the server.
2. `Game` fetches `GET /api/session`. That Route Handler reads the `mc_user` cookie, creates one if it is missing, and asks the store for the save.
3. The store is Postgres when `DATABASE_URL` is set, and `.data/store.json` otherwise. The route does not branch on that; `getStore()` does. `GET /api/health` reports which one is in use.
4. `replay()` drops activities before a chosen start date and calls `simulate()` with today's UTC date as `asOf`. Parks and streak vehicles only count for weeks that have ended by that date.
5. The JSON comes back. `Game` keeps a copy in `sessionStorage` so the next refresh can draw before the network returns. The store is still the source of truth: the fresh response replaces the cache.
6. If there is no active save, the opening screens run. **Resume** lists the named cities (up to 3). **New City** asks for a name, then the city picker, Strava (only if it is not connected yet), all-history or a date, then the race-day question. **Demo city** skips Strava and loads the sample log under the name "Demo city".
7. The city screen mounts `CityView`, which builds a Pixi canvas in the browser. Lighting calls `lightingAt(new Date())`, so it follows the phone clock. The bottom bar's middle label is the save's name, not the theme.

## Named saves

A person can keep three cities. Each one is a row in `city_saves` with its own `save_id`. The browser cookie is still only the user id. `active` is which of the three is on screen.

The name is a label they type ("Training block", "CJ's Denver"), at most 24 characters. A blank name is refused. The theme stays Denver for the beta. The bottom bar shows the name so the three cities are easy to tell apart.

What a save stores: the name, the theme, all-history or a start date, the race date and race name if they set one, the runs that belong to that city, and that city's own `last_synced_at`. Log run and the first-load Strava pull write runs onto the active save only. The same Strava id can sit on two saves. Inside one save, a repeat of that id is still ignored.

The city on screen is not a drawing we keep. `replay()` builds it from that save's runs and its start date, the same way as before. The same runs and the same date range build the same skyline. Replacing a slot deletes that snapshot. It does not delete the ability to make it again: New City, the same dates, and Strava produce the same layout. The database is still the source of truth for the runs and the save row.

Slots are 1, 2, and 3. Reset deletes the city on screen and frees its slot. The next new city takes the lowest open slot. When all three are full, New City asks which name to replace and then asks again on a confirm screen. The other two cities stay, including when you reset only the one you are playing.

Resume lists each save with its name, where the miles start (all history, a date, or demo), and the mile total. Menu, then Cities, opens that list without leaving the city you were in. Opening one sets it active. If that city has never synced and Strava is connected, the page pulls runs once, same as the first sign-in.

Demo city is the sample log, named "Demo city". It uses a slot too. It does not sync from Strava, because its `last_synced_at` is set when it is created.

`src/lib/saves.js` holds the cap and the name check. Both the JSON file and Postgres call it, so a fourth city or a blank name cannot sneak in through one store only.

## City codes

Every save gets a five-digit code when it is created, for example `04821`. The digits are text, not a number, so the leading zero stays. Postgres keeps a unique index on that column, and the migration fills a code for any city that was saved before this existed. Running the migration again does not mint a second code. The JSON file on a laptop does the same fill the first time that file is read.

The code is on the Resume list under the city's name, and in the Menu as `CODE 04821`. That is the thing to write down.

**Enter city code** is on the opening screen, in the same pixel frame as the other screens. A correct code on another phone or browser loads that same city. It is not a copy. Runs added there show up for the owner too, and reset erases that city for both, because both are playing the one save. The new phone keeps its own user id. Strava tokens stay on that id, so **Log run** on a phone that has not signed in yet sends them through the existing Strava button. The client id and secret are still only in the server environment. A demo city does not ask for Strava. It still asks for a typed distance.

Each phone keeps its own "last synced" clock. If they shared the city's clock, the second phone's sync would move the timestamp and the owner's next pull could skip runs.

## The guess limit

Five digits is 100,000 possibilities. A script could try them all. `src/lib/cityCode.js` allows five failures in a minute, then waits 30 seconds, then 60, then 120, up to 15 minutes. The wait is stored for the browser's user id and, when the request has one, for the IP. A new cookie on the same network still hits the IP row. A wrong code, a short code, and a locked guess all return the same sentence: "That code did not work." The route does not look the code up while the wait is active, so a locked guesser cannot learn whether a code is real. This is basic protection, not a secret. Someone patient can still guess a code. The tradeoff is that the owner can read five digits off the menu and type them on the couch, which a long random token would make miserable.

The counter lives in `code_attempts`. A page load does not write it, and it does not run the schema. Schema changes still happen only in `scripts/migrate.mjs` at build time.

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

`src/lib/schema.sql` is the migration. It creates `users`, `strava_tokens`, `activities`, and `city_saves` if they are missing, and adds the race-day columns if an older database does not have them. It also adds `activities.start_local`, the Strava `start_date_local` string. The bakery reads the hour out of that text. A null means the clock was not stored. It does not mean midnight. It also adds `code` on each city, `city_access` for a browser that opened a code, and `code_attempts` for wrong guesses. A database that still has one city per person gets `save_id`, `name`, `slot`, and `active` on that row. The row is kept: slot 1, active, named after its theme (so an old Denver save still says Denver). Its runs are pointed at that `save_id`. A run that belonged to no city is removed so the new key can be required. Cities that exist keep their runs. Every statement is written so running it again is a no-op, which is why it is safe on every deploy. The `DO` blocks are one statement each. Semicolons inside them change the old primary key. They are not separate commands.

The migration runs at build time, from the `vercel-build` script in `package.json`: migrate, then `next build`. Vercel already has the URL in the build environment, so the tables exist before the new deployment starts serving traffic. Nobody has to open a database console and paste SQL. If `DATABASE_URL` is unset, the script prints one line and exits successfully. `npm run build` on a laptop does not call the migration. `npm run migrate` still does, and it skips the same way when the URL is empty.

`GET /api/health` is the check after a deploy. The JSON is only `ok`, `storage` (`postgres`, `file`, or `demo`), and `dbReachable`. `demo` means this process is on Vercel and no database URL was set, so there is nowhere durable to write a save. `file` is the laptop JSON store. A Postgres deploy that migrated cleanly looks like `{ "ok": true, "storage": "postgres", "dbReachable": true }`.

## How to change the rules

Edit `src/lib/rules.js`. Heights, the 100-mile Union Station line, the park week rule, and the side-quest lists are all in that object. Key order inside `ringWeights` matters, because the weighted picker walks the keys in insertion order.

`cities.Austin.landmarks` applies only when the save's city is Austin. Denver never reads the object. `lbjLibrary.cumulativeRunMiles` is 500. `marthasGallery.minDistance` is 5 and `afterRuns` is 0, so the first faster run of at least 5 miles builds the gallery, and the Blanton still waits for its own 20 runs. `rockmansBakery.earlyRuns` is 10 and `beforeHour` is 6 (5:59 counts, 6:00 does not). `at` is the lot, written `[blockX, blockY, lotX, lotY]`. The Austin tests check 499 against 500, 9 early runs against 10, and 5:59 against 6:00.

`types.run` includes `TrailRun` and `Trail Run` next to `Run`. The simulator looks the activity name up in that list and then runs the same mile loop, so a trail run builds stories and can unlock Union Station, the Capitol, a cathedral, the courthouse, an art-museum PR, and a park. `stravaActivityType` in `src/lib/strava.js` prefers Strava's `sport_type` over `type`, because a trail run often arrives with `type: "Run"` and `sport_type: "TrailRun"`.

`sideQuests.halfMarathon` and `sideQuests.fullMarathon` are ordered name lists with a single-run mile line. The replay counts how many of that kind are already on the map and awards the next name when one run clears the line. A 26.2 mile run clears both lines, so it earns one half and one full. Further runs walk the rest of the list. When the list is used up, later runs of that distance add nothing from it. The half-marathon names are Cherry Creek Trail, Denver Zoo, and Denver Botanic Gardens. Walks stay on `sideQuests.walk` as year-to-date miles. Rides are back on `sideQuests.ride` the same way: Coors Field at 10, Ball Arena at 25, Empower Field at Mile High at 50, inside one calendar year. `types.ride` lists the Strava sport types that count. Weight sessions do not read a quest list.

`vehicles` and `pedestrians` are in that same file. The streak math and the people count are explained in the next section. `maxAnimated` only limits what `CityView` draws. The numbers on the city object are the full counts. `vehicles.speedMultiplier` (0.75) and `pedestrians.speedMultiplier` (0.5) only change how fast the overlay moves. 1 is the original pace. They do not change how many cars or people the city earns. The yellow ultra bus and the light rail ignore the vehicle multiplier and keep their own lap times.

`transit` is the ultra rule. `overMiles` is the marathon line, and a run counts only when its miles are greater than that number, so 26.2 stays a marathon and 26.3 lays the first piece. `types` is the cycle (`bike`, `bus`, `lightRail`) and it wraps with no cap. Each entry is stored on the city as `{ mode, index, date, miles }`. `CityView` draws it in its own Pixi graphics object, in scene coordinates, along a road chosen from `index`. `sceneSignature` ignores transit, so the ticker can move the bus and the train without calling `paintScene`.

Limits live in the same file. `buildingTypes.museum.perCity` is how many museums the picker may start (10). Story heights stay `min` and `max`. Each milestone landmark has `max: 1`, so Union Station, the Courthouse, the Art Museum, and the Capitol cannot stack. The Cathedral is `milesPer: 200` and `max: null`: the city gets `floor(banked run miles / 200)` of them, and a number in `max` would cut that off. Set `max` back to a number if you ever want a ceiling. A 13.1 mile run does not create one early, because that would put a cathedral in a city that has not banked 200 miles.

`raceDay` in that same file only tunes the celebration: how many confetti bits, and how long one parade loop takes. The date itself is not a rule. It is `raceDate` and `raceName` on the city save, written by the opening question and by the menu. `isRaceDay` in `src/lib/raceDay.js` compares that date to the device's local calendar day, not UTC, so the parade lasts from local midnight to the next local midnight. The parade and confetti are a Pixi layer on top of the cached city texture. They do not call `paintScene`, so the skyline is not redrawn every frame. `?raceday=1` forces the overlay for a screenshot.

Then run `npm test`. The demo-log test checks 704.95 miles, exactly 3 cathedrals, 1 capitol, and at most 10 museums. The same replay keeps the three walk quests, adds Coors Field and Ball Arena from the sample rides, leaves Empower Field and the half-marathon landmarks off (no 50-mile ride year, no 13.1 mile run), and leaves transit empty. It also expects 36 streak vehicles and 207 pedestrians. Another test checks 1000 miles gives 5 cathedrals, and that `max: 2` holds them there. Trail, half, full, and ultra tests check Cherry Creek Trail at 13.1 miles, the bear at 26.2, a bike route at 26.3, and an empty skyline for weight sessions. Ride tests check the 10 / 25 / 50 ladder, including gravel, mountain, e-bike, and virtual rides. Two replays of the same log must still match, and a partial mile still carries onto the next run. Cathedrals take lots when they unlock, so building coordinates are not identical to `prototype/city.json`.

The live city is not stored as pixels. It is rebuilt from the activity rows on each visit. Change the rules, and the next page load rebuilds every save from those rows.

## Art system

The city is not a set of flat 3D boxes redrawn every frame. `pixelScene.js` paints two 1280×1000 pictures. `paintBackdrop` is the sky, the mountains, and the sandy ground. `paintScene` with `gridOnly` is the lots, roads, and buildings, and every other pixel in that picture is clear. `CityView.js` uploads each as a Pixi texture and scales both with nearest-neighbor. The grid texture is thrown away and painted again only when a building's story count changes, the clock moves to a new lighting phase (morning, midday, dusk, night), or the theme changes. The backdrop is painted again only when the phase changes.

The two pictures start in the same place. `gridPlacement` in `gridFit.js` fits the 1280×1000 picture *inside* the view (the smaller of width and height), then centers it. That is not "cover". Covering a tall phone uses the height, and that zoomed the diamond until its corners ran off both sides of a 390px screen. Before the canvas filled the phone, the picture was only about as tall as it was wide, so the width set the scale and the whole diamond sat inside the screen with a margin. Fitting inside the view brings that size back. On a short desktop window the height is the smaller side, so the front of the diamond is not cropped there either.

A drag, a pinch, or the mouse wheel changes only the grid's container. The backdrop stays at the opening placement. That backdrop picture is extended with more sky above and more speckled ground below (and to the sides on a wide window) so the texture itself reaches the edges of the screen. A flat rectangle of the same colors sits behind it, in case a pixel is still uncovered. The sky still reaches the top and the ground still reaches the bottom bar. The city screen itself is `position: fixed` and the canvas is absolutely positioned inside its box, because Safari was sizing the canvas from its bitmap and leaving a light-gray band under the menu and another above the bar.

The crane, the dust, the plane, the race-day parade, the transit lines, the streak vehicles, and the walkers are drawn on top. The crane and the dust live in the grid's container, so they stay on the building while you pan. The crane's idle sway is the same sine bob as before. The dust is eight reused pixel rectangles at the west side, the east side, and the front corner of the lot. They only run while a story is being added (`dust` on the animation), and the build steps take a little longer (`14` steps, at least `1500` ms) so the puff is visible. The plane stays in screen space. Cars and people are one Graphics object in that same grid container: `clear()` each frame, then at most `maxAnimated` of each. None of these call `paintScene` every frame.

A pinch or the mouse wheel changes only that grid container, and only onto the ladder from `stepZoom` in `gridFit.js`. The opening fit can be a fraction. Past 1× the scale is a whole number. The backdrop is not on that ladder. The scale change is anchored on the point under the fingers or the cursor, then clamped. The section below explains why a bare snap used to throw the diamond off the phone.

The isometric placement is `x = (u - v) * 24`, `y = (u + v) * 12`, with the origin near the middle of the canvas. A lot with a larger `u + v` is closer to the camera, so it is painted later and covers the lots behind it. Every building is three faces: the left face is darker, the right face is mid, the top is lighter. That is the whole shading model. Windows are a few pixels on those faces, with a sill between stories. At dusk and night (`windowLight` from `lighting.js`) the glass switches to a warm yellow, and the sky and mountains use that phase's colors.

To add or change a Denver sprite, edit `src/components/game/themes/denver.js`. Do not put the new shape in `rules.js`.

- A new ordinary type goes in `drawBuilding`. Give it a base color, call `pen.box` for the three faces, then `pen.windows` for the dots. `stories` is already the height. Use `b.variant` as the seed if two buildings of the same type should not match. An odd variant of a rowhouse is a Victorian (bay and turret). An even one is the flat-front house.
- A civic landmark goes in `drawLandmark`, keyed by `unionStation`, `courthouse`, `artMuseum`, or `cathedral`. Every cathedral uses the `cathedral` key, so the second and third get the same twin-spire sprite rather than a copy of some other building. The Capitol is a building (`type === "capitol"`), not a separate landmark sprite, because it has a story count. Museum buildings are the `museum` type: a gallery and one shard, not the cathedral spires. Austin's library, gallery, and bakery are extra keys in `themes/austin.js` (`lbjLibrary`, `marthasGallery`, `rockmansBakery`). Denver's painter has no branch for them, so a Denver city does not grow a new sprite. They are ordinary landmarks in `listProps`, so each one is its own sprite sorted by the front of its lot. A walker or a car behind that front is hidden. The lot is still 48 pixels across and a story is still 6 pixels.
- A side-quest block goes in `drawQuest`, matched on the quest name from `rules.js`.
- Parks go in `drawPark`. Washington Park and City Park get the lake; every park gets trees and a path.

## How the 2× art and the theme seam work

The first city picture was 640×500. A lot was 24 pixels wide and 12 tall, and one story was 3 pixels tall. That was enough for a colored box and a few window dots. It was not enough for a door, an awning, or a sidewalk that you could still see after the picture was fit onto a phone.

The picture is now 1280×1000. The lot step is 24 by 12 (`HW` and `HH` in `sceneLayout.js`), and one story is 6 pixels (`STORY`). Those numbers are exactly double. The map is still 22 tiles on a side, so the diamond grows by the same amount as the picture. On a 390px-wide phone the opening scale is about 0.30 instead of 0.61, and the diamond still fills the same fraction of the screen. The fit got smaller as a number because there are twice as many pixels to fit, not because the city is cropped.

Nearest-neighbor is what keeps it pixel art. Pixi is created with `antialias: false`, `roundPixels: true`, `resolution: 1`, and `autoDensity: false`. The texture `scaleMode` is `"nearest"`. The canvas CSS says `image-rendering: pixelated`. `resolution: 1` means the backing store is CSS pixels, not device pixels. A retina buffer would be three times wider and the browser would scale it back down, which softens the blocks. `autoDensity` is off for the same reason. The canvas is pinned to its box with `width: 100%` and `height: 100%` in `globals.css`, which is what stops Safari from sizing the bitmap and leaving gray bands. Zoom past the opening fit still stops on 1, 2, 3, up to 6. At 2× each city pixel is a 2×2 block of screen pixels. A scale of 1.5 would blend neighbors.

The extra pixels are used, not just stretched:

- A street lot is painted three times: sidewalk, then a darker curb, then asphalt. The sidewalk is about 6 picture pixels wide, which is about two screen pixels when the whole city is on a phone. That is the smallest band that still reads.
- Houses have a door, a sill between stories, a pitched roof, and a chimney. Half of them (odd `variant`) add a bay window and a turret. Those are the Victorians.
- A mixed-use lot has glass on the ground floor and a colored awning slab in front of the wall. The slab is what you can see at phone size. A stripe painted on the brick disappears.
- Offices are a glass grid with a roof box. Towers are a tighter glass grid, a setback when they are tall enough, and an antenna with a red light. State buildings are pale stone with a flag.
- Landmarks are silhouettes first. The capitol is the gold dome. Union Station is the clock and the red shed roof. The art museum is one metal shard (two shards used to look like cathedral spires). A cathedral is two spires with gold tips. Stadiums are bowls. The bear stands in front of a glass wall.

Cars, trucks, the navy bus, the police car, pedestrians, the dust puff, and the crane are drawn at that same pixel size, in `overlaySprites.js` and `dust.js`. Their speed is still `vehicles.speedMultiplier` (0.75) and `pedestrians.speedMultiplier` (0.5) in `rules.js`. The lap times did not change. The airplane stays in screen pixels, because it flies next to the quote banner, which is also laid out on the page.

A car is not drawn on top of every building. The ground (streets and lawns) is one picture at the back. Each building, landmark, park, and side quest is its own small sprite. Its depth is the front corner of its lot, `x + y + span * 2`, which is the edge closest to the camera. Movers go in a bucket for `floor(u + v)`. That bucket is drawn after a building with the same whole number and before the next building, so a tower in front of a pedestrian covers the pedestrian and a tower behind them does not. A tall sprite is only opaque where it painted pixels. The UT Tower is a narrow shaft, so a walker on the sidewalk just beside it used to show through at the height of the roof and look like they were standing on the crown. `moverHidden` in `moverOcclusion.js` drops a mover whose body touches a nearer sprite's box, for every building and landmark in either city. Someone in front of that sprite has a greater depth and is still drawn. Only the buckets that have a sprite in them are cleared each frame. A story changing repaints that one building, not the whole city. The static bus stops and rail marks sit under every building, because they do not move.

One 1280×1000 texture is about 5 MB. Phones allow at least 4096×4096. The city does not need to be split into chunks. The sky picture grows to cover a tall screen, and `fitBackdropExtras` trims that growth so the upload stays inside 4096. A flat rectangle of sky and prairie sits behind it and covers any gap.

The theme seam is `src/components/game/themes/`. `themeFor("Denver")` returns the Denver object. `themeFor("Austin")` returns the Austin object. `paintScene` asks that object to draw buildings, landmarks, parks, and side quests, and it reads the object's colors for the prairie, the hills, and the streets. The save's `city` field is the name that gets passed in (`"Denver"` or `"Austin"`). The name the person typed for the save is a label on the bottom bar. It is not the theme. An unknown name paints Denver, so a typo does not draw an empty picture. `sceneSignature` includes the theme name, so the cached texture is thrown away when the theme changes and kept when a car moves.

## How a theme is chosen, stored, and drawn

The picker is the only place a person chooses a theme. Denver and Austin are both enabled. Boulder, New York, and Tokyo still say SOON. Tapping a card does not build the city yet. NEXT writes the choice onto the draft (`"Austin"` or `"Denver"`), and that draft is what Strava, the start date, and the race question keep. The title-screen **Demo city** button still builds Denver. The DEMO button on the Strava step uses whatever the picker just chose, so an Austin demo is the sample log drawn with Austin's art.

`POST /api/city` checks the name with `resolveTheme` in `themes/names.js`. A missing name is Denver, which is why an old client and an old save still get the Mile High city. A name that is not in `OPEN_THEMES` is refused. The row stores the canonical name (`"Austin"`, not `"austin"`). City codes do not include the theme. Opening a code opens that save, and the save already knows its city.

The city is still rebuilt from the activity rows. The theme is not baked into those rows. `Game` passes `payload.save.city` into `CityView` as `theme`. `themeFor` turns the string into drawings. A save from before Austin existed has `city: "Denver"`. A blank city column is read back as Denver too.

The shared slots do not look at a different mile table. The simulator still unlocks `unionStation` at 100 miles and still names that quest `"Coors Field"` in the city object, because both cities share `rules.js`. Austin's `labels` map is the name a person would say for that slot. The painter matches the slot key (or the Denver quest name) and draws the Austin shape. 250 miles is still the capitol slot, and in Austin that slot is the pink-granite Texas State Capitol.

Three landmarks are not renames. `replay()` passes `save.city` into the rules. When that name is Austin, `simulate()` also reads `rules.cities.Austin` and may add `lbjLibrary`, `marthasGallery`, and `rockmansBakery`. A Denver save, and a save with no city, skips that object, and the lots those buildings would have used stay in the normal pool. The demo log has no watch times, so an Austin demo earns the library (the log is past 500 miles) and the gallery (the log has a pace PR) and does not earn the bakery.

What Austin changes, besides the buildings:

- The backdrop. Denver's mountains are the Rockies, and its sky is the clock's cool blue. Austin's ridges are low green-gold hills. Its sky is three colors of its own: a warm light blue up high, peach in the middle, gold at the horizon. Mixing every stop toward one peach was tried first, and the sky went flat gray, which is why the stops are separate. At night those stops blend toward a dark warm sky so the stars stay visible. The dither in `pixelScene.js` is the same one Denver uses. `theme.lake` paints Lady Bird Lake as a ribbon along the south edge of the diamond, two lots wide (`band: 48`). The prairie under that ribbon stays grass and caliche. A fill of the whole foreground is what put water across the bottom half of the phone. The Congress Avenue Bridge draws water on its own lot, because the civic block sits inland of the ribbon.
- The frame. Denver keeps the Nuggets gold because it has no extra CSS class. Austin adds `theme-austin`, and `globals.css` swaps the loading-screen border, the stripes, the buttons, and the bottom bar to burnt orange, cream, and cedar. The Strava button stays Strava orange.
- Dusk and night, if the bridge has been earned, a few bat rectangles fly over it. They are drawn like the cars, every frame, and only then. The city texture is not repainted just to move a wing.

Slots Austin paints, using Denver's unlocks:

| Slot | Austin |
| --- | --- |
| State Capitol (250 mi) | Texas State Capitol, pink granite dome |
| Union Station (100 mi) | Congress Avenue Bridge, with bats at dusk and night |
| Courthouse (streak) | UT Tower, cream shaft, red tile roof, orange crown |
| Art Museum (pace PR) | Blanton Museum of Art, a canopy of colored petals |
| LBJ Library (500 run mi, Austin only) | Travertine slab, recessed top band, its own lot |
| Martha's Art Gallery (first 5-mile pace PR, Austin only) | Small cream storefront, burnt-orange awning, across from the Blanton |
| Rockman's Bakery (10 runs before 6:00am local, Austin only) | Awning and a loaf sign |
| Cathedral (every 200 mi) | St. Mary Cathedral, one steeple and a rose window |
| Half marathon, in order | Barton Springs Pool, Mount Bonnell, Pennybacker Bridge |
| Full marathon, in order | Giga Texas, then Frost Bank Tower |
| Parks, in order | Zilker Park, Lady Bird Lake trail, Auditorium Shores |
| Rides, 10 / 25 / 50 | Q2 Stadium, Moody Center, DKR Texas Memorial Stadium |
| Walks, 10 / 25 / 50 | Sixth Street, South Congress, Circuit of the Americas |

Ordinary buildings follow the same rings. A rowhouse is a Hyde Park or Bouldin bungalow (cream or wood, red hip roof, a porch) instead of a Victorian. Mixed-use is a South Congress shop under a red roof. Offices are limestone. A skyscraper is one of three shapes, chosen from its variant: stacked slabs (the Independent), a glass sail, or a bronze shaft (Sixth and Guadalupe). State buildings are limestone with a small Texas flag. The sprinkled museum type is a limestone gallery, not a second Blanton. Giga Texas uses the Big Blue Bear's block, which is already on the southeast edge, so the factory sits on the east side without moving a lot. Nothing in the Austin file draws a seal, a wordmark, or a mascot. The library is a travertine slab with a set-back top, the gallery is a cream shop and an orange awning, and the bakery is an awning with a loaf on the sign.

## How to add a third city

Do not edit `rules.js`, `simulate.js`, or the city-code tables. The mile numbers stay shared. Austin's library, gallery, and bakery are already the `cities.Austin` block; a new city that only changes drawings should not add a second block there. Copy `themes/austin.js` to `themes/chicago.js` (or whatever the city is) and export an object with the same shape. The field list is at the top of `themes/index.js`. Omit `sky` and `lake` if this city should keep Denver's sky and dry prairie.

Then:

1. Register it in `THEMES` inside `themes/index.js`.
2. Add the canonical name to `OPEN_THEMES` in `themes/names.js`. That is what the API will accept. `themeFor` still falls back to Denver if the painter is missing, so do both.
3. Add the uppercase label to `CITIES` in `Screens.js`. A name in that list but not in `OPEN_THEMES` stays a SOON card. A name in both becomes a button.
4. If the frame should change, add a `.theme-<id>` block in `globals.css` next to `.theme-austin`. The class is `theme-` plus the name in lowercase. Denver has no class, on purpose, so its gold frame is the default.
5. Give the theme a `labels` map if the landmarks should have their own names. Draw functions still switch on the slot key the simulator writes (`unionStation`, `"Coors Field"`, `"Cheesman Park"`). The map is the display name. It does not move the unlock.

Run `npm test`. The Denver capitol test still expects a gold dome, and the Austin capitol test expects pink granite and almost no gold. A new city should get the same kind of check: one pixel that Denver has, and one it must not have. Then `npm run lint` and `npm run build`.

`?flyover=1` on the city page, or the F key, plays the 8-second plane and quote banner without logging a run. `?time=22:00` (or any `HH:MM`) previews that hour's sky instead of the device clock. Neither one writes a run.

## Streak weeks, pedestrians, and crisp zoom

This section is the "why" for the cars, the people, and the zoom stops. The numbers themselves stay in `src/lib/rules.js`. Change a number there and the next page load rebuilds the city from the same activities.

### A streak week is a Monday, and it has to be over

A vehicle is not three runs on three days. It is one run, or one trail run, in each of several Monday-to-Sunday weeks in a row.

`rules.parks.weekStartsOn` is `1`. In the JavaScript clock, `0` is Sunday and `1` is Monday. `simulate.js` uses that same helper for parks and for vehicles. It walks backward from the run's date to the Monday that opened the week. Saturday and Sunday belong to the Monday that already happened. Monday morning is the next week. Two runs on Tuesday and Thursday are still one streak week. The week is stored once.

The week only counts after it is finished. The last day is Sunday, which is the Monday plus 6 days. Parks already use `weekEnd < asOfDate`. Vehicles use that test too. If today is still that Sunday, the week is in progress and it cannot add a car. The next morning, when `asOfDate` has moved on, it can. That is why the browser and the server have to share the same `asOf` date. Otherwise one of them would draw a car the other one does not have yet.

The first `rules.vehicles.afterWeeks` finished weeks of a streak add nothing. That number is 2. Week 3 adds the first vehicle, week 4 the next, and so on. For one streak the count is `max(0, length - 2)`. Two weeks is 0. Five weeks is 3.

A week with no run or trail run ends the streak. A ride-only week ends it too. The count for the next streak starts over at zero. Cars already on the map stay. The city is permanent. The type cycle does not start over. If the last vehicle earned was a truck, the next streak's first vehicle is a bus.

Add those per-streak counts. Four weeks, a gap, then three weeks is `max(0, 4 - 2) + max(0, 3 - 2) = 3` vehicles. The types go car, truck, bus, police, then car again, in the order they were earned across the whole log. `rules.vehicles.types` is that list.

The streak bus is not the ultra bus. A run longer than 26.2 miles lays a transit line, and the bus on that line is a yellow coach with stop poles. A streak bus is a small navy bus with a cream window row. Both drive on roads the map already has. Only `maxAnimated` (16) streak vehicles are drawn. The city object still holds every one.

How fast those four streak sprites drive is `vehicles.speedMultiplier`. The lap times in `CityView` (car 6.5s, truck 11s, navy bus 9s, police 7.5s) are the pace at multiplier 1. 0.75 multiplies the clock, so each one takes longer to cross the same road. The police light still blinks on its own timer. The yellow ultra coach (9s) and the light rail (7s) do not read this number.

### Pedestrians are lifetime miles, not the walk landmarks

The walk landmarks did not move. Inside one calendar year, 10 walk miles is the Confluence Park bridge, 25 is the 16th Street Mall, and 50 is Red Rocks. A new year starts that counter over. A landmark, once earned, stays.

People on the sidewalk are a second counter. Add every walk mile ever logged, in every year. Divide by `rules.pedestrians.milesPerPerson` (0.25) and drop the fraction: `floor(lifetimeWalkMiles / 0.25)`, which is 4 people per mile. 0.24 miles is nobody. 0.25 miles is one person. 0.20 in 2024 plus 0.20 in 2025 is one person, and it is not a landmark, because neither year reached 10.

The simulator sums the hundredths of a mile, the same way it sums run miles, so `0.1 + 0.1 + 0.1` stays `0.30` instead of a binary fraction. It stores the full count, even when that is hundreds of people. `CityView` draws at most `maxAnimated` (32). Each of those walkers gets a phase from a mix of the walk-row seed and their index, so the same log puts the same people on the same sidewalks. They flip between two leg positions. They are not a new random set on every visit.

`pedestrians.speedMultiplier` scales both the sidewalk crossing and that leg flip. The crossing is 16 seconds and the flip is 180ms when the multiplier is 1. 0.5 makes the walk and the step each half as fast, so the feet do not slide ahead of the body. The phase offset is not scaled, so changing the number does not teleport a walker to a new spot on the block.

### The ride ladder

Coors Field, Ball Arena, and Empower Field are year-to-date ride miles again, in that order: 10, 25, and 50. The check is the same loop as the walk landmarks. One calendar year. A 9 mile year earns nothing. A 25 mile year earns Coors and Ball Arena, because both lines have been crossed, and it earns them in list order. A 10 mile year in 2015 keeps Coors forever. A 25 mile year in 2026 can then earn Ball Arena without earning Coors a second time. Nine miles in 2024 plus nine miles in 2025 do not add up to Coors.

`types.ride` is `Ride`, `GravelRide`, `MountainBikeRide`, `EBikeRide`, and `VirtualRide`. Those are the `sport_type` strings Strava sends. `stravaActivityType` keeps them as they arrived, and the simulator looks them up in that list. A weight session still earns no block.

A half marathon is still one run or trail run of at least 13.1 miles, lifetime, one unlock per qualifying run. The names are Cherry Creek Trail, then Denver Zoo, then Denver Botanic Gardens. Their blocks are on the front edge of the map, in `map.sideQuestBlocks`, and `drawQuest` in `themes/denver.js` paints each one: a creek and a bridge, a green lot with a gate and an elephant shape, a glass dome over flower beds. A 26.2 mile run still also unlocks the next full-marathon landmark (the bear, then the athletic club).

### The overlay is not the cached texture

`pixelScene.js` paints the lots, the roads, and the buildings into one picture, asking the theme for the shapes. Pixi uploads that picture and keeps it. `sceneSignature` is the name of the picture: the theme, the lighting phase, each building's stories, the landmarks, the park count, and the side-quest names. When the name is unchanged, the GPU just moves the picture.

Cars, walkers, the ultra bus, the crane, the dust, and the parade are not in that name. They are Graphics objects drawn every frame, in the same isometric coordinates as the picture, as children of the grid container. `drawPopulation` clears one Graphics object and redraws at most 16 vehicles and 32 walkers. That is the pool: one object, reused, not a sprite per person and not a pixel baked into the city picture. A moving foot does not call `paintScene`. Earning the zoo does, because the zoo is a side quest and the signature includes its name.

### Why integer zoom keeps the pixels sharp

`gridPlacement` fits the 1280×1000 picture inside the view. On a 390px-wide phone that scale is about 0.30. The whole diamond is visible, and the sky and the ground stay pinned behind it. That opening scale is allowed to be a fraction. Shrinking the picture does not smear it the way a fractional enlarge does. The diamond fills the same fraction of the phone as it did when the picture was 640 wide, because the lots doubled with the picture.

`stepZoom` is the ladder. From 0.61 the next stop is 1, then 2, then 3, up to 6. At 2×, each city pixel is a 2×2 block of screen pixels. The texture is `scaleMode: "nearest"`, so those blocks are copies, not blends. A scale of 1.5 would have to blend neighboring pixels, and the blocks would look soft. Zooming out from 1× does not stop at 0.9. It returns to the opening fit, which is the smallest scale. On a short desktop window the fit can already be above 1 (about 1.8). That fit stays on the ladder, and the next pinch in snaps to 2.

`roundPixels` stays on, and the canvas `resolution` stays 1 with `autoDensity` off. The backing store is CSS pixels. A device-pixel buffer would be wider than the screen and Safari would letterbox it. The canvas CSS (`width` and `height` 100% on `.city-canvas canvas`) is what makes the bitmap fill its box. Integer zoom does not touch that. When the scale is a whole number, the pan position handed to Pixi is rounded too, so the 2× blocks do not shimmer between screen pixels while you drag. The pan value the next gesture uses is still the unrounded one, so the focal-point solve does not drift by a pixel each snap. This is the same idea as `chooseScale` in brick-city's `Overworld.js`: pick a whole-number scale so the art stays blocks.

### Why a pinch used to throw the grid off the phone

`stepZoom` only picks the next scale. It does not move the camera. The old pinch handler wrote that new scale onto the grid and left the pan where it was.

The grid is drawn as `screen = pan + scene * zoom`. The picture pixel under a finger is `(finger - pan) / zoom`. If the pan stays put and the zoom jumps from the phone's contain-fit (about 0.61 on a 390px-wide screen) to 1, then to 2, that pixel is no longer under the finger. The picture grows from its top-left corner, so the pixel slides up and to the left. On a phone the opening pan is the left edge of the screen, and one snap to 2× shoves most of the diamond off the right and the bottom. A drag had the same hole in the other direction: nothing stopped the pan, so the city could leave the screen entirely. The sky did not go with it. The sky is a different layer, pinned to the opening fit. Only the grid moved, which made the jump look like the city had vanished and left the mountains behind.

Two functions in `gridFit.js` close that. `CityView` calls them after every zoom and every pan.

`zoomAboutPoint` keeps one picture pixel under one screen pixel. Rearranging the draw formula gives `pan = finger - scene * nextZoom`. A pinch remembers the picture pixel that was between the two fingers when the gesture started, and each snap (1×, 2×, 3×, and the rest of the ladder) solves the pan so that pixel is under the fingers again, including when the midpoint has moved. A mouse wheel does the same thing with the cursor, holding whatever pixel is under the cursor at that notch. The snap still happens on the way in, one ladder step at a time, rather than as a blurry in-between scale. Snapping only the scale, without solving the pan, is what made the grid jump.

`clampCityPan` runs after that anchor, and after a one-finger drag. The box it watches is the diamond (`GRID_LEFT` through `GRID_RIGHT`, back corner to front corner), not the empty sky in the 1280×1000 picture. At least about 40% of the view (`MIN_VISIBLE_FRACTION`) has to keep showing that diamond. If the diamond is smaller than that slice, the whole diamond stays on screen and can still slide inside the margin. The clamp can pull the focal point a little when the fingers are over empty margin and the snap would have parked the city past the edge. It cannot pull the city all the way off.

Zooming back out onto the opening fit does not keep the corner the fingers were on. That scale is the "show the whole city" scale, so `placeZoom` puts the pan back to the centered contain-fit from `gridPlacement`.

iOS Safari also tries to zoom the page itself on a pinch. The canvas sets `touch-action: none` (in CSS and on the element), and the page calls `preventDefault` on `gesturestart` and `gesturechange`, so the browser zoom does not fight the grid zoom. The backdrop, nearest-neighbor scaling, `roundPixels`, and `resolution: 1` with `autoDensity: false` stay as described above.

## Favicon and the home-screen icon

The picture in the browser tab is not drawn by React. Next.js looks for a few file names in the same folder as `layout.js` and writes the `<link>` tags itself. There is no `<head>` in `layout.js`, and the metadata object does not list an icon. Adding a hand-written `<link rel="icon">` would put a second tag next to the one Next already emits.

Three files, one drawing:

- `src/app/favicon.ico` is the classic tab icon. It holds four pictures: 16, 32, 48, and 64. A browser picks the entry closest to the slot it is filling. A tab is usually 16 or 32. Windows also asks for 48.
- `src/app/icon.png` is 512×512. Next adds it as a larger icon, so a shortcut or a high-resolution tab does not have to stretch the tiny ico.
- `src/app/apple-icon.png` is 180×180. That is the size Apple uses for Share → Add to Home Screen. The file is RGB with no alpha channel. iOS paints a transparent pixel black, which would put a black edge around the tower.

The master is `prototype/icon32_drawn.png`. It is 32 by 32 pixels: the cream UT Tower with the red roof and burnt-orange crown, the pink Capitol dome, a warm sky, and the burnt-orange frame. `npm run icons` runs `scripts/make-icons.mjs`, which reads that file and writes the three files above. The app does not run the script. The committed PNGs and the ico are what Next serves. Run the script again only after the drawing changes.

The scale is nearest-neighbor. A source pixel is copied into a block. It is not averaged with its neighbors, so the twelve flat colors stay the twelve flat colors and the edges stay hard.

- 64 copies each pixel into a 2×2 block. 512 copies each pixel into a 16×16 block. Both divide evenly.
- 48 is 1.5×, which does not divide evenly. A direct nearest resize clumps fat columns next to fat columns. The script first copies each pixel into a 3×3 block (a 96×96 picture) and then keeps every other pixel of that. The columns then alternate thin, fat, thin, fat, and no new color is introduced. 64 is in the ico as well, for a slot that can take an even scale.
- 16 keeps the one source pixel under the middle of each 2×2 block. Averaging the four pixels was tried. It invented colors that are not in the drawing, and the clock went gray. The script does not do that.
- 180, the home-screen size, is not a whole multiple of 32 either (some pixels are copied 5 times, some 6). Apple asks for 180, so that is the size on disk. Any pixel that is not fully opaque is mixed onto the burnt-orange frame before the file is written. The drawing has no such pixels today.

`docs/austin-theme-screenshot.png` is the Austin scene the drawing was made from. It is a reference for the next person who opens the master. The site does not serve it. The full scene is the wrong favicon: at 16 pixels the tower and the dome disappear into the skyline.

## Commands

```bash
cp .env.example .env.local
npm install
npm run dev       # http://localhost:3000
npm test
npm run lint
npm run build
npm run icons     # rebuilds the favicon from prototype/icon32_drawn.png
npm run migrate   # skips with a log line when DATABASE_URL is unset
                  # Vercel runs this automatically via vercel-build
```

Node.js 20.9 or newer.
