import { getPool } from "../db/index.js";

export interface CourseRow {
  id: string;
  code: string;
  title: string;
  description: string | null;
  credits: string | number | null;
  department: string | null;
}

export interface CourseSummary {
  code: string;
  title: string;
  credits: number | null;
  department: string | null;
}

export interface CourseDetail extends CourseSummary {
  description: string | null;
  prerequisites: string[];
}

export interface ListCoursesOptions {
  department?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

function toCredits(value: string | number | null): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toSummary(row: Pick<CourseRow, "code" | "title" | "credits" | "department">): CourseSummary {
  return {
    code: row.code,
    title: row.title,
    credits: toCredits(row.credits),
    department: row.department,
  };
}

export async function listCourses(options: ListCoursesOptions = {}): Promise<{
  courses: CourseSummary[];
  total: number;
}> {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.department?.trim()) {
    params.push(options.department.trim().toUpperCase());
    conditions.push(`upper(department) = $${params.length}`);
  }

  if (options.search?.trim()) {
    params.push(`%${options.search.trim()}%`);
    const index = params.length;
    conditions.push(`(code ILIKE $${index} OR title ILIKE $${index} OR coalesce(description, '') ILIKE $${index})`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await getPool().query<{ count: string }>(
    `SELECT count(*)::text AS count FROM courses ${where}`,
    params,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  params.push(limit, offset);
  const result = await getPool().query<CourseRow>(
    `SELECT code, title, credits, department
     FROM courses
     ${where}
     ORDER BY department NULLS LAST, code ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    courses: result.rows.map(toSummary),
    total,
  };
}

export async function listDepartments(): Promise<string[]> {
  const result = await getPool().query<{ department: string }>(
    `SELECT DISTINCT department
     FROM courses
     WHERE department IS NOT NULL AND trim(department) <> ''
     ORDER BY department ASC`,
  );
  return result.rows.map((row) => row.department);
}

export async function getCourseByCode(code: string): Promise<CourseDetail | null> {
  const normalized = code.trim().toUpperCase();
  const result = await getPool().query<CourseRow>(
    `SELECT id, code, title, description, credits, department
     FROM courses
     WHERE upper(code) = $1`,
    [normalized],
  );

  const row = result.rows[0];
  if (!row) return null;

  const prereqResult = await getPool().query<{ prerequisite_code: string }>(
    `SELECT prerequisite_code
     FROM course_prerequisites
     WHERE course_id = $1
     ORDER BY prerequisite_code ASC`,
    [row.id],
  );

  return {
    ...toSummary(row),
    description: row.description,
    prerequisites: prereqResult.rows.map((entry) => entry.prerequisite_code),
  };
}
