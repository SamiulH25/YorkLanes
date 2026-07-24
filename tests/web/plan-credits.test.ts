import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCredits,
  formatTermCredits,
  formatYearCredits,
  summarizeChecklistYear,
  summarizeTerm,
} from "../../apps/web/src/lib/plan-credits.ts";
import type { PlanCourse, PlanTerm } from "../../apps/web/src/types/plan.ts";

function course(overrides: Partial<PlanCourse> & Pick<PlanCourse, "id" | "course_code">): PlanCourse {
  return {
    credits: 3,
    title: null,
    checklist_year: 1,
    sort_order: 0,
    entry_kind: "course",
    section_label: null,
    completed: false,
    ...overrides,
  };
}

function term(overrides: Partial<PlanTerm> & Pick<PlanTerm, "id">): PlanTerm {
  return {
    label: "Fall 2026",
    session: "Fall",
    academic_year: 2026,
    checklist_year: 1,
    sort_order: 0,
    courses: [],
    ...overrides,
  };
}

describe("summarizeTerm", () => {
  it("sums numeric credits and skips stubs", () => {
    const summary = summarizeTerm(
      term({
        id: "t1",
        courses: [
          course({ id: "c1", course_code: "EECS 1011", credits: 3 }),
          course({ id: "c2", course_code: "MATH 1013", credits: 6 }),
          course({
            id: "s1",
            course_code: "Elective",
            entry_kind: "stub",
            credits: null,
          }),
        ],
      }),
    );

    assert.deepEqual(summary, {
      concreteCredits: 9,
      stubSlots: 1,
      courseCount: 2,
      completedCredits: 0,
    });
  });

  it("coerces string credits from API JSON", () => {
    const summary = summarizeTerm(
      term({
        id: "t1",
        courses: [
          course({ id: "c1", course_code: "EECS 1011", credits: "3" as unknown as number }),
          course({ id: "c2", course_code: "EECS 2030", credits: "6.0" as unknown as number }),
        ],
      }),
    );

    assert.equal(summary.concreteCredits, 9);
    assert.equal(summary.courseCount, 2);
  });

  it("treats invalid credits as zero", () => {
    const summary = summarizeTerm(
      term({
        id: "t1",
        courses: [
          course({ id: "c1", course_code: "BAD", credits: "n/a" as unknown as number }),
          course({ id: "c2", course_code: "NULL", credits: null }),
        ],
      }),
    );

    assert.equal(summary.concreteCredits, 0);
    assert.equal(summary.courseCount, 2);
  });

  it("counts completed credits separately", () => {
    const summary = summarizeTerm(
      term({
        id: "t1",
        courses: [
          course({ id: "c1", course_code: "EECS 1011", credits: 3, completed: true }),
          course({ id: "c2", course_code: "EECS 2030", credits: 3, completed: false }),
        ],
      }),
    );

    assert.equal(summary.concreteCredits, 6);
    assert.equal(summary.completedCredits, 3);
  });
});

describe("summarizeChecklistYear", () => {
  it("aggregates only terms in the requested checklist year", () => {
    const terms = [
      term({
        id: "y1-fall",
        checklist_year: 1,
        courses: [course({ id: "c1", course_code: "EECS 1011", credits: 3 })],
      }),
      term({
        id: "y1-winter",
        checklist_year: 1,
        courses: [course({ id: "c2", course_code: "MATH 1013", credits: 6 })],
      }),
      term({
        id: "y2-fall",
        checklist_year: 2,
        courses: [course({ id: "c3", course_code: "EECS 2030", credits: 3 })],
      }),
    ];

    const yearOne = summarizeChecklistYear(terms, 1);
    assert.equal(yearOne.concreteCredits, 9);
    assert.equal(yearOne.courseCount, 2);

    const yearTwo = summarizeChecklistYear(terms, 2);
    assert.equal(yearTwo.concreteCredits, 3);
    assert.equal(yearTwo.courseCount, 1);
  });
});

describe("formatCredits", () => {
  it("formats integers without decimals", () => {
    assert.equal(formatCredits(3), "3");
    assert.equal(formatCredits("6"), "6");
  });

  it("formats fractional credits with one decimal", () => {
    assert.equal(formatCredits(1.5), "1.5");
    assert.equal(formatCredits("4.5"), "4.5");
  });

  it("falls back to zero for nullish or invalid values", () => {
    assert.equal(formatCredits(null), "0");
    assert.equal(formatCredits(undefined), "0");
    assert.equal(formatCredits("oops"), "0");
  });
});

describe("formatYearCredits", () => {
  it("joins credits, course count, and optional open slots", () => {
    assert.equal(
      formatYearCredits({
        concreteCredits: 9,
        stubSlots: 0,
        courseCount: 3,
        completedCredits: 0,
      }),
      "9 cr · 3 courses",
    );

    assert.equal(
      formatYearCredits({
        concreteCredits: 6,
        stubSlots: 2,
        courseCount: 2,
        completedCredits: 0,
      }),
      "6 cr · 2 courses · 2 open slots",
    );

    assert.equal(
      formatYearCredits({
        concreteCredits: 3,
        stubSlots: 1,
        courseCount: 1,
        completedCredits: 0,
      }),
      "3 cr · 1 course · 1 open slot",
    );
  });
});

describe("formatTermCredits", () => {
  it("shows stub slots in parentheses", () => {
    assert.equal(
      formatTermCredits({
        concreteCredits: 9,
        stubSlots: 0,
        courseCount: 3,
        completedCredits: 0,
      }),
      "9 cr",
    );

    assert.equal(
      formatTermCredits({
        concreteCredits: 6,
        stubSlots: 1,
        courseCount: 2,
        completedCredits: 0,
      }),
      "6 cr (+1 slot)",
    );
  });
});
