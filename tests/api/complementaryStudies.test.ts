import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyComplementaryCourse,
  computeComplementaryWarnings,
  pickComplementaryStubToConsume,
  planComplementaryStubRestoration,
  searchComplementaryCatalog,
  type ComplementaryCatalog,
} from "../../apps/api/src/services/complementaryStudies.js";
import type { PlanCourseRow, PlanTermRow } from "../../apps/api/src/services/planGenerator.js";

const catalog: ComplementaryCatalog = {
  programme_hint: "BEng General Education",
  rules: { total_credits: 12, min_subject_area_credits: 3 },
  subject_areas: [
    { name: "Philosophy", prefixes: ["PHIL"] },
    { name: "History", prefixes: ["HIST"] },
  ],
  listed_courses: [
    { code: "ADMS 1000", credits: 3, raw: "AP/ADMS 1000 3.00", counts_as_subject_area: false },
    { code: "HUMA 3226", credits: 3, raw: "AP/HUMA 3226 3.00*", counts_as_subject_area: true },
  ],
  warnings: [],
};

function course(
  overrides: Partial<PlanCourseRow> & Pick<PlanCourseRow, "id" | "course_code">,
): PlanCourseRow {
  return {
    credits: 3,
    title: null,
    checklist_year: 2,
    sort_order: 0,
    entry_kind: "course",
    section_label: null,
    completed: false,
    ...overrides,
  };
}

function term(id: string, courses: PlanCourseRow[]): PlanTermRow {
  return {
    id,
    label: "Winter 2027",
    session: "Winter",
    academic_year: 2027,
    checklist_year: 2,
    sort_order: 1,
    courses,
  };
}

describe("classifyComplementaryCourse", () => {
  it("recognizes listed courses and subject-area prefixes", () => {
    assert.equal(classifyComplementaryCourse("ADMS 1000", catalog).valid, true);
    assert.equal(classifyComplementaryCourse("HUMA 3226", catalog).countsAsSubjectArea, true);
    assert.equal(classifyComplementaryCourse("PHIL 2010", catalog).countsAsSubjectArea, true);
    assert.equal(classifyComplementaryCourse("EECS 1028", catalog).valid, false);
  });
});

describe("searchComplementaryCatalog", () => {
  it("filters listed courses by code fragment", () => {
    const results = searchComplementaryCatalog(catalog, "adms", 10);
    assert.equal(results.length, 1);
    assert.equal(results[0]?.code, "ADMS 1000");
  });
});

describe("pickComplementaryStubToConsume", () => {
  it("deletes an exact-match stub in the preferred term", () => {
    const result = pickComplementaryStubToConsume(
      [
        { id: "stub-a", credits: 3, sort_order: 0, term_id: "term-a" },
        { id: "stub-b", credits: 3, sort_order: 1, term_id: "term-a" },
      ],
      3,
      "term-a",
    );

    assert.deepEqual(result, { action: "delete", id: "stub-a" });
  });

  it("decrements a larger stub instead of deleting it", () => {
    const result = pickComplementaryStubToConsume(
      [{ id: "stub-a", credits: 6, sort_order: 0, term_id: "term-a" }],
      3,
      "term-a",
    );

    assert.deepEqual(result, { action: "decrement", id: "stub-a", newCredits: 3 });
  });

  it("prefers stubs in the target term over the same checklist year", () => {
    const result = pickComplementaryStubToConsume(
      [
        { id: "stub-other", credits: 3, sort_order: 0, term_id: "term-b" },
        { id: "stub-target", credits: 3, sort_order: 1, term_id: "term-a" },
      ],
      3,
      "term-a",
    );

    assert.deepEqual(result, { action: "delete", id: "stub-target" });
  });
});

describe("planComplementaryStubRestoration", () => {
  it("re-inserts a stub when a fully consumed slot is removed", () => {
    assert.deepEqual(planComplementaryStubRestoration(null, false, 3, 4), {
      action: "insert",
      credits: 3,
      sortOrder: 4,
    });
  });

  it("increments a partial stub when a decrement-consumed course is removed", () => {
    assert.deepEqual(planComplementaryStubRestoration("stub-a", true, 3, 4), {
      action: "increment",
      stubId: "stub-a",
      credits: 3,
    });
  });

  it("re-inserts when the consumed stub row no longer exists", () => {
    assert.deepEqual(planComplementaryStubRestoration("stub-a", false, 6, 2), {
      action: "insert",
      credits: 6,
      sortOrder: 2,
    });
  });

  it("defaults missing course credits to 3 on insert", () => {
    assert.deepEqual(planComplementaryStubRestoration(null, false, 0, 1), {
      action: "insert",
      credits: 3,
      sortOrder: 1,
    });
  });
});

