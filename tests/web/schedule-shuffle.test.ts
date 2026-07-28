import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toScheduleDay } from "../../apps/web/src/lib/schedule-days";
import type { ScheduleGridEntry } from "../../apps/web/src/lib/schedule-grid";
import {
  enumerateValidSchedules,
  findAlternativeIndex,
  generateCourseBundleOptions,
  generateCourseBundleOptionsForLecture,
  PINNED_PICK_KEY,
} from "../../apps/web/src/lib/schedule-shuffle";
import type { SectionComponentType } from "../../apps/web/src/lib/schedule-sections";
import type { SectionGroup } from "../../apps/web/src/types/course-sections";

const context = { planYear: 1, planSeason: "fall", cdmTerm: "2026-2027 FW" };

function pinnedEntry(courseCode: string, day: string, start: string, end: string): ScheduleGridEntry {
  return {
    id: crypto.randomUUID(),
    course_code: courseCode,
    section_code: "LECT 01",
    component_type: "lec",
    day: toScheduleDay(day),
    start_time: start,
    end_time: end,
    bundle_id: crypto.randomUUID(),
    ...context,
  };
}

describe("generateCourseBundleOptions", () => {
  it("builds lecture and linked tutorial combinations", () => {
    const sections = [
      {
        section_code: "LECT 01 (A)",
        section_group: "A",
        meetings: [{ day: "MON", start_time: "10:00:00", end_time: "11:00:00", duration: null, campus: null, room: null, instructor: null, delivery_mode: null }],
      },
      {
        section_code: "LECT 02 (B)",
        section_group: "B",
        meetings: [{ day: "TUE", start_time: "10:00:00", end_time: "11:00:00", duration: null, campus: null, room: null, instructor: null, delivery_mode: null }],
      },
      {
        section_code: "TUT 01 (A)",
        section_group: "A",
        meetings: [{ day: "WED", start_time: "12:00:00", end_time: "13:00:00", duration: null, campus: null, room: null, instructor: null, delivery_mode: null }],
      },
      {
        section_code: "TUT 02 (B)",
        section_group: "B",
        meetings: [{ day: "THU", start_time: "12:00:00", end_time: "13:00:00", duration: null, campus: null, room: null, instructor: null, delivery_mode: null }],
      },
    ];

    const options = generateCourseBundleOptions("EECS 1011", sections, context);
    assert.equal(options.length, 2);
    assert.ok(options.every((option) => option.entries.length >= 2));
  });
});

describe("generateCourseBundleOptionsForLecture", () => {
  it("keeps the lecture section fixed while varying tutorials", () => {
    const sections = [
      {
        section_code: "LECT 01 (A)",
        section_group: "A",
        meetings: [{ day: "MON", start_time: "10:00:00", end_time: "11:00:00", duration: null, campus: null, room: null, instructor: null, delivery_mode: null }],
      },
      {
        section_code: "LECT 02 (B)",
        section_group: "B",
        meetings: [{ day: "TUE", start_time: "10:00:00", end_time: "11:00:00", duration: null, campus: null, room: null, instructor: null, delivery_mode: null }],
      },
      {
        section_code: "TUT 01 (A)",
        section_group: "A",
        meetings: [{ day: "WED", start_time: "12:00:00", end_time: "13:00:00", duration: null, campus: null, room: null, instructor: null, delivery_mode: null }],
      },
      {
        section_code: "TUT 02 (B)",
        section_group: "B",
        meetings: [{ day: "THU", start_time: "12:00:00", end_time: "13:00:00", duration: null, campus: null, room: null, instructor: null, delivery_mode: null }],
      },
    ];

    const options = generateCourseBundleOptionsForLecture("EECS 1011", sections, "LECT 01 (A)", context);
    assert.ok(options.length >= 1);
    assert.ok(options.every((option) => option.picks.get("lec") === "LECT 01 (A)"));
  });
});

describe("findAlternativeIndex", () => {
  it("returns the index of the current pick set", () => {
    const alternatives = [
      {
        picksByCourse: new Map([["EECS 1011", new Map([["lec", "LECT 01"]])]]),
        entries: [],
      },
      {
        picksByCourse: new Map([["EECS 1011", new Map([["lec", "LECT 02"]])]]),
        entries: [],
      },
    ];
    const current = new Map([["EECS 1011", new Map([["lec", "LECT 02"]])]]);
    assert.equal(findAlternativeIndex(alternatives, current), 1);
  });
});

describe("enumerateValidSchedules", () => {
  const groupA: SectionGroup = {
    course_code: "EECS 1011",
    term: context.cdmTerm,
    title: null,
    sections: [
      {
        section_code: "LECT 01",
        meetings: [{ day: "MON", start_time: "10:00:00", end_time: "11:00:00", duration: null, campus: null, room: null, instructor: null, delivery_mode: null }],
      },
      {
        section_code: "LECT 02",
        meetings: [{ day: "TUE", start_time: "10:00:00", end_time: "11:00:00", duration: null, campus: null, room: null, instructor: null, delivery_mode: null }],
      },
    ],
  };

  const groupB: SectionGroup = {
    course_code: "MATH 1013",
    term: context.cdmTerm,
    title: null,
    sections: [
      {
        section_code: "LECT 01",
        meetings: [{ day: "MON", start_time: "13:00:00", end_time: "14:00:00", duration: null, campus: null, room: null, instructor: null, delivery_mode: null }],
      },
      {
        section_code: "LECT 02",
        meetings: [{ day: "MON", start_time: "10:30:00", end_time: "11:30:00", duration: null, campus: null, room: null, instructor: null, delivery_mode: null }],
      },
    ],
  };

  it("respects pinned courses when searching alternatives", () => {
    const pinned = new Set(["EECS 1011"]);
    const currentPicks = new Map<string, Map<SectionComponentType, string>>([
      ["EECS 1011", new Map([["lec", "LECT 01"]])],
      ["MATH 1013", new Map([["lec", "LECT 01"]])],
    ]);
    const pinnedEntries = [pinnedEntry("EECS 1011", "MON", "10:00", "11:00")];

    const alternatives = enumerateValidSchedules(
      ["EECS 1011", "MATH 1013"],
      pinned,
      [groupA, groupB],
      context.cdmTerm,
      context,
      pinnedEntries,
      currentPicks,
    );

    assert.ok(alternatives.length >= 1);
    for (const alternative of alternatives) {
      const eecsPick = alternative.picksByCourse.get("EECS 1011")?.get("lec");
      assert.equal(eecsPick, "LECT 01");
    }
  });

  it("exposes pinned metadata key for cloud sync", () => {
    assert.equal(PINNED_PICK_KEY, "__pinned");
  });
});
