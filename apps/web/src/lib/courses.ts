/**
 * Course explorer API client.
 * Task guide: docs/tasks/courses.md
 */
import { getApiUrl } from "./api-url";

const API_URL = getApiUrl();

interface Course {
  code: string;
  title: string;
  credits: number;
}

export async function fetchCourses(): Promise<Course[]> {
  const response = await fetch(`${API_URL}/api/courses`);
  const data = (await response.json().catch(() => ({}))) as {
    courses?: Course[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error ?? `Courses API error: ${response.status}`);
  }
  return data.courses as Course[];
}
