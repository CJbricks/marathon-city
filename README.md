# Marathon City

Marathon City turns the owner's Strava runs into a growing pixel-art city. The look is isometric, in the spirit of SimCity 2000, and the theme is Denver. The app is planned as a plain-JavaScript Next.js site, hosted on Vercel, and laid out for a phone.

The app at the repo root replays runs into a city: opening screens, Strava sync (or a demo log), and an isometric Pixi view. The original scripts and stills stay in [`prototype/`](prototype/) as the spec the app was ported from. New to the code? Read [docs/NOTES.md](docs/NOTES.md).

![Isometric Denver city built from run miles](prototype/preview.png)

## Run locally

Node.js 20.9 or newer.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Choose **Demo city** on the title screen to load `prototype/activities.txt` with no keys and no database. **Log run** then asks for a distance, because the demo is not connected to Strava.

The app runs with nothing filled in. Saves go to `.data/store.json` (gitignored) until `DATABASE_URL` is set. Restart the dev server after changing `.env.local`.

`npm test` replays the sample log and checks it against `prototype/city.json`. `npm run lint` and `npm run build` are the other checks.

### Strava API app

1. Open [Strava's API settings](https://www.strava.com/settings/api) and create an app.
2. Set **Authorization Callback Domain** to `localhost` for local dev. Strava wants the domain only, not the path.
3. Put the client id and secret in `.env.local`. Set `STRAVA_REDIRECT_URI` to `http://localhost:3000/api/strava/callback`.
4. On the deployed site, change the callback domain and the redirect URI to that host. The names have no `NEXT_PUBLIC_` prefix, so they stay on the server.

The connect button asks for the `read` and `activity:read_all` scopes. Tokens are stored server-side and refreshed there.

### Database

Set `DATABASE_URL` to a Neon, Vercel Postgres, or Supabase connection string, then run `npm run migrate`. The same script prints a note and exits if the variable is empty. Without it, the JSON file store is the source of truth for that machine. On Vercel the build runs that migration itself when the Neon integration has set the URL. `GET /api/health` reports `postgres`, `file`, or `demo` and whether the database answered. It does not return the connection string.

`@pixi/react` is not installed. Release 8.0.5 is built on `react-reconciler` 0.31, which targets React 19.0, and this app uses React 19.3. The city view imports `pixi.js` directly.

## How a run becomes a building

One mile is one story. A run that does not finish a building leaves the leftover fraction on that lot, and the next run continues it. Building height is chosen by type:

| Type | Stories |
| --- | --- |
| Rowhouse | 2–3 |
| Mixed-use | 4–6 |
| Office | 8–12 |
| Skyscraper | 20–30 |
| State building | 8–12 |
| Museum | 10–15 |

The State Capitol is its own building, and the city gets at most one. It takes 13.1 miles. It unlocks at 250 cumulative run miles, pauses whatever is already under construction, spends the next 13.1 miles, and then lets that earlier building resume.

Downtown lots prefer offices and skyscrapers. The inner ring prefers mixed-use. The outer ring prefers rowhouses. State buildings and museums are sprinkled through every ring. Museums stay 10–15 stories and still appear from those weights, and the city stops at 10 of them. The map is a 7×7 grid of blocks, with a Civic Center block in front of downtown for the one-of-a-kind landmarks.

## Landmarks, parks, and side quests

Landmarks unlock from milestones:

- **Union Station** at 100 run miles.
- **The Courthouse** for a streak. The prototype uses 12 runs inside 30 days.
- **The Denver Art Museum** for a pace PR. The prototype counts a PR only on a run of at least 5 miles, and only after the first 20 runs.
- **The Cathedral Basilica** at one per 200 banked run miles, with no ceiling unless `max` is set in `src/lib/rules.js`. 700 miles is 3. 1000 miles is 5. A single 13.1 mile run does not unlock one early.

Trail runs count as runs. Strava's `TrailRun` sport type and a log line that says `Trail Run` both add their miles to stories, Union Station, the Capitol, cathedrals, the courthouse streak, art-museum pace PRs, and parks.

After you pick a start date, the app asks if you are training for a specific day. Yes saves a date and an optional name, such as Austin Marathon on 2027-02-14. No skips it. On that local calendar day the city plays confetti and a small parade, and shows the name if you gave one. Change it later from the city menu. `?raceday=1` previews the celebration on any day. The counts and the timing live in `raceDay` inside `src/lib/rules.js`.

Parks are Cheesman Park, Washington Park, City Park, and the Confluence bridge. In the current simulator, a quiet calendar week (at most one run, and only when the gap between runs is 21 days or less) awards the named parks in order — Cheesman, Washington Park, City Park — and later quiet weeks become numbered neighborhood parks. The Confluence bridge is earned there as a year-to-date walk milestone.

Side quests, once earned, stay earned. The names and the mile lines live in `sideQuests` inside `src/lib/rules.js`.

- **Half marathon:** any single run or trail run of 13.1 miles or more unlocks the next stadium, in order: Coors Field, then Ball Arena, then Empower Field at Mile High. The count is lifetime. One run unlocks one stadium.
- **Full marathon:** any single run or trail run of 26.2 miles or more unlocks the next athletic landmark, in order: the Big Blue Bear, then the Denver Athletic Club. A 26.2 mile run also clears the half-marathon line, so it can earn one stadium and the bear on the same day.
- **Walk:** year-to-date miles, unchanged. The Confluence Park bridge is 10, the 16th Street Mall is 25, and Red Rocks Amphitheatre is 50.
- **Rides and weight sessions** leave the skyline as it was.

A run or trail run longer than 26.2 miles unlocks the next transit line. The order in `transit.types` is a bike route, then a bus route, then a light-rail line, and then it starts over. There is no cap. Exactly 26.2 miles stays a marathon and does not lay track. The lines are pixel stripes on the overlay (a bike-lane dash, a bus with stops, a rail with a train) along roads that are already in the city. They are not part of the cached texture, so a moving bus does not repaint every building. Change `transit.overMiles` or `transit.types` in `src/lib/rules.js` to edit the threshold and the cycle.

`src/lib/rules.js` is the editable source for these numbers, including `perCity` on museums and `milesPer` / `max` on landmarks. `prototype/summary.txt` is the older replay, from before cathedrals followed the mileage bank and from before stadiums moved off of ride miles.

## Logging a run

A **Log run** button syncs from Strava. The app keeps the timestamp of the last successful sync. Each press fetches every activity since that timestamp, with about a one-hour overlap so a run that was still uploading cannot be missed. Activities are deduped by Strava activity ID. New runs are built in chronological order. Only after that replay succeeds does the saved timestamp move forward. If Strava returns nothing new, the app asks for the distance by hand and builds that run the same way.

## City state

The database is the source of truth: Vercel Postgres or Supabase. It stores the activities and the resulting city. The city is never edited by hand. The same activities, replayed in order through the same rules, always produce the same lots, heights, landmarks, and parks. The prototype already does that replay in Node (`prototype/simulate.js` writes `city.json`) with a seeded random number generator, so building types do not reshuffle between runs.

## Opening flow

1. **Resume City** or **New City**. Resume lists up to three named saves. The name on the save is not the theme.
2. If all three slots are full, New City asks which save to replace and confirms. The same Strava dates rebuild that city.
3. A name for the save, then the city picker. Only Denver is enabled for the beta.
4. Strava OAuth, if it is not already connected.
5. A choice of all history, or a start date that defaults to today.
6. An optional race day. On that local date the city shows confetti and a parade.

The menu's **Cities** item returns to this list without erasing the city on screen. The bottom bar shows the save's name.

![Intro screens: title, city picker, Strava, and start date](prototype/intro_sheet.png)

## Lighting, loading, and the airplane

Lighting follows the device clock. Dawn, midday, golden hour, and night share one set of keyframes (`prototype/lighting.js`) so the Python previews and the future app match.

![Loading screen](prototype/loading_still.png)

The loading screen shows a random quote from [`prototype/quotes.json`](prototype/quotes.json). The building currently under construction shows an idle crane. Every 4th run longer than 5 miles triggers an 8-second plane flyover with a quote on the banner.

![Airplane quote banner](prototype/airplane_still.png)

## Art

The art stays small and cheap to draw. Each ordinary building type is a generic pixel marker. Landmarks get a little more detail (the Capitol dome, Union Station, the museums) without becoming illustrations. The palette is a consistent retro Nuggets rainbow: navy, gold, and the red–orange–yellow stripe, with a pixel font and a gold frame. Scaling is nearest-neighbor, so the pixels stay sharp on a phone.

The Strava client ID and client secret belong in Vercel environment variables. They never go in source code, and `.env*` is gitignored.

## Prototype files

Scripts assume they are run from `prototype/`. `node simulate.js` replays `activities.txt` into `city.json` and `summary.txt`. `python3 render.py` draws `preview.png`.

| File | What it is |
| --- | --- |
| `rules.js` | Editable rules: story heights, zoning weights, landmark milestones, parks, and side-quest thresholds. |
| `simulate.js` | Replays the activity log oldest-first and writes `city.json` and `summary.txt`. |
| `city.json` | Deterministic city state from that replay: map, lots, buildings, landmarks, parks, and side quests. |
| `activities.txt` | Sample activity log (`type \| date \| miles \| time \| title`), newest first. |
| `summary.txt` | Readable replay report as of 2026-10-29. |
| `render.py` | Draws `city.json` as an isometric pixel preview. Honors `MC_TIME` for time-of-day lighting and draws the idle crane. |
| `animate.py` | Animates one example run: a moving crane, dust, and captions. Writes the build animation. |
| `airplane.py` | Renders the 8-second plane flyover and quote banner. |
| `tod_sheet.py` | Renders the city at several clock times and assembles the 2×2 contact sheet. |
| `lighting.js` | Time-of-day keyframes from the local clock, shared by the renderer and the future app. |
| `loading.js` | 320×200 loading screen: Nuggets palette, pixel font, gold frame, and progress. The prototype cycles built-in status lines. |
| `loading.html` | Browser demo that mounts the loading screen on a pixelated canvas. |
| `render_loading.js` | Renders the loading still, MP4, and GIF from `loading.js`. |
| `render_intro.js` | Renders the four onboarding stills and `intro_sheet.png`. |
| `quotes.json` | Short quotes for the loading screen and the plane banner. The flyover already picks one at random. |
| `preview.png` | Isometric city from the current `city.json`. |
| `intro_sheet.png` | Contact sheet of the four onboarding screens. |
| `intro_title.png` | Title still: Resume City or New City. |
| `intro_city.png` | City picker still. Denver is the enabled choice. |
| `intro_strava.png` | Strava connect still. |
| `intro_start.png` | All-history or start-date still. The date defaults to today. |
| `loading_still.png` | Loading screen, frozen mid-progress. |
| `loading_anim.gif` | Loading screen animation. |
| `loading_anim.mp4` | Loading screen animation. |
| `airplane_still.png` | Still of the plane and quote banner over the city. |
| `airplane_anim.gif` | Plane flyover animation. |
| `airplane_anim.mp4` | Plane flyover animation. |
| `build_anim_still.png` | Still of a lot under construction with the crane. |
| `build_anim.gif` | Construction animation. |
| `build_anim.mp4` | Construction animation. |
| `tod_sheet.png` | 2×2 time-of-day contact sheet. |
| `tod_0830.png` | City at 08:30. |
| `tod_1230.png` | City at 12:30. |
| `tod_1845.png` | City at 18:45. |
| `tod_2200.png` | City at 22:00. |
| `ref_nuggets_palette.png` | Reference for the retro Nuggets rainbow palette. |
| `anim_sim/rules.js` | Rules copy used to replay the example run for the construction animation. |
| `anim_sim/activities.txt` | Activity log with that example run appended. |
| `anim_sim/city.json` | City state after the example run. |
| `anim_sim/summary.txt` | Replay report for the animation scenario. |
