// Persistence. The database is the source of truth when DATABASE_URL is
// set (Neon on Vercel, or any Postgres). With no URL, the same methods
// write .data/store.json so the app still runs on a laptop. Route handlers
// import getStore() and do not care which one they got.
//
// One person can keep three named cities. Each city has its own runs and
// its own last_synced_at. The browser cookie is still only the user id.
// The active flag is which of the three is on screen.
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
import { cleanName, planCreate } from "./saves.js";

function empty() {
  return { users: {}, tokens: {}, activities: {}, saves: {} };
}

function jsonPath() {
  return process.env.CITY_STORE_PATH || path.join(process.cwd(), ".data", "store.json");
}

// Older laptop files stored one object under the user id, and the runs
// under that same id. A named save uses the user id as its id so those
// runs still belong to it. New cities get their own id.
function readSaves(data, userId) {
  const raw = data.saves?.[userId];
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((save) => ({ ...save }));
  if (raw.city) {
    return [
      {
        id: raw.id || userId,
        name: cleanName(raw.name) || cleanName(raw.city) || "Denver",
        slot: raw.slot || 1,
        active: raw.active !== false,
        city: raw.city,
        startMode: raw.startMode,
        startDate: raw.startDate || null,
        lastSyncedAt: raw.lastSyncedAt || null,
        demo: Boolean(raw.demo),
        raceDate: raw.raceDate || null,
        raceName: raw.raceName || null,
        createdAt: raw.createdAt || new Date().toISOString(),
      },
    ];
  }
  return [];
}

function writeSaves(data, userId, saves) {
  data.saves[userId] = saves;
}

