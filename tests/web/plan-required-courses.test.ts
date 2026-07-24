import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isRequiredPlanCourse,
  reconcileMissingRequiredCourses,
} from "../../apps/web/src/lib/plan-required-courses.ts";

describe("isRequiredPlanCourse", () => {
  it("treats concrete checklist courses as required", () => {
    assert.equal(
      isRequiredPlanCourse({ entry_kind: "course", section_label: null }),
      true,
    );
    assert.equal(
      isRequiredPlanCourse({ entry_kind: "course", section_label: "Core" }),
      true,
    );
  });

  it("excludes stubs and complementary placements", () => {
    assert.equal(
      isRequiredPlanCourse({ entry_kind: "stub", section_label: "Elective" }),
      false,
    );
    assert.equal(
      isRequiredPlanCourse({
        entry_kind: "course",
        section_label: "Complementary Studies",
      }),
      false,
    );
  });
});

describe("reconcileMissingRequiredCourses", () => {
  it("drops entries that are back on the plan", () => {
    const stored = [
      { code: "EECS 2030", title: "Intro", formerTermId: "term-1" },
      { code: "MATH 1013", title: "Calc", formerTermId: "term-2" },
    ];
    const planned = new Set(["EECS 2030"]);
    assert.deepEqual(reconcileMissingRequiredCourses(stored, planned), [
      { code: "MATH 1013", title: "Calc", formerTermId: "term-2" },
    ]);
  });
});
