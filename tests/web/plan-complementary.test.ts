import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planExpectsComplementaryStudies } from "../../apps/web/src/lib/plan-complementary.ts";

describe("planExpectsComplementaryStudies", () => {
  it("returns true for BEng programme names", () => {
    assert.equal(
      planExpectsComplementaryStudies({
        faculty_key: "lassonde",
        programme_name: "BACHELOR OF ENGINEERING (BEng) — Software Engineering",
      }),
      true,
    );
    assert.equal(
      planExpectsComplementaryStudies({
        faculty_key: "lassonde",
        programme_name: "BEng Software Engineering",
      }),
      true,
    );
  });

  it("returns true when only the checklist filename mentions BEng", () => {
    assert.equal(
      planExpectsComplementaryStudies({
        faculty_key: "lassonde",
        programme_name: null,
        source_filename: "2023-2024-Degree-Checklist-BEng-Software-Big-Data.pdf",
      }),
      true,
    );
  });

  it("returns true for Lassonde engineering programmes without an explicit BEng label", () => {
    assert.equal(
      planExpectsComplementaryStudies({
        faculty_key: "lassonde",
        programme_name: "Honours Software Engineering",
      }),
      true,
    );
  });

  it("returns false for Lassonde BSc and non-engineering programmes", () => {
    assert.equal(
      planExpectsComplementaryStudies({
        faculty_key: "lassonde",
        programme_name: "BSc Honours Computer Science",
      }),
      false,
    );
    assert.equal(
      planExpectsComplementaryStudies({
        faculty_key: "laps",
        programme_name: "BCom Specialized Honours",
      }),
      false,
    );
    assert.equal(
      planExpectsComplementaryStudies({
        faculty_key: "science",
        programme_name: "BSc Honours Biology",
      }),
      false,
    );
  });
});
