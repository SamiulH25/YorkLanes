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
  complementary_filename: string | null;
  complementary_catalog: unknown | null;
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
      complementary_filename: null,
      complementary_catalog: null,
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

function termSessionIsSummer(session: string): boolean {
  return session.toLowerCase().includes("summer");
}

function termSessionIsWinter(session: string): boolean {
  const value = session.toLowerCase();
  return value.includes("winter") || value === "w";
}

function termSessionIsFall(session: string): boolean {
  const value = session.toLowerCase();
  return value.includes("fall") || value.includes("autumn");
}

/** Insert an empty summer term for a checklist year (shifts later terms' sort_order). */
export async function createSummerTermForChecklistYear(
  pool: Pool,
  planId: string,
  checklistYear: number,
): Promise<DegreePlanRow | null> {
  const plan = await getPlanById(pool, planId);
  if (!plan) {
    return null;
  }

  if (!Number.isInteger(checklistYear) || checklistYear < 1) {
    throw new Error("Invalid checklist year");
  }

  if (plan.terms.some((term) => term.checklist_year === checklistYear && termSessionIsSummer(term.session))) {
    throw new Error("Summer term already exists for this year");
  }

  const winterTerm = plan.terms.find(
    (term) => term.checklist_year === checklistYear && termSessionIsWinter(term.session),
  );
  const fallTerm = plan.terms.find(
    (term) => term.checklist_year === checklistYear && termSessionIsFall(term.session),
  );
  const anchorTerm = winterTerm ?? fallTerm;
  if (!anchorTerm) {
    throw new Error("No fall or winter term found for this checklist year");
  }

  const summerAcademicYear = winterTerm ? winterTerm.academic_year : fallTerm!.academic_year + 1;
  const insertSortOrder = anchorTerm.sort_order + 1;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE plan_terms SET sort_order = sort_order + 1
       WHERE plan_id = $1 AND sort_order >= $2`,
      [planId, insertSortOrder],
    );
    await client.query(
      `INSERT INTO plan_terms (plan_id, label, session, academic_year, checklist_year, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        planId,
        `Summer ${summerAcademicYear}`,
        "Summer",
        summerAcademicYear,
        checklistYear,
        insertSortOrder,
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return getPlanById(pool, planId);
}

export async function getLatestPlanForUser(
  pool: Pool,
  userId: string,
  options: GetPlanOptions = {},
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

  return getPlanById(pool, result.rows[0].id, options);
}

export interface GetPlanOptions {
  /** When false, skips loading the large complementary_catalog JSONB column. */
  includeComplementaryCatalog?: boolean;
}

export async function getPlanById(
  pool: Pool,
  planId: string,
  options: GetPlanOptions = {},
): Promise<DegreePlanRow | null> {
  const includeComplementaryCatalog = options.includeComplementaryCatalog ?? true;
  const { degreePlansHaveComplementaryColumns } = await import("../db/planComplementarySchema.js");
  const includeComplementary = await degreePlansHaveComplementaryColumns(pool);

  const planResult = await pool.query<{
    id: string;
    faculty_key: string;
    programme_name: string | null;
    starting_year: number;
    source_filename: string | null;
    complementary_filename: string | null;
    complementary_catalog: unknown;
    parse_warnings: unknown;
  }>(
    includeComplementary
      ? includeComplementaryCatalog
        ? `SELECT id, faculty_key, programme_name, starting_year, source_filename,
                  complementary_filename, complementary_catalog, parse_warnings
           FROM degree_plans WHERE id = $1`
        : `SELECT id, faculty_key, programme_name, starting_year, source_filename,
                  complementary_filename, NULL::jsonb AS complementary_catalog, parse_warnings
           FROM degree_plans WHERE id = $1`
      : `SELECT id, faculty_key, programme_name, starting_year, source_filename,
                NULL::text AS complementary_filename,
                NULL::jsonb AS complementary_catalog,
                parse_warnings
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

  const includeCompleted = await planCoursesHaveCompletedColumn(pool);
  const termIds = termsResult.rows.map((term) => term.id);
  const coursesByTerm = new Map<string, PlanCourseRow[]>();

  if (termIds.length > 0) {
    const coursesResult = await pool.query<PlanCourseRow & { term_id: string }>(
      `SELECT ${planCourseSelectSql(includeCompleted)}, term_id
       FROM plan_courses
       WHERE term_id = ANY($1::uuid[])
       ORDER BY sort_order`,
      [termIds],
    );

    for (const course of coursesResult.rows) {
      const list = coursesByTerm.get(course.term_id) ?? [];
      list.push({
        id: course.id,
        course_code: course.course_code,
        credits: course.credits,
        title: course.title,
        checklist_year: course.checklist_year,
        sort_order: course.sort_order,
        entry_kind: course.entry_kind,
        section_label: course.section_label,
        completed: course.completed,
      });
      coursesByTerm.set(course.term_id, list);
    }
  }

  const terms: PlanTermRow[] = termsResult.rows.map((term) => ({
    ...term,
    courses: coursesByTerm.get(term.id) ?? [],
  }));

  const warnings = Array.isArray(plan.parse_warnings)
    ? (plan.parse_warnings as string[])
    : [];

  return {
    id: plan.id,
    faculty_key: plan.faculty_key,
    programme_name: plan.programme_name,
    starting_year: plan.starting_year,
    source_filename: plan.source_filename,
    complementary_filename: plan.complementary_filename,
    complementary_catalog: plan.complementary_catalog,
    parse_warnings: warnings,
    terms,
  };
}