function createJsonStore() {
  let queue = Promise.resolve();
  const file = jsonPath();

  async function read() {
    try {
      const data = JSON.parse(await readFile(file, "utf8"));
      data.users ||= {};
      data.tokens ||= {};
      data.activities ||= {};
      data.saves ||= {};
      return data;
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
    async listSaves(userId) {
      const data = await read();
      return readSaves(data, userId).sort((a, b) => a.slot - b.slot);
    },
    async getSave(userId) {
      const saves = await this.listSaves(userId);
      return saves.find((save) => save.active) || null;
    },
    async setActive(userId, saveId) {
      return update((data) => {
        const saves = readSaves(data, userId);
        const target = saves.find((save) => save.id === saveId);
        if (!target) return null;
        for (const save of saves) save.active = save.id === saveId;
        writeSaves(data, userId, saves);
        return target;
      });
    },
    async createSave(userId, input) {
      return update((data) => {
        const saves = readSaves(data, userId);
        const plan = planCreate(saves, input);
        const kept = plan.replaceId ? saves.filter((save) => save.id !== plan.replaceId) : saves;
        if (plan.replaceId) delete data.activities[plan.replaceId];
        for (const save of kept) save.active = false;
        const save = {
          id: crypto.randomUUID(),
          name: plan.name,
          slot: plan.slot,
          active: true,
          city: input.city,
          startMode: input.startMode,
          startDate: input.startDate || null,
          lastSyncedAt: input.lastSyncedAt || null,
          demo: Boolean(input.demo),
          raceDate: input.raceDate || null,
          raceName: input.raceName || null,
          createdAt: new Date().toISOString(),
        };
        kept.push(save);
        writeSaves(data, userId, kept);
        return save;
      });
    },
    async saveCity(userId, save) {
      return update((data) => {
        const saves = readSaves(data, userId);
        const index = saves.findIndex((row) => row.id === save.id);
        if (index < 0) return null;
        // Slot and active stay as they are. A race-day edit or a sync
        // timestamp must not open a second "playing" city.
        saves[index] = {
          ...saves[index],
          name: cleanName(save.name) || saves[index].name,
          city: save.city,
          startMode: save.startMode,
          startDate: save.startDate || null,
          lastSyncedAt: save.lastSyncedAt || null,
          demo: Boolean(save.demo),
          raceDate: save.raceDate || null,
          raceName: save.raceName || null,
        };
        writeSaves(data, userId, saves);
        return saves[index];
      });
    },
    async clearCity(userId, saveId) {
      return update((data) => {
        const saves = readSaves(data, userId).filter((save) => save.id !== saveId);
        writeSaves(data, userId, saves);
        delete data.activities[saveId];
      });
    },
    async listActivities(saveId) {
      const data = await read();
      return data.activities[saveId] || [];
    },
    async addActivities(userId, saveId, rows) {
      return update((data) => {
        // Runs are stored under the city id. Refuse a city that is not
        // this user's, so two saves in the same file cannot trade miles.
        const owns = readSaves(data, userId).some((save) => save.id === saveId);
        if (!owns) return [];
        const have = new Set((data.activities[saveId] || []).map((a) => String(a.stravaId)));
        const fresh = rows.filter((a) => a.stravaId && !have.has(String(a.stravaId)));
        data.activities[saveId] = [...(data.activities[saveId] || []), ...fresh];
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

function rowToSave(row) {
  return {
    id: row.save_id,
    name: row.name,
    slot: Number(row.slot),
    active: Boolean(row.active),
    city: row.city,
    startMode: row.start_mode,
    startDate: row.start_date,
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at).toISOString() : null,
    demo: row.demo,
    raceDate: row.race_date || null,
    raceName: row.race_name || null,
    createdAt: new Date(row.created_at).toISOString(),
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
    async listSaves(userId) {
      const rows = await sql`SELECT * FROM city_saves WHERE user_id = ${userId} ORDER BY slot`;
      return rows.map(rowToSave);
    },
    async getSave(userId) {
      const [row] = await sql`
        SELECT * FROM city_saves
        WHERE user_id = ${userId} AND active = TRUE
        ORDER BY slot
        LIMIT 1
      `;
      return row ? rowToSave(row) : null;
    },
    async setActive(userId, saveId) {
      return sql.begin(async (tx) => {
        const [found] = await tx`
          SELECT * FROM city_saves WHERE user_id = ${userId} AND save_id = ${saveId}
        `;
        if (!found) return null;
        // Clear first. The unique index allows only one active city, so
        // setting the new one true while the old one is still true fails.
        await tx`UPDATE city_saves SET active = FALSE WHERE user_id = ${userId}`;
        await tx`
          UPDATE city_saves SET active = TRUE
          WHERE user_id = ${userId} AND save_id = ${saveId}
        `;
        return rowToSave({ ...found, active: true });
      });
    },
    async createSave(userId, input) {
      const existing = await this.listSaves(userId);
      const plan = planCreate(existing, input);
      return sql.begin(async (tx) => {
        if (plan.replaceId) {
          await tx`DELETE FROM city_saves WHERE user_id = ${userId} AND save_id = ${plan.replaceId}`;
        }
        await tx`UPDATE city_saves SET active = FALSE WHERE user_id = ${userId}`;
        const id = crypto.randomUUID();
        const [row] = await tx`
          INSERT INTO city_saves (
            save_id, user_id, slot, name, active, city, start_mode, start_date,
            last_synced_at, demo, race_date, race_name
          ) VALUES (
            ${id}, ${userId}, ${plan.slot}, ${plan.name}, TRUE, ${input.city},
            ${input.startMode}, ${input.startDate || null}, ${input.lastSyncedAt || null},
            ${Boolean(input.demo)}, ${input.raceDate || null}, ${input.raceName || null}
          )
          RETURNING *
        `;
        return rowToSave(row);
      });
    },
    async saveCity(userId, save) {
      const [row] = await sql`
        UPDATE city_saves SET
          name = ${cleanName(save.name) || save.name},
          city = ${save.city},
          start_mode = ${save.startMode},
          start_date = ${save.startDate || null},
          last_synced_at = ${save.lastSyncedAt || null},
          demo = ${Boolean(save.demo)},
          race_date = ${save.raceDate || null},
          race_name = ${save.raceName || null}
        WHERE user_id = ${userId} AND save_id = ${save.id}
        RETURNING *
      `;
      return row ? rowToSave(row) : null;
    },
    async clearCity(userId, saveId) {
      await sql`DELETE FROM city_saves WHERE user_id = ${userId} AND save_id = ${saveId}`;
    },
    async listActivities(saveId) {
      const rows = await sql`
        SELECT * FROM activities WHERE save_id = ${saveId} ORDER BY activity_date, seq
      `;
      return rows.map(rowToActivity);
    },
    async addActivities(userId, saveId, rows) {
      const fresh = [];
      for (const a of rows) {
        const inserted = await sql`
          INSERT INTO activities (save_id, user_id, strava_id, type, activity_date, miles, moving_seconds, title, seq)
          VALUES (
            ${saveId}, ${userId}, ${String(a.stravaId)}, ${a.type}, ${a.date}, ${a.miles},
            ${Math.round(a.seconds || 0)}, ${a.title || ""}, ${a.seq || 0}
          )
          ON CONFLICT (save_id, strava_id) DO NOTHING
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

// Tests point CITY_STORE_PATH at a temp file and call this so the next
// getStore() opens that file instead of a store created earlier.
export function resetStoreCache() {
  store = undefined;
}

export function storageKind() {
  return runtimeUrl() ? "postgres" : "file";
}
