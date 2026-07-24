import type pg from "pg";

export interface Assignment {
  id: string;
  title: string;
  courseCode: string;
  description: string | null;
  dueAt: string;
  done: boolean;
  starred: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AssignmentRow {
  id: string;
  title: string;
  course_code: string;
  description: string | null;
  due_at: string;
  done: boolean;
  starred: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAssignmentInput {
  title: string;
  courseCode: string;
  description?: string | null;
  dueAt: string;
  userId?: string | null;
}

export interface UpdateAssignmentInput {
  title: string;
  courseCode: string;
  description: string | null;
  dueAt: string;
  done?: boolean;
}

function getSupabaseRestConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function assignmentsRestHeaders(extra?: HeadersInit): HeadersInit {
  const config = getSupabaseRestConfig();
  if (!config) return extra ?? {};

  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    ...extra,
  };
}

function requireSupabaseRestConfig(): { url: string; key: string } {
  const config = getSupabaseRestConfig();
  if (!config) {
    throw new Error("No assignments database configured. Set SUPABASE_DB_URL or SUPABASE_URL plus SUPABASE_PUBLISHABLE_KEY.");
  }
  return config;
}

function mapAssignment(row: AssignmentRow): Assignment {
  return {
    id: row.id,
    title: row.title,
    courseCode: row.course_code,
    description: row.description,
    dueAt: row.due_at,
    done: row.done,
    starred: row.starred,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function scopeClause(userId?: string | null): { sql: string; values: string[] } {
  if (userId) {
    return { sql: "where user_id = $1", values: [userId] };
  }
  return { sql: "where user_id is null", values: [] };
}

const ASSIGNMENT_COLUMNS = `
  id,
  title,
  course_code,
  description,
  due_at::text as due_at,
  done,
  starred,
  created_at::text as created_at,
  updated_at::text as updated_at`;

// Starred first, then soonest due date.
const ASSIGNMENT_ORDER = "order by starred desc, due_at asc";

export async function listAssignments(
  pool: pg.Pool,
  userId?: string | null,
): Promise<Assignment[]> {
  const scope = scopeClause(userId);
  const result = await pool.query<AssignmentRow>(
    `select ${ASSIGNMENT_COLUMNS}
       from public.assignments
       ${scope.sql}
       ${ASSIGNMENT_ORDER}`,
    scope.values,
  );
  return result.rows.map(mapAssignment);
}

export interface UpcomingAssignment {
  id: string;
  title: string;
  courseCode: string;
  dueAt: string;
}

// Soonest pending deadlines for the dashboard widget (overdue-but-open sort first).
export async function listUpcomingAssignments(
  pool: pg.Pool,
  userId: string | null | undefined,
  limit = 5,
): Promise<UpcomingAssignment[]> {
  const scope = userId ? "user_id = $1" : "user_id is null";
  const values: unknown[] = userId ? [userId, limit] : [limit];
  const limitParam = userId ? "$2" : "$1";
  const result = await pool.query<{ id: string; title: string; course_code: string; due_at: string }>(
    `select id, title, course_code, due_at::text as due_at
       from public.assignments
       where ${scope} and done = false
       order by due_at asc
       limit ${limitParam}`,
    values,
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    courseCode: row.course_code,
    dueAt: row.due_at,
  }));
}

export async function createAssignment(
  pool: pg.Pool,
  input: CreateAssignmentInput,
): Promise<Assignment> {
  const result = await pool.query<AssignmentRow>(
    `insert into public.assignments
       (user_id, title, course_code, description, due_at)
     values ($1, $2, $3, $4, $5)
     returning ${ASSIGNMENT_COLUMNS}`,
    [
      input.userId ?? null,
      input.title,
      input.courseCode,
      input.description ?? null,
      input.dueAt,
    ],
  );
  return mapAssignment(result.rows[0]);
}

export async function updateAssignment(
  pool: pg.Pool,
  assignmentId: string,
  data: UpdateAssignmentInput,
  userId?: string | null,
): Promise<Assignment | null> {
  const scope = userId ? "user_id = $6" : "user_id is null";
  const values: unknown[] = [
    data.title,
    data.courseCode,
    data.description ?? null,
    data.dueAt,
    data.done ?? null,
    ...(userId ? [userId] : []),
  ];
  const result = await pool.query<AssignmentRow>(
    `update public.assignments
       set title = $1,
           course_code = $2,
           description = $3,
           due_at = $4,
           done = coalesce($5, done),
           updated_at = now()
     where id = ${userId ? "$7" : "$6"} and ${scope}
     returning ${ASSIGNMENT_COLUMNS}`,
    [...values, assignmentId],
  );
  return result.rows[0] ? mapAssignment(result.rows[0]) : null;
}

export async function setAssignmentDone(
  pool: pg.Pool,
  assignmentId: string,
  done: boolean,
  userId?: string | null,
): Promise<Assignment | null> {
  const scope = userId ? "user_id = $3" : "user_id is null";
  const values = userId ? [done, assignmentId, userId] : [done, assignmentId];
  const result = await pool.query<AssignmentRow>(
    `update public.assignments
       set done = $1, updated_at = now()
       where id = $2 and ${scope}
       returning ${ASSIGNMENT_COLUMNS}`,
    values,
  );
  return result.rows[0] ? mapAssignment(result.rows[0]) : null;
}

export async function setAssignmentStarred(
  pool: pg.Pool,
  assignmentId: string,
  starred: boolean,
  userId?: string | null,
): Promise<Assignment | null> {
  const scope = userId ? "user_id = $3" : "user_id is null";
  const values = userId ? [starred, assignmentId, userId] : [starred, assignmentId];
  const result = await pool.query<AssignmentRow>(
    `update public.assignments
       set starred = $1, updated_at = now()
       where id = $2 and ${scope}
       returning ${ASSIGNMENT_COLUMNS}`,
    values,
  );
  return result.rows[0] ? mapAssignment(result.rows[0]) : null;
}

export async function deleteAssignment(
  pool: pg.Pool,
  assignmentId: string,
  userId?: string | null,
): Promise<boolean> {
  const scope = userId ? "user_id = $2" : "user_id is null";
  const values = userId ? [assignmentId, userId] : [assignmentId];
  const result = await pool.query(
    `delete from public.assignments
       where id = $1 and ${scope}`,
    values,
  );
  return (result.rowCount ?? 0) > 0;
}

// --- Supabase REST fallback (used when only SUPABASE_URL + key are set) -------

export function canUseAssignmentsRest(): boolean {
  return Boolean(getSupabaseRestConfig());
}

const REST_SELECT = "id,title,course_code,description,due_at,done,starred,created_at,updated_at";

function restUserFilter(userId?: string | null): string {
  return userId ? `eq.${encodeURIComponent(userId)}` : "is.null";
}

export async function listAssignmentsViaRest(userId?: string | null): Promise<Assignment[]> {
  const config = requireSupabaseRestConfig();
  const url = new URL(`${config.url}/rest/v1/assignments`);
  url.searchParams.set("select", REST_SELECT);
  url.searchParams.set("user_id", restUserFilter(userId));
  // Starred first, then soonest due.
  url.searchParams.set("order", "starred.desc,due_at.asc");

  const response = await fetch(url, { headers: assignmentsRestHeaders() });
  if (!response.ok) {
    throw new Error(`Assignments REST query failed: ${response.status} ${await response.text()}`);
  }

  const rows = (await response.json()) as AssignmentRow[];
  return rows.map(mapAssignment);
}

export async function listUpcomingAssignmentsViaRest(
  userId: string | null | undefined,
  limit = 5,
): Promise<UpcomingAssignment[]> {
  const config = requireSupabaseRestConfig();
  const url = new URL(`${config.url}/rest/v1/assignments`);
  url.searchParams.set("select", "id,title,course_code,due_at");
  url.searchParams.set("user_id", restUserFilter(userId));
  url.searchParams.set("done", "eq.false");
  url.searchParams.set("order", "due_at.asc");
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, { headers: assignmentsRestHeaders() });
  if (!response.ok) {
    throw new Error(`Assignments REST query failed: ${response.status} ${await response.text()}`);
  }

