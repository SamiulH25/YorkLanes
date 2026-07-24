import type { Pool } from "pg";
import {
  COMPLEMENTARY_MIGRATION_HINT,
  degreePlansHaveComplementaryColumns,
} from "../db/planComplementarySchema.js";
import type { ComplementaryCatalog } from "./complementaryParser.js";
import { getPlanById, type DegreePlanRow } from "./planGenerator.js";

export function parseCatalogFromDb(value: unknown): ComplementaryCatalog | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const catalog = value as ComplementaryCatalog;
  if (!Array.isArray(catalog.listed_courses) || !catalog.rules) {
    return null;
  }

  return catalog;
}

export async function getComplementaryCatalog(
  pool: Pool,
  planId: string,
): Promise<{ filename: string | null; catalog: ComplementaryCatalog | null }> {
  if (!(await degreePlansHaveComplementaryColumns(pool))) {
    return { filename: null, catalog: null };
  }

  const result = await pool.query<{
    complementary_filename: string | null;
    complementary_catalog: unknown;
  }>(
    `SELECT complementary_filename, complementary_catalog
     FROM degree_plans
     WHERE id = $1`,
    [planId],
  );

  if (result.rows.length === 0) {
    return { filename: null, catalog: null };
  }

  const row = result.rows[0];
  return {
    filename: row.complementary_filename,
    catalog: parseCatalogFromDb(row.complementary_catalog),
  };
}

export async function saveComplementaryCatalog(
  pool: Pool,
  planId: string,
  filename: string,
  catalog: ComplementaryCatalog,
): Promise<DegreePlanRow | null> {
  if (!(await degreePlansHaveComplementaryColumns(pool))) {
    throw new Error(COMPLEMENTARY_MIGRATION_HINT);
  }

  const result = await pool.query<{ id: string }>(
    `UPDATE degree_plans
     SET complementary_filename = $2,
         complementary_catalog = $3::jsonb,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [planId, filename, JSON.stringify(catalog)],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return getPlanById(pool, planId);
}
