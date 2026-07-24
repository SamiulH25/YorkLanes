import type { Pool } from "pg";

let hasComplementaryColumns: boolean | null = null;

export async function degreePlansHaveComplementaryColumns(pool: Pool): Promise<boolean> {
  if (hasComplementaryColumns !== null) {
    return hasComplementaryColumns;
  }

  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'degree_plans'
         AND column_name = 'complementary_filename'
     ) AS exists`,
  );

  hasComplementaryColumns = result.rows[0]?.exists ?? false;
  return hasComplementaryColumns;
}

export const COMPLEMENTARY_MIGRATION_HINT =
  "Run npm run supabase:push to enable complementary studies uploads.";