describe("computeComplementaryWarnings", () => {
  it("prompts for upload when no catalogue exists", () => {
    const warnings = computeComplementaryWarnings([], null);
    assert.equal(warnings[0]?.code, "no_catalog");
  });

  it("warns about open stubs and credit shortfall", () => {
    const warnings = computeComplementaryWarnings(
      [
        term("t1", [
          course({
            id: "stub-1",
            course_code: "COMPLEMENTARY",
            entry_kind: "stub",
            section_label: "Complementary Studies",
            credits: 6,
          }),
        ]),
      ],
      catalog,
    );

    assert.ok(warnings.some((warning) => warning.code === "open_stub"));
    assert.ok(warnings.some((warning) => warning.code === "credit_shortfall"));
  });

  it("does not warn about open stubs once a complementary course replaces the slot", () => {
    const warnings = computeComplementaryWarnings(
      [
        term("t1", [
          course({
            id: "c1",
            course_code: "ADMS 1000",
            section_label: "Complementary Studies",
            credits: 3,
          }),
        ]),
      ],
      catalog,
    );

    assert.ok(!warnings.some((warning) => warning.code === "open_stub"));
    assert.ok(warnings.some((warning) => warning.code === "credit_shortfall"));
  });

  it("flags courses outside the approved complementary list", () => {
    const warnings = computeComplementaryWarnings(
      [
        term("t1", [
          course({
            id: "c1",
            course_code: "EECS 1028",
            section_label: "Complementary Studies",
          }),
        ]),
      ],
      catalog,
    );

    assert.ok(warnings.some((warning) => warning.code === "not_approved"));
  });

  it("does not flag required stream courses that share a term with complementary stubs", () => {
    const warnings = computeComplementaryWarnings(
      [
        term("y3-winter", [
          course({
            id: "c1",
            course_code: "EECS 3221",
            section_label: "Stream / Specialization",
            credits: 3,
          }),
          course({
            id: "stub-1",
            course_code: "COMPLEMENTARY",
            entry_kind: "stub",
            section_label: "Complementary Studies",
            credits: 9,
          }),
        ]),
      ],
      catalog,
    );

    assert.ok(!warnings.some((warning) => warning.code === "not_approved"));
    assert.ok(warnings.some((warning) => warning.code === "open_stub"));
  });

  it("ignores parser section headers on required year-4 courses", () => {
    const warnings = computeComplementaryWarnings(
      [
        term("y4-winter", [
          course({
            id: "c1",
            course_code: "EECS 4312",
            section_label: "Complementary Studies (9 credits)",
            credits: 3,
          }),
          course({
            id: "c2",
            course_code: "ENG 4000",
            section_label: "Complementary Studies (9 credits)",
            credits: 6,
          }),
          course({
            id: "stub-1",
            course_code: "COMPLEMENTARY",
            entry_kind: "stub",
            section_label: "Complementary Studies",
            credits: 3,
          }),
        ]),
      ],
      catalog,
    );

    assert.ok(!warnings.some((warning) => warning.code === "not_approved"));
    assert.ok(warnings.some((warning) => warning.code === "open_stub"));
    assert.ok(warnings.some((warning) => warning.code === "credit_shortfall"));
  });

  it("tracks subject-area credit minimums", () => {
    const warnings = computeComplementaryWarnings(
      [
        term("t1", [
          course({
            id: "c1",
            course_code: "ADMS 1000",
            section_label: "Complementary Studies",
            credits: 3,
          }),
          course({
            id: "c2",
            course_code: "ADMS 1010",
            section_label: "Complementary Studies",
            credits: 3,
          }),
          course({
            id: "c3",
            course_code: "ADMS 2110",
            section_label: "Complementary Studies",
            credits: 3,
          }),
          course({
            id: "c4",
            course_code: "ADMS 2210",
            section_label: "Complementary Studies",
            credits: 3,
          }),
        ]),
      ],
      {
        ...catalog,
        listed_courses: [
          ...catalog.listed_courses,
          { code: "ADMS 1010", credits: 3, raw: "", counts_as_subject_area: false },
          { code: "ADMS 2110", credits: 3, raw: "", counts_as_subject_area: false },
          { code: "ADMS 2210", credits: 3, raw: "", counts_as_subject_area: false },
        ],
      },
    );

    assert.ok(warnings.some((warning) => warning.code === "subject_area_shortfall"));
    assert.ok(!warnings.some((warning) => warning.code === "credit_shortfall"));
  });
});
