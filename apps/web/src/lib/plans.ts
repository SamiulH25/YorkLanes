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

export interface RemovedRequiredCourse {
  code: string;
  title: string | null;
}

export interface RemovePlanCourseResponse extends PlanGraphResponse {
  removed_required_course?: RemovedRequiredCourse | null;
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

export async function createPlanSummerTerm(
  planId: string,
  checklistYear: number,
): Promise<PlanGraphResponse> {
  const response = await fetch(`${getApiUrl()}/api/plans/${planId}/terms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ checklistYear, session: "summer" }),
    credentials: "include",
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to create summer term");
  }
  return payload as PlanGraphResponse;
}

export async function addPlanCourse(
  planId: string,
  termId: string,
  courseCode: string,
  options: { fromComplementary?: boolean } = {},
): Promise<PlanGraphResponse> {
  const response = await fetch(`${getApiUrl()}/api/plans/${planId}/courses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      termId,
      courseCode,
      fromComplementary: options.fromComplementary === true,
    }),
    credentials: "include",
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to add course");
  }
  return payload as PlanGraphResponse;
}

export async function fetchComplementarySummary(
  planId: string,
): Promise<{
  filename: string | null;
  summary: import("../types/plan").ComplementaryCatalogSummary | null;
}> {
  const response = await fetch(`${getApiUrl()}/api/plans/${planId}/complementary`, planRequestInit());
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to load complementary catalogue");
  }
  return payload as {
    filename: string | null;
    summary: import("../types/plan").ComplementaryCatalogSummary | null;
  };
}

export async function searchComplementaryCourses(
  planId: string,
  query: string,
  limit = 20,
): Promise<{ courses: import("../types/plan").ComplementaryListedCourse[]; total: number }> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const response = await fetch(
    `${getApiUrl()}/api/plans/${planId}/complementary/search?${params}`,
    planRequestInit(),
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Complementary search failed");
  }
  return payload as { courses: import("../types/plan").ComplementaryListedCourse[]; total: number };
}

export async function uploadComplementaryPdf(
  planId: string,
  file: File,
): Promise<PlanGraphResponse & { catalog: unknown }> {
  const formData = new FormData();
  formData.set("complementary", file, file.name);

  const response = await fetch(`${getApiUrl()}/api/plans/${planId}/complementary`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  const payload = await response.json();
  if (!response.ok) {
    const parts = [payload.error ?? "Failed to upload complementary PDF"];
    if (payload.hint) parts.push(String(payload.hint));
    throw new Error(parts.join(" "));
  }
  return payload as PlanGraphResponse & { catalog: unknown };
}

export async function removePlanCourse(
  planId: string,
  courseId: string,
): Promise<RemovePlanCourseResponse> {
  const response = await fetch(`${getApiUrl()}/api/plans/${planId}/courses/${courseId}`, {
    method: "DELETE",
    credentials: "include",
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to remove course");
  }
  return payload as RemovePlanCourseResponse;
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
