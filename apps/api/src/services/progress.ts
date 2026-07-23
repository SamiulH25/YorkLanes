/**
 * Progress stats from a degree plan.
 * Pure logic — no database required. Used by GET /api/progress and dashboard summary.
 */
import type { DegreePlanRow } from "./planGenerator.js";

export interface PlanProgressStats {
  percentComplete: number;
  completed: number;
  total: number;
  remaining: number;
}

export interface PlanProgressResult extends PlanProgressStats {
  planId: string;
  programmeName: string | null;
  startingYear: number;
  message: string;
}

/** Count concrete courses (not stubs) marked complete on a degree plan. */
export function computePlanProgress(plan: DegreePlanRow): PlanProgressStats {
  const courses = plan.terms
    .flatMap((term) => term.courses)
    .filter((course) => course.entry_kind === "course");

  const completed = courses.filter((course) => course.completed).length;
  const total = courses.length;
  const percentComplete = total === 0 ? 0 : Math.round((completed / total) * 100);

  return {
    percentComplete,
    completed,
    total,
    remaining: total - completed,
  };
}

export function buildPlanProgressResult(plan: DegreePlanRow): PlanProgressResult {
  const stats = computePlanProgress(plan);

  let message: string;
  if (stats.total === 0) {
    message = "No concrete courses on this plan yet.";
  } else if (stats.remaining === 0) {
    message = "Every course on your plan is marked complete.";
  } else {
    message = `${stats.completed} of ${stats.total} courses marked complete.`;
  }

  return {
    planId: plan.id,
    programmeName: plan.programme_name,
    startingYear: plan.starting_year,
    message,
    ...stats,
  };
}
