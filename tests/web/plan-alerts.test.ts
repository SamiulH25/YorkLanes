import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatScheduleAlertsHint,
  formatScheduleWarningDetail,
  progressPercent,
  summarizeComplementaryWarnings,
} from "../../apps/web/src/lib/plan-alerts.ts";
import type { DegreePlan } from "../../apps/web/src/types/plan.ts";

const plan: DegreePlan = {
  id: "p1",
  terms: [
    {
      id: "t1",
      label: "Winter 2026",
      session: "Winter",
      checklist_year: 1,
      sort_order: 1,
      courses: [
        {
          id: "stub-1",
          course_code: "COMP-STUB-1",
          entry_kind: "stub",
          section_label: "Complementary Studies",
          credits: 3,
          sort_order: 0,
        },
      ],
    },
  ],
} as DegreePlan;

describe("formatScheduleAlertsHint", () => {
  it("mentions the flagged season for summer placements", () => {
    const hint = formatScheduleAlertsHint([
      {
        course_id: "c1",
        course_code: "ADMS 1000",
        term_id: "t1",
        term_label: "Summer 2026",
        planned_season: "summer",
        seasons_seen: { fall: true, winter: true, summer: false },
        severity: "warning",
        message: "ADMS 1000 has no recorded Summer offerings (typically Fall / Winter)",
      },
    ]);
    assert.match(hint, /Summer/i);
    assert.doesNotMatch(hint, /Winter has no recorded Winter/i);
  });
});

describe("formatScheduleWarningDetail", () => {
  it("describes summer gaps with usual offerings", () => {
    const detail = formatScheduleWarningDetail({
      course_id: "c1",
      course_code: "ADMS 1000",
      term_id: "t1",
      term_label: "Summer 2026",
      planned_season: "summer",
      seasons_seen: { fall: true, winter: true, summer: false },
      severity: "warning",
      message: "",
    });
    assert.match(detail, /No recorded Summer sections/);
    assert.match(detail, /Usually offered in Fall \/ Winter/);
  });
});

describe("summarizeComplementaryWarnings", () => {
  it("groups stub, credit, and subject warnings", () => {
    const summary = summarizeComplementaryWarnings(
      [
        {
          severity: "warning",
          code: "open_stub",
          message: "Complementary Studies slot (3 cr) is still open.",
          course_id: "stub-1",
        },
        {
          severity: "warning",
          code: "credit_shortfall",
          message: "Complementary studies: 3.0 of 12 required credits planned (9 cr short).",
        },
        {
          severity: "warning",
          code: "subject_area_shortfall",
          message:
            "At least 3 credits must come from approved humanities/social science areas (0 cr planned, 3 cr short).",
        },
      ],
      plan,
    );

    assert.equal(summary.openStubs.length, 1);
    assert.equal(summary.openStubs[0]?.termLabel, "Winter 2026");
    assert.deepEqual(summary.creditProgress, { planned: 3, required: 12 });
    assert.deepEqual(summary.subjectProgress, { planned: 0, required: 3 });
  });
});

describe("progressPercent", () => {
  it("caps at 100", () => {
    assert.equal(progressPercent(15, 12), 100);
    assert.equal(progressPercent(3, 12), 25);
  });
});
