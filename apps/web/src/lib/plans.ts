import type { DegreePlan, FacultyChecklistInfo } from "../types/plan";

const API_URL = import.meta.env.PUBLIC_API_URL ?? "http://localhost:3001";

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
    throw new Error("Failed to load degree plan");
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

export const PLAN_STORAGE_KEY = "yorklanes-plan-id";
