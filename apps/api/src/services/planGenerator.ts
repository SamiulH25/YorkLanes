/**
 * Saves and loads degree plans in Postgres.
 *
 * buildTerms() splits each checklist year into Fall/Winter columns:
 *   - concrete courses halved between terms
 *   - full-year courses → fall only
 *   - stubs (electives/complementary) → winter
 */
import type { Pool } from "pg";
import { planCourseSelectSql, planCoursesHaveCompletedColumn } from "../db/planCourseSchema.js";
import type { ParsedChecklist } from "./checklistParser.js";

export interface PlanCourseRow {
  id: string;
  course_code: string;
  credits: number | null;
  title: string | null;
  checklist_year: number | null;
  sort_order: number;
  entry_kind: "course" | "stub";
  section_label: string | null;
  completed: boolean;
}

export interface PlanTermRow {
  id: string;
  label: string;
  session: string;
  academic_year: number;
  checklist_year: number;
  sort_order: number;
  courses: PlanCourseRow[];
}

export interface DegreePlanRow {
  id: string;
  faculty_key: string;
  programme_name: string | null;
  starting_year: number;
  source_filename: string | null;
  parse_warnings: string[];
  terms: PlanTermRow[];
}

interface CreatePlanInput {
  facultyKey: string;
  programmeName?: string;
  startingYear: number;
  sourceFilename?: string;
  sourceType?: string;
  userId?: string;
  parsed: ParsedChecklist;
}

function buildTerms(startingYear: number, parsed: ParsedChecklist): Array<{
  label: string;
  session: string;
  academicYear: number;
  checklistYear: number;
  sortOrder: number;
  courses: Array<{
    code: string;
    credits: number | null;
    checklistYear: number;
    sortOrder: number;
    entryKind: "course" | "stub";
    sectionLabel: string | null;
    title: string | null;
  }>;
}> {
  const terms: Array<{
    label: string;
    session: string;
    academicYear: number;
    checklistYear: number;
    sortOrder: number;
    courses: Array<{
      code: string;
      credits: number | null;
      checklistYear: number;
      sortOrder: number;
      entryKind: "course" | "stub";
      sectionLabel: string | null;
      title: string | null;
    }>;
  }> = [];

  const yearMap = new Map(parsed.years.map((year) => [year.year, year.courses]));
  const maxChecklistYear = Math.max(4, ...parsed.years.map((year) => year.year), 1);

  let sortOrder = 0;

  for (let checklistYear = 1; checklistYear <= maxChecklistYear; checklistYear++) {
    const yearCourses = yearMap.get(checklistYear) ?? [];
    const baseYear = startingYear + checklistYear - 1;

    const concrete = yearCourses.filter((course) => course.kind !== "stub");
    const stubs = yearCourses.filter((course) => course.kind === "stub");
    const fullYearCourses = concrete.filter((course) => course.schedule_note === "full_year");
    const regularConcrete = concrete.filter((course) => course.schedule_note !== "full_year");

    const fallCount = Math.max(1, Math.ceil(regularConcrete.length / 2));
    const fallConcrete = regularConcrete.slice(0, fallCount);
    const winterConcrete = regularConcrete.slice(fallCount);

    const toEntry = (
      course: (typeof yearCourses)[number],
      index: number,
    ): (typeof terms)[0]["courses"][number] => {
      const isStub = course.kind === "stub";
      const isFullYear = course.schedule_note === "full_year";
      const optionCodes = course.option_codes ?? [];
      const optionsTitle =
        optionCodes.length > 0
          ? optionCodes.join(", ")
          : (course.title ?? null);

      return {
        code: course.code,
        credits: course.credits,
        checklistYear,
        sortOrder: index,
        entryKind: (isStub ? "stub" : "course") as "course" | "stub",
        sectionLabel: course.section_label ?? course.section ?? null,
        title: isStub
          ? (optionsTitle ?? course.section_label ?? course.section ?? course.code)
          : isFullYear
            ? "Full year course"
            : (course.section_label ?? null),
      };
    };

    const fallCourses = [
      ...fallConcrete.map((course, index) => toEntry(course, index)),
      ...fullYearCourses.map((course, index) => toEntry(course, fallConcrete.length + index)),
    ];
    const winterCourses = [
      ...winterConcrete.map((course, index) =>
        toEntry(course, fallConcrete.length + fullYearCourses.length + index),
      ),
      ...stubs.map((course, index) =>
        toEntry(
          course,
          fallConcrete.length + fullYearCourses.length + winterConcrete.length + index,
        ),
      ),
    ];

    terms.push({
      label: `Fall ${baseYear}`,
      session: "Fall",
      academicYear: baseYear,
      checklistYear,
      sortOrder: sortOrder++,
      courses: fallCourses,
    });

    terms.push({
      label: `Winter ${baseYear + 1}`,
      session: "Winter",
      academicYear: baseYear + 1,
      checklistYear,
      sortOrder: sortOrder++,
      courses: winterCourses,
    });
  }

  if (terms.length === 0) {
    terms.push({
      label: `Fall ${startingYear}`,
      session: "Fall",
      academicYear: startingYear,
      checklistYear: 1,
      sortOrder: 0,
      courses: [],
    });
  }

  return terms;
}

