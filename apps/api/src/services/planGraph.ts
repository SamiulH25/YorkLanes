/**
 * Prerequisite graph for the plan editor.
 *
 * Edges from course_prerequisites (catalogue) + co-reqs parsed from course descriptions.
 * Satisfaction = earlier term, or course marked completed in the plan.
 */
import type { Pool } from "pg";
import type { DegreePlanRow, PlanCourseRow } from "./planGenerator.js";

export type DependencyKind = "prerequisite" | "corequisite";

export interface CourseDependencyEdge {
  from: string;
  to: string;
  from_course_id: string | null;
  to_course_id: string | null;
  satisfied: boolean;
  kind: DependencyKind;
}

export interface CoursePlacement {
  course_id: string;
  course_code: string;
  term_id: string;
  term_label: string;
  term_sort_order: number;
  sort_order: number;
  entry_kind: "course" | "stub";
  section_label: string | null;
  completed: boolean;
}

export interface PlanGraphSnapshot {
  plan_id: string;
  placements: CoursePlacement[];
  dependencies: CourseDependencyEdge[];
  course_codes: string[];
}

const CONCRETE_COURSE_CODE = /^[A-Z]{2,6} \d{4}$/;
const COURSE_CODE_IN_TEXT =
  /(?:AP\/|FA\/|HH\/|SC\/|LE\/|SB\/|GL\/|ES\/)?([A-Z]{2,6})\s+(\d{4}[A-Z]?)/gi;

const COREQ_STOP_WORDS = [
  "prerequisite",
  "credit exclusion",
  "not open to",
  "may not be",
  "note:",
  "previously offered",
];

function isConcreteCourseCode(code: string): boolean {
  return CONCRETE_COURSE_CODE.test(code);
}

function courseNumberFromCode(code: string): string {
  const parts = code.split(/\s+/);
  return parts[1] ?? "";
}

function normalizeCourseCode(subject: string, number: string): string {
  return `${subject.toUpperCase()} ${number.toUpperCase()}`;
}

