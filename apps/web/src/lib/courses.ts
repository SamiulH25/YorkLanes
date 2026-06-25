/**
 * Course explorer API client.
 * Task guide: docs/tasks/courses.md
 */
import { getApiUrl } from "./api-url";

const API_URL = getApiUrl();

export interface CoursesResponse {
  feature: string;
  status: string;
  message: string;
  nextSteps: string[];
  courses: Array<{ code: string; title: string }>;
}

export async function fetchCourses(): Promise<CoursesResponse> {
  const response = await fetch(`${API_URL}/api/courses`);
  if (!response.ok) {
    throw new Error(`Courses API error: ${response.status}`);
  }
  return response.json() as Promise<CoursesResponse>;
}
