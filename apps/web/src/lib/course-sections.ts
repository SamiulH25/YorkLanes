/**
 * Course section timetables API client.
 */
import { getApiUrl } from "./api-url";
import type {
  CourseOfferingSummaryResponse,
  CourseSectionsResponse,
  FetchSectionsOptions,
} from "../types/course-sections";

const API_URL = getApiUrl();

async function parseError(response: Response): Promise<string> {
  const data = (await response.json().catch(() => ({}))) as { error?: string; hint?: string };
  const parts = [data.error ?? `Course sections API error: ${response.status}`];
  if (data.hint) parts.push(data.hint);
  return parts.join(" ");
}

export async function fetchCourseSections(options: FetchSectionsOptions = {}): Promise<CourseSectionsResponse> {
  const params = new URLSearchParams();
  if (options.courseCode) params.set("course_code", options.courseCode);
  if (options.term) params.set("term", options.term);
  if (options.department) params.set("department", options.department);

  const query = params.toString();
  const response = await fetch(`${API_URL}/api/course-sections${query ? `?${query}` : ""}`);
  const data = (await response.json().catch(() => ({}))) as Partial<CourseSectionsResponse> & { error?: string };

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return {
    feature: data.feature ?? "course-sections",
    status: data.status ?? "ok",
    message: data.message ?? "",
    filters: data.filters ?? {},
    total_sections: data.total_sections ?? 0,
    groups: data.groups ?? [],
  };
}

export async function fetchCourseOfferingSummary(
  courseCode: string,
): Promise<CourseOfferingSummaryResponse["summary"]> {
  const params = new URLSearchParams({ course_code: courseCode });
  const response = await fetch(`${API_URL}/api/course-sections/summary?${params}`);
  const data = (await response.json().catch(() => ({}))) as Partial<CourseOfferingSummaryResponse> & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  if (!data.summary) {
    throw new Error("Course offering summary missing from API response");
  }

  return data.summary;
}
