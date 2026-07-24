import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  seasonFromPlanSession,
  seasonsFromScrapedTerm,
  seasonOffered,
  emptySeasonFlags,
  mergeSeasonFlags,
} from "./termSeason.js";

describe("seasonFromPlanSession", () => {
  it("maps plan term sessions to seasons", () => {
    assert.equal(seasonFromPlanSession("Fall"), "fall");
    assert.equal(seasonFromPlanSession("Winter"), "winter");
    assert.equal(seasonFromPlanSession("Summer"), "summer");
    assert.equal(seasonFromPlanSession("F"), "fall");
    assert.equal(seasonFromPlanSession("W"), "winter");
    assert.equal(seasonFromPlanSession("S"), "summer");
  });
});

describe("seasonsFromScrapedTerm", () => {
  it("maps scraped term codes to seasons (year-independent)", () => {
    assert.deepEqual(seasonsFromScrapedTerm("2026-2027 FW"), ["fall", "winter"]);
    assert.deepEqual(seasonsFromScrapedTerm("2026 S"), ["summer"]);
    assert.deepEqual(seasonsFromScrapedTerm("2026 F"), ["fall"]);
    assert.deepEqual(seasonsFromScrapedTerm("2027 W"), ["winter"]);
  });

  it("treats FW as both fall and winter for offering history", () => {
    const flags = emptySeasonFlags();
    mergeSeasonFlags(flags, seasonsFromScrapedTerm("2025-2026 FW"));
    assert.equal(seasonOffered(flags, "fall"), true);
    assert.equal(seasonOffered(flags, "winter"), true);
    assert.equal(seasonOffered(flags, "summer"), false);
  });
});
