-- Marathon City tables. The Vercel build runs this file on every deploy,
-- so each statement has to be safe to repeat: CREATE TABLE IF NOT EXISTS,
-- ADD COLUMN IF NOT EXISTS. A new table or column belongs in that form.
-- Do not DROP or rewrite rows here.
-- Dates are TEXT (YYYY-MM-DD) so a date cannot shift across timezones
-- between Postgres and the JSON file store. last_synced_at is a real
-- timestamp because the sync window is an instant, not a calendar day.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  strava_athlete_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strava_tokens (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strava_id TEXT NOT NULL,
  type TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  miles DOUBLE PRECISION NOT NULL,
  moving_seconds INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  seq BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, strava_id)
);

CREATE TABLE IF NOT EXISTS city_saves (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  start_mode TEXT NOT NULL,
  start_date TEXT,
  last_synced_at TIMESTAMPTZ,
  demo BOOLEAN NOT NULL DEFAULT FALSE,
  race_date TEXT,
  race_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Existing databases already have city_saves from before race day.
-- Adding the columns here is a no-op once they exist.
ALTER TABLE city_saves ADD COLUMN IF NOT EXISTS race_date TEXT;
ALTER TABLE city_saves ADD COLUMN IF NOT EXISTS race_name TEXT;
