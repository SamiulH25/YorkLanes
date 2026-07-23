/** Task guide: docs/tasks/assignments.md */
import { apiRequestInit, apiUrl } from "./api-request";

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

export async function fetchAssignments(cookieHeader?: string | null): Promise<AssignmentsResponse> {
  const response = await fetch(apiUrl("/api/assignments"), apiRequestInit(cookieHeader));
  if (!response.ok) throw new Error(`Assignments API error: ${response.status}`);
  return response.json() as Promise<AssignmentsResponse>;
}

export async function createAssignment(
  input: CreateAssignmentInput,
  cookieHeader?: string | null,
): Promise<Assignment> {
  const response = await fetch(
    apiUrl("/api/assignments"),
    apiRequestInit(cookieHeader, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );

  const data = (await response.json().catch(() => ({}))) as {
    assignment?: Assignment;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error ?? `Assignments API error: ${response.status}`);
  }

  return data.assignment as Assignment;
}

export async function setAssignmentDone(
  assignmentId: string,
  done: boolean,
  cookieHeader?: string | null,
): Promise<Assignment> {
  const response = await fetch(
    apiUrl(`/api/assignments/${assignmentId}`),
    apiRequestInit(cookieHeader, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    }),
  );

  const data = (await response.json().catch(() => ({}))) as {
    assignment?: Assignment;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error ?? `Assignments API error: ${response.status}`);
  }

  return data.assignment as Assignment;
}

export async function deleteAssignment(
  assignmentId: string,
  cookieHeader?: string | null,
): Promise<{ deleted: boolean }> {
  const response = await fetch(
    apiUrl(`/api/assignments/${assignmentId}`),
    apiRequestInit(cookieHeader, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    }),
  );

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(error.error || `Assignments delete API error: ${response.status}`);
  }

  return response.json() as Promise<{ deleted: boolean }>;
}

export async function updateAssignment(
  id: string,
  data: {
    title: string;
    courseCode: string;
    description: string;
    dueDate: string;
    userId?: string;
  },
  cookieHeader?: string | null,
): Promise<Assignment> {
  if (!id) {
    throw new Error("Assignment ID is required for update");
  }

  const response = await fetch(
    apiUrl(`/api/assignments/${id}`),
    apiRequestInit(cookieHeader, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: data.title,
        courseCode: data.courseCode,
        description: data.description,
        dueDate: data.dueDate,
        userId: data.userId,
      }),
    }),
  );

  const responseData = (await response.json().catch(() => ({}))) as {
    assignment?: Assignment;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(responseData.error || `Failed to update assignment: ${response.status}`);
  }

  return responseData.assignment as Assignment;
}
