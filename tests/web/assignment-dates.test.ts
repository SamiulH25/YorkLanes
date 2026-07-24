import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignmentDueThisWeekBounds,
  daysUntilDue,
  dueCalendarDate,
  formatDashboardDueLabel,
  isAssignmentDueInNextWeek,
  isAssignmentDueUrgent,
} from "../../apps/web/src/lib/assignment-dates.ts";

describe("dueCalendarDate", () => {
  it("reads the UTC calendar date from date-only due timestamps", () => {
    assert.equal(dueCalendarDate("2025-07-25T00:00:00.000Z"), "2025-07-25");
    assert.equal(dueCalendarDate("2025-07-25"), "2025-07-25");
  });
});

describe("daysUntilDue", () => {
  it("does not shift date-only deadlines back a day in Toronto", () => {
    const now = new Date("2025-07-24T20:00:00-04:00");
    assert.equal(daysUntilDue("2025-07-25T00:00:00.000Z", now), 1);
  });

  it("labels same-day deadlines as today", () => {
    const now = new Date("2025-07-25T10:00:00-04:00");
    assert.equal(daysUntilDue("2025-07-25T00:00:00.000Z", now), 0);
  });
});

describe("formatDashboardDueLabel", () => {
  it("shows Tomorrow for next-day UTC midnight deadlines", () => {
    const now = new Date("2025-07-24T20:00:00-04:00");
    assert.equal(formatDashboardDueLabel("2025-07-25T00:00:00.000Z", now), "Tomorrow");
  });

  it("shows Today for same-day deadlines", () => {
    const now = new Date("2025-07-25T10:00:00-04:00");
    assert.equal(formatDashboardDueLabel("2025-07-25T00:00:00.000Z", now), "Today");
  });
});

describe("isAssignmentDueUrgent", () => {
  it("treats today and tomorrow as urgent", () => {
    const today = new Date("2025-07-25T10:00:00-04:00");
    assert.equal(isAssignmentDueUrgent("2025-07-25T00:00:00.000Z", today), true);
    assert.equal(isAssignmentDueUrgent("2025-07-26T00:00:00.000Z", today), true);
    assert.equal(isAssignmentDueUrgent("2025-07-27T00:00:00.000Z", today), false);
  });
});

describe("assignmentDueThisWeekBounds", () => {
  it("matches the API dashboard window on late Toronto evenings", () => {
    const now = new Date("2025-07-24T22:00:00-04:00");
    const bounds = assignmentDueThisWeekBounds(now);

    assert.equal(bounds.today, "2025-07-24");
    assert.equal(bounds.weekEnd, "2025-07-31");
    assert.equal(isAssignmentDueInNextWeek("2025-07-24T00:00:00.000Z", now), true);
    assert.equal(isAssignmentDueInNextWeek("2025-07-31T00:00:00.000Z", now), false);
  });
});
