import type { Pool } from "pg";
import { planCoursesHaveConsumedStubColumn } from "../db/planCourseSchema.js";
import { stripFacultyCourseCodePrefix } from "./courseSearch.js";
import { getCourseByCode } from "./courses.js";
import { getComplementaryCatalog } from "./complementaryCatalog.js";
import {
  classifyComplementaryCourse,
  pickComplementaryStubToConsume,
  planComplementaryReconciliation,
  planComplementaryStubRestoration,
  type ComplementaryStubCandidate,
} from "./complementaryStudies.js";
import type { ComplementaryCatalog } from "./complementaryParser.js";
import type { DegreePlanRow } from "./planGenerator.js";

const COMPLEMENTARY_STUB_FILTER = `
  AND pc.entry_kind = 'stub'
  AND (
    upper(pc.course_code) = 'COMPLEMENTARY'
    OR pc.section_label ILIKE '%complementar%'
    OR pc.course_code ILIKE '%complementar%'
  )
`;

export async function loadComplementaryStubsForPlanYear(
  pool: Pool,
  planId: string,
  checklistYear: number,
  preferredTermId: string,
): Promise<ComplementaryStubCandidate[]> {
  const result = await pool.query<ComplementaryStubCandidate>(
    `SELECT pc.id, pc.credits, pc.sort_order, pc.term_id
     FROM plan_courses pc
     INNER JOIN plan_terms pt ON pt.id = pc.term_id
     WHERE pt.plan_id = $1
       AND pt.checklist_year = $2
       ${COMPLEMENTARY_STUB_FILTER}
     ORDER BY CASE WHEN pc.term_id = $3 THEN 0 ELSE 1 END, pc.sort_order`,
    [planId, checklistYear, preferredTermId],
  );
  return result.rows;
}

export async function consumeComplementaryStubSlot(
  pool: Pool,
  planId: string,
  termId: string,
  checklistYear: number,
  courseCredits: number,
  courseId?: string,
): Promise<void> {
  const stubs = await loadComplementaryStubsForPlanYear(pool, planId, checklistYear, termId);
  const consumption = pickComplementaryStubToConsume(stubs, courseCredits, termId);
  if (!consumption) {
    return;
  }

  const hasConsumedStubColumn = courseId
    ? await planCoursesHaveConsumedStubColumn(pool)
    : false;

  if (hasConsumedStubColumn && courseId) {
    await pool.query(`UPDATE plan_courses SET consumed_stub_id = $2 WHERE id = $1`, [
      courseId,
      consumption.id,
    ]);
  }

  if (consumption.action === "delete") {
    await pool.query(`DELETE FROM plan_courses WHERE id = $1`, [consumption.id]);
    return;
  }

  await pool.query(`UPDATE plan_courses SET credits = $2 WHERE id = $1`, [
    consumption.id,
    consumption.newCredits,
  ]);
}

export interface ComplementaryCourseForRestore {
  id: string;
  term_id: string;
  sort_order: number;
  credits: number | null;
  checklist_year: number | null;
  section_label: string | null;
  entry_kind: string;
  consumed_stub_id: string | null;
}

export async function restoreComplementaryStubSlot(
  pool: Pool,
  course: ComplementaryCourseForRestore,
): Promise<void> {
  if (course.entry_kind !== "course" || course.section_label !== "Complementary Studies") {
    return;
  }

  const hasConsumedStubColumn = await planCoursesHaveConsumedStubColumn(pool);
  let stubStillExists = false;
  if (hasConsumedStubColumn && course.consumed_stub_id) {
    const stub = await pool.query<{ id: string }>(
      `SELECT id
       FROM plan_courses
       WHERE id = $1
         AND entry_kind = 'stub'`,
      [course.consumed_stub_id],
    );
    stubStillExists = stub.rows.length > 0;
  }

  const restoration = planComplementaryStubRestoration(
    hasConsumedStubColumn ? course.consumed_stub_id : null,
    stubStillExists,
    course.credits ?? 3,
    course.sort_order,
  );

  if (restoration.action === "increment") {
    await pool.query(`UPDATE plan_courses SET credits = COALESCE(credits, 0) + $2 WHERE id = $1`, [
      restoration.stubId,
      restoration.credits,
    ]);
    return;
  }

  await pool.query(
    `INSERT INTO plan_courses (term_id, course_code, credits, title, checklist_year, sort_order, entry_kind, section_label)
     VALUES ($1, 'COMPLEMENTARY', $2, NULL, $3, $4, 'stub', 'Complementary Studies')`,
    [course.term_id, restoration.credits, course.checklist_year, restoration.sortOrder],
  );
}