  const rows = (await response.json()) as Array<{
    id: string;
    title: string;
    course_code: string;
    due_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    courseCode: row.course_code,
    dueAt: row.due_at,
  }));
}

export async function createAssignmentViaRest(input: CreateAssignmentInput): Promise<Assignment> {
  const config = requireSupabaseRestConfig();
  const response = await fetch(`${config.url}/rest/v1/assignments`, {
    method: "POST",
    headers: assignmentsRestHeaders({
      "Content-Type": "application/json",
      Prefer: "return=representation",
    }),
    body: JSON.stringify({
      user_id: input.userId ?? null,
      title: input.title,
      course_code: input.courseCode,
      description: input.description ?? null,
      due_at: input.dueAt,
    }),
  });

  if (!response.ok) {
    throw new Error(`Assignments REST insert failed: ${response.status} ${await response.text()}`);
  }

  const rows = (await response.json()) as AssignmentRow[];
  return mapAssignment(rows[0]);
}

async function patchAssignmentViaRest(
  assignmentId: string,
  body: Record<string, unknown>,
  userId?: string | null,
): Promise<Assignment | null> {
  const config = requireSupabaseRestConfig();
  const url = new URL(`${config.url}/rest/v1/assignments`);
  url.searchParams.set("id", `eq.${assignmentId}`);
  url.searchParams.set("user_id", restUserFilter(userId));

  const response = await fetch(url, {
    method: "PATCH",
    headers: assignmentsRestHeaders({
      "Content-Type": "application/json",
      Prefer: "return=representation",
    }),
    body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) {
    throw new Error(`Assignments REST update failed: ${response.status} ${await response.text()}`);
  }

  const rows = (await response.json()) as AssignmentRow[];
  return rows[0] ? mapAssignment(rows[0]) : null;
}

export async function updateAssignmentViaRest(
  assignmentId: string,
  data: UpdateAssignmentInput,
  userId?: string | null,
): Promise<Assignment | null> {
  const body: Record<string, unknown> = {
    title: data.title,
    course_code: data.courseCode,
    description: data.description ?? null,
    due_at: data.dueAt,
  };
  if (typeof data.done === "boolean") body.done = data.done;
  return patchAssignmentViaRest(assignmentId, body, userId);
}

export async function setAssignmentDoneViaRest(
  assignmentId: string,
  done: boolean,
  userId?: string | null,
): Promise<Assignment | null> {
  return patchAssignmentViaRest(assignmentId, { done }, userId);
}

export async function setAssignmentStarredViaRest(
  assignmentId: string,
  starred: boolean,
  userId?: string | null,
): Promise<Assignment | null> {
  return patchAssignmentViaRest(assignmentId, { starred }, userId);
}

export async function deleteAssignmentViaRest(
  assignmentId: string,
  userId?: string | null,
): Promise<boolean> {
  const config = requireSupabaseRestConfig();
  const url = new URL(`${config.url}/rest/v1/assignments`);
  url.searchParams.set("id", `eq.${assignmentId}`);
  url.searchParams.set("user_id", restUserFilter(userId));

  const response = await fetch(url, {
    method: "DELETE",
    headers: assignmentsRestHeaders({ Prefer: "return=representation" }),
  });
  if (!response.ok) {
    throw new Error(`Assignments REST delete failed: ${response.status} ${await response.text()}`);
  }

  const rows = (await response.json()) as AssignmentRow[];
  return rows.length > 0;
}
