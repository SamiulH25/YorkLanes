import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  nextOccurredOn,
  normalizeRecurrence,
  recurrenceLabel,
} from "../../apps/api/src/services/financeRecurrence.js";

describe("normalizeRecurrence (FR-FIN-06)", () => {
  it("accepts known recurrence values and defaults unknowns to none", () => {
    assert.equal(normalizeRecurrence("weekly"), "weekly");
    assert.equal(normalizeRecurrence("Monthly"), "monthly");
    assert.equal(normalizeRecurrence("YEARLY"), "yearly");
    assert.equal(normalizeRecurrence("none"), "none");
    assert.equal(normalizeRecurrence("daily"), "none");
    assert.equal(normalizeRecurrence(""), "none");
    assert.equal(normalizeRecurrence(null), "none");
  });
});

describe("recurrenceLabel (FR-FIN-06)", () => {
  it("returns UI labels", () => {
    assert.equal(recurrenceLabel("none"), "One-time");
    assert.equal(recurrenceLabel("weekly"), "Weekly");
    assert.equal(recurrenceLabel("monthly"), "Monthly");
    assert.equal(recurrenceLabel("yearly"), "Yearly");
  });
});

describe("nextOccurredOn (FR-FIN-06)", () => {
  it("returns null for one-time or invalid dates", () => {
    assert.equal(nextOccurredOn("2026-07-01", "none"), null);
    assert.equal(nextOccurredOn("not-a-date", "monthly"), null);
  });

  it("advances weekly by seven days", () => {
    assert.equal(nextOccurredOn("2026-07-01", "weekly"), "2026-07-08");
  });

  it("advances monthly and clamps end-of-month days", () => {
    assert.equal(nextOccurredOn("2026-01-31", "monthly"), "2026-02-28");
    assert.equal(nextOccurredOn("2026-07-15", "monthly"), "2026-08-15");
  });

  it("advances yearly and clamps leap-day style lengths", () => {
    assert.equal(nextOccurredOn("2024-02-29", "yearly"), "2025-02-28");
    assert.equal(nextOccurredOn("2026-07-01", "yearly"), "2027-07-01");
  });
});
