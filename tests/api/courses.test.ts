import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stripFacultyCourseCodePrefix } from "../../apps/api/src/services/courseSearch.js";
import { normalizeCourseCodeSearchQuery } from "../../apps/api/src/services/courses.js";

describe("stripFacultyCourseCodePrefix", () => {
  it("strips faculty prefixes for catalogue lookups", () => {
    assert.equal(stripFacultyCourseCodePrefix("LE/EECS 2030"), "EECS 2030");
    assert.equal(stripFacultyCourseCodePrefix("EECS 2030"), "EECS 2030");
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
