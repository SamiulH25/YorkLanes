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
  createdAt?: string;
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

export async function setAssignmentDone(assignmentId: string, done: boolean): Promise<Assignment> {
  const response = await fetch(`${API_URL}/api/assignments/${assignmentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ done }),
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

export async function deleteAssignment(assignmentId: string): Promise<{ deleted: boolean }> {
  const response = await fetch(`${API_URL}/api/assignments/${assignmentId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Assignments delete API error: ${response.status}`);
  }
  
  return response.json() as Promise<{ deleted: boolean }>;
}

// In lib/assignments.ts
export async function updateAssignment(
  id: string,
  data: {
    title: string;
    courseCode: string;
    description: string;
    dueDate: string;
    userId?: string; // Add optional userId
  }
): Promise<Assignment> {
  if (!id) {
    throw new Error("Assignment ID is required for update");
  }

  const url = `${API_URL}/api/assignments/${id}`;
  console.log("Updating assignment at URL:", url);
  
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: data.title,
      courseCode: data.courseCode,
      description: data.description,
      dueDate: data.dueDate,
      userId: data.userId // Pass userId
    }),
  });

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(responseData.error || `Failed to update assignment: ${response.status}`);
  }

  return responseData.assignment as Assignment;
}