# Notes for learning this codebase

The game rules (one story per mile, landmarks, parks, side quests) are in the [README](../README.md). This file is the map of the code: where a click goes, and which file to edit when a rule should change.

## Folder structure

```
src/lib/rules.js           The numbers. Heights, milestones, park and side-quest thresholds.
src/lib/landmarkNames.js   Real-world names for the landmark popup. One file to edit.
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
src/lib/records.js         Which cached best efforts count as this city's records.
src/lib/effortFill.js      Fetches a few missing best-effort lists. Server only.
src/app/api/records        Medal data. GET is the cache. POST fills a small batch.
src/components/game/RecordsMedal.js  The top-right medal and the records panel.
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
src/components/game/rotation.js    Quarter-turns of the view. Does not edit the save.
src/components/game/pixelPen.js    The shared pixel pen every theme draws with.
src/components/game/streets.js     Sidewalks, curbs, and asphalt. Colors come from the theme.
src/components/game/themes/        One file per city. Denver, Austin, and Tokyo. names.js is the allow-list. tokyoSkyline.js is Tokyo's horizon.
src/components/game/overlaySprites.js  Cars, people, crane, transit. Same pixel scale as the city.
src/components/game/pixelScene.js  Paints the backdrop and the grid, then asks the theme to draw.
src/components/game/gridFit.js    Opening scale, pinch focal point, and the pan clamp.
src/components/game/dust.js      Pixel specks at the base of a building that is going up.
src/components/game/CityView.js  Shows the canvas in Pixi. The sky stays put. The grid moves.
src/components/game/landmarkHit.js  Tap to picture pixel, then which sprite box was hit.
src/components/game/LandmarkPopup.js  The card that grows out of a tapped landmark.
src/components/game/shareCapture.js  Copies that canvas to a PNG and shares or downloads it.
src/lib/shareCity.js       The share sentence, the filename, and the footer colors. No canvas.
src/app/layout.js          Font, tab title, share-card tags, viewport, Chakra provider.
src/app/favicon.ico        Tab icon. 16, 32, 48, and 64, from the 32×32 drawing.
src/app/icon.png           512×512 icon. Same drawing, each pixel copied 16 times.
src/app/apple-icon.png     180×180 home-screen icon. Solid, no transparent pixels.
src/app/opengraph-image.png  1200×630 share picture for og:image.
src/app/twitter-image.png    The same picture, under the name X requests.
src/app/opengraph-image.alt.txt  The sentence in place of that picture.
src/app/twitter-image.alt.txt    The same sentence for the Twitter card.
src/app/page.js            Mounts Game. Stays a Server Component.
prototype/                 The original scripts and stills. The app does not execute them.
prototype/icon32_drawn.png The 32×32 drawing every icon size is scaled from.
prototype/og_source.png    The 488×414 Austin close-up the share card is cut from.
scripts/make-icons.mjs     Rebuilds favicon.ico, icon.png, and apple-icon.png.
scripts/make-og.mjs        Rebuilds opengraph-image.png and twitter-image.png.
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
7. The city screen mounts `CityView`, which builds a Pixi canvas in the browser. Lighting calls `lightingAt(new Date())`, so it follows the phone clock. The bottom bar's middle label is the save's name, not the theme. **Share my city** on the menu copies that canvas to a PNG. See [Share my city](#share-my-city).

## Named saves

A person can keep three cities. Each one is a row in `city_saves` with its own `save_id`. The browser cookie is still only the user id. `active` is which of the three is on screen.

The name is a label they type ("Training block", "CJ's Denver"), at most 24 characters. A blank name is refused. The theme is the city they picked: Denver, Austin, or Tokyo. The bottom bar shows the name so the three cities are easy to tell apart.

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

## Personal records

The medal in the top-right corner opens them. It is HTML, on the same line as MENU and on the opposite corner, so a drag does not move it and it is not in the Share my city PNG. The rotate buttons stay in the grass under the city. The panel sits under the medal, short of that grass, and it closes on a tap outside, the X, or Esc.

Strava's activity list does not include best efforts. Those are on the detailed activity, `GET /activities/{id}`, in `best_efforts`. The names this city keeps are `1 mile`, `5k`, `10k`, `Half-Marathon`, and `Marathon`. A 10 mile effort is not a marathon, and a segment effort is a different list, so it is not read. Local Legend is not read either.

The time is that effort's `elapsed_time`, shown as `m:ss` under an hour and `h:mm:ss` from an hour up. The run's own moving time is not a substitute, and neither is `pr_rank` (that rank is Strava's all-time mark, which may sit outside this city's start date). A distance with no effort is left out of the panel. No dashes. If every distance is missing, the panel says so. If some runs are still unfetched, the rows that are already cached are shown and the panel says it is still checking.

The window is the same one the skyline uses. A dated city starts on its start date. All-history and demo have no start. A date after today is left out. The fastest elapsed time wins. A tie keeps the earlier run, because that is when the time was first run.

Each numeric Strava id is fetched once and stored in `activity_efforts` (or `efforts` in the laptop JSON file). An empty array means Strava had none of the five distances, and it is not requested again. A missing row means not yet. The cache is keyed by Strava's activity id, not by the city, so two saves and a phone that opened the city code share it. That phone does not use the owner's token. Strava's client id and secret stay in the server environment.

Opening the medal, on a phone that has connected Strava, asks for a few uncached runs (longer ones first). Log run does the same for the runs it just stored. The counter stops before Strava's 100 requests per 15 minutes and 1,000 per day, and it leaves ten requests so the activity list and a token refresh can still run. A 429 stops the batch and does not cache that run. The panel then says Strava is busy and shows what is already saved.

Demo rows and typed distances use ids like `demo-3` and `manual-…`. Those are not sent to Strava, and they do not become records.

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

The theme seam is `src/components/game/themes/`. `themeFor("Denver")` returns the Denver object. `themeFor("Austin")` returns the Austin object. `themeFor("Tokyo")` returns the Tokyo object. `paintScene` asks that object to draw buildings, landmarks, parks, and side quests, and it reads the object's colors for the prairie, the hills, and the streets. The save's `city` field is the name that gets passed in (`"Denver"`, `"Austin"`, or `"Tokyo"`). The name the person typed for the save is a label on the bottom bar. It is not the theme. An unknown name paints Denver, so a typo does not draw an empty picture. `sceneSignature` includes the theme name, so the cached texture is thrown away when the theme changes and kept when a car moves.

## How a theme is chosen, stored, and drawn

The picker is the only place a person chooses a theme. Denver, Austin, and Tokyo are enabled. Flagstaff and New York still say SOON. The card that used to say Boulder now says Flagstaff, and it is still locked. Tapping a card does not build the city yet. NEXT writes the choice onto the draft (`"Tokyo"`, `"Austin"`, or `"Denver"`), and that draft is what Strava, the start date, and the race question keep. The title-screen **Demo city** button still builds Denver. The DEMO button on the Strava step uses whatever the picker just chose, so a Tokyo demo is the sample log drawn with Tokyo's art.

`POST /api/city` checks the name with `resolveTheme` in `themes/names.js`. A missing name is Denver, which is why an old client and an old save still get the Mile High city. A name that is not in `OPEN_THEMES` is refused. The row stores the canonical name (`"Austin"`, not `"austin"`). City codes do not include the theme. Opening a code opens that save, and the save already knows its city.

The city is still rebuilt from the activity rows. The theme is not baked into those rows. `Game` passes `payload.save.city` into `CityView` as `theme`. `themeFor` turns the string into drawings. A save from before Austin existed has `city: "Denver"`. A blank city column is read back as Denver too.

The shared slots do not look at a different mile table. The simulator still unlocks `unionStation` at 100 miles and still names that quest `"Coors Field"` in the city object, because both cities share `rules.js`. Austin's `labels` map is the name a person would say for that slot. The painter matches the slot key (or the Denver quest name) and draws the Austin shape. 250 miles is still the capitol slot, and in Austin that slot is the pink-granite Texas State Capitol.

Three landmarks are not renames. `replay()` passes `save.city` into the rules. When that name is Austin, `simulate()` also reads `rules.cities.Austin` and may add `lbjLibrary`, `marthasGallery`, and `rockmansBakery`. A Denver save, and a save with no city, skips that object, and the lots those buildings would have used stay in the normal pool. The demo log has no watch times, so an Austin demo earns the library (the log is past 500 miles) and the gallery (the log has a pace PR) and does not earn the bakery.

What Austin changes, besides the buildings:

- The backdrop. Denver's mountains are the Rockies, and its sky is the clock's cool blue. Austin's ridges are low green-gold hills. Its sky is three colors of its own: a warm light blue up high, peach in the middle, gold at the horizon. Mixing every stop toward one peach was tried first, and the sky went flat gray, which is why the stops are separate. At night those stops blend toward a dark warm sky so the stars stay visible. The dither in `pixelScene.js` is the same one Denver uses. There is no lake. A ribbon along the south edge was tried, two lots wide, and a fill of the whole foreground before that. The fill put water across the bottom half of the phone. The ribbon left gaps, and the gaps showed the pinned prairie, which does not zoom, so the shore jumped when the city zoomed. A turn pulled the ribbon across the lots or off into a separate chunk. The Congress Avenue Bridge, the Lady Bird Lake trail, Auditorium Shores, Barton Springs, and Pennybacker sit on grass. The lip under the diamond is the skirt, tan and cedar. It is not water. See [Why Austin zoom looked broken](#why-austin-zoom-looked-broken-and-why-the-lake-is-gone).
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
| Martha's (first 5-mile pace PR, Austin only) | Small cream shop, burnt-orange awning, across from the Blanton. The rules file still says "Martha's Art Gallery". |
| Rockman Coffee (10 runs before 6:00am local, Austin only) | Awning and a loaf sign. The rules file still says "Rockman's Bakery". |
| Cathedral (every 200 mi) | Saint Mary Cathedral, one steeple and a rose window |
| Half marathon, in order | Barton Springs Pool, Mount Bonnell, Pennybacker Bridge |
| Full marathon, in order | Giga Texas, then Frost Bank Tower |
| Parks, in order | Zilker Park, Lady Bird Lake trail, Auditorium Shores |
| Rides, 10 / 25 / 50 | Q2 Stadium, Moody Center, DKR Texas Memorial Stadium |
| Walks, 10 / 25 / 50 | Sixth Street, South Congress, Circuit of the Americas |

Ordinary buildings follow the same rings. A rowhouse is a Hyde Park or Bouldin bungalow (cream or wood, red hip roof, a porch) instead of a Victorian. Mixed-use is a South Congress shop under a red roof. Offices are limestone. A skyscraper is one of three shapes, chosen from its variant: stacked slabs (the Independent), a glass sail, or a bronze shaft (Sixth and Guadalupe). State buildings are limestone with a small Texas flag. The sprinkled museum type is a limestone gallery, not a second Blanton. Giga Texas uses the Big Blue Bear's block, which is already on the southeast edge, so the factory sits on the east side without moving a lot. Nothing in the Austin file draws a seal, a wordmark, or a mascot. The library is a travertine slab with a set-back top, the gallery is a cream shop and an orange awning, and the bakery is an awning with a loaf on the sign.

## How the Tokyo skyline is drawn

The horizon behind Tokyo is a row of traditional buildings, not a mountain. `drawSkyline` paints them into the backdrop, in picture pixels, on the rows above `HORIZON_Y`. The ground painter then covers everything from the horizon down, and the city grid is a second picture drawn on top. The row sits behind every lot.

It does not call `project()` or `pen.box()`. Those place a building on a lot, and a lot moves when the view turns. At 90° and 270° an ordinary building sprite is also mirrored. A pagoda on a lot would slide around the diamond, and a mirrored one would face the wrong way. The backdrop is pinned. Turning the city leaves the pagoda, the gate, and the temple where they were, upright, at all four quarters. Landmarks in the city still never mirror. That is `mirrorBuildingSprite` in `rotation.js`, applied in `listProps`. The skyline never goes through it, because it is not a sprite.

Each pigment is mixed toward the sky before it is drawn. Day mist is the horizon cream. Night mist is the night horizon. Higher pixels get a little more mist. That mix is the haze: the row stays lighter and less saturated than a wall in the city, so it does not compete with the buildings in front. The clock's mountain tint is only a light touch. Using it at full strength made the old snow cone a dark lump.

The roofs are silhouettes with an eave that sags in the middle and turns up at the corners, and dark courses for the kawara tiles. Four forms:

- kirizuma is a gable. Timber fills a triangle inside the slopes. Tile stays on the border and the eaves.
- yosemune is a hip. The ridge is a short flat line, every face is tile, and there is no timber triangle.
- irimoya is a hip with a small gable cut into the upper slope. The temple hall's lower roof uses it.
- hogyo is a pyramid. The slopes meet at a point. Each of the pagoda's five roofs is one.

The pagoda is the tallest shape: a stone step, five vermilion stories, a dark tiled roof on each, then a pole with five rings. The gate is two vermilion pillars, a wide gabled roof, a smaller roof above it, and a lantern with gold bands and no mark. The temple is a wide timber hall on stone, with a second story and a second roof so the two eaves stay separate. The lower houses use the other roof forms. One wooden house stands next to a flat concrete slab with glass bands. Pink blossoms sit along the base, in front of the walls.

The red disc stays a plain circle in the upper sky, and it is skipped once the stars are up. A ray around it would be a flag. Nothing in the skyline file draws a word or a team mark.

A machiya in the city is close enough for two things the distant houses only hint at. The windows are shoji: most of the opening is pale paper, with a wood bar and a mullion, not the dark glass an office uses. The engawa is a wooden deck, two posts, and a thin tile roof stuck out past the front wall. It is kept below the main eaves, or a short house would wear the porch on its head. The noren still hangs in that opening. It is color panels, not a word.

Denver has no `drawHorizon`, so the seven-peak ridge still runs, snow and all. Austin has no `drawHorizon` either. Its snow line sits above the peaks, so the same ridge stays a low hill. Neither background reads this file.

## How view rotation works

The two buttons under the city, and the Q and E keys, turn the view by 90 degrees. Right is clockwise. Left is the opposite direction. Four rights put every lot back where it started. One left undoes one right.

This is a view setting. The save, the city code, and the rules are not rewritten. The same runs still build the same lots. The quarter is stored in `localStorage` under `mc-view-quarter` as 0, 1, 2, or 3, on this device only. A phone that opens a city code starts at whatever that phone last used, or at 0. Strava tokens are not involved.

`orientCity` in `rotation.js` copies the buildings, landmarks, parks, and side quests and gives the copy the coordinates of the turned grid. The original objects keep the stored x and y. Streets, cars, walkers, bats, the parade, and the crane all read `viewQuarter` on that copy and run the same turn on the point they are about to draw. `project()` itself does not turn anything. A building is drawn with the same three-face formula, on the lot it moved to. There is no lake in that list. The ribbon used to read `viewQuarter` too, and that is the path that painted water across the lots.

The math is around the center of the map (`tiles / 2`). One right turn sends a grid point `(u, v)` to `(tiles - v, u)`. That slides the right corner of the diamond to the front, the front to the left, and so on. The center point does not move, so the city spins in place. The outer corners trade places, but the box around the diamond does not change size or position. Pinch zoom still anchors on a picture pixel, and the pan clamp still watches that same box, so a turn does not throw the diamond off the phone.

A lot is stored by its back corner. After a turn, a different corner of that square is the one farthest from the camera. `rotateLot` picks the minimum u and the minimum v of the four turned corners. Drawing from the old corner would slide the building by a whole lot.

Depth is still "larger means closer to the camera," and that number is still `u + v`. It has to be the turned u and v. `listProps` uses the front corner of the turned lot, `x + y + span * 2`. Cars and walkers use the turned sum of the point they are standing on, and they go in the bucket for `floor` of that sum. A tower that rotated to the front is drawn after the car it should hide. `moverHidden` still drops a walker whose body overlaps a nearer sprite, so someone on the sidewalk beside a tall landmark does not appear to stand on the roof. Sorting by the saved coordinates would leave that tower behind the car.

Buildings are painted for one isometric angle: the left wall is dark, the right wall is mid, the roof faces the viewer. There is no second set of drawings for the other three compass directions. At 90° and 270° the finished building sprite is flipped left to right, so a door swaps walls. That is a stand-in for looking from the other diagonal, not a true view of the back of the building. At 0° and 180° the sprite is not flipped, so roofs stay upright. Landmarks, parks, and side quests are never flipped. A mirrored clock, flag, or sign would be harder to recognize. None of the landmark painters draw a word, and the rule is still "do not mirror them," so a later sign does not come out backwards.

The lip under the near edge of the diamond stays on the camera side at every quarter. It is there so the city does not look like it is floating. It is the skirt, not a shore, and it does not turn into water when the lots move. The Congress Avenue Bridge is a deck on its own lot, and that lot moves with the other landmarks. The bats still fly over that lot at dusk and night.

The grid fades for about a sixth of a second when the quarter changes. The sky does not. Share my city copies the stage after that fade is forced back to full opacity, so the PNG is the turn you are looking at. The buttons are HTML, the same as the menu, so they are not in the picture.

The buttons are a row, left then right, centered in the prairie under the diamond. That band is empty at the opening fit: the picture is taller than the diamond, and the view fits the whole picture, on a 390px phone and on a desktop window. They sit 20px above the footer, so they do not cover the bottom bar or the city. They are HTML on the canvas box, the same way MENU is, not sprites in the grid. A drag or a pinch moves the city and leaves the buttons where they are. Q and E do the same turns on a keyboard, and they are ignored while a text field is focused.

## Landmark tap popups

A tap or a click on a civic landmark, or on one of the other named landmark buildings, opens a small card. The card scales out of that building in four pixel steps. It closes on a tap outside the card, the X, or Escape. The same card is used on a phone and on a desktop window.

The buildings that open it are the slots in `src/lib/landmarkNames.js`: the capitol, Union Station, the courthouse, the art museum, and the cathedral, plus Austin's library, gallery, and bakery, plus Tokyo's Skytree. A rowhouse, a park, a trail, and a stadium do not. Those are ordinary buildings, parks, and side quests. Their sprites still block a tap, so a tower standing in front of Union Station does not open Union Station.

The name on the card is not the string `simulate()` stored. The replay still writes "State Capitol", "Courthouse", "Cathedral Basilica", "Martha's Art Gallery", and "Rockman's Bakery", because those strings are in the log and in old tests. `landmarkNames.js` is the map from that slot to the real place. Denver's capitol is the Colorado State Capitol. Austin's same slot is the Texas State Capitol. Tokyo's same slot is Imperial Palace Nijubashi Bridge. The other Tokyo cards are Tokyo Station Marunouchi Building, Tokyo Tower, Meiji Jingu, Senso-ji Kaminarimon, and Tokyo Skytree. The courthouse sprite in Denver is a stone block with a pediment, so the Denver name is the Byron R. White U.S. Courthouse, not the City and County Building (that one is known for a clock tower, and the clock in this city is Union Station). Austin's cathedral is Saint Mary Cathedral, the name on the cathedral's own site. Martha's and Rockman Coffee are the names on those businesses' own sites. Edit that one file to change a name. Austin's and Tokyo's `labels` maps read their half of it, so the label and the card cannot disagree. A slot with no row for the city on screen does not open. That is why Tokyo has its own table: without it, a tap on Tokyo Tower would find the slot and then stay closed, because the Denver name is not Tokyo's.

The run on the card is copied when the city is replayed. `runOf` in `simulate.js` keeps the date, the miles, the moving seconds, and the Strava id of the activity that unlocked the landmark. The capitol is the exception: while it is still going up, the run is the one that crossed 250 miles. When the 13.1 miles finish, that finish replaces it, on both the building and the landmark row. The capitol is drawn as a building, so the tap reads `building.run`. Every other landmark is its own sprite, and the tap reads `landmark.run`. Pace is moving seconds divided by miles. A demo id (`demo-3`) or a typed distance (`manual-…`) has no Strava page, and the card says so. A missing run says no run is linked yet. The card does not call Strava. A phone that opened the city by code is looking at the same replay of the saved activities. It does not have the owner's token, and it does not need one.

Hit testing does not use the lot diamond. The dome and the spires stand above the lot, and the sprite's box is the rectangle CityView already cut out of the picture. A tap's page pixel becomes a canvas pixel (minus the canvas origin), then a picture pixel: `(canvas - pan) / zoom`. That is the same camera a drag and a pinch write. The box that contains the point and has the greatest depth wins. Depth is the turned `x + y + span * 2`, so a landmark that rotated to the front is in front. `orientCity` has already moved the lot, and the sprite was painted on that moved lot, so the box is the turned one. At 90° and 270° a normal building, including the capitol, is drawn with a negative horizontal scale. The anchor sits on the right edge, which keeps the building on its lot. The hit box starts at `position.x - width` in that case. Landmark sprites stay at scale 1. A mirrored clock would be harder to recognize, and the hit box must not pretend they were mirrored.

A finger that moves more than 12 pixels is a pan. The card stays closed, and the drag is the one that was already running. Two fingers are a pinch, and the lift does not open a card. The wheel listener is unchanged. The rotate buttons are later siblings of the transparent scrim, at the same stacking level, so a tap on a button turns the view instead of closing the card. The turn then closes the card, because every lot just moved and the card was aimed at the old pixel.

## How a city theme is added

Tokyo is the example. Austin was the one before it. The mile numbers stay shared. Do not add a new threshold for a landmark that already has a slot. A 100-mile run is still `unionStation`. In Tokyo that slot is drawn as Tokyo Station's Marunouchi Building. The simulator still writes the slot key. The name on the card lives in `landmarkNames.js`. The theme's `labels` map spreads `labelsFor("Tokyo")` from that file, then adds the park and side-quest names, which do not open a card.

Tokyo's one extra is the Skytree, and it follows the library, not a new rule. `rules.cities.Tokyo.landmarks.tokyoSkytree.cumulativeRunMiles` is 500, the same line as `lbjLibrary`. `simulate.js` walks any city landmark that has `cumulativeRunMiles`, so the Skytree does not need its own `if`. The gallery and the bakery stay on Austin's keys. Tokyo's block does not list them, so a Tokyo replay does not earn them. The Capitol, the streak tower, the pace-PR gate, and the cathedral count are the shared slots. They are not reimplemented.

What changed for Tokyo, and only that:

| Piece | Where | What Tokyo did |
| --- | --- | --- |
| Drawings and names | `themes/tokyo.js`, `themes/tokyoSkyline.js`, and `landmarkNames.js` | Silhouettes, the faded skyline, and the six real names the card shows |
| Register the painter | `themes/index.js` | `THEMES.Tokyo` |
| Let the API accept the name | `themes/names.js` | `"Tokyo"` in `OPEN_THEMES` |
| Picker card | `Screens.js` `CITIES` | Tokyo is a button. Boulder was renamed to Flagstaff and left locked, with New York |
| Frame | `globals.css` `.theme-tokyo` | Navy, white pinstripes, one red disc, gold trim |
| Title face | `layout.js` and the two CSS rules | Zilla Slab on `.pixel-title` and `.hud-name` only while Tokyo is active |
| 500-mile lot | `rules.js` `cities.Tokyo` | The Skytree, same number as the library |

Slots Tokyo paints, using the same unlocks:

| Slot | Tokyo |
| --- | --- |
| State Capitol (250 mi, then 13.1 mi to build) | Imperial Palace Nijubashi Bridge |
| Union Station (100 mi) | Tokyo Station Marunouchi Building |
| Courthouse (12 runs in 30 days) | Tokyo Tower |
| Art Museum (5-mile run after 20 runs) | Meiji Jingu |
| Cathedral (one per 200 run miles, no cap) | Senso-ji Kaminarimon |
| Skytree (500 run miles, Tokyo only) | Tokyo Skytree, its own lot |
| Half marathon, in order | Shibuya Crossing, Rainbow Bridge, Komazawa Olympic Park |
| Full marathon, in order | Tokyo Metropolitan Government Building, then Mori Tower |
| Parks, in order | Ueno Park, Yoyogi Park, Shinjuku Gyoen |
| Rides, 10 / 25 / 50 | Tokyo Dome, Jingu Stadium, Japan National Stadium |
| Walks, 10 / 25 / 50 | Takeshita Street, Ginza, Ameyoko |

Ordinary buildings follow the same rings. A rowhouse is a machiya: wood posts, plaster, a tile roof, pale shoji screens, and a covered engawa along the street face. Mixed-use is a shotengai shop under apartments. Offices are concrete mid-rises. A skyscraper is one of three shapes from its variant: a glass slab with a red crown band, stepped setbacks, or a slender shaft with a mast. Nothing in the Tokyo file draws a team mark, a "J", or a ray flag. The red disc in the sky is a circle. The banner on a state building is navy with one gold bar.

The horizon is `drawHorizon`. The shared ridge is seven peaks, which is Denver's snow range and, with the snow line pushed above the peaks, Austin's hills. Tokyo passes `drawHorizon`, so that ridge is skipped. The painter is `drawSkyline` in `themes/tokyoSkyline.js`. How that row is drawn is the next section. There is no `lake` field. Rainbow Bridge, the parks, and the skirt are on stone and grass. A blue fill under the diamond is the water coming back.

The frame is `.theme-tokyo`. Denver has no class, on purpose, so its gold frame stays the default. Austin keeps `.theme-austin`. The class is `theme-` plus the name in lowercase, from `themeClass`.

The face on the title and the city name, and only those, is Zilla Slab. `next/font` loads it in `layout.js` and publishes `--font-slab`. It is a Latin slab serif under the SIL Open Font License, served from this origin. `.theme-tokyo .pixel-title` and `.theme-tokyo .hud-name` are the only rules that use it. Buttons, cards, and notes stay on Press Start 2P. The other cities never see the slab, because the rules are under `.theme-tokyo`.

Buildings mirror at 90° and 270°. Landmarks, parks, and side quests do not. That is `mirrorBuildingSprite` in `rotation.js`, applied in `listProps`. Tokyo does not get a second set of drawings. The palace is the capitol building, so it mirrors with the houses. It is drawn symmetric so the bridge still reads. The tower, the torii, the station clock, the lantern, and the Skytree are landmarks, so they stay unflipped.

To add the next city, copy `themes/tokyo.js`, keep the same slot keys, and add a table in `landmarkNames.js`. Then:

1. Register it in `THEMES` inside `themes/index.js`.
2. Add the canonical name to `OPEN_THEMES` in `themes/names.js`. `themeFor` still falls back to Denver if the painter is missing, so do both.
3. Add the uppercase label to `CITIES` in `Screens.js`. A name in that list but not in `OPEN_THEMES` stays a SOON card. A name in both becomes a button.
4. If the frame should change, add a `.theme-<id>` block in `globals.css` next to `.theme-tokyo`. The class is `theme-` plus the name in lowercase. Denver has no class, on purpose, so its gold frame is the default.
5. Add the city's real landmark names to `src/lib/landmarkNames.js`, with `popup: true`. Spread `labelsFor` into the theme's `labels` map, then add park and side-quest names. Draw functions still switch on the slot key (`unionStation`, `"Coors Field"`, `"Cheesman Park"`). A name that is only on the theme, and not in `landmarkNames.js`, will not open the card.
6. Add a `cities.<Name>` block only for a landmark that is not one of the shared slots. Give it `cumulativeRunMiles` if it should follow the library and the Skytree. Do not copy the gallery or the bakery unless that city has those rules.

Run `npm test`. The Denver capitol test still expects a gold dome. The Austin capitol test expects pink granite and almost no gold. The Tokyo capitol test expects red posts and almost no gold. The backdrop test expects the faded skyline and a plain red disc, and Denver's snow range still spans the picture. Then `npm run lint` and `npm run build`.

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

## Share my city

Menu, then **Share my city**, copies the city and closes the menu first. The MENU button and the bottom bar are HTML, so they are not in the picture. The menu is closed before the copy anyway, so the shutter is not compared against the open box.

The picture is not whatever pinch is on screen. A phone fit leaves the diamond small and the file mostly near-ground, which is the dark muddy field. `shareFrame` in `src/lib/shareCity.js` builds a 4:5 portrait at scale 1. The diamond fills most of the width, the back corner sits under a band of sky, and there is ground under the front corner. CityView moves the sky container and the grid to that camera, renders once, and puts the pinch back before the browser paints. The pointer listeners are not touched. The screen-sized sky fill is hidden for that one render. It is a rectangle the size of the phone, and on the 4:5 frame it would cover the corner.

The copy uses `renderer.extract.canvas` with antialiasing off and resolution 1. The WebGL canvas is created with `preserveDrawingBuffer` left off, on purpose. Keeping that buffer would hold a full extra frame of memory on every phone, and pinch zoom does not need it. The cost of leaving it off is that `canvas.toBlob` on the on-screen canvas comes back black. Extract does not read that buffer. It renders into its own texture and the PNG copies those pixels with `putImageData`, so nothing is resampled. Opaque sky and ground are alpha 255, and those bytes match a screenshot of the same texel. Extract's texture is premultiplied, so a partial-alpha edge is stored darker than the texel. Those pixels are divided by their alpha. Opaque pixels are not touched, which is what keeps a sky sample exact. The output canvas is sRGB. The footer is the same band as before, scaled by a whole number so the pixel type is still readable on a phone.

The share sheet is `navigator.share` with the PNG file, the title `Miles and Miles`, and the sentence `<name>: <miles> miles of running built this city.` plus `https://marathon-city.vercel.app`. That call only happens when `navigator.canShare({ files })` is true, which is iPhone Safari. Anywhere else the same PNG downloads. The filename is the save name in lowercase, with spaces turned into hyphens, then `-miles-and-miles.png`. `CJ's Denver` becomes `cjs-denver-miles-and-miles.png`.

The share call has to happen in the same turn as the tap. iOS forgets the tap if the page waits on a promise first, and then the sheet throws and looks like a failure. The pixels are copied synchronously, then `navigator.share` is called, and only then does the code wait. Closing the sheet without sending is `AbortError`. That is the person changing their mind, so there is no red note. On a successful share the note says CITY SHARED. On a download it says IMAGE SAVED. A white shutter with the theme's accent bars blinks over the screen either way. It is HTML, so it is not in the PNG. The button stays disabled until that finishes so a second tap does not start a second copy.

The sentence, the filename, and the two backup palettes are pure functions in `src/lib/shareCity.js`. `npm test` checks them. The canvas part needs a browser, which is why it is not in that file.

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

## The share card

A link pasted into iMessage, Slack, or X shows a card. The card is not the page. Those apps read a few tags in `<head>` and one image. They do not run the game.

`src/app/layout.js` sets the words:

- The browser tab, `og:title`, `twitter:title`, and `og:site_name` are all `Miles and Miles`.
- The description under that name, for the page and for both cards, is `A dynamic city built on your strava stats.`
- `metadataBase` is `https://marathon-city.vercel.app`. Next builds the image URL from that origin, so the tag is an absolute `https://` link. A path with no host is ignored by most of those apps, and the card would be words with no picture.
- `og:type` is `website`. `og:url` is `/`, which `metadataBase` turns into the home page. `twitter:card` is `summary_large_image`, the wide card. `summary` would shrink the city to a small square.

