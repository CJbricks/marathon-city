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
// A city code is five digits stored on the save. Another browser that
// types the code plays that same city. Their Strava login stays their own.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { takeCityCode } from "./cityCode.js";
import { postgresOptions, runtimeUrl } from "./pgClient.mjs";
import { SaveRejected, cleanName, planCreate } from "./saves.js";

function empty() {
  return { users: {}, tokens: {}, activities: {}, saves: {}, access: {}, guest: {}, attempts: {} };
}

function validCode(value) {
  return /^\d{5}$/.test(value || "") ? value : null;
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
  if (Array.isArray(raw)) {
    return raw.map((save) => ({ ...save, code: validCode(save.code), ownerId: userId }));
  }
  if (raw.city) {
    return [
      {
        id: raw.id || userId,
        name: cleanName(raw.name) || cleanName(raw.city) || "Denver",
        slot: raw.slot || 1,
        active: raw.active !== false,
        // A save written before themes existed, or a row with a blank city,
        // is Denver. Austin is stored only when the person picked it.
        city: raw.city || "Denver",
        startMode: raw.startMode,
        startDate: raw.startDate || null,
        lastSyncedAt: raw.lastSyncedAt || null,
        demo: Boolean(raw.demo),
        raceDate: raw.raceDate || null,
        raceName: raw.raceName || null,
        code: validCode(raw.code),
        createdAt: raw.createdAt || new Date().toISOString(),
        ownerId: userId,
      },
    ];
  }
  return [];
}

function writeSaves(data, userId, saves) {
  // ownerId is only for this process. The file stores the city, not a copy
  // of whoever happened to open it.
  data.saves[userId] = saves.map(({ ownerId, ...save }) => save);
}

function needsCode(data) {
  for (const userId of Object.keys(data.saves || {})) {
    if (readSaves(data, userId).some((save) => !save.code)) return true;
  }
  return false;
}

function assignMissingCodes(data) {
  const groups = [];
  const used = new Set();
  for (const userId of Object.keys(data.saves || {})) {
    const saves = readSaves(data, userId);
    groups.push([userId, saves]);
    for (const save of saves) if (save.code) used.add(save.code);
  }
  let changed = false;
  for (const [, saves] of groups) {
    for (const save of saves) {
      if (save.code) continue;
      const code = takeCityCode(used);
      if (!code) throw new SaveRejected("Could not assign a city code.", 500);
      save.code = code;
      changed = true;
    }
  }
  if (changed) {
    for (const [userId, saves] of groups) writeSaves(data, userId, saves);
  }
}

function findSave(data, saveId) {
  for (const userId of Object.keys(data.saves || {})) {
    const save = readSaves(data, userId).find((row) => row.id === saveId);
    if (save) return save;
  }
  return null;
}

function findByCode(data, code) {
  for (const userId of Object.keys(data.saves || {})) {
    const save = readSaves(data, userId).find((row) => row.code === code);
    if (save) return save;
  }
  return null;
}

function canPlay(data, userId, save) {
  if (!save) return false;
  if (save.ownerId === userId) return true;
  return Boolean(data.access?.[userId]?.[save.id]);
}

// The owner syncs from the city's clock. A guest syncs from their own,
// so opening a shared city does not skip the owner's un-synced runs.
function viewSave(data, userId, save) {
  if (!save) return null;
  const copy = { ...save };
  if (save.ownerId !== userId) {
    copy.lastSyncedAt = data.access?.[userId]?.[save.id]?.lastSyncedAt || null;
  }
  return copy;
}

