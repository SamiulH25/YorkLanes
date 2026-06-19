/**
 * Database connection pool.
 */
import pg from "pg";

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
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set. Copy .env.example to apps/api/.env");
    }
    pool = new Pool(buildPoolConfig(connectionString));
  }
  return pool;
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const client = await getPool().connect();
    await client.query("SELECT 1");
    client.release();
    return true;
  } catch {
    return false;
  }
}

export async function checkDegreePlanTables(): Promise<{ ok: boolean; error?: string }> {
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
        error:
          "Degree plan tables are missing. Run npm run supabase:push from the repo root to apply migrations.",
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Database check failed",
    };
  }
}
