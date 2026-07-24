/** Task guide: docs/tasks/schedule.md */
import { apiRequestInit, apiUrl } from "./api-request";
import type { ScheduleGridEntry } from "./schedule-grid";

export interface ScheduleBundlePick {
  courseCode: string;
  bundleId: string;
  picks: Record<string, string>;
}

export interface ScheduleWeekResponse {
  planYear: number;
  planSeason: string;
  cdmTerm: string;
  entries: ScheduleGridEntry[];
  bundles: ScheduleBundlePick[];
  isActive: boolean;
  updatedAt: string;
}

export interface SavedScheduleSummary {
  planYear: number;
  planSeason: string;
  cdmTerm: string;
  courseCount: number;
  entryCount: number;
  isActive: boolean;
  updatedAt: string;
}

export interface ScheduleWeekPayload {
  planYear: number;
  planSeason: string;
  cdmTerm: string;
  entries: ScheduleGridEntry[];
  bundles: Array<{
    course_code: string;
    bundle_id: string;
    picks: Record<string, string>;
  }>;
}

async function scheduleFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), apiRequestInit(null, init));
}

export async function fetchSavedSchedules(): Promise<SavedScheduleSummary[]> {
  const response = await scheduleFetch("/api/schedules");
  if (response.status === 401) return [];
  if (!response.ok) {
    throw new Error(`Schedules API error: ${response.status}`);
  }
  const data = (await response.json()) as { schedules: SavedScheduleSummary[] };
  return data.schedules ?? [];
}

export async function fetchScheduleWeek(
  planYear: number,
  planSeason: string,
  cdmTerm: string,
): Promise<ScheduleWeekResponse | null> {
  const params = new URLSearchParams({
    plan_year: String(planYear),
    plan_season: planSeason,
    cdm_term: cdmTerm,
  });
  const response = await scheduleFetch(`/api/schedules/week?${params}`);
  if (response.status === 401 || response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Schedule week API error: ${response.status}`);
  }
  return response.json() as Promise<ScheduleWeekResponse>;
}

export async function saveScheduleWeek(payload: ScheduleWeekPayload): Promise<ScheduleWeekResponse | null> {
  const response = await scheduleFetch("/api/schedules/week", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`Save schedule error: ${response.status}`);
  }
  return response.json() as Promise<ScheduleWeekResponse>;
}

export async function setActiveSchedule(
  planYear: number,
  planSeason: string,
  cdmTerm: string,
): Promise<boolean> {
  const response = await scheduleFetch("/api/schedules/active", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planYear, planSeason, cdmTerm }),
  });
  if (response.status === 401 || response.status === 404) return false;
  if (!response.ok) {
    throw new Error(`Set active schedule error: ${response.status}`);
  }
  return true;
}

export async function deleteSavedSchedule(
  planYear: number,
  planSeason: string,
  cdmTerm: string,
): Promise<boolean> {
  const params = new URLSearchParams({
    plan_year: String(planYear),
    plan_season: planSeason,
    cdm_term: cdmTerm,
  });
  const response = await scheduleFetch(`/api/schedules/week?${params}`, { method: "DELETE" });
  if (response.status === 401) return false;
  if (!response.ok) {
    throw new Error(`Delete schedule error: ${response.status}`);
  }
  return true;
}

export function seasonLabel(season: string): string {
  const labels: Record<string, string> = {
    all: "Full year",
    fall: "Fall",
    winter: "Winter",
    summer: "Summer",
  };
  return labels[season] ?? season;
}

export function componentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    lec: "Lecture",
    tut: "Tutorial",
    lab: "Lab",
    sem: "Seminar",
    other: "Section",
  };
  return labels[type] ?? "Section";
}