The picture is files next to `layout.js`, the same way the favicon is. The metadata object does not list an image path. Adding one by hand would put a second `og:image` next to the one Next already emits.

- `src/app/opengraph-image.png` is what Facebook, Slack, and iMessage request (`og:image`).
- `src/app/twitter-image.png` is the same picture under the name X looks for (`twitter:image`). Next does not reuse one file for both tags, so both are committed. The bytes match.
- `opengraph-image.alt.txt` and `twitter-image.alt.txt` are one sentence: the pink Capitol dome, the cream UT Tower, and the cathedral spire. A screen reader uses it in place of the picture, and some cards print it as the image caption. The script does not write these files. They are words, not pixels. The file is that one line and nothing after it. Next copies the bytes into `og:image:alt`, so a trailing blank line would show up inside the tag.

The card is 1200 by 630. That is the size the large card expects.

The drawing is `prototype/og_source.png`, a 488 by 414 close-up of the Austin scene. `npm run og` runs `scripts/make-og.mjs`. The script copies each source pixel into a 3 by 3 block, which makes a 1464 by 1242 picture, and then cuts a 1200 by 630 window out of that. The window starts 72 source pixels in and 96 down (216 by 288 after the scale). That crop keeps the pink Capitol dome, the cream UT Tower with its orange crown and clock, and the cathedral spire with the blue rose window. Towers at the edges and the roofs along the bottom are outside the card.

