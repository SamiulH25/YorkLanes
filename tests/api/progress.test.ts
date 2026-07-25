import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ComplementaryCatalog } from "../../apps/api/src/services/complementaryParser.js";
import type { DegreePlanRow } from "../../apps/api/src/services/planGenerator.js";
import {
  applyComplementaryElectivesCategory,
  buildComplementaryElectivesProgress,
  computeRequirementCategories,
} from "../../apps/api/src/services/progress.js";
import { computeComplementaryStudiesProgress } from "../../apps/api/src/services/complementaryStudies.js";

const catalog: ComplementaryCatalog = {
  programme_hint: "BEng General Education",
  rules: { total_credits: 12, min_subject_area_credits: 3 },
  subject_areas: [{ name: "Philosophy", prefixes: ["PHIL"] }],
  listed_courses: [
    { code: "ADMS 1000", credits: 3, raw: "AP/ADMS 1000 3.00", counts_as_subject_area: false },
    { code: "HUMA 3226", credits: 3, raw: "AP/HUMA 3226 3.00*", counts_as_subject_area: true },
  ],
  warnings: [],
};

function planWithComplementaryCourses(): DegreePlanRow {
  return {
    id: "plan-1",
    programme_name: "Computer Engineering BEng",
    faculty_key: "lassonde",
    starting_year: 2024,
    source_filename: "checklist.pdf",
    complementary_filename: "complementary.pdf",
    complementary_catalog: catalog,
    parse_warnings: [],
    terms: [
      {
        id: "t1",
        label: "Winter 2026",
        session: "Winter",
        academic_year: 2026,
        checklist_year: 2,
        sort_order: 1,
        courses: [
          {
            id: "major-1",
            course_code: "EECS 2021",
            entry_kind: "course",
            section_label: "Major core",
            credits: 3,
            title: null,
            checklist_year: 2,
            sort_order: 0,
            completed: true,
          },
          {
            id: "comp-1",
            course_code: "ADMS 1000",
            entry_kind: "course",
            section_label: "Complementary Studies",
            credits: 3,
            title: null,
            checklist_year: 2,
            sort_order: 1,
            completed: false,
          },
          {
            id: "stub-1",
            course_code: "COMPLEMENTARY",
            entry_kind: "stub",
            section_label: "Complementary Studies",
            credits: 3,
            title: null,
            checklist_year: 2,
            sort_order: 2,
            completed: false,
          },
        ],
      },
    ],
  };
}

describe("computeComplementaryStudiesProgress", () => {
  it("counts planned complementary credits from explicit placements", () => {
    const progress = computeComplementaryStudiesProgress(planWithComplementaryCourses().terms, catalog);
    assert.equal(progress.plannedCredits, 3);
    assert.equal(progress.requiredCredits, 12);
    assert.equal(progress.openStubCredits, 3);
  });
});

describe("applyComplementaryElectivesCategory", () => {
  it("replaces electives stats with complementary credit progress", () => {
    const plan = planWithComplementaryCourses();
    const categories = computeRequirementCategories(plan);
    const complementary = computeComplementaryStudiesProgress(plan.terms, catalog);
    const updated = applyComplementaryElectivesCategory(categories, complementary);
    const electives = updated.find((category) => category.id === "electives");

    assert.ok(electives);
    assert.equal(electives.label, "Complementary studies");
    assert.equal(electives.completed, 3);
    assert.equal(electives.total, 12);
    assert.equal(electives.percentComplete, 25);
  });
});

describe("buildComplementaryElectivesProgress", () => {
  it("returns API payload for progress linking", () => {
    const plan = planWithComplementaryCourses();
    const complementary = computeComplementaryStudiesProgress(plan.terms, catalog);
    const payload = buildComplementaryElectivesProgress(plan, complementary, "complementary.pdf");

    assert.equal(payload.mode, "complementary");
    assert.equal(payload.catalogFilename, "complementary.pdf");
    assert.equal(payload.plannedCredits, 3);
    assert.equal(payload.requiredCredits, 12);
  });
});
