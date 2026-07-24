import type { Pool } from "pg";
import { getComplementaryCatalog } from "./complementaryCatalog.js";
import {
  consumeComplementaryStubSlot,
  loadComplementaryStubsForPlanYear,
  restoreComplementaryStubSlot,
} from "./complementaryPlanCourses.js";
import { classifyComplementaryCourse } from "./complementaryStudies.js";
import { getCourseByCode } from "./courses.js";
import type { DegreePlanRow } from "./planGenerator.js";
import { planCoursesHaveConsumedStubColumn } from "../db/planCourseSchema.js";

export interface AddPlanCourseInput {
  termId: string;
  courseCode: string;
}

export async function addCourseToPlan(
  pool: Pool,
  planId: string,
  input: AddPlanCourseInput,
): Promise<DegreePlanRow | null> {
  const termResult = await pool.query<{ id: string; checklist_year: number }>(
    `SELECT id, checklist_year FROM plan_terms WHERE id = $1 AND plan_id = $2`,
    [input.termId, planId],
  );

  if (termResult.rows.length === 0) {
    return null;
  }

  const catalogue = await getCourseByCode(input.courseCode);
  if (!catalogue) {
    throw new Error(`Course ${input.courseCode.trim().toUpperCase()} not found in catalogue`);
  }

  const normalized = catalogue.code.trim().toUpperCase();

  const duplicate = await pool.query<{ id: string }>(
    `SELECT pc.id
     FROM plan_courses pc
     INNER JOIN plan_terms pt ON pt.id = pc.term_id
     WHERE pt.plan_id = $1
       AND upper(pc.course_code) = $2
       AND pc.entry_kind = 'course'`,
    [planId, normalized],
  );

  if (duplicate.rows.length > 0) {
    throw new Error(`${normalized} is already on this plan`);
  }

  const checklistYear = termResult.rows[0].checklist_year;

  const sortResult = await pool.query<{ max: number | null }>(
    `SELECT max(sort_order) AS max FROM plan_courses WHERE term_id = $1`,
    [input.termId],
  );
  const sortOrder = (sortResult.rows[0]?.max ?? -1) + 1;

  let sectionLabel: string | null = null;
  let consumeStub = false;
  let complementaryCredits = catalogue.credits ?? 3;
  const { catalog } = await getComplementaryCatalog(pool, planId);
  if (catalog) {
    const classification = classifyComplementaryCourse(normalized, catalog, catalogue.credits);
    if (classification.valid) {
      complementaryCredits = catalogue.credits ?? classification.credits;
      const stubs = await loadComplementaryStubsForPlanYear(
        pool,
        planId,
        checklistYear,
        input.termId,
      );
      if (stubs.length > 0) {
        sectionLabel = "Complementary Studies";
        consumeStub = true;
      }
    }
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO plan_courses (term_id, course_code, credits, title, checklist_year, sort_order, entry_kind, section_label)
     VALUES ($1, $2, $3, $4, $5, $6, 'course', $7)
     RETURNING id`,
    [
      input.termId,
      normalized,
      catalogue.credits,
      catalogue.title,
      checklistYear,
      sortOrder,
      sectionLabel,
    ],
  );

  if (consumeStub) {
    await consumeComplementaryStubSlot(
      pool,
      planId,
      input.termId,
      checklistYear,
      complementaryCredits,
      inserted.rows[0]?.id,
    );
  }

  await pool.query(`UPDATE degree_plans SET updated_at = NOW() WHERE id = $1`, [planId]);

  const { getPlanById } = await import("./planGenerator.js");
  return getPlanById(pool, planId);
}

export async function removeCourseFromPlan(
  pool: Pool,
  planId: string,
  courseId: string,
): Promise<DegreePlanRow | null> {
  const hasConsumedStubColumn = await planCoursesHaveConsumedStubColumn(pool);
  const courseResult = await pool.query<{
    id: string;
    term_id: string;
    sort_order: number;
    credits: number | null;
    checklist_year: number | null;
    section_label: string | null;
    entry_kind: string;
    consumed_stub_id: string | null;
  }>(
    hasConsumedStubColumn
      ? `SELECT pc.id, pc.term_id, pc.sort_order, pc.credits, pc.checklist_year,
                pc.section_label, pc.entry_kind, pc.consumed_stub_id
         FROM plan_courses pc
         INNER JOIN plan_terms pt ON pt.id = pc.term_id
         WHERE pc.id = $1 AND pt.plan_id = $2`
      : `SELECT pc.id, pc.term_id, pc.sort_order, pc.credits, pc.checklist_year,
                pc.section_label, pc.entry_kind, NULL::uuid AS consumed_stub_id
         FROM plan_courses pc
         INNER JOIN plan_terms pt ON pt.id = pc.term_id
         WHERE pc.id = $1 AND pt.plan_id = $2`,
    [courseId, planId],
  );

  if (courseResult.rows.length === 0) {
    return null;
  }

  const course = courseResult.rows[0];
  if (course.entry_kind === "stub") {
    throw new Error("Cannot remove checklist placeholder slots");
  }

  await restoreComplementaryStubSlot(pool, course);
  await pool.query(`DELETE FROM plan_courses WHERE id = $1`, [courseId]);
  await pool.query(`UPDATE degree_plans SET updated_at = NOW() WHERE id = $1`, [planId]);

  const { getPlanById } = await import("./planGenerator.js");
  return getPlanById(pool, planId);
}
