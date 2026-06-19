/**
 * Database connection pool.
 *
 * EXPAND HERE:
 * - Import pool in route handlers once tables are populated
 * - Add query helpers per domain (users, courses, plans, etc.)
 *
 * DATABASE_URL options (see .env.example):
 * - Local Supabase: postgresql://postgres:postgres@localhost:54322/postgres
 * - Hosted Supabase: connection string from project dashboard
 * - Legacy docker-compose: postgresql://yorklanes:yorklanes_dev@localhost:5432/yorklanes
 */
import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set. Copy .env.example to apps/api/.env");
    }
    pool = new Pool({ connectionString });
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