The scale is nearest-neighbor. A source pixel is copied, not averaged with its neighbors. Averaging would invent colors between the pink granite and the sky, and the dome would go soft. The script checks that every output pixel is a color from the source, and that four landmark pixels (the tower crown, the dome, the spire, the rose window) are still the colors they were. The app does not run the script. The committed PNGs are what Next serves. Run the script again only after the drawing changes.

The favicon is a different picture, the 32 by 32 tower-and-dome drawing. `npm run og` does not write `favicon.ico`, `icon.png`, or `apple-icon.png`.

## The Next.js security patch

`next` was pinned at `16.4.3`. That release prints a build notice that the installed version has a known security vulnerability (`Installed Next.js version … is affected by a known security vulnerability`). `npm audit` agreed: `next` 16.0.0 through 16.4.4 carried seven advisories, every one of them moderate. The fixes shipped in `16.4.5`. The newest stable release on the 16 line is `16.4.6`, which is that patch plus a small bug-fix backport, so the pin moved from `16.4.3` to `16.4.6` and nowhere else.

`react` and `react-dom` stayed at `19.3.0`. `eslint-config-next` stayed at `16.4.3`. The new Next release still accepts React 19, and the ESLint config does not have to match the framework version for the app to build. Strava client id and secret were not part of this change. They stay in the Vercel environment.

