export interface PlanCourseClassificationInput {
  entry_kind?: string | null;
  section_label?: string | null;
}

/** Concrete checklist courses (not stubs or complementary placements). */
export function isRequiredPlanCourse(course: PlanCourseClassificationInput): boolean {
  if (course.entry_kind === "stub") {
    return false;
  }
  if (course.section_label === "Complementary Studies") {
    return false;
  }
  return true;
}
