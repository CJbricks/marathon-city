// GET /api/health
// A deploy check. It says whether this process is using Postgres, the
// local JSON file, or the demo fallback, and whether a query reached the
// database. The body is only those three fields. Connection strings stay
// in the environment and are not written into the response or the log.

import { NextResponse } from "next/server";
import { checkDatabase } from "@/lib/db";
import { healthBody } from "@/lib/pgClient.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const hasDatabase = Boolean(process.env.DATABASE_URL);
  const onVercel = Boolean(process.env.VERCEL);
  const status = hasDatabase ? await checkDatabase() : { reachable: false, schemaReady: false };
  return NextResponse.json(
    healthBody({
      hasDatabase,
      onVercel,
      reachable: status.reachable,
      schemaReady: status.schemaReady,
    }),
  );
}