export async function createPlanFromChecklist(
  pool: Pool,
  input: CreatePlanInput,
): Promise<DegreePlanRow> {
  const programmeName =
    input.programmeName?.trim() ||
    input.parsed.programme_hint?.trim() ||
    "My degree programme";

  const warnings = [...(input.parsed.warnings ?? [])];
  const termBlueprint = buildTerms(input.startingYear, input.parsed);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const planResult = await client.query<{ id: string }>(
      `INSERT INTO degree_plans
        (user_id, faculty_key, programme_name, starting_year, source_filename, source_type, parse_warnings)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING id`,
      [
        input.userId ?? null,
        input.facultyKey,
        programmeName,
        input.startingYear,
        input.sourceFilename ?? null,
        input.sourceType ?? null,
        JSON.stringify(warnings),
      ],
    );

    const planId = planResult.rows[0].id;
    const terms: PlanTermRow[] = [];

    for (const term of termBlueprint) {
      const termResult = await client.query<{ id: string }>(
        `INSERT INTO plan_terms (plan_id, label, session, academic_year, checklist_year, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [planId, term.label, term.session, term.academicYear, term.checklistYear, term.sortOrder],
      );

      const termId = termResult.rows[0].id;
      const courses: PlanCourseRow[] = [];

      for (const course of term.courses) {
        const courseResult = await client.query<PlanCourseRow>(
          `INSERT INTO plan_courses (term_id, course_code, credits, title, checklist_year, sort_order, entry_kind, section_label)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, course_code, credits, title, checklist_year, sort_order, entry_kind, section_label`,
          [
            termId,
            course.code,
            course.credits,
            course.title,
            course.checklistYear,
            course.sortOrder,
            course.entryKind,
            course.sectionLabel,
          ],
        );
        courses.push(courseResult.rows[0]);
      }

      terms.push({
        id: termId,
        label: term.label,
        session: term.session,
        academic_year: term.academicYear,
        checklist_year: term.checklistYear,
        sort_order: term.sortOrder,
        courses,
      });
    }

    await client.query("COMMIT");

    return {
      id: planId,
      faculty_key: input.facultyKey,
      programme_name: programmeName,
      starting_year: input.startingYear,
      source_filename: input.sourceFilename ?? null,
      parse_warnings: warnings,
      terms,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getLatestPlanForUser(
  pool: Pool,
  userId: string,
): Promise<DegreePlanRow | null> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM degree_plans
     WHERE user_id = $1
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1`,
    [userId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return getPlanById(pool, result.rows[0].id);
}

export async function getPlanById(pool: Pool, planId: string): Promise<DegreePlanRow | null> {
  const planResult = await pool.query<{
    id: string;
    faculty_key: string;
    programme_name: string | null;
    starting_year: number;
    source_filename: string | null;
    parse_warnings: unknown;
  }>(
    `SELECT id, faculty_key, programme_name, starting_year, source_filename, parse_warnings
     FROM degree_plans WHERE id = $1`,
    [planId],
  );

  if (planResult.rows.length === 0) {
    return null;
  }

  const plan = planResult.rows[0];
  const termsResult = await pool.query<{
    id: string;
    label: string;
    session: string;
    academic_year: number;
    checklist_year: number;
    sort_order: number;
  }>(
    `SELECT id, label, session, academic_year, checklist_year, sort_order
     FROM plan_terms WHERE plan_id = $1 ORDER BY sort_order`,
    [planId],
  );

  const terms: PlanTermRow[] = [];

  const includeCompleted = await planCoursesHaveCompletedColumn(pool);

  for (const term of termsResult.rows) {
    const coursesResult = await pool.query<PlanCourseRow>(
      `SELECT ${planCourseSelectSql(includeCompleted)}
       FROM plan_courses WHERE term_id = $1 ORDER BY sort_order`,
      [term.id],
    );

    terms.push({ ...term, courses: coursesResult.rows });
  }

  const warnings = Array.isArray(plan.parse_warnings)
    ? (plan.parse_warnings as string[])
    : [];

  return {
    id: plan.id,
    faculty_key: plan.faculty_key,
    programme_name: plan.programme_name,
    starting_year: plan.starting_year,
    source_filename: plan.source_filename,
    parse_warnings: warnings,
    terms,
  };
}
