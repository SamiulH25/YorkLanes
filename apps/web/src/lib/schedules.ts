/** Task guide: docs/tasks/schedule.md */
import { apiRequestInit, apiUrl } from "./api-request";

export interface ScheduleEntry {
  id: string;
  course_code: string;
  day: string;
  start_time: string;
  end_time: string;
}

export interface SchedulesResponse {
  feature: string;
  status: string;
  message: string;
  nextSteps: string[];
  entries: ScheduleEntry[];
}

export async function fetchSchedules(cookieHeader?: string | null): Promise<SchedulesResponse> {
  const response = await fetch(apiUrl("/api/schedules"), apiRequestInit(cookieHeader));

  if (!response.ok) {
    throw new Error(`Schedules API error: ${response.status}`);
  }

  return response.json() as Promise<SchedulesResponse>;
}

export async function createScheduleEntry(
  entry: Omit<ScheduleEntry, "id">,
  cookieHeader?: string | null,
): Promise<ScheduleEntry> {
  const response = await fetch(
    apiUrl("/api/schedules"),
    apiRequestInit(cookieHeader, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(entry),
    }),
  );

  if (!response.ok) {
    throw new Error(`Create schedule error: ${response.status}`);
  }

  return response.json() as Promise<ScheduleEntry>;
}
