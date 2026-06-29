/** Task guide: docs/tasks/progress.md */
import type { DegreePlan, PlanCourse } from "../types/plan";
import { getApiUrl } from "./api-url";

const API_URL = getApiUrl();

export interface PlanProgressStats {
  percentComplete: number;
  completed: number;
  total: number;
  remaining: number;
}

export interface ProgressResponse {
  feature: string;
  status: string;
  planId: string;
  programmeName: string | null;
  startingYear: number;
  percentComplete: number;
  completed: number;
  total: number;
  remaining: number;
  message: string;
}

/** Count concrete courses (not stubs) marked complete on a degree plan. */
export function computePlanProgress(plan: DegreePlan): PlanProgressStats {
  const courses = plan.terms.flatMap((term) => term.courses).filter((c) => c.entry_kind === "course");
  const completed = courses.filter((c) => c.completed).length;
  const total = courses.length;
  const percentComplete = total === 0 ? 0 : Math.round((completed / total) * 100);

  return {
    percentComplete,
    completed,
    total,
    remaining: total - completed,
  };
}

export function listPlanCourses(plan: DegreePlan): Array<PlanCourse & { termLabel: string }> {
  return plan.terms.flatMap((term) =>
    term.courses
      .filter((course) => course.entry_kind === "course")
      .map((course) => ({ ...course, termLabel: term.label })),
  );
}

export async function fetchProgress(planId: string): Promise<ProgressResponse> {
  const response = await fetch(`${API_URL}/api/progress?planId=${encodeURIComponent(planId)}`);
  if (!response.ok) {
    let message = `Progress API error: ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string; hint?: string };
      if (payload.error) {
        message = payload.hint ? `${payload.error} ${payload.hint}` : payload.error;
      }
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(message);
  }
  return response.json() as Promise<ProgressResponse>;
}
