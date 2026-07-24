import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyComplementaryCourse,
  computeComplementaryWarnings,
  extractComplementaryStubOptionCodes,
  isComplementaryReconciliationCandidate,
  matchesComplementarySearch,
  pickComplementaryStubToConsume,
  planComplementaryReconciliation,
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

  it("matches subject prefix queries like econ", () => {
    const econCatalog: ComplementaryCatalog = {
      ...catalog,
      listed_courses: [
        { code: "ADMS 2510", credits: 3, raw: "AP/ADMS 2510 3.00", counts_as_subject_area: false },
        { code: "ECON 1000", credits: 3, raw: "AP/ECON 1000 3.00*", counts_as_subject_area: true },
        {
          code: "HUMA 1170",
          credits: 3,
          raw: "AP/HUMA 1170 3.00 Recommended for economics students",
          counts_as_subject_area: true,
        },
      ],
    };

    const results = searchComplementaryCatalog(econCatalog, "econ", 10);
    assert.equal(results.length, 1);
    assert.equal(results[0]?.code, "ECON 1000");
  });

  it("matches EECS subject prefix without matching BIOL prerequisite mentions", () => {
    const mixedCatalog: ComplementaryCatalog = {
      ...catalog,
      listed_courses: [
        { code: "EECS 1011", credits: 3, raw: "LE/EECS 1011 3.00", counts_as_subject_area: false },
        {
          code: "BIOL 1000",
          credits: 3,
          raw: "AP/BIOL 1000 3.00 Prerequisites: LE/EECS 1011 3.00",
          counts_as_subject_area: false,
        },
      ],
    };

    assert.equal(matchesComplementarySearch(mixedCatalog.listed_courses[0]!, "eecs"), true);
    assert.equal(matchesComplementarySearch(mixedCatalog.listed_courses[1]!, "eecs"), false);

    const results = searchComplementaryCatalog(mixedCatalog, "eecs", 10);
    assert.deepEqual(results.map((course) => course.code), ["EECS 1011"]);
  });

  it("matches subject and number tokens like econ 1000", () => {
    const econCatalog: ComplementaryCatalog = {
      ...catalog,
      listed_courses: [
        { code: "ADMS 2510", credits: 3, raw: "AP/ADMS 2510 3.00", counts_as_subject_area: false },
        { code: "ECON 1000", credits: 3, raw: "AP/ECON 1000 3.00*", counts_as_subject_area: true },
      ],
    };

    const results = searchComplementaryCatalog(econCatalog, "econ 1000", 10);
    assert.equal(results.length, 1);
    assert.equal(results[0]?.code, "ECON 1000");
  });

  it("excludes unrelated courses when filtering multi-token queries", () => {
    const mixedCatalog: ComplementaryCatalog = {
      ...catalog,
      listed_courses: Array.from({ length: 43 }, (_, index) => ({
        code: `ADMS ${2510 + index * 10}`,
        credits: 3,
        raw: `AP/ADMS ${2510 + index * 10} 3.00`,
        counts_as_subject_area: false,
      })).concat({
        code: "ECON 1000",
        credits: 3,
        raw: "AP/ECON 1000 3.00*",
        counts_as_subject_area: true,
      }),
    };

    const results = searchComplementaryCatalog(mixedCatalog, "econ 1000", 12);
    assert.equal(results.length, 1);
    assert.equal(results[0]?.code, "ECON 1000");
  });

  it("returns a limited default list for an empty query", () => {
    const browseCatalog: ComplementaryCatalog = {
      ...catalog,
      listed_courses: Array.from({ length: 20 }, (_, index) => ({
        code: `ADMS ${1000 + index}`,
        credits: 3,
        raw: "",
        counts_as_subject_area: false,
      })),
    };

    const results = searchComplementaryCatalog(browseCatalog, "", 12);
    assert.equal(results.length, 12);
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

describe("extractComplementaryStubOptionCodes", () => {
  it("parses option codes from complementary stub titles", () => {
    const codes = extractComplementaryStubOptionCodes({
      entry_kind: "stub",
      course_code: "COMPLEMENTARY",
      section_label: "Complementary Studies",
      title: "HUMA 1110, HUMA 1120, SOCI 2030",
    });

    assert.deepEqual(codes, ["HUMA 1110", "HUMA 1120", "SOCI 2030"]);
  });
});

describe("planComplementaryReconciliation", () => {
  it("labels valid courses in complementary terms and plans stub consumption", () => {
    const actions = planComplementaryReconciliation(
      [
        term("t1", [
          course({
            id: "stub-1",
            course_code: "COMPLEMENTARY",
            entry_kind: "stub",
            section_label: "Complementary Studies",
            credits: 6,
          }),
          course({
            id: "c1",
            course_code: "ADMS 1000",
            section_label: null,
          }),
        ]),
      ],
      catalog,
    );

    assert.deepEqual(actions, [
      {
        courseId: "c1",
        termId: "t1",
        checklistYear: 2,
        courseCode: "ADMS 1000",
        credits: 3,
        setSectionLabel: true,
        consumeStub: true,
      },
    ]);
  });

  it("consumes stubs for already-labeled valid complementary courses", () => {
    const actions = planComplementaryReconciliation(
      [
        term("t1", [
          course({
            id: "stub-1",
            course_code: "COMPLEMENTARY",
            entry_kind: "stub",
            section_label: "Complementary Studies",
            credits: 3,
          }),
          course({
            id: "c1",
            course_code: "ADMS 1000",
            section_label: "Complementary Studies",
          }),
        ]),
      ],
      catalog,
    );

    assert.deepEqual(actions, [
      {
        courseId: "c1",
        termId: "t1",
        checklistYear: 2,
        courseCode: "ADMS 1000",
        credits: 3,
        setSectionLabel: false,
        consumeStub: true,
      },
    ]);
  });

  it("skips required major courses with parser section labels", () => {
    const actions = planComplementaryReconciliation(
      [
        term("t1", [
          course({
            id: "stub-1",
            course_code: "COMPLEMENTARY",
            entry_kind: "stub",
            section_label: "Complementary Studies",
            credits: 6,
          }),
          course({
            id: "c1",
            course_code: "EECS 3221",
            section_label: "Stream / Specialization",
          }),
        ]),
      ],
      catalog,
    );

    assert.deepEqual(actions, []);
  });

  it("labels courses that match complementary stub option codes", () => {
    const actions = planComplementaryReconciliation(
      [
        term("t1", [
          course({
            id: "stub-1",
            course_code: "COMPLEMENTARY",
            entry_kind: "stub",
            section_label: "Complementary Studies",
            title: "HUMA 3226, PHIL 2010",
            credits: 3,
          }),
          course({
            id: "c1",
            course_code: "HUMA 3226",
            section_label: null,
          }),
        ]),
      ],
      catalog,
    );

    assert.deepEqual(actions, [
      {
        courseId: "c1",
        termId: "t1",
        checklistYear: 2,
        courseCode: "HUMA 3226",
        credits: 3,
        setSectionLabel: true,
        consumeStub: true,
      },
    ]);
  });

  it("does not label invalid courses even when they sit in complementary terms", () => {
    const actions = planComplementaryReconciliation(
      [
        term("t1", [
          course({
            id: "stub-1",
            course_code: "COMPLEMENTARY",
            entry_kind: "stub",
            section_label: "Complementary Studies",
            credits: 6,
          }),
          course({
            id: "c1",
            course_code: "EECS 1028",
            section_label: null,
          }),
        ]),
      ],
      catalog,
    );

    assert.deepEqual(actions, []);
  });

  it("does not consume stubs when the course already consumed one", () => {
    const actions = planComplementaryReconciliation(
      [
        term("t1", [
          course({
            id: "stub-1",
            course_code: "COMPLEMENTARY",
            entry_kind: "stub",
            section_label: "Complementary Studies",
            credits: 3,
          }),
          course({
            id: "c1",
            course_code: "ADMS 1000",
            section_label: "Complementary Studies",
          }),
        ]),
      ],
      catalog,
      new Map([["c1", "stub-1"]]),
    );

    assert.deepEqual(actions, []);
  });
});

describe("isComplementaryReconciliationCandidate", () => {
  it("treats unlabeled courses in complementary terms as candidates", () => {
    const planTerms = [
      term("t1", [
        course({
          id: "stub-1",
          course_code: "COMPLEMENTARY",
          entry_kind: "stub",
          section_label: "Complementary Studies",
        }),
        course({ id: "c1", course_code: "ADMS 1000", section_label: null }),
      ]),
    ];
    const context = {
      optionCodesByChecklistYear: new Map<number, Set<string>>(),
      complementaryStubYears: new Set([2]),
      complementaryTermIds: new Set(["t1"]),
    };

    assert.equal(
      isComplementaryReconciliationCandidate(planTerms[0]!.courses[1]!, planTerms[0]!, context),
      true,
    );
  });
});