function playingSave(data, userId) {
  const pointer = data.guest?.[userId];
  if (pointer) {
    const save = findSave(data, pointer);
    if (canPlay(data, userId, save)) return viewSave(data, userId, save);
  }
  return readSaves(data, userId).find((save) => save.active) || null;
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
      let data = await read();
      if (needsCode(data)) {
        await update((next) => assignMissingCodes(next));
        data = await read();
      }
      return readSaves(data, userId).sort((a, b) => a.slot - b.slot);
    },
    async getSave(userId) {
      let data = await read();
      if (needsCode(data)) {
        await update((next) => assignMissingCodes(next));
        data = await read();
      }
      return playingSave(data, userId);
    },
    async setActive(userId, saveId) {
      return update((data) => {
        const saves = readSaves(data, userId);
        const target = saves.find((save) => save.id === saveId);
        if (!target) return null;
        for (const save of saves) save.active = save.id === saveId;
        writeSaves(data, userId, saves);
        if (data.guest) delete data.guest[userId];
        return target;
      });
    },
    async claimCode(userId, code) {
      return update((data) => {
        assignMissingCodes(data);
        const found = findByCode(data, code);
        if (!found) return null;
        if (found.ownerId === userId) {
          if (data.guest) delete data.guest[userId];
          const saves = readSaves(data, userId);
          for (const save of saves) save.active = save.id === found.id;
          writeSaves(data, userId, saves);
          return saves.find((save) => save.id === found.id) || null;
        }
        data.access ||= {};
        data.access[userId] ||= {};
        data.access[userId][found.id] ||= { lastSyncedAt: null };
        data.guest ||= {};
        data.guest[userId] = found.id;
        return viewSave(data, userId, found);
      });
    },
    async getCodeAttempt(key) {
      const data = await read();
      return data.attempts?.[key] || null;
    },
    async setCodeAttempt(key, state) {
      return update((data) => {
        data.attempts ||= {};
        data.attempts[key] = state;
        return state;
      });
    },
    async createSave(userId, input) {
      return update((data) => {
        assignMissingCodes(data);
        const saves = readSaves(data, userId);
        const plan = planCreate(saves, input);
        const kept = plan.replaceId ? saves.filter((save) => save.id !== plan.replaceId) : saves;
        if (plan.replaceId) delete data.activities[plan.replaceId];
        for (const save of kept) save.active = false;
        const used = new Set();
        for (const ownerId of Object.keys(data.saves || {})) {
          for (const save of readSaves(data, ownerId)) {
            if (save.code && save.id !== plan.replaceId) used.add(save.code);
          }
        }
        const code = takeCityCode(used);
        if (!code) throw new SaveRejected("Could not assign a city code.", 500);
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
          code,
          createdAt: new Date().toISOString(),
          ownerId: userId,
        };
        kept.push(save);
        writeSaves(data, userId, kept);
        if (data.guest) delete data.guest[userId];
        return save;
      });
    },
    async saveCity(userId, save) {
      return update((data) => {
        const found = findSave(data, save.id);
        if (!canPlay(data, userId, found)) return null;
        const saves = readSaves(data, found.ownerId);
        const index = saves.findIndex((row) => row.id === save.id);
        if (index < 0) return null;
        const isOwner = found.ownerId === userId;
        // Slot, code, and active stay as they are. A race-day edit or a
        // sync timestamp must not open a second "playing" city. A guest's
        // sync clock is stored on their access row, not on the city.
        saves[index] = {
          ...saves[index],
          name: cleanName(save.name) || saves[index].name,
          city: save.city,
          startMode: save.startMode,
          startDate: save.startDate || null,
          lastSyncedAt: isOwner ? save.lastSyncedAt || null : saves[index].lastSyncedAt,
          demo: Boolean(save.demo),
          raceDate: save.raceDate || null,
          raceName: save.raceName || null,
          code: saves[index].code,
        };
        writeSaves(data, found.ownerId, saves);
        if (!isOwner) {
          data.access ||= {};
          data.access[userId] ||= {};
          data.access[userId][save.id] = {
            ...(data.access[userId][save.id] || {}),
            lastSyncedAt: save.lastSyncedAt || null,
          };
        }
        return viewSave(data, userId, { ...saves[index], ownerId: found.ownerId });
      });
    },
    async clearCity(userId, saveId) {
      return update((data) => {
        const save = findSave(data, saveId);
        if (!canPlay(data, userId, save)) return;
        const saves = readSaves(data, save.ownerId).filter((row) => row.id !== saveId);
        writeSaves(data, save.ownerId, saves);
        delete data.activities[saveId];
        for (const uid of Object.keys(data.guest || {})) {
          if (data.guest[uid] === saveId) delete data.guest[uid];
        }
        for (const uid of Object.keys(data.access || {})) {
          if (data.access[uid]) delete data.access[uid][saveId];
        }
      });
    },
    async listActivities(saveId) {
      const data = await read();
      return data.activities[saveId] || [];
    },
    async addActivities(userId, saveId, rows) {
      return update((data) => {
        // Runs are stored under the city id. The owner and anyone who
        // opened the city code may add a run. A stranger may not.
        const save = findSave(data, saveId);
        if (!canPlay(data, userId, save)) return [];
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
    // Empty on rows saved before this column existed. An unknown clock
    // is not an early run. Midnight would unlock the bakery by accident.
    startLocal: r.start_local || "",
  };
}

function rowToSave(row, viewerId = null, guestSynced = undefined) {
  const ownerId = row.user_id;
  const asGuest = Boolean(viewerId && viewerId !== ownerId);
  return {
    id: row.save_id,
    ownerId,
    name: row.name,
    slot: Number(row.slot),
    active: Boolean(row.active),
    city: row.city || "Denver",
    startMode: row.start_mode,
    startDate: row.start_date,
    lastSyncedAt: asGuest
      ? guestSynced
        ? new Date(guestSynced).toISOString()
        : null
      : row.last_synced_at
        ? new Date(row.last_synced_at).toISOString()
        : null,
    demo: row.demo,
    raceDate: row.race_date || null,
    raceName: row.race_name || null,
    code: row.code || null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function isCodeCollision(error) {
  return error?.code === "23505" && /code/i.test(`${error.constraint_name || ""} ${error.constraint || ""} ${error.message || ""}`);
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
    async hasAccess(userId, saveId) {
      const [row] = await sql`
        SELECT 1 AS ok FROM city_access WHERE user_id = ${userId} AND save_id = ${saveId}
      `;
      return Boolean(row);
    },
    async getSave(userId) {
      const [user] = await sql`SELECT playing_save_id FROM users WHERE id = ${userId}`;
      if (user?.playing_save_id) {
        const [shared] = await sql`
          SELECT s.*, a.last_synced_at AS guest_synced
          FROM city_saves s
          LEFT JOIN city_access a ON a.save_id = s.save_id AND a.user_id = ${userId}
          WHERE s.save_id = ${user.playing_save_id}
            AND (s.user_id = ${userId} OR a.user_id IS NOT NULL)
        `;
        if (shared) return rowToSave(shared, userId, shared.guest_synced);
      }
      const [row] = await sql`
        SELECT * FROM city_saves
        WHERE user_id = ${userId} AND active = TRUE
        ORDER BY slot
        LIMIT 1
      `;
      return row ? rowToSave(row, userId) : null;
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
        await tx`UPDATE users SET playing_save_id = NULL WHERE id = ${userId}`;
        return rowToSave({ ...found, active: true }, userId);
      });
    },
    async claimCode(userId, code) {
      const [row] = await sql`SELECT * FROM city_saves WHERE code = ${code}`;
      if (!row) return null;
      if (row.user_id === userId) {
        await sql`UPDATE users SET playing_save_id = NULL WHERE id = ${userId}`;
        return this.setActive(userId, row.save_id);
      }
      await sql`
        INSERT INTO city_access (user_id, save_id)
        VALUES (${userId}, ${row.save_id})
        ON CONFLICT (user_id, save_id) DO NOTHING
      `;
      await sql`UPDATE users SET playing_save_id = ${row.save_id} WHERE id = ${userId}`;
      const [access] = await sql`
        SELECT last_synced_at FROM city_access WHERE user_id = ${userId} AND save_id = ${row.save_id}
      `;
      return rowToSave(row, userId, access?.last_synced_at || null);
    },
    async getCodeAttempt(key) {
      const [row] = await sql`SELECT * FROM code_attempts WHERE attempt_key = ${key}`;
      if (!row) return null;
      return {
        failures: row.failures,
        windowStart: new Date(row.window_started).getTime(),
        lockedUntil: row.locked_until ? new Date(row.locked_until).getTime() : 0,
      };
    },
    async setCodeAttempt(key, state) {
      const locked = state.lockedUntil ? new Date(state.lockedUntil).toISOString() : null;
      await sql`
        INSERT INTO code_attempts (attempt_key, failures, window_started, locked_until)
        VALUES (${key}, ${state.failures}, ${new Date(state.windowStart).toISOString()}, ${locked})
        ON CONFLICT (attempt_key) DO UPDATE SET
          failures = EXCLUDED.failures,
          window_started = EXCLUDED.window_started,
          locked_until = EXCLUDED.locked_until
      `;
      return state;
    },
    async createSave(userId, input) {
      const existing = await this.listSaves(userId);
      const plan = planCreate(existing, input);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const code = takeCityCode(new Set());
        if (!code) throw new SaveRejected("Could not assign a city code.", 500);
        try {
          return await sql.begin(async (tx) => {
            if (plan.replaceId) {
              await tx`DELETE FROM city_saves WHERE user_id = ${userId} AND save_id = ${plan.replaceId}`;
            }
            await tx`UPDATE city_saves SET active = FALSE WHERE user_id = ${userId}`;
            await tx`UPDATE users SET playing_save_id = NULL WHERE id = ${userId}`;
            const id = crypto.randomUUID();
            const [row] = await tx`
              INSERT INTO city_saves (
                save_id, user_id, slot, name, active, city, start_mode, start_date,
                last_synced_at, demo, race_date, race_name, code
              ) VALUES (
                ${id}, ${userId}, ${plan.slot}, ${plan.name}, TRUE, ${input.city},
                ${input.startMode}, ${input.startDate || null}, ${input.lastSyncedAt || null},
                ${Boolean(input.demo)}, ${input.raceDate || null}, ${input.raceName || null},
                ${code}
              )
              RETURNING *
            `;
            return rowToSave(row, userId);
          });
        } catch (error) {
          // Another city grabbed this code between the roll and the insert.
          // The slot collision is a real conflict and is not retried here.
          if (isCodeCollision(error)) continue;
          throw error;
        }
      }
      throw new SaveRejected("Could not assign a city code.", 500);
    },
    async saveCity(userId, save) {
      const [existing] = await sql`SELECT * FROM city_saves WHERE save_id = ${save.id}`;
      if (!existing) return null;
      const isOwner = existing.user_id === userId;
      if (!isOwner && !(await this.hasAccess(userId, save.id))) return null;
      const [row] = await sql`
        UPDATE city_saves SET
          name = ${cleanName(save.name) || save.name},
          city = ${save.city},
          start_mode = ${save.startMode},
          start_date = ${save.startDate || null},
          last_synced_at = ${isOwner ? save.lastSyncedAt || null : existing.last_synced_at},
          demo = ${Boolean(save.demo)},
          race_date = ${save.raceDate || null},
          race_name = ${save.raceName || null}
        WHERE save_id = ${save.id}
        RETURNING *
      `;
      if (!row) return null;
      if (!isOwner) {
        await sql`
          UPDATE city_access SET last_synced_at = ${save.lastSyncedAt || null}
          WHERE user_id = ${userId} AND save_id = ${save.id}
        `;
        return rowToSave(row, userId, save.lastSyncedAt || null);
      }
      return rowToSave(row, userId);
    },
    async clearCity(userId, saveId) {
      const [existing] = await sql`SELECT user_id FROM city_saves WHERE save_id = ${saveId}`;
      if (!existing) return;
      if (existing.user_id !== userId && !(await this.hasAccess(userId, saveId))) return;
      await sql`DELETE FROM city_saves WHERE save_id = ${saveId}`;
      await sql`UPDATE users SET playing_save_id = NULL WHERE playing_save_id = ${saveId}`;
    },
    async listActivities(saveId) {
      const rows = await sql`
        SELECT * FROM activities WHERE save_id = ${saveId} ORDER BY activity_date, seq
      `;
      return rows.map(rowToActivity);
    },
    async addActivities(userId, saveId, rows) {
      const [existing] = await sql`SELECT user_id FROM city_saves WHERE save_id = ${saveId}`;
      if (!existing) return [];
      if (existing.user_id !== userId && !(await this.hasAccess(userId, saveId))) return [];
      const fresh = [];
      for (const a of rows) {
        const inserted = await sql`
          INSERT INTO activities (
            save_id, user_id, strava_id, type, activity_date, miles, moving_seconds, title, seq, start_local
          )
          VALUES (
            ${saveId}, ${userId}, ${String(a.stravaId)}, ${a.type}, ${a.date}, ${a.miles},
            ${Math.round(a.seconds || 0)}, ${a.title || ""}, ${a.seq || 0}, ${a.startLocal || null}
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
