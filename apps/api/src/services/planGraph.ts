import type { Pool } from "pg";
import type { DegreePlanRow, PlanCourseRow } from "./planGenerator.js";

export interface CourseDependencyEdge {
  from: string;
  to: string;
  from_course_id: string | null;
  to_course_id: string | null;
  satisfied: boolean;
}

export interface CoursePlacement {
  course_id: string;
  course_code: string;
  term_id: string;
  term_label: string;
  term_sort_order: number;
  sort_order: number;
}

export interface PlanGraphSnapshot {
  plan_id: string;
  placements: CoursePlacement[];
  dependencies: CourseDependencyEdge[];
  course_codes: string[];
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
      });
    }
  }

  return placements;
}

function termOrderForCourse(plan: DegreePlanRow, courseId: string): number | null {
  for (const term of plan.terms) {
    if (term.courses.some((course) => course.id === courseId)) {
      return term.sort_order;
    }
  }
  return null;
}

export async function buildPlanGraph(pool: Pool, plan: DegreePlanRow): Promise<PlanGraphSnapshot> {
  const placements = buildPlacements(plan);
  const courseCodes = [...new Set(placements.map((p) => p.course_code))];
  const codeToCourseId = new Map(placements.map((p) => [p.course_code, p.course_id]));
  const courseIdToTermOrder = new Map<string, number>();

  for (const placement of placements) {
    courseIdToTermOrder.set(placement.course_id, placement.term_sort_order);
  }

  if (courseCodes.length === 0) {
    return { plan_id: plan.id, placements, dependencies: [], course_codes: [] };
  }

  const prereqResult = await pool.query<{ code: string; prerequisite_code: string }>(
    `SELECT c.code, cp.prerequisite_code
     FROM courses c
     INNER JOIN course_prerequisites cp ON cp.course_id = c.id
     WHERE c.code = ANY($1::text[])`,
    [courseCodes],
  );

  const dependencies: CourseDependencyEdge[] = [];

  for (const row of prereqResult.rows) {
    if (!courseCodes.includes(row.prerequisite_code)) {
      continue;
    }

    const toCourseId = codeToCourseId.get(row.code) ?? null;
    const fromCourseId = codeToCourseId.get(row.prerequisite_code) ?? null;
    const toTerm = toCourseId ? courseIdToTermOrder.get(toCourseId) : undefined;
    const fromTerm = fromCourseId ? courseIdToTermOrder.get(fromCourseId) : undefined;

    const satisfied =
      fromTerm !== undefined && toTerm !== undefined ? fromTerm < toTerm : false;

    dependencies.push({
      from: row.prerequisite_code,
      to: row.code,
      from_course_id: fromCourseId,
      to_course_id: toCourseId,
      satisfied,
    });
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

    await client.query(
      `UPDATE degree_plans SET updated_at = NOW() WHERE id = $1`,
      [planId],
    );

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
