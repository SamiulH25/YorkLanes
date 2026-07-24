import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CourseSeasonHistory } from "./courseOfferings.js";
import { computeScheduleWarnings, type CoursePlacement } from "./planGraph.js";

function history(seasons: Partial<CourseSeasonHistory["seasons"]>): CourseSeasonHistory {
  return {
    course_code: "EECS 1028",
    has_history: true,
    seasons: {
      fall: seasons.fall ?? false,
      winter: seasons.winter ?? false,
      summer: seasons.summer ?? false,
    },
    terms_seen: ["2026 S"],
  };
}

describe("computeScheduleWarnings", () => {
  const terms = [
    { id: "term-fall", session: "Fall", label: "Fall 2026" },
    { id: "term-winter", session: "Winter", label: "Winter 2027" },
    { id: "term-summer", session: "Summer", label: "Summer 2026" },
  ];

  const placement = (
    overrides: Partial<CoursePlacement> & Pick<CoursePlacement, "course_id" | "term_id">,
  ): CoursePlacement => ({
    course_code: "EECS 1028",
    term_label: "Fall 2026",
    term_sort_order: 0,
    sort_order: 0,
    entry_kind: "course",
    section_label: null,
    completed: false,
    ...overrides,
  });

  it("warns when a summer-only course is placed in winter", () => {
    const seasonHistory = new Map<string, CourseSeasonHistory>([
      ["EECS 1028", history({ summer: true })],
    ]);

    const warnings = computeScheduleWarnings(
      [placement({ course_id: "c1", term_id: "term-winter", term_label: "Winter 2027" })],
      terms,
      seasonHistory,
    );

    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.planned_season, "winter");
    assert.match(warnings[0]?.message ?? "", /no recorded Winter offerings/i);
  });

  it("does not warn when the course has FW history in the planned fall slot", () => {
    const seasonHistory = new Map<string, CourseSeasonHistory>([
      ["EECS 1028", history({ fall: true, winter: true })],
    ]);

    const warnings = computeScheduleWarnings(
      [placement({ course_id: "c1", term_id: "term-fall" })],
      terms,
      seasonHistory,
    );

    assert.equal(warnings.length, 0);
  });

  it("skips courses with no scraped offering history", () => {
    const seasonHistory = new Map<string, CourseSeasonHistory>([
      [
        "EECS 1028",
        {
          course_code: "EECS 1028",
          has_history: false,
          seasons: { fall: false, winter: false, summer: false },
          terms_seen: [],
        },
      ],
    ]);

    const warnings = computeScheduleWarnings(
      [placement({ course_id: "c1", term_id: "term-summer", term_label: "Summer 2026" })],
      terms,
      seasonHistory,
    );

    assert.equal(warnings.length, 0);
  });

  it("ignores stubs and non-concrete course codes", () => {
    const seasonHistory = new Map<string, CourseSeasonHistory>([
      ["EECS 1028", history({ summer: true })],
    ]);

    const warnings = computeScheduleWarnings(
      [
        placement({
          course_id: "stub-1",
          term_id: "term-winter",
          course_code: "Complementary studies elective",
          entry_kind: "stub",
        }),
      ],
      terms,
      seasonHistory,
    );

    assert.equal(warnings.length, 0);
  });
});
