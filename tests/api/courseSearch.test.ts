import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyCourseSearchQuery,
  courseCodeMatchesSubjectPrefix,
  extractCourseSubject,
  matchesCatalogCourseSearch,
  normalizeCourseCodeSearchQuery,
} from "../../apps/api/src/services/courseSearch.js";

describe("classifyCourseSearchQuery", () => {
  it("classifies subject-number, subject-prefix, and general queries", () => {
    assert.deepEqual(classifyCourseSearchQuery("econ 1000"), {
      kind: "subject-number",
      normalizedCode: "ECON 1000",
    });
    assert.deepEqual(classifyCourseSearchQuery("econ"), {
      kind: "subject-prefix",
      subjectPrefix: "ECON",
    });
    assert.deepEqual(classifyCourseSearchQuery("discrete math"), {
      kind: "general",
      generalTokens: ["discrete", "math"],
    });
  });
});

describe("extractCourseSubject", () => {
  it("extracts subjects from catalogue and faculty-prefixed codes", () => {
    assert.equal(extractCourseSubject("ECON 1000"), "ECON");
    assert.equal(extractCourseSubject("LE/EECS 2030"), "EECS");
    assert.equal(extractCourseSubject("AP/BIOL 1000"), "BIOL");
  });
});

describe("matchesCatalogCourseSearch", () => {
  const econ = {
    code: "ECON 1000",
    title: "Introduction to Microeconomics",
    description: null,
  };
  const biol = {
    code: "BIOL 1000",
    title: "Biological Concepts",
    description: "Prerequisites: LE/EECS 1011 3.00",
  };
  const eecs = {
    code: "EECS 1011",
    title: "Introduction to Programming",
    description: null,
  };
  const huma = {
    code: "HUMA 1170",
    title: "The Modern Age",
    description: "Recommended for ECON majors",
  };

  it("matches ECON courses for econ prefix queries", () => {
    assert.equal(matchesCatalogCourseSearch(econ, "econ"), true);
    assert.equal(matchesCatalogCourseSearch(econ, "econ 1000"), true);
    assert.equal(matchesCatalogCourseSearch(huma, "econ"), false);
  });

  it("matches EECS courses without matching BIOL prerequisite mentions", () => {
    assert.equal(matchesCatalogCourseSearch(eecs, "eecs"), true);
    assert.equal(matchesCatalogCourseSearch(biol, "eecs"), false);
  });

  it("matches title terms for general queries without description noise", () => {
    assert.equal(
      matchesCatalogCourseSearch(
        { code: "MATH 1190", title: "Introduction to Sets and Numbers", description: "Not for EECS students" },
        "sets numbers",
      ),
      true,
    );
    assert.equal(
      matchesCatalogCourseSearch(
        { code: "MATH 1190", title: "Introduction to Sets and Numbers", description: "Not for EECS students" },
        "eecs",
      ),
      false,
    );
  });
});

describe("courseCodeMatchesSubjectPrefix", () => {
  it("matches subject prefixes only on course codes", () => {
    assert.equal(courseCodeMatchesSubjectPrefix("ECON 1000", "ECON"), true);
    assert.equal(courseCodeMatchesSubjectPrefix("LE/EECS 2030", "EECS"), true);
    assert.equal(courseCodeMatchesSubjectPrefix("BIOL 1000", "EECS"), false);
  });
});

describe("normalizeCourseCodeSearchQuery", () => {
  it("normalizes subject and number tokens like econ 1000", () => {
    assert.equal(normalizeCourseCodeSearchQuery("econ 1000"), "ECON 1000");
    assert.equal(normalizeCourseCodeSearchQuery("  eecs 2030  "), "EECS 2030");
  });

  it("returns null for partial or non-code searches", () => {
    assert.equal(normalizeCourseCodeSearchQuery("economics"), null);
    assert.equal(normalizeCourseCodeSearchQuery("econ"), null);
    assert.equal(normalizeCourseCodeSearchQuery("econ 100"), null);
  });
});
