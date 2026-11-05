// How this app talks to Postgres.
// Neon (the database Vercel attaches) gives two connection strings. The
// pooled one (DATABASE_URL) is for the running app: many short serverless
// requests share a small set of real connections. The unpooled one
// (DATABASE_URL_UNPOOLED) is a direct line to Postgres, which is what
// CREATE TABLE needs. This file only decides which string to use and how
// to open it. It never prints the string.

export function migrationUrl() {
  return process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "";
}

export function runtimeUrl() {
  return process.env.DATABASE_URL || "";
}

export function migrationUrlLabel() {
  if (process.env.DATABASE_URL_UNPOOLED) return "DATABASE_URL_UNPOOLED";
  if (process.env.DATABASE_URL) return "DATABASE_URL";
  return "";
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

// Options for the `postgres` driver. Localhost skips SSL so a laptop
// database without certificates still works. Everywhere else SSL is
// required, which Neon demands. `prepare: false` matters on the pooled
// host: that host is PgBouncer in transaction mode, and a prepared
// statement belongs to one session the pooler does not keep.
export function postgresOptions(url) {
  const local = /localhost|127\.0\.0\.1/.test(url || "");
  const pooled = hostOf(url).includes("-pooler");
  return {
    ssl: local ? false : "require",
    max: 1,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: !local ? false : true,
    fetch_types: !pooled,
  };
}

// schema.sql is a list of statements. Running them one at a time keeps a
// pooled connection from rejecting a multi-command script. Semicolons
// inside a quoted string stay part of that statement. A DO $$ block is
// one statement too: the semicolons that move the old primary key live
// inside the dollar quotes and must not be run on their own.
export function splitSchema(sqlText) {
  const statements = [];
  let current = "";
  let inQuote = false;
  let dollar = null;
  for (let i = 0; i < sqlText.length; i++) {
    if (dollar) {
      if (sqlText.startsWith(dollar, i)) {
        current += dollar;
        i += dollar.length - 1;
        dollar = null;
        continue;
      }
      current += sqlText[i];
      continue;
    }
    const ch = sqlText[i];
    if (ch === "$") {
      const match = sqlText.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        dollar = match[0];
        current += dollar;
        i += dollar.length - 1;
        continue;
      }
    }
    if (ch === "'") {
      if (inQuote && sqlText[i + 1] === "'") {
        current += "''";
        i += 1;
        continue;
      }
      inQuote = !inQuote;
      current += ch;
      continue;
    }
    if (ch === ";" && !inQuote) {
      pushStatement(statements, current);
      current = "";
      continue;
    }
    current += ch;
  }
  pushStatement(statements, current);
  return statements;
}

function pushStatement(statements, raw) {
  const withoutComments = raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .trim();
  if (withoutComments) statements.push(withoutComments);
}

export function redactSecrets(text) {
  return String(text)
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]")
    .replace(/DATABASE_URL[A-Z_]*=\S+/g, "[redacted]");
}

// The health route's JSON. `demo` means there is no database and this
// process is on Vercel, where the project directory is not a place to
// keep .data/store.json. `file` is that JSON store on a laptop.
export function healthBody({ hasDatabase, onVercel, reachable, schemaReady }) {
  if (!hasDatabase) {
    return { ok: true, storage: onVercel ? "demo" : "file", dbReachable: false };
  }
  return {
    ok: Boolean(reachable && schemaReady),
    storage: "postgres",
    dbReachable: Boolean(reachable),
  };
}