The seven advisories, as `npm audit` and the GitHub advisory records name them, all moderate:

- CVE-2026-119790 / GHSA-mfr8-8qww-v76h. A `use cache` function called both directly and through `unstable_cache()` can return another root param's cached value.
- CVE-2026-119351 / GHSA-vc7v-qv4w-wrv8. Nested `use cache` functions can leak a value across root params.
- CVE-2026-119349 / GHSA-rhh4-g77r-r9qj. Binary arguments to `use cache` can share one cache identity across users.
- CVE-2026-119350 / GHSA-vvgp-ww4w-46vf. A self-hosted app with Cache Components can have a shared fallback shell poisoned.
- CVE-2026-119348 / GHSA-pc58-hwjq-p385. Forwarding a fetched response unchanged can mix one client's response into another's.
- CVE-2026-119347 / GHSA-7qx7-33qx-rqx2. The image optimizer can be handed an SVG it was supposed to reject.
- CVE-2026-119346 / GHSA-f3mh-rxg3-f5g2. An Edge runtime route can expose an HttpOnly cookie on an internal response header.

This app does not turn on Cache Components, does not call `use cache` or `unstable_cache`, does not use `next/image`, and does not run routes on the Edge runtime. The city, the screens, and the route handlers are the same code. `16.4.6` also compresses a route-handler body when it was not already compressed, and it includes Turbopack fixes. Dev and build still pass `--webpack`, so those Turbopack fixes do not run here. After the bump, `npm audit` no longer lists `next`.

