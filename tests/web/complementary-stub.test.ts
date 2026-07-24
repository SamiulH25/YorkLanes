import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractComplementaryStubOptionCodes,
  formatComplementaryStubDisplay,
  isComplementaryStub,
  isComplementaryStubDraggable,
} from "../../apps/web/src/lib/complementary-stub.ts";

describe("complementary stub helpers", () => {
  it("detects complementary stubs", () => {
    assert.equal(
      isComplementaryStub({
        entry_kind: "stub",
        course_code: "COMPLEMENTARY",
        section_label: null,
      }),
      true,
    );
    assert.equal(
      isComplementaryStub({
        entry_kind: "stub",
        course_code: "ELECTIVE",
        section_label: "Science Complementary",
      }),
      true,
    );
    assert.equal(
      isComplementaryStub({
        entry_kind: "course",
        course_code: "ESSE 2210",
        section_label: "Complementary Studies",
      }),
      false,
    );
  });

  it("allows dragging complementary stubs only", () => {
    assert.equal(
      isComplementaryStubDraggable({
        id: "1",
        entry_kind: "stub",
        course_code: "COMPLEMENTARY",
        section_label: "Complementary Studies",
        credits: 6,
        title: null,
        checklist_year: 1,
        sort_order: 0,
      }),
      true,
    );
    assert.equal(
      isComplementaryStubDraggable({
        id: "2",
        entry_kind: "stub",
        course_code: "ELECTIVE",
        section_label: "Free Choice",
        credits: 3,
        title: null,
        checklist_year: 1,
        sort_order: 1,
      }),
      false,
    );
  });

  it("parses option codes from stub titles", () => {
    assert.deepEqual(
      extractComplementaryStubOptionCodes({
        entry_kind: "stub",
        course_code: "COMPLEMENTARY",
        section_label: "Complementary Studies",
        title: "ESSE 2210, BIOL 1000, HUMA 1110",
      }),
      ["ESSE 2210", "BIOL 1000", "HUMA 1110"],
    );
  });

  it("formats consistent complementary stub display", () => {
    assert.deepEqual(
      formatComplementaryStubDisplay({
        entry_kind: "stub",
        course_code: "COMPLEMENTARY",
        section_label: "Complementary Studies",
        title: null,
      }),
      {
        header: "Complementary Studies",
        subtitle: "Pick from checklist options",
      },
    );

    assert.deepEqual(
      formatComplementaryStubDisplay({
        entry_kind: "stub",
        course_code: "COMPLEMENTARY",
        section_label: null,
        title: "ESSE 2210, BIOL 1000, HUMA 1110, NATS 1510",
      }),
      {
        header: "Complementary Studies",
        subtitle: "ESSE 2210, BIOL 1000, HUMA 1110, +1 more",
      },
    );
  });
});
