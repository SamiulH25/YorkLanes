/** Task guide: docs/tasks/assignments.md */
import { apiRequestInit, apiUrl } from "./api-request";

export interface Assignment {
  id: string;
  title: string;
  courseCode: string;
  description: string | null;
  dueAt: string;
  done: boolean;
  starred: boolean;
  createdAt?: string;
  updatedAt?: string;
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

function normalizeAssignment(value: unknown): Assignment {
  if (!value || typeof value !== "object") {
    throw new Error("Assignments API returned an invalid assignment.");
  }

  const row = value as Record<string, unknown>;
  const title = row.title;
  const id = row.id;
  if (typeof title !== "string" || typeof id !== "string") {
    throw new Error("Assignments API returned an invalid assignment.");
  }

  return {
    id,
    title,
    courseCode: String(row.courseCode ?? row.course_code ?? ""),
    description: (row.description as string | null | undefined) ?? null,
    dueAt: String(row.dueAt ?? row.due_at ?? ""),
    done: Boolean(row.done),
    starred: Boolean(row.starred),
    createdAt:
      typeof row.createdAt === "string"
        ? row.createdAt
        : typeof row.created_at === "string"
          ? row.created_at
          : undefined,
    updatedAt:
      typeof row.updatedAt === "string"
        ? row.updatedAt
        : typeof row.updated_at === "string"
          ? row.updated_at
          : undefined,
  };
}

function parseAssignmentPayload(data: unknown): Assignment {
  if (!data || typeof data !== "object") {
    throw new Error("Assignments API returned an empty response.");
  }

  const record = data as Record<string, unknown>;
  if (record.assignment) {
    return normalizeAssignment(record.assignment);
  }

  if (typeof record.title === "string" && typeof record.id === "string") {
    return normalizeAssignment(record);
  }

  throw new Error(
    typeof record.error === "string"
      ? record.error
      : "Assignments API returned an invalid assignment.",
  );
}

async function readAssignmentError(response: Response): Promise<string> {
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return data.error ?? `Assignments API error: ${response.status}`;
}

function tryParseAssignmentPayload(data: unknown): Assignment | null {
  try {
    return parseAssignmentPayload(data);
  } catch {
    return null;
  }
}

export async function fetchAssignments(cookieHeader?: string | null): Promise<AssignmentsResponse> {
  const response = await fetch(apiUrl("/api/assignments"), apiRequestInit(cookieHeader));
  if (!response.ok) throw new Error(`Assignments API error: ${response.status}`);
  return response.json() as Promise<AssignmentsResponse>;
}

export async function createAssignment(
  input: CreateAssignmentInput,
  cookieHeader?: string | null,
): Promise<void> {
  const response = await fetch(
    apiUrl("/api/assignments"),
    apiRequestInit(cookieHeader, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );

  if (!response.ok) {
    throw new Error(await readAssignmentError(response));
  }

  // Mutation succeeded — the page reloads to refresh the list. Body may be empty
  // behind some proxies even when the row was created.
  if (response.status !== 204) {
    const data = await response.json().catch(() => ({}));
    tryParseAssignmentPayload(data);
  }
}

async function patchAssignment(
  assignmentId: string,
  body: { done?: boolean; starred?: boolean },
  cookieHeader?: string | null,
): Promise<void> {
  const response = await fetch(
    apiUrl(`/api/assignments/${assignmentId}`),
    apiRequestInit(cookieHeader, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

  if (!response.ok) {
    throw new Error(await readAssignmentError(response));
  }

  if (response.status !== 204) {
    const data = await response.json().catch(() => ({}));
    tryParseAssignmentPayload(data);
  }
}

export function setAssignmentDone(
  assignmentId: string,
  done: boolean,
  cookieHeader?: string | null,
): Promise<void> {
  return patchAssignment(assignmentId, { done }, cookieHeader);
}

export function setAssignmentStarred(
  assignmentId: string,
  starred: boolean,
  cookieHeader?: string | null,
): Promise<void> {
  return patchAssignment(assignmentId, { starred }, cookieHeader);
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
  },
  cookieHeader?: string | null,
): Promise<void> {
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
      }),
    }),
  );

  if (!response.ok) {
    throw new Error(await readAssignmentError(response));
  }

  if (response.status !== 204) {
    const responseData = await response.json().catch(() => ({}));
    tryParseAssignmentPayload(responseData);
  }
}