export interface AddComplementaryCourseInput {
  termId: string;
  courseCode: string;
}

export async function addComplementaryCourseToPlan(
  pool: Pool,
  planId: string,
  input: AddComplementaryCourseInput,
): Promise<DegreePlanRow | null> {
  const termResult = await pool.query<{ id: string; checklist_year: number }>(
    `SELECT id, checklist_year FROM plan_terms WHERE id = $1 AND plan_id = $2`,
    [input.termId, planId],
  );

  if (termResult.rows.length === 0) {
    return null;
  }

  const { catalog } = await getComplementaryCatalog(pool, planId);
  if (!catalog) {
    throw new Error("Upload a complementary studies PDF before adding complementary courses");
  }

  const normalized = stripFacultyCourseCodePrefix(input.courseCode);
  const classification = classifyComplementaryCourse(normalized, catalog);
  if (!classification.valid) {
    throw new Error(`${normalized} is not on the approved complementary list`);
  }

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

  const catalogue = await getCourseByCode(normalized);
  const credits = catalogue?.credits ?? classification.credits;
  const title = catalogue?.title ?? null;

  const sortResult = await pool.query<{ max: number | null }>(
    `SELECT max(sort_order) AS max FROM plan_courses WHERE term_id = $1`,
    [input.termId],
  );
  const sortOrder = (sortResult.rows[0]?.max ?? -1) + 1;

  const checklistYear = termResult.rows[0].checklist_year;

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO plan_courses (term_id, course_code, credits, title, checklist_year, sort_order, entry_kind, section_label)
     VALUES ($1, $2, $3, $4, $5, $6, 'course', $7)
     RETURNING id`,
    [
      input.termId,
      catalogue?.code ?? normalized,
      credits,
      title,
      checklistYear,
      sortOrder,
      "Complementary Studies",
    ],
  );

  await consumeComplementaryStubSlot(
    pool,
    planId,
    input.termId,
    checklistYear,
    credits,
    inserted.rows[0]?.id,
  );

  await pool.query(`UPDATE degree_plans SET updated_at = NOW() WHERE id = $1`, [planId]);

  const { getPlanById } = await import("./planGenerator.js");
  return getPlanById(pool, planId);
}

export async function reconcileComplementaryCoursesAfterCatalogUpload(
  pool: Pool,
  planId: string,
  catalog: ComplementaryCatalog,
): Promise<void> {
  const { getPlanById } = await import("./planGenerator.js");
  const plan = await getPlanById(pool, planId);
  if (!plan) {
    return;
  }

  const hasConsumedStubColumn = await planCoursesHaveConsumedStubColumn(pool);
  const consumedStubByCourseId = new Map<string, string | null>();

  if (hasConsumedStubColumn) {
    const result = await pool.query<{ id: string; consumed_stub_id: string | null }>(
      `SELECT pc.id, pc.consumed_stub_id
       FROM plan_courses pc
       INNER JOIN plan_terms pt ON pt.id = pc.term_id
       WHERE pt.plan_id = $1
         AND pc.entry_kind = 'course'`,
      [planId],
    );
    for (const row of result.rows) {
      consumedStubByCourseId.set(row.id, row.consumed_stub_id);
    }
  }

  const actions = planComplementaryReconciliation(plan.terms, catalog, consumedStubByCourseId);
  if (actions.length === 0) {
    return;
  }

  for (const action of actions) {
    if (action.setSectionLabel) {
      await pool.query(`UPDATE plan_courses SET section_label = $2 WHERE id = $1`, [
        action.courseId,
        "Complementary Studies",
      ]);
    }
    if (action.consumeStub) {
      await consumeComplementaryStubSlot(
        pool,
        planId,
        action.termId,
        action.checklistYear,
        action.credits,
        action.courseId,
      );
    }
  }

  await pool.query(`UPDATE degree_plans SET updated_at = NOW() WHERE id = $1`, [planId]);
}
