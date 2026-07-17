/**
 * API client for degree plans. All plan data flows through the Express API (not Supabase JS).
 */
import type { DegreePlan, FacultyChecklistInfo } from "../types/plan";
import type { PlanGraphSnapshot } from "./plan-store";
import { getApiUrl } from "./api-url";

export interface PlanLayoutMove {
  courseId: string;
  termId: string;
  sortOrder: number;
}

export interface PlanGraphResponse {
  plan: DegreePlan;
  graph: Omit<PlanGraphSnapshot, "plan" | "updated_at">;
}

function planRequestInit(cookieHeader?: string | null, init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  return {
    ...init,
    headers,
    credentials: cookieHeader ? init?.credentials : (init?.credentials ?? "include"),
  };
}

export async function fetchFaculties(cookieHeader?: string | null): Promise<FacultyChecklistInfo[]> {
  const response = await fetch(
    `${getApiUrl()}/api/plans/faculties`,
    planRequestInit(cookieHeader),
  );
  if (!response.ok) {
    throw new Error("Failed to load faculty checklist links");
  }
  const data = (await response.json()) as { faculties: FacultyChecklistInfo[] };
  return data.faculties;
}

export async function fetchPlan(
  planId: string,
  cookieHeader?: string | null,
): Promise<DegreePlan> {
  const response = await fetch(
    `${getApiUrl()}/api/plans/${planId}`,
    planRequestInit(cookieHeader),
  );
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

/** Latest plan for the signed-in user (remote DB). Returns null when none exists. */
export async function fetchMyPlan(cookieHeader?: string | null): Promise<DegreePlan | null> {
  const response = await fetch(
    `${getApiUrl()}/api/plans/mine`,
    planRequestInit(cookieHeader),
  );

  if (response.status === 404) {
    return null;
  }

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    let message = "Failed to load your degree plan";
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
  const response = await fetch(`${getApiUrl()}/api/plans/import`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to import checklist");
  }

  return payload as { plan: DegreePlan };
}

export async function fetchPlanGraph(planId: string): Promise<PlanGraphResponse> {
  const response = await fetch(
    `${getApiUrl()}/api/plans/${planId}/graph`,
    planRequestInit(),
  );
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
  const response = await fetch(`${getApiUrl()}/api/plans/${planId}/courses/${courseId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed }),
    credentials: "include",
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
  const response = await fetch(`${getApiUrl()}/api/plans/${planId}/layout`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ moves }),
    credentials: "include",
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
