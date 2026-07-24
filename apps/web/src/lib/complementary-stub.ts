import type { PlanCourse } from "../types/plan";

const STUB_OPTION_CODE_PATTERN = /\b[A-Z]{2,6}\s*\d{4}[A-Z]?\b/g;
const OPTION_HINT_LIMIT = 3;

export const COMPLEMENTARY_STUB_HEADER = "Complementary Studies";

export function isComplementaryStub(
  course: Pick<PlanCourse, "entry_kind" | "course_code" | "section_label">,
): boolean {
  if (course.entry_kind !== "stub") {
    return false;
  }
  if (course.course_code.toUpperCase() === "COMPLEMENTARY") {
    return true;
  }
  return /complementar/i.test(course.section_label ?? course.course_code);
}

export function isComplementaryStubDraggable(course: PlanCourse): boolean {
  return isComplementaryStub(course);
}

export function extractComplementaryStubOptionCodes(
  stub: Pick<PlanCourse, "entry_kind" | "course_code" | "section_label" | "title">,
): string[] {
  if (!isComplementaryStub(stub)) {
    return [];
  }

  const source = stub.title ?? "";
  const matches = source.toUpperCase().match(STUB_OPTION_CODE_PATTERN) ?? [];
  return [...new Set(matches.map((code) => code.replace(/\s+/g, " ").trim()))];
}

function formatOptionHint(codes: string[]): string | null {
  if (codes.length === 0) {
    return null;
  }
  if (codes.length <= OPTION_HINT_LIMIT) {
    return codes.join(", ");
  }
  const shown = codes.slice(0, OPTION_HINT_LIMIT).join(", ");
  return `${shown}, +${codes.length - OPTION_HINT_LIMIT} more`;
}

export interface ComplementaryStubDisplay {
  header: string;
  subtitle: string;
}

/** Consistent complementary stub card copy across SSR and client-rendered cards. */
export function formatComplementaryStubDisplay(
  course: Pick<PlanCourse, "entry_kind" | "course_code" | "section_label" | "title">,
): ComplementaryStubDisplay {
  const optionHint = formatOptionHint(extractComplementaryStubOptionCodes(course));
  return {
    header: COMPLEMENTARY_STUB_HEADER,
    subtitle: optionHint ?? "Pick from checklist options",
  };
}

export function formatStubDragLabel(course: PlanCourse): string {
  if (isComplementaryStub(course)) {
    return formatComplementaryStubDisplay(course).header;
  }
  return course.section_label ?? course.title ?? course.course_code;
}
