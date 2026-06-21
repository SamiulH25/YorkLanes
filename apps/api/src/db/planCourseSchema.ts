import type { Pool } from "pg";

let hasCompletedColumn: boolean | null = null;

export async function planCoursesHaveCompletedColumn(pool: Pool): Promise<boolean> {
  if (hasCompletedColumn !== null) {
    return hasCompletedColumn;
  }

  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'plan_courses'
         AND column_name = 'completed'
     ) AS exists`,
  );

  hasCompletedColumn = result.rows[0]?.exists ?? false;
  return hasCompletedColumn;
}

export function planCourseSelectSql(includeCompleted: boolean): string {
  const base =
    "id, course_code, credits, title, checklist_year, sort_order, entry_kind, section_label";
  return includeCompleted ? `${base}, completed` : `${base}, false AS completed`;
}