## Why Austin zoom looked broken, and why the lake is gone

Two things showed up on the Austin city at desktop size (a 1440×900 window and a 1280×800 window). The zoom math in `gridFit.js` is the same for both cities. What differed is where the wheel landed, and what Austin had painted in that spot.

The rotate buttons sit in the grass under the diamond, on top of the canvas. The wheel listener was on the canvas. A wheel event whose target is a button never reaches the canvas, so the zoom did nothing while the cursor was on those buttons. A ctrl+wheel pinch, which is how a trackpad zooms on a desktop, failed the same way. On those window sizes the 1280×1000 picture is fitted to the height, so that grass band is at the bottom of the screen, which is where the cursor rests. Moving the cursor up onto the buildings made zoom work again, which felt like a jump and then a zoom that had stopped. Denver has the same buttons. The dead spot there is empty grass, so it was easier to miss. The phone pinch does not use the wheel listener. It is still the two-finger pointer path: it remembers the picture pixel between the fingers, snaps one whole step at a time (1×, 2×, 3×, up to 6×), and `clampCityPan` keeps the diamond on screen. That path was not changed.

The listener is now on the city box, in the capture phase, so it hears the wheel before the button does. `preventDefault` still runs, so a ctrl+wheel does not also zoom the browser page. Landing back on the opening fit still recenters. Any other step still holds the picture pixel under the cursor, then clamps.

