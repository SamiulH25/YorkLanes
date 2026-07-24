import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  baseSectionCode,
  componentLabel,
  filterSectionsForLecture,
  groupSectionsByComponent,
  linksToLectureSection,
  parseSectionComponent,
  sectionBundleKey,
  summarizeWeeklyPattern,
} from "../../apps/web/src/lib/schedule-sections.ts";
import type { CourseSection } from "../../apps/web/src/types/course-sections.ts";

function section(sectionCode: string, sectionGroup?: string | null): CourseSection {
  return {
    section_code: sectionCode,
    section_group: sectionGroup,
    meetings: [
      {
        day: "Monday",
        start_time: "10:00:00",
        end_time: "11:30:00",
        duration: null,
        campus: "Keele",
        room: "TEL 1009",
        instructor: null,
        delivery_mode: null,
      },
    ],
  };
}

describe("baseSectionCode", () => {
  it("strips York bundle suffix from section codes", () => {
    assert.equal(baseSectionCode("LECT 01 (A)"), "LECT 01");
    assert.equal(baseSectionCode("TUTR 02 (A)"), "TUTR 02");
    assert.equal(baseSectionCode("LECT 03"), "LECT 03");
  });
});

describe("sectionBundleKey", () => {
  it("prefers explicit section_group over parsed suffix", () => {
    assert.equal(sectionBundleKey("LECT 01 (A)", "m"), "M");
    assert.equal(sectionBundleKey("LECT 01 (A)"), "A");
    assert.equal(sectionBundleKey("LECT 01"), null);
  });
});

describe("parseSectionComponent", () => {
  it("classifies lecture, tutorial, lab, and seminar tokens", () => {
    assert.deepEqual(parseSectionComponent("LEC 01 (A)"), {
      type: "lec",
      code: "LEC 01",
      suffix: "01",
    });
    assert.deepEqual(parseSectionComponent("TUT 02 (A)"), {
      type: "tut",
      code: "TUT 02",
      suffix: "02",
    });
    assert.deepEqual(parseSectionComponent("LAB 01"), {
      type: "lab",
      code: "LAB 01",
      suffix: "01",
    });
    assert.deepEqual(parseSectionComponent("SEM 03"), {
      type: "sem",
      code: "SEM 03",
      suffix: "03",
    });
  });

  it("returns other for unrecognized prefixes", () => {
    assert.equal(parseSectionComponent("EXAM 01").type, "other");
  });
});

describe("componentLabel", () => {
  it("maps component types to display labels", () => {
    assert.equal(componentLabel("lec"), "Lecture");
    assert.equal(componentLabel("tut"), "Tutorial");
    assert.equal(componentLabel("lab"), "Laboratory");
  });
});

describe("linksToLectureSection", () => {
  it("matches linked components by bundle group", () => {
    assert.equal(
      linksToLectureSection("LECT 01 (A)", "TUTR 02 (A)", "A", "A"),
      true,
    );
    assert.equal(
      linksToLectureSection("LECT 01 (A)", "TUTR 02 (B)", "A", "B"),
      false,
    );
  });

  it("matches tutorial suffix to lecture bundle when only lecture has a group", () => {
    assert.equal(linksToLectureSection("LEC 01 (A)", "TUTR A01", "A", null), true);
    assert.equal(linksToLectureSection("LEC 02 (B)", "TUTR B02", "B", null), true);
    assert.equal(linksToLectureSection("LEC 01 (A)", "TUTR B02", "A", null), false);
  });

  it("matches by shared trailing section number when bundles are absent", () => {
    assert.equal(linksToLectureSection("LECT 01", "TUTR 01"), true);
    assert.equal(linksToLectureSection("LECT 01", "TUTR 02"), false);
  });
});

describe("filterSectionsForLecture", () => {
  it("returns only sections linked to the selected lecture", () => {
    const sections = [
      section("TUTR 02 (A)", "A"),
      section("TUTR 03 (B)", "B"),
      section("LAB 02 (A)", "A"),
    ];

    const linked = filterSectionsForLecture("LECT 01 (A)", sections, "A");
    assert.deepEqual(
      linked.map((item) => item.section_code),
      ["LAB 02 (A)", "TUTR 02 (A)"],
    );
  });

  it("returns all sections when lecture code is blank", () => {
    const sections = [section("TUTR 01"), section("TUTR 02")];
    assert.equal(filterSectionsForLecture("", sections).length, 2);
  });
});

describe("groupSectionsByComponent", () => {
  it("groups and sorts sections in component order", () => {
    const groups = groupSectionsByComponent([
      section("TUTR 02"),
      section("LECT 01"),
      section("LAB 01"),
    ]);

    assert.deepEqual(
      groups.map((group) => group.type),
      ["lec", "tut", "lab"],
    );
    assert.deepEqual(
      groups[0]?.sections.map((item) => item.section_code),
      ["LECT 01"],
    );
  });
});

describe("summarizeWeeklyPattern", () => {
  it("formats meeting days and time ranges", () => {
    const text = summarizeWeeklyPattern(section("LECT 01"));
    assert.equal(text, "MON 10:00–11:30");
  });
});
