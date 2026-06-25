/** Task guide: docs/tasks/schedule.md */
import { getApiUrl } from "./api-url";

const API_URL = getApiUrl();

export interface SchedulesResponse {
  feature: string;
  status: string;
  message: string;
  nextSteps: string[];
  entries: unknown[];
}

export async function fetchSchedules(): Promise<SchedulesResponse> {
  const response = await fetch(`${API_URL}/api/schedules`);
  if (!response.ok) throw new Error(`Schedules API error: ${response.status}`);
  return response.json() as Promise<SchedulesResponse>;
}
