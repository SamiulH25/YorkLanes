import type { DegreePlan, PlanCourse, PlanTerm } from "../types/plan";

/** Shared cache key prefix — other features read via readPlanGraphSnapshot(). */
export const PLAN_GRAPH_CACHE_KEY = "yorklanes-plan-graph";
export const PLAN_ACTIVE_ID_KEY = "yorklanes-plan-id";

export interface CoursePlacement {
  course_id: string;
  course_code: string;
  term_id: string;
  term_label: string;
  term_sort_order: number;
  sort_order: number;
  entry_kind?: "course" | "stub";
  section_label?: string | null;
  completed?: boolean;
}

export interface CourseDependencyEdge {
  from: string;
  to: string;
  from_course_id: string | null;
  to_course_id: string | null;
  satisfied: boolean;
  kind: "prerequisite" | "corequisite";
}

export interface PlanGraphSnapshot {
  plan_id: string;
  plan?: DegreePlan;
  placements: CoursePlacement[];
  dependencies: CourseDependencyEdge[];
  course_codes: string[];
  updated_at: string;
}

export function buildPlacementsFromPlan(plan: DegreePlan): CoursePlacement[] {
  const placements: CoursePlacement[] = [];
  for (const term of plan.terms) {
    for (const course of term.courses) {
      placements.push({
        course_id: course.id,
        course_code: course.course_code,
        term_id: term.id,
        term_label: term.label,
        term_sort_order: term.sort_order,
        sort_order: course.sort_order,
        entry_kind: course.entry_kind ?? "course",
        section_label: course.section_label,
        completed: course.completed ?? false,
      });
    }
  }
  return placements;
}

export function cachePlanGraphSnapshot(snapshot: PlanGraphSnapshot): void {
  sessionStorage.setItem(`${PLAN_GRAPH_CACHE_KEY}:${snapshot.plan_id}`, JSON.stringify(snapshot));
  sessionStorage.setItem(PLAN_ACTIVE_ID_KEY, snapshot.plan_id);
}

export function readPlanGraphSnapshot(planId: string): PlanGraphSnapshot | null {
  const raw = sessionStorage.getItem(`${PLAN_GRAPH_CACHE_KEY}:${planId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlanGraphSnapshot;
  } catch {
    return null;
  }
}

export function readActivePlanGraphSnapshot(): PlanGraphSnapshot | null {
  const planId = sessionStorage.getItem(PLAN_ACTIVE_ID_KEY);
  if (!planId) return null;
  return readPlanGraphSnapshot(planId);
}

/** Convenience for schedule/progress features: list of course codes in term order. */
export function listPlannedCourseCodes(snapshot: PlanGraphSnapshot): string[] {
  return [...snapshot.placements]
    .filter((p) => (p.entry_kind ?? "course") === "course")
    .sort((a, b) => a.term_sort_order - b.term_sort_order || a.sort_order - b.sort_order)
    .map((p) => p.course_code);
}

export function listPlanStubs(snapshot: PlanGraphSnapshot): CoursePlacement[] {
  return snapshot.placements.filter((p) => p.entry_kind === "stub");
}

export function findUnmetPrerequisites(snapshot: PlanGraphSnapshot): CourseDependencyEdge[] {
  return snapshot.dependencies.filter(
    (edge) => !edge.satisfied && edge.kind === "prerequisite",
  );
}

export function countUnmetPrerequisitesForCourse(
  snapshot: PlanGraphSnapshot,
  courseId: string,
): number {
  return snapshot.dependencies.filter(
    (edge) =>
      edge.kind === "prerequisite" &&
      !edge.satisfied &&
      edge.to_course_id === courseId,
  ).length;
}

export function findUnsatisfiedDependencies(snapshot: PlanGraphSnapshot): CourseDependencyEdge[] {
  return snapshot.dependencies.filter((edge) => !edge.satisfied);
}

export function courseById(plan: DegreePlan, courseId: string): { course: PlanCourse; term: PlanTerm } | null {
  for (const term of plan.terms) {
    const course = term.courses.find((c) => c.id === courseId);
    if (course) return { course, term };
  }
  return null;
}