export function extractCorequisiteCodes(description: string | null, courseCode: string): string[] {
  if (!description) return [];

  const lower = description.toLowerCase();
  const start = lower.search(/co-?requisites?:/);
  if (start < 0) return [];

  let stop = lower.length;
  for (const keyword of COREQ_STOP_WORDS) {
    const index = lower.indexOf(keyword, start + 1);
    if (index >= 0 && index < stop) {
      stop = index;
    }
  }

  const snippet = description.slice(start, stop);
  const selfNumber = courseNumberFromCode(courseCode);
  const level = selfNumber[0]?.match(/\d/) ? Number(selfNumber[0]) : 9;

  const codes: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const pattern = new RegExp(COURSE_CODE_IN_TEXT.source, COURSE_CODE_IN_TEXT.flags);

  while ((match = pattern.exec(snippet)) !== null) {
    const number = match[2];
    if (!number[0]?.match(/\d/)) continue;
    if (Number(number[0]) > level) continue;
    if (number.toUpperCase() === selfNumber.toUpperCase()) continue;
    const code = normalizeCourseCode(match[1], number);
    if (!seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }

  return codes;
}

function buildPlacements(plan: DegreePlanRow): CoursePlacement[] {
  const placements: CoursePlacement[] = [];

  for (const term of plan.terms) {
    for (const course of term.courses) {
      placements.push({
        course_id: course.id,
        course_code: course.course_code,
        term_id: term.id,
        term_label: term.label,
        term_sort_order: term.sort_order,
        sort_order: course.sort_order,
        entry_kind: course.entry_kind ?? "course",
        section_label: course.section_label,
        completed: course.completed ?? false,
      });
    }
  }

  return placements;
}

function buildCompletedIds(plan: DegreePlanRow): Set<string> {
  const ids = new Set<string>();
  for (const term of plan.terms) {
    for (const course of term.courses) {
      if (course.completed) {
        ids.add(course.id);
      }
    }
  }
  return ids;
}

function isPrerequisiteSatisfied(
  fromTerm: number | undefined,
  toTerm: number | undefined,
  fromCourseId: string | null,
  completedIds: Set<string>,
): boolean {
  if (fromCourseId && completedIds.has(fromCourseId)) {
    return true;
  }
  return fromTerm !== undefined && toTerm !== undefined && fromTerm < toTerm;
}

function isCorequisiteSatisfied(
  fromTerm: number | undefined,
  toTerm: number | undefined,
  fromCourseId: string | null,
  toCourseId: string | null,
  completedIds: Set<string>,
): boolean {
  if (fromCourseId && completedIds.has(fromCourseId)) {
    return true;
  }
  if (toCourseId && completedIds.has(toCourseId)) {
    return true;
  }
  return fromTerm !== undefined && toTerm !== undefined && fromTerm === toTerm;
}

export async function buildPlanGraph(pool: Pool, plan: DegreePlanRow): Promise<PlanGraphSnapshot> {
  const placements = buildPlacements(plan);
  const completedIds = buildCompletedIds(plan);
  const courseCodes = [
    ...new Set(
      placements
        .filter((p) => p.entry_kind === "course" && isConcreteCourseCode(p.course_code))
        .map((p) => p.course_code),
    ),
  ];
  const codeToCourseId = new Map(placements.map((p) => [p.course_code, p.course_id]));
  const courseIdToTermOrder = new Map<string, number>();

  for (const placement of placements) {
    courseIdToTermOrder.set(placement.course_id, placement.term_sort_order);
  }

  if (courseCodes.length === 0) {
    return { plan_id: plan.id, placements, dependencies: [], course_codes: [] };
  }

  const catalogResult = await pool.query<{ code: string; description: string | null }>(
    `SELECT code, description FROM courses WHERE code = ANY($1::text[])`,
    [courseCodes],
  );
  const descriptions = new Map(catalogResult.rows.map((row) => [row.code, row.description]));

  const prereqResult = await pool.query<{ code: string; prerequisite_code: string }>(
    `SELECT c.code, cp.prerequisite_code
     FROM courses c
     INNER JOIN course_prerequisites cp ON cp.course_id = c.id
     WHERE c.code = ANY($1::text[])`,
    [courseCodes],
  );

  const dependencies: CourseDependencyEdge[] = [];
  const edgeKeys = new Set<string>();

  function addEdge(
    kind: DependencyKind,
    fromCode: string,
    toCode: string,
  ): void {
    if (!courseCodes.includes(fromCode)) {
      return;
    }

    const key = `${kind}:${fromCode}->${toCode}`;
    if (edgeKeys.has(key)) {
      return;
    }
    edgeKeys.add(key);

    const toCourseId = codeToCourseId.get(toCode) ?? null;
    const fromCourseId = codeToCourseId.get(fromCode) ?? null;
    const toTerm = toCourseId ? courseIdToTermOrder.get(toCourseId) : undefined;
    const fromTerm = fromCourseId ? courseIdToTermOrder.get(fromCourseId) : undefined;

    const satisfied =
      kind === "prerequisite"
        ? isPrerequisiteSatisfied(fromTerm, toTerm, fromCourseId, completedIds)
        : isCorequisiteSatisfied(fromTerm, toTerm, fromCourseId, toCourseId, completedIds);

    dependencies.push({
      from: fromCode,
      to: toCode,
      from_course_id: fromCourseId,
      to_course_id: toCourseId,
      satisfied,
      kind,
    });
  }

  for (const row of prereqResult.rows) {
    addEdge("prerequisite", row.prerequisite_code, row.code);
  }

  for (const code of courseCodes) {
    const coreqs = extractCorequisiteCodes(descriptions.get(code) ?? null, code);
    for (const coreqCode of coreqs) {
      addEdge("corequisite", coreqCode, code);
    }
  }

  return {
    plan_id: plan.id,
    placements,
    dependencies,
    course_codes: courseCodes,
  };
}

export interface PlanLayoutMove {
  courseId: string;
  termId: string;
  sortOrder: number;
}

export async function applyPlanLayoutMoves(
  pool: Pool,
  planId: string,
  moves: PlanLayoutMove[],
): Promise<DegreePlanRow | null> {
  if (moves.length === 0) {
    return null;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const move of moves) {
      const owner = await client.query<{ plan_id: string }>(
        `SELECT pt.plan_id
         FROM plan_courses pc
         INNER JOIN plan_terms pt ON pt.id = pc.term_id
         WHERE pc.id = $1`,
        [move.courseId],
      );

      if (owner.rows.length === 0 || owner.rows[0].plan_id !== planId) {
        throw new Error("Course does not belong to this plan");
      }

      const termOwner = await client.query<{ plan_id: string }>(
        `SELECT plan_id FROM plan_terms WHERE id = $1`,
        [move.termId],
      );

      if (termOwner.rows.length === 0 || termOwner.rows[0].plan_id !== planId) {
        throw new Error("Term does not belong to this plan");
      }

      await client.query(
        `UPDATE plan_courses
         SET term_id = $2, sort_order = $3
         WHERE id = $1`,
        [move.courseId, move.termId, move.sortOrder],
      );
    }

    await client.query(`UPDATE degree_plans SET updated_at = NOW() WHERE id = $1`, [planId]);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const { getPlanById } = await import("./planGenerator.js");
  return getPlanById(pool, planId);
}

export async function setPlanCourseCompletion(
  pool: Pool,
  planId: string,
  courseId: string,
  completed: boolean,
): Promise<DegreePlanRow | null> {
  const { planCoursesHaveCompletedColumn } = await import("../db/planCourseSchema.js");

  const owner = await pool.query<{ plan_id: string }>(
    `SELECT pt.plan_id
     FROM plan_courses pc
     INNER JOIN plan_terms pt ON pt.id = pc.term_id
     WHERE pc.id = $1`,
    [courseId],
  );

  if (owner.rows.length === 0 || owner.rows[0].plan_id !== planId) {
    return null;
  }

  if (await planCoursesHaveCompletedColumn(pool)) {
    await pool.query(`UPDATE plan_courses SET completed = $2 WHERE id = $1`, [courseId, completed]);
  }
  await pool.query(`UPDATE degree_plans SET updated_at = NOW() WHERE id = $1`, [planId]);

  const { getPlanById } = await import("./planGenerator.js");
  return getPlanById(pool, planId);
}
