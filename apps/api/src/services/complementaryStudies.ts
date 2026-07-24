import type { PlanCourseRow, PlanTermRow } from "./planGenerator.js";
import type { ComplementaryCatalog } from "./complementaryParser.js";

export interface ComplementaryWarning {
  severity: "warning" | "info";
  code: string;
  message: string;
  course_id?: string;
  course_code?: string;
}

export interface ComplementaryCourseClassification {
  valid: boolean;
  countsAsSubjectArea: boolean;
  source: "listed" | "subject_area" | null;
  credits: number;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, " ");
}

function courseSubject(code: string): string {
  const match = normalizeCode(code).match(/^([A-Z]{2,6})\s/);
  return match?.[1] ?? "";
}

export function isComplementaryStub(course: Pick<PlanCourseRow, "entry_kind" | "course_code" | "section_label">): boolean {
  if (course.entry_kind !== "stub") {
    return false;
  }
  if (course.course_code.toUpperCase() === "COMPLEMENTARY") {
    return true;
  }
  return /complementar/i.test(course.section_label ?? course.course_code);
}

export interface ComplementaryStubCandidate {
  id: string;
  credits: number | null;
  sort_order: number;
  term_id: string;
}

export type ComplementaryStubConsumption =
  | { action: "delete"; id: string }
  | { action: "decrement"; id: string; newCredits: number };

export type ComplementaryStubRestoration =
  | { action: "increment"; stubId: string; credits: number }
  | { action: "insert"; credits: number; sortOrder: number };

/** Reverse stub consumption when a complementary course is removed from the plan. */
export function planComplementaryStubRestoration(
  consumedStubId: string | null,
  stubStillExists: boolean,
  courseCredits: number,
  sortOrder: number,
): ComplementaryStubRestoration {
  const credits = courseCredits > 0 ? courseCredits : 3;

  if (consumedStubId && stubStillExists) {
    return { action: "increment", stubId: consumedStubId, credits };
  }

  return { action: "insert", credits, sortOrder };
}

/** Pick one complementary stub to fill when adding an approved complementary course. */
export function pickComplementaryStubToConsume(
  stubs: ComplementaryStubCandidate[],
  courseCredits: number,
  preferredTermId: string,
): ComplementaryStubConsumption | null {
  if (stubs.length === 0) {
    return null;
  }

  const sorted = [...stubs].sort((left, right) => {
    const leftInTerm = left.term_id === preferredTermId ? 0 : 1;
    const rightInTerm = right.term_id === preferredTermId ? 0 : 1;
    if (leftInTerm !== rightInTerm) {
      return leftInTerm - rightInTerm;
    }

    const leftCredits = left.credits ?? 0;
    const rightCredits = right.credits ?? 0;
    const leftFits = left.credits == null || leftCredits >= courseCredits;
    const rightFits = right.credits == null || rightCredits >= courseCredits;
    if (leftFits !== rightFits) {
      return leftFits ? -1 : 1;
    }
    if (leftFits && rightFits) {
      return leftCredits - rightCredits;
    }
    return left.sort_order - right.sort_order;
  });

  const stub = sorted[0];
  if (!stub) {
    return null;
  }

  if (stub.credits != null && stub.credits > courseCredits) {
    return { action: "decrement", id: stub.id, newCredits: stub.credits - courseCredits };
  }

  return { action: "delete", id: stub.id };
}

/** Courses added via the complementary search flow use this exact label. */
const EXPLICIT_COMPLEMENTARY_LABEL = "Complementary Studies";

function buildPrefixSet(catalog: ComplementaryCatalog): Set<string> {
  const prefixes = new Set<string>();
  for (const area of catalog.subject_areas) {
    for (const prefix of area.prefixes) {
      prefixes.add(prefix.toUpperCase());
    }
  }
  return prefixes;
}

function buildListedMap(catalog: ComplementaryCatalog): Map<string, ComplementaryCatalog["listed_courses"][number]> {
  const map = new Map<string, ComplementaryCatalog["listed_courses"][number]>();
  for (const course of catalog.listed_courses) {
    map.set(normalizeCode(course.code), course);
  }
  return map;
}

