import type { PlanCourse } from "../types/plan";

export interface MissingRequiredCourse {
  code: string;
  title: string | null;
  formerTermId: string | null;
}

/** Concrete checklist courses (not stubs or complementary placements). */
export function isRequiredPlanCourse(course: Pick<PlanCourse, "entry_kind" | "section_label">): boolean {
  if (course.entry_kind === "stub") {
    return false;
  }
  if (course.section_label === "Complementary Studies") {
    return false;
  }
  return true;
}

export function missingRequiredStorageKey(planId: string): string {
  return `yorklanes-missing-required-${planId}`;
}

export function readMissingRequiredCourses(planId: string): MissingRequiredCourse[] {
  try {
    const raw = sessionStorage.getItem(missingRequiredStorageKey(planId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is MissingRequiredCourse =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as MissingRequiredCourse).code === "string",
    );
  } catch {
    return [];
  }
}

export function writeMissingRequiredCourses(planId: string, courses: MissingRequiredCourse[]): void {
  try {
    if (courses.length === 0) {
      sessionStorage.removeItem(missingRequiredStorageKey(planId));
      return;
    }
    sessionStorage.setItem(missingRequiredStorageKey(planId), JSON.stringify(courses));
  } catch {
    // ignore quota / private mode
  }
}

export function reconcileMissingRequiredCourses(
  stored: MissingRequiredCourse[],
  plannedCodes: Set<string>,
): MissingRequiredCourse[] {
  return stored.filter((entry) => !plannedCodes.has(entry.code.trim().toUpperCase()));
}
