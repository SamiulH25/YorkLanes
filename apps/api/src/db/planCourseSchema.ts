import type { Pool } from "pg";

let hasCompletedColumn: boolean | null = null;
let hasConsumedStubColumn: boolean | null = null;

async function planCoursesHaveColumn(pool: Pool, columnName: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'plan_courses'
         AND column_name = $1
     ) AS exists`,
    [columnName],
  );
  return result.rows[0]?.exists ?? false;
}

export async function planCoursesHaveCompletedColumn(pool: Pool): Promise<boolean> {
  if (hasCompletedColumn !== null) {
    return hasCompletedColumn;
  }

  hasCompletedColumn = await planCoursesHaveColumn(pool, "completed");
  return hasCompletedColumn;
}

export async function planCoursesHaveConsumedStubColumn(pool: Pool): Promise<boolean> {
  if (hasConsumedStubColumn !== null) {
    return hasConsumedStubColumn;
  }

  hasConsumedStubColumn = await planCoursesHaveColumn(pool, "consumed_stub_id");
  return hasConsumedStubColumn;
}

export function planCourseSelectSql(includeCompleted: boolean): string {
  const base =
    "id, course_code, credits, title, checklist_year, sort_order, entry_kind, section_label";
  return includeCompleted ? `${base}, completed` : `${base}, false AS completed`;
}
