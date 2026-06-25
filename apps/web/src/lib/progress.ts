/** Task guide: docs/tasks/progress.md */
import { getApiUrl } from "./api-url";

const API_URL = getApiUrl();

export interface ProgressResponse {
  feature: string;
  status: string;
  message: string;
  nextSteps: string[];
  percentComplete: number;
}

export async function fetchProgress(): Promise<ProgressResponse> {
  const response = await fetch(`${API_URL}/api/progress`);
  if (!response.ok) throw new Error(`Progress API error: ${response.status}`);
  return response.json() as Promise<ProgressResponse>;
}
