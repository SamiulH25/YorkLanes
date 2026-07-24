import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeEventLayout,
  convertTimeToMinutes,
  courseBundleKey,
  entryKey,
  formatTimeRange,
  gridHours,
  meetingsOverlap,
  ROW_HEIGHT,
  SCHEDULE_START_HOUR,
  sectionSelectionKey,
  weekStorageKey,
} from "../../apps/web/src/lib/schedule-grid.ts";

describe("weekStorageKey", () => {
  it("builds a stable key from plan year, season, and CDM term", () => {
    assert.equal(weekStorageKey(2026, "fall", "2026-2027 FW"), "2026|fall|2026-2027 FW");
  });
});

describe("convertTimeToMinutes", () => {
  it("converts HH:MM times to minutes since midnight", () => {
    assert.equal(convertTimeToMinutes("08:30"), 8 * 60 + 30);
    assert.equal(convertTimeToMinutes("13:15"), 13 * 60 + 15);
  });
});

describe("formatTimeRange", () => {
  it("formats 24-hour times as 12-hour clock ranges", () => {
    assert.equal(formatTimeRange("09:00", "10:30"), "9:00 AM – 10:30 AM");
    assert.equal(formatTimeRange("13:00", "15:00"), "1:00 PM – 3:00 PM");
  });
});

describe("computeEventLayout", () => {
  const days = ["Monday", "Tuesday", "Wednesday"] as const;

  it("positions events within the visible schedule window", () => {
    const layout = computeEventLayout("Tuesday", "10:00", "11:30", days);
    assert.ok(layout);
    assert.equal(layout.dayIndex, 1);
    assert.equal(layout.top, ((10 - SCHEDULE_START_HOUR) * 60) / 60 * ROW_HEIGHT);
    assert.equal(layout.height, Math.max(((90) / 60) * ROW_HEIGHT, 44));
  });

  it("returns null for events outside the grid or unknown days", () => {
    assert.equal(computeEventLayout("Saturday", "10:00", "11:00", days), null);
    assert.equal(computeEventLayout("Monday", "07:00", "08:00", days), null);
    assert.equal(computeEventLayout("Monday", "18:00", "20:00", days), null);
  });
});

describe("gridHours", () => {
  it("returns one label per hour in the schedule window", () => {
    const hours = gridHours();
    assert.equal(hours[0], "8:00 AM");
    assert.equal(hours.at(-1), "7:00 PM");
    assert.equal(hours.length, 12);
  });
});

describe("meetingsOverlap", () => {
  it("detects overlapping meetings on the same day", () => {
    const a = { day: "Monday", start_time: "10:00", end_time: "11:00" };
    const b = { day: "Monday", start_time: "10:30", end_time: "11:30" };
    const c = { day: "Tuesday", start_time: "10:30", end_time: "11:30" };

    assert.equal(meetingsOverlap(a, b), true);
    assert.equal(meetingsOverlap(a, c), false);
  });
});

describe("key helpers", () => {
  it("normalizes course bundle keys", () => {
    assert.equal(courseBundleKey(" eecs 1011 "), "EECS 1011");
  });

  it("builds stable entry and selection keys", () => {
    const entry = {
      course_code: "EECS 1011",
      section_code: "LECT 01",
      day: "Monday",
      start_time: "10:00",
    };

    assert.equal(entryKey(entry), "EECS 1011|LECT 01|Monday|10:00");
    assert.equal(sectionSelectionKey("EECS 1011", "LECT 01"), "EECS 1011|LECT 01");
  });
});
