-- Marathon City tables. The Vercel build runs this file on every deploy,
-- so each statement has to be safe to repeat: CREATE TABLE IF NOT EXISTS,
-- ADD COLUMN IF NOT EXISTS, and DO blocks that check before they alter.
-- A new table or column belongs in that form.
-- Do not DROP a table or delete saved cities here.
--
-- A person can keep MAX three named cities. city_saves.save_id is one
-- city. user_id is the browser, and it is no longer the primary key,
-- because that key only allowed one row. The old single row is kept:
-- the migration copies it to slot 1 and names it after its theme.
-- activities.save_id says which city a run belongs to. Sync still
-- ignores a Strava id that is already stored, but only inside that city,
-- so two saves can each hold the same run.
--
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

-- city_saves is created before activities so the activity rows can point
-- at a city. On a database that already has these tables, CREATE is a
-- no-op and the ALTER / DO block below adds the new columns.
CREATE TABLE IF NOT EXISTS city_saves (
  save_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot SMALLINT NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  city TEXT NOT NULL,
  start_mode TEXT NOT NULL,
  start_date TEXT,
  last_synced_at TIMESTAMPTZ,
  demo BOOLEAN NOT NULL DEFAULT FALSE,
  race_date TEXT,
  race_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT city_saves_slot_range CHECK (slot BETWEEN 1 AND 3),
  CONSTRAINT city_saves_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 24)
);

CREATE TABLE IF NOT EXISTS activities (
  save_id TEXT NOT NULL REFERENCES city_saves(save_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strava_id TEXT NOT NULL,
  type TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  miles DOUBLE PRECISION NOT NULL,
  moving_seconds INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  seq BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (save_id, strava_id)
);

-- Existing databases already have city_saves from before race day.
-- Adding the columns here is a no-op once they exist.
ALTER TABLE city_saves ADD COLUMN IF NOT EXISTS race_date TEXT;
ALTER TABLE city_saves ADD COLUMN IF NOT EXISTS race_name TEXT;

-- Databases created when one user had one city do not have these yet.
ALTER TABLE city_saves ADD COLUMN IF NOT EXISTS save_id TEXT;
ALTER TABLE city_saves ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE city_saves ADD COLUMN IF NOT EXISTS slot SMALLINT;
ALTER TABLE city_saves ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS save_id TEXT;

-- Move the old one-city primary key onto save_id without deleting the row.
-- The name falls back to the theme ("Denver") so the bottom bar still has
-- a label. Slot 1 of 3 stays filled by that existing city.
DO $$
BEGIN
  UPDATE city_saves
  SET save_id = user_id
  WHERE save_id IS NULL;

  UPDATE city_saves
  SET name = LEFT(COALESCE(NULLIF(btrim(city), ''), 'Denver'), 24)
  WHERE name IS NULL OR btrim(name) = '';

  UPDATE city_saves
  SET slot = 1
  WHERE slot IS NULL;

  UPDATE city_saves AS c
  SET active = TRUE
  WHERE c.active = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM city_saves AS other
      WHERE other.user_id = c.user_id
        AND other.active = TRUE
        AND other.save_id IS DISTINCT FROM c.save_id
    );

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.city_saves'::regclass
      AND contype = 'p'
      AND pg_get_constraintdef(oid) NOT LIKE '%save_id%'
  ) THEN
    ALTER TABLE city_saves ALTER COLUMN save_id SET NOT NULL;
    ALTER TABLE city_saves ALTER COLUMN name SET NOT NULL;
    ALTER TABLE city_saves ALTER COLUMN slot SET NOT NULL;
    ALTER TABLE city_saves DROP CONSTRAINT city_saves_pkey;
    ALTER TABLE city_saves ADD PRIMARY KEY (save_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.city_saves'::regclass
      AND conname = 'city_saves_slot_range'
  ) THEN
    ALTER TABLE city_saves
      ADD CONSTRAINT city_saves_slot_range CHECK (slot BETWEEN 1 AND 3);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.city_saves'::regclass
      AND conname = 'city_saves_name_len'
  ) THEN
    ALTER TABLE city_saves
      ADD CONSTRAINT city_saves_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 24);
  END IF;
END $$;

-- Attach each stored run to that user's city. The old key was
-- (user_id, strava_id), which mixed every city together. After this,
-- deleting one city removes only its runs.
-- A run whose user has no city row cannot sit in a slot. Those orphans
-- are removed so the new key can be required. A city that exists keeps
-- its runs: the UPDATE above copies them onto that city's save_id.
DO $$
DECLARE
  pk_name text;
BEGIN
  UPDATE activities AS a
  SET save_id = s.save_id
  FROM city_saves AS s
  WHERE a.save_id IS NULL
    AND a.user_id = s.user_id;

  DELETE FROM activities AS a
  WHERE a.save_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM city_saves AS s WHERE s.user_id = a.user_id
    );

  IF EXISTS (SELECT 1 FROM activities WHERE save_id IS NULL) THEN
    RAISE EXCEPTION 'activities rows are missing a city save';
  END IF;

  SELECT conname INTO pk_name
  FROM pg_constraint
  WHERE conrelid = 'public.activities'::regclass
    AND contype = 'p'
    AND pg_get_constraintdef(oid) NOT LIKE '%save_id%'
  LIMIT 1;

  IF pk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE activities DROP CONSTRAINT %I', pk_name);
    ALTER TABLE activities ALTER COLUMN save_id SET NOT NULL;
    ALTER TABLE activities ADD PRIMARY KEY (save_id, strava_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.activities'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE '%save_id%'
      AND pg_get_constraintdef(oid) LIKE '%city_saves%'
  ) THEN
    ALTER TABLE activities
      ADD CONSTRAINT activities_save_id_fkey
      FOREIGN KEY (save_id) REFERENCES city_saves (save_id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS city_saves_user ON city_saves (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS city_saves_user_slot ON city_saves (user_id, slot);
CREATE UNIQUE INDEX IF NOT EXISTS city_saves_one_active ON city_saves (user_id) WHERE active;
