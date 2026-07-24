import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignmentDueThisWeekUtcBounds } from "../../apps/api/src/services/assignments.js";

describe("assignmentDueThisWeekUtcBounds", () => {
  it("uses Toronto calendar dates so dashboard windows match the web widget", () => {
    const now = new Date("2025-07-25T10:00:00-04:00");
    const bounds = assignmentDueThisWeekUtcBounds(now);

    assert.equal(bounds.todayUtc, "2025-07-25");
    assert.equal(bounds.weekEndUtc, "2025-08-01");
  });

  it("does not roll to the next day before midnight in Toronto", () => {
    const now = new Date("2025-07-24T22:00:00-04:00");
    const bounds = assignmentDueThisWeekUtcBounds(now);

    assert.equal(bounds.todayUtc, "2025-07-24");
    assert.equal(bounds.weekEndUtc, "2025-07-31");
  });
});
