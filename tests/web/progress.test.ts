import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  categoryProgressLabel,
  planComplementaryFocusHref,
  progressElectivesHref,
  type ComplementaryElectivesProgress,
  type RequirementCategoryStats,
} from "../../apps/web/src/lib/progress.ts";

const complementaryElectives: ComplementaryElectivesProgress = {
  mode: "complementary",
  label: "Complementary studies",
  plannedCredits: 6,
  requiredCredits: 12,
  subjectAreaCredits: 0,
  minSubjectAreaCredits: 3,
  openStubCredits: 3,
  catalogFilename: "availability.pdf",
};

const electivesCategory: RequirementCategoryStats = {
  id: "electives",
  label: "Complementary studies",
  percentComplete: 50,
  completed: 6,
  total: 12,
  remaining: 6,
};

describe("progress linking helpers", () => {
  it("builds plan and progress URLs with context", () => {
    assert.equal(
      planComplementaryFocusHref("abc-123"),
      "/plan?id=abc-123&focus=complementary",
    );
    assert.equal(
      progressElectivesHref("abc-123"),
      "/progress?planId=abc-123#progress-electives",
    );
  });
});

describe("categoryProgressLabel", () => {
  it("describes complementary credit progress with subject-area note", () => {
    const label = categoryProgressLabel(electivesCategory, complementaryElectives);
    assert.match(label, /6 of 12 credits planned/);
    assert.match(label, /0 of 3 cr humanities\/social science/);
  });

  it("keeps course-based labels without complementary context", () => {
    const label = categoryProgressLabel({
      id: "major",
      label: "Major requirements",
      percentComplete: 50,
      completed: 1,
      total: 2,
      remaining: 1,
    });
    assert.equal(label, "1 of 2 complete");
  });
});
