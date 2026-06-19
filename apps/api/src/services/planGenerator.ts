import type { Pool } from "pg";
import type { ParsedChecklist } from "./checklistParser.js";

export interface PlanCourseRow {
  id: string;
  course_code: string;
  credits: number | null;
  title: string | null;
  checklist_year: number | null;
  sort_order: number;
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
  parsed: ParsedChecklist;
}

function buildTerms(startingYear: number, parsed: ParsedChecklist): Array<{
  label: string;
  session: string;
  academicYear: number;
  checklistYear: number;
  sortOrder: number;
  courses: Array<{ code: string; credits: number | null; checklistYear: number; sortOrder: number }>;
}> {
  const terms: Array<{
    label: string;
    session: string;
    academicYear: number;
    checklistYear: number;
    sortOrder: number;
    courses: Array<{ code: string; credits: number | null; checklistYear: number; sortOrder: number }>;
  }> = [];

  let sortOrder = 0;

  for (const yearBlock of parsed.years) {
    const checklistYear = yearBlock.year;
    const baseYear = startingYear + checklistYear - 1;

    const fallLabel = `Fall ${baseYear}`;
    const winterLabel = `Winter ${baseYear + 1}`;

    const fallCourses: typeof terms[0]["courses"] = [];
    const winterCourses: typeof terms[0]["courses"] = [];

    yearBlock.courses.forEach((course, index) => {
      const entry = {
        code: course.code,
        credits: course.credits,
        checklistYear,
        sortOrder: index,
      };
      if (index % 2 === 0) {
        fallCourses.push(entry);
      } else {
        winterCourses.push(entry);
      }
    });

    terms.push({
      label: fallLabel,
      session: "Fall",
      academicYear: baseYear,
      checklistYear,
      sortOrder: sortOrder++,
      courses: fallCourses,
    });

    terms.push({
      label: winterLabel,
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
        (faculty_key, programme_name, starting_year, source_filename, source_type, parse_warnings)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id`,
      [
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
          `INSERT INTO plan_courses (term_id, course_code, credits, checklist_year, sort_order)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, course_code, credits, title, checklist_year, sort_order`,
          [termId, course.code, course.credits, course.checklistYear, course.sortOrder],
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

  for (const term of termsResult.rows) {
    const coursesResult = await pool.query<PlanCourseRow>(
      `SELECT id, course_code, credits, title, checklist_year, sort_order
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
