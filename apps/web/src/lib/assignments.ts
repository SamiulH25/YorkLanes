/** Task guide: docs/tasks/assignments.md */
import { getApiUrl } from "./api-url";

const API_URL = getApiUrl();

export interface Assignment {
  id: string;
  title: string;
  courseCode: string;
  description: string | null;
  dueAt: string;
  done: boolean;
}

export interface AssignmentsResponse {
  feature: string;
  status: string;
  message: string;
  assignments: Assignment[];
}

export interface CreateAssignmentInput {
  title: string;
  courseCode: string;
  description?: string;
  dueDate: string;
}

export async function fetchAssignments(): Promise<AssignmentsResponse> {
  const response = await fetch(`${API_URL}/api/assignments`);
  if (!response.ok) throw new Error(`Assignments API error: ${response.status}`);
  return response.json() as Promise<AssignmentsResponse>;
}

export async function createAssignment(input: CreateAssignmentInput): Promise<Assignment> {
  const response = await fetch(`${API_URL}/api/assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = (await response.json().catch(() => ({}))) as {
    assignment?: Assignment;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error ?? `Assignments API error: ${response.status}`);
  }

  return data.assignment as Assignment;
}