The lake made the same gesture look worse, and it was only on Austin. The ribbon was painted into the ground picture, which zooms with the lots. It was full of gaps. The gaps showed the prairie backdrop, and that backdrop stays pinned. It does not zoom. Zooming the city moved the teal and left the grass in the holes where it was, so the shore looked like it jumped away from the cursor. The clamp watches the diamond, not the ribbon, and the ribbon hung past that box (about 48 picture pixels past the front tip, and off the side corners). A wheel on the water was a wheel on what the clamp treats as empty margin. Denver has no ribbon, so the same wheel on the same grass is just the pinned prairie and does not look like a piece of the city tearing off. A turn made it worse. The ribbon was supposed to follow the south and east edges of the map. At 90° it left a gap and a separate chunk on the left. At 180° it crossed the back lots. At 270° it did the same on the right.

The ribbon is gone, and so is the painter (`paintLakeRibbon` and the turn-specific stroke). So is the teal on the Congress Avenue Bridge lot, the Lady Bird Lake trail, the Zilker pool, Barton Springs, and the lots under the Pennybacker arch. Those shapes still draw, on grass: the bridge deck and its pilings, the trail path, the Auditorium Shores shell, the trees, the white arch. The bats still use the bridge lot. The lip under the diamond stays. It is the skirt (`skirt` on the theme), tan and cedar in Austin, and it stays on the camera side at every quarter. It is not water.

## Commands

```bash
cp .env.example .env.local
npm install
npm run dev       # http://localhost:3000
npm test
npm run lint
npm run build
npm run icons     # rebuilds the favicon from prototype/icon32_drawn.png
npm run og        # rebuilds the share card from prototype/og_source.png
npm run migrate   # skips with a log line when DATABASE_URL is unset
                  # Vercel runs this automatically via vercel-build
```

Node.js 20.9 or newer.