export function classifyComplementaryCourse(
  courseCode: string,
  catalog: ComplementaryCatalog,
  credits: number | null = null,
): ComplementaryCourseClassification {
  const normalized = normalizeCode(courseCode);
  const listed = buildListedMap(catalog).get(normalized);
  if (listed) {
    return {
      valid: true,
      countsAsSubjectArea: listed.counts_as_subject_area,
      source: "listed",
      credits: credits ?? listed.credits,
    };
  }

  const subject = courseSubject(normalized);
  if (subject && buildPrefixSet(catalog).has(subject)) {
    return {
      valid: true,
      countsAsSubjectArea: true,
      source: "subject_area",
      credits: credits ?? 3,
    };
  }

  return {
    valid: false,
    countsAsSubjectArea: false,
    source: null,
    credits: credits ?? 0,
  };
}

export function searchComplementaryCatalog(
  catalog: ComplementaryCatalog,
  query: string,
  limit = 20,
): ComplementaryCatalog["listed_courses"] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }

  return catalog.listed_courses
    .filter((course) => {
      const code = course.code.toLowerCase();
      const subject = courseSubject(course.code).toLowerCase();
      return code.includes(needle) || subject.includes(needle);
    })
    .slice(0, limit);
}

function isComplementaryPlacement(course: PlanCourseRow): boolean {
  if (course.entry_kind === "stub") {
    return isComplementaryStub(course);
  }
  // Only courses explicitly placed as complementary electives count — not required
  // major/stream courses that share a term or parser section header with stubs.
  return course.section_label === EXPLICIT_COMPLEMENTARY_LABEL;
}

export function computeComplementaryWarnings(
  planTerms: PlanTermRow[],
  catalog: ComplementaryCatalog | null,
): ComplementaryWarning[] {
  if (!catalog) {
    return [
      {
        severity: "info",
        code: "no_catalog",
        message:
          "Use the Complementary PDF button in the toolbar to upload your faculty availability list.",
      },
    ];
  }

  const warnings: ComplementaryWarning[] = [];
  const requiredCredits = catalog.rules.total_credits;
  const minSubjectCredits = catalog.rules.min_subject_area_credits;

  let filledCredits = 0;
  let subjectAreaCredits = 0;
  const complementaryCourses: Array<{ course: PlanCourseRow; term: PlanTermRow }> = [];

  for (const term of planTerms) {
    for (const course of term.courses) {
      if (course.entry_kind === "stub") {
        if (isComplementaryStub(course)) {
          const stubCredits = course.credits ?? 0;
          warnings.push({
            severity: "warning",
            code: "open_stub",
            message: `${course.section_label ?? "Complementary Studies"} slot (${stubCredits || "?"} cr) is still open.`,
            course_id: course.id,
            course_code: course.course_code,
          });
        }
        continue;
      }

      if (!isComplementaryPlacement(course)) {
        continue;
      }

      complementaryCourses.push({ course, term });
      const classification = classifyComplementaryCourse(
        course.course_code,
        catalog,
        course.credits,
      );

      if (!classification.valid) {
        warnings.push({
          severity: "warning",
          code: "not_approved",
          message: `${course.course_code} is not on the approved complementary list or subject areas.`,
          course_id: course.id,
          course_code: course.course_code,
        });
        continue;
      }

      filledCredits += classification.credits;
      if (classification.countsAsSubjectArea) {
        subjectAreaCredits += classification.credits;
      }
    }
  }

  if (filledCredits < requiredCredits) {
    const shortfall = requiredCredits - filledCredits;
    warnings.push({
      severity: "warning",
      code: "credit_shortfall",
      message: `Complementary studies: ${filledCredits} of ${requiredCredits} required credits planned (${shortfall} cr short).`,
    });
  }

  if (subjectAreaCredits < minSubjectCredits) {
    const shortfall = minSubjectCredits - subjectAreaCredits;
    warnings.push({
      severity: "warning",
      code: "subject_area_shortfall",
      message: `At least ${minSubjectCredits} credits must come from approved humanities/social science areas (${subjectAreaCredits} cr planned, ${shortfall} cr short).`,
    });
  }

  if (complementaryCourses.length === 0 && warnings.every((warning) => warning.code === "open_stub")) {
    warnings.push({
      severity: "warning",
      code: "no_courses",
      message: "No complementary courses have been added to your plan yet.",
    });
  }

  return warnings;
}
