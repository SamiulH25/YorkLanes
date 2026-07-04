/**
 * Course explorer API client.
 */
import { getApiUrl } from "./api-url";
import type {
  CourseDetail,
  CourseDetailResponse,
  CoursesListResponse,
  CourseSummary,
  DepartmentsResponse,
  FetchCoursesOptions,
} from "../types/courses";

const API_URL = getApiUrl();

async function parseError(response: Response): Promise<string> {
  const data = (await response.json().catch(() => ({}))) as { error?: string; hint?: string };
  const parts = [data.error ?? `Courses API error: ${response.status}`];
  if (data.hint) parts.push(data.hint);
  return parts.join(" ");
}

export function courseDetailPath(code: string): string {
  return `/courses/${encodeURIComponent(code)}`;
}

export async function fetchCourses(options: FetchCoursesOptions = {}): Promise<{
  courses: CourseSummary[];
  total: number;
  message: string;
}> {
  const params = new URLSearchParams();
  if (options.department) params.set("department", options.department);
  if (options.search) params.set("search", options.search);
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.offset !== undefined) params.set("offset", String(options.offset));

  const query = params.toString();
  const response = await fetch(`${API_URL}/api/courses${query ? `?${query}` : ""}`);
  const data = (await response.json().catch(() => ({}))) as Partial<CoursesListResponse> & { error?: string };

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return {
    courses: data.courses ?? [],
    total: data.total ?? data.courses?.length ?? 0,
    message: data.message ?? "",
  };
}

export async function fetchDepartments(): Promise<string[]> {
  const response = await fetch(`${API_URL}/api/courses/departments`);
  const data = (await response.json().catch(() => ({}))) as Partial<DepartmentsResponse> & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? `Departments API error: ${response.status}`);
  }

  return data.departments ?? [];
}

export async function fetchCourse(code: string): Promise<CourseDetail> {
  const response = await fetch(`${API_URL}/api/courses/${encodeURIComponent(code)}`);
  const data = (await response.json().catch(() => ({}))) as Partial<CourseDetailResponse> & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? `Course API error: ${response.status}`);
  }

  if (!data.course) {
    throw new Error("Course not found.");
  }

  return data.course;
}

export type { CourseDetail, CourseSummary };
