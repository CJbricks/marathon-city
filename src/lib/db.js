// Persistence. The database is the source of truth when DATABASE_URL is
// set (Neon on Vercel, or any Postgres). With no URL, the same methods
// write .data/store.json so the app still runs on a laptop. Route handlers
// import getStore() and do not care which one they got.
//
// Runtime queries use the pooled DATABASE_URL. The tables are created by
// scripts/migrate.mjs during the Vercel build, not on each request.
// CREATE TABLE IF NOT EXISTS still emits a Postgres NOTICE when the table
// is already there, and those notices were showing up on every /api/session.
// A laptop with a new DATABASE_URL still runs `npm run migrate` once.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { postgresOptions, runtimeUrl } from "./pgClient.mjs";

function empty() {
  return { users: {}, tokens: {}, activities: {}, saves: {} };
}

function jsonPath() {
  return process.env.CITY_STORE_PATH || path.join(process.cwd(), ".data", "store.json");
}

function createJsonStore() {
  let queue = Promise.resolve();
  const file = jsonPath();

  async function read() {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch {
      return empty();
    }
  }

  function update(mutator) {
    const run = queue.then(async () => {
      const data = await read();
      const result = await mutator(data);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(data, null, 2));
      return result;
    });
    queue = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  return {
    kind: "file",
    async ensureUser(id) {
      return update((data) => {
        data.users[id] = data.users[id] || { id, stravaAthleteId: null, createdAt: new Date().toISOString() };
        return data.users[id];
      });
    },
    async getSave(userId) {
      const data = await read();
      return data.saves[userId] || null;
    },
    async saveCity(userId, save) {
      return update((data) => {
        data.saves[userId] = save;
        return save;
      });
    },
    async clearCity(userId) {
      return update((data) => {
        delete data.saves[userId];
        delete data.activities[userId];
      });
    },
    async listActivities(userId) {
      const data = await read();
      return data.activities[userId] || [];
    },
    async addActivities(userId, rows) {
      return update((data) => {
        const have = new Set((data.activities[userId] || []).map((a) => a.stravaId));
        const fresh = rows.filter((a) => a.stravaId && !have.has(String(a.stravaId)));
        data.activities[userId] = [...(data.activities[userId] || []), ...fresh];
        return fresh;
      });
    },
    async getTokens(userId) {
      const data = await read();
      return data.tokens[userId] || null;
    },
    async saveTokens(userId, tokens) {
      return update((data) => {
        data.tokens[userId] = tokens;
        if (tokens.athleteId) data.users[userId].stravaAthleteId = tokens.athleteId;
        return tokens;
      });
    },
  };
}

let sqlSingleton;

function sqlClient() {
  if (!sqlSingleton) {
    const url = runtimeUrl();
    sqlSingleton = postgres(url, postgresOptions(url));
  }
  return sqlSingleton;
}

// Used by /api/health. A failure is reported as flags, not as the driver's
// message, because that message can contain the host or the URL.
export async function checkDatabase() {
  if (!runtimeUrl()) return { reachable: false, schemaReady: false };
  try {
    const sql = sqlClient();
    const [row] = await sql`SELECT to_regclass('public.city_saves') AS ready`;
    return { reachable: true, schemaReady: Boolean(row?.ready) };
  } catch {
    return { reachable: false, schemaReady: false };
  }
}

function rowToActivity(r) {
  return {
    stravaId: r.strava_id,
    type: r.type,
    date: r.activity_date,
    miles: Number(r.miles),
    seconds: r.moving_seconds,
    title: r.title,
    seq: Number(r.seq),
  };
}

function createPostgresStore() {
  const sql = sqlClient();
  return {
    kind: "postgres",
    async ensureUser(id) {
      await sql`INSERT INTO users (id) VALUES (${id}) ON CONFLICT (id) DO NOTHING`;
      const [row] = await sql`SELECT id, strava_athlete_id, created_at FROM users WHERE id = ${id}`;
      return { id: row.id, stravaAthleteId: row.strava_athlete_id, createdAt: row.created_at };
    },
    async getSave(userId) {
      const [row] = await sql`SELECT * FROM city_saves WHERE user_id = ${userId}`;
      if (!row) return null;
      return {
        city: row.city,
        startMode: row.start_mode,
        startDate: row.start_date,
        lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
        demo: row.demo,
        raceDate: row.race_date || null,
        raceName: row.race_name || null,
        createdAt: new Date(row.created_at).toISOString(),
      };
    },
    async saveCity(userId, save) {
      await sql`
        INSERT INTO city_saves (user_id, city, start_mode, start_date, last_synced_at, demo, race_date, race_name)
        VALUES (
          ${userId}, ${save.city}, ${save.startMode}, ${save.startDate},
          ${save.lastSyncedAt}, ${Boolean(save.demo)}, ${save.raceDate || null}, ${save.raceName || null}
        )
        ON CONFLICT (user_id) DO UPDATE SET
          city = EXCLUDED.city,
          start_mode = EXCLUDED.start_mode,
          start_date = EXCLUDED.start_date,
          last_synced_at = EXCLUDED.last_synced_at,
          demo = EXCLUDED.demo,
          race_date = EXCLUDED.race_date,
          race_name = EXCLUDED.race_name
      `;
      return save;
    },
    async clearCity(userId) {
      await sql`DELETE FROM activities WHERE user_id = ${userId}`;
      await sql`DELETE FROM city_saves WHERE user_id = ${userId}`;
    },
    async listActivities(userId) {
      const rows = await sql`
        SELECT * FROM activities WHERE user_id = ${userId} ORDER BY activity_date, seq
      `;
      return rows.map(rowToActivity);
    },
    async addActivities(userId, rows) {
      const fresh = [];
      for (const a of rows) {
        const inserted = await sql`
          INSERT INTO activities (user_id, strava_id, type, activity_date, miles, moving_seconds, title, seq)
          VALUES (
            ${userId}, ${String(a.stravaId)}, ${a.type}, ${a.date}, ${a.miles},
            ${Math.round(a.seconds || 0)}, ${a.title || ""}, ${a.seq || 0}
          )
          ON CONFLICT (user_id, strava_id) DO NOTHING
          RETURNING *
        `;
        if (inserted.length) fresh.push(rowToActivity(inserted[0]));
      }
      return fresh;
    },
    async getTokens(userId) {
      const [row] = await sql`SELECT * FROM strava_tokens WHERE user_id = ${userId}`;
      if (!row) return null;
      return {
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        expiresAt: new Date(row.expires_at).toISOString(),
        athleteId: null,
      };
    },
    async saveTokens(userId, tokens) {
      await sql`
        INSERT INTO strava_tokens (user_id, access_token, refresh_token, expires_at)
        VALUES (${userId}, ${tokens.accessToken}, ${tokens.refreshToken}, ${tokens.expiresAt})
        ON CONFLICT (user_id) DO UPDATE SET
          access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          expires_at = EXCLUDED.expires_at
      `;
      if (tokens.athleteId) {
        await sql`UPDATE users SET strava_athlete_id = ${tokens.athleteId} WHERE id = ${userId}`;
      }
      return tokens;
    },
  };
}

let store;
export function getStore() {
  if (!store) store = runtimeUrl() ? createPostgresStore() : createJsonStore();
  return store;
}

export function storageKind() {
  return runtimeUrl() ? "postgres" : "file";
}
