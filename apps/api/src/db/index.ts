/**
 * Database connection pool.
 */
import pg from "pg";
import { describeDatabaseTarget, resolveDatabaseUrl } from "./resolveDatabaseUrl.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

function buildPoolConfig(connectionString: string): pg.PoolConfig {
  const isSupabase = connectionString.includes("supabase.co");
  return {
    connectionString,
    connectionTimeoutMillis: 10_000,
    ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
  };
}

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = resolveDatabaseUrl();
    pool = new Pool(buildPoolConfig(connectionString));
  }
  return pool;
}

export function getDatabaseTarget(): string {
  try {
    return describeDatabaseTarget(resolveDatabaseUrl());
  } catch {
    return "not configured";
  }
}

export async function checkDatabaseConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await getPool().connect();
    await client.query("SELECT 1");
    client.release();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database connection failed";
    return { ok: false, error: message };
  }
}

export async function checkDegreePlanTables(): Promise<{ ok: boolean; error?: string; hint?: string }> {
  try {
    const result = await getPool().query<{ plans: string | null; terms: string | null; courses: string | null }>(
      `SELECT
        to_regclass('public.degree_plans')::text AS plans,
        to_regclass('public.plan_terms')::text AS terms,
        to_regclass('public.plan_courses')::text AS courses`,
    );

    const row = result.rows[0];
    if (!row?.plans || !row?.terms || !row?.courses) {
      return {
        ok: false,
        error: "Degree plan tables are missing on the connected database.",
        hint: "Run npm run supabase:push from the repo root against your hosted Supabase project.",
      };
    }

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database check failed";

    if (
      message.includes("localhost:54322") ||
      message.includes("ECONNREFUSED") ||
      message.includes("Set SUPABASE_DB_URL")
    ) {
      return {
        ok: false,
        error: message,
        hint:
          "Set SUPABASE_DB_URL in apps/api/.env to your hosted Postgres URI (Supabase Dashboard > Database > Connect).",
      };
    }

    return { ok: false, error: message };
  }
}
