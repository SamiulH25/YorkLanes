import type { DegreePlan, FacultyChecklistInfo } from "../types/plan";
import type { PlanGraphSnapshot } from "./plan-store";

const API_URL = import.meta.env.PUBLIC_API_URL ?? "http://localhost:3001";

export interface PlanLayoutMove {
  courseId: string;
  termId: string;
  sortOrder: number;
}

export interface PlanGraphResponse {
  plan: DegreePlan;
  graph: Omit<PlanGraphSnapshot, "plan" | "updated_at">;
}

export async function fetchFaculties(): Promise<FacultyChecklistInfo[]> {
  const response = await fetch(`${API_URL}/api/plans/faculties`);
  if (!response.ok) {
    throw new Error("Failed to load faculty checklist links");
  }
  const data = (await response.json()) as { faculties: FacultyChecklistInfo[] };
  return data.faculties;
}

export async function fetchPlan(planId: string): Promise<DegreePlan> {
  const response = await fetch(`${API_URL}/api/plans/${planId}`);
  if (!response.ok) {
    let message = "Failed to load degree plan";
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(message);
  }
  return response.json() as Promise<DegreePlan>;
}

export async function importChecklist(formData: FormData): Promise<{ plan: DegreePlan }> {
  const response = await fetch(`${API_URL}/api/plans/import`, {
    method: "POST",
    body: formData,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to import checklist");
  }

  return payload as { plan: DegreePlan };
}

export async function fetchPlanGraph(planId: string): Promise<PlanGraphResponse> {
  const response = await fetch(`${API_URL}/api/plans/${planId}/graph`);
  if (!response.ok) {
    throw new Error("Failed to load plan graph");
  }
  return response.json() as Promise<PlanGraphResponse>;
}

export async function updatePlanCourseCompletion(
  planId: string,
  courseId: string,
  completed: boolean,
): Promise<PlanGraphResponse> {
  const response = await fetch(`${API_URL}/api/plans/${planId}/courses/${courseId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to update course completion");
  }
  return payload as PlanGraphResponse;
}

export async function updatePlanLayout(
  planId: string,
  moves: PlanLayoutMove[],
): Promise<PlanGraphResponse> {
  const response = await fetch(`${API_URL}/api/plans/${planId}/layout`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ moves }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to update plan layout");
  }
  return payload as PlanGraphResponse;
}

export const PLAN_STORAGE_KEY = "yorklanes-plan-id";

export {
  cachePlanGraphSnapshot,
  countUnmetPrerequisitesForCourse,
  findUnmetPrerequisites,
  findUnsatisfiedDependencies,
  listPlannedCourseCodes,
  listPlanStubs,
  readActivePlanGraphSnapshot,
  readPlanGraphSnapshot,
  PLAN_ACTIVE_ID_KEY,
  PLAN_GRAPH_CACHE_KEY,
  type CourseDependencyEdge,
  type CoursePlacement,
  type PlanGraphSnapshot,
} from "./plan-store";
