/** Task guide: docs/tasks/assignments.md */
const API_URL = import.meta.env.PUBLIC_API_URL ?? "http://localhost:3001";

export interface AssignmentsResponse {
  feature: string;
  status: string;
  message: string;
  nextSteps: string[];
  assignments: unknown[];
}

export async function fetchAssignments(): Promise<AssignmentsResponse> {
  const response = await fetch(`${API_URL}/api/assignments`);
  if (!response.ok) throw new Error(`Assignments API error: ${response.status}`);
  return response.json() as Promise<AssignmentsResponse>;
}
