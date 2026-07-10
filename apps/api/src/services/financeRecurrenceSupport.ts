/** Detect whether finance_entries.recurrence exists (migration may lag). */
import type pg from "pg";

let postgresSupported: boolean | null = null;
let restSupported: boolean | null = null;

function getSupabaseRestConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export async function financeRecurrenceSupportedPostgres(pool: pg.Pool): Promise<boolean> {
  if (postgresSupported !== null) return postgresSupported;
  const result = await pool.query<{ exists: boolean }>(
    `select exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'finance_entries'
         and column_name = 'recurrence'
     ) as exists`,
  );
  postgresSupported = result.rows[0]?.exists ?? false;
  return postgresSupported;
}

export async function financeRecurrenceSupportedRest(): Promise<boolean> {
  if (restSupported !== null) return restSupported;
  const config = getSupabaseRestConfig();
  if (!config) {
    restSupported = false;
    return false;
  }

  const url = new URL(`${config.url}/rest/v1/finance_entries`);
  url.searchParams.set("select", "recurrence");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
    },
  });

  if (response.ok) {
    restSupported = true;
    return true;
  }

  restSupported = false;
  return false;
}

export function resetFinanceRecurrenceSupportCache(): void {
  postgresSupported = null;
  restSupported = null;
}
