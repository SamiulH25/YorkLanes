import type pg from "pg";

export interface Assignment {
  id: string;
  title: string;
  courseCode: string;
  description: string | null;
  dueAt: string;
  done: boolean;
  createdAt: string;
}

interface AssignmentRow {
  id: string;
  title: string;
  course_code: string;
  description: string | null;
  due_at: string;
  done: boolean;
  created_at: string;
}

export interface CreateAssignmentInput {
  title: string;
  courseCode: string;
  description?: string | null;
  dueAt: string;
  userId?: string | null;
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
    createdAt: row.created_at,
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
  created_at::text as created_at`;

export async function listAssignments(
  pool: pg.Pool,
  userId?: string | null,
): Promise<Assignment[]> {
  const scope = scopeClause(userId);
  const result = await pool.query<AssignmentRow>(
    `select ${ASSIGNMENT_COLUMNS}
       from public.assignments
       ${scope.sql}
       order by due_at asc`,
    scope.values,
  );
  return result.rows.map(mapAssignment);
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
       set done = $1
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

export function canUseAssignmentsRest(): boolean {
  return Boolean(getSupabaseRestConfig());
}

const REST_SELECT = "id,title,course_code,description,due_at,done,created_at";

export async function listAssignmentsViaRest(userId?: string | null): Promise<Assignment[]> {
  const config = requireSupabaseRestConfig();
  const userFilter = userId ? `eq.${encodeURIComponent(userId)}` : "is.null";
  const url = new URL(`${config.url}/rest/v1/assignments`);
  url.searchParams.set("select", REST_SELECT);
  url.searchParams.set("user_id", userFilter);
  url.searchParams.set("order", "due_at.asc");

  const response = await fetch(url, { headers: assignmentsRestHeaders() });
  if (!response.ok) {
    throw new Error(`Assignments REST query failed: ${response.status} ${await response.text()}`);
  }

  const rows = (await response.json()) as AssignmentRow[];
  return rows.map(mapAssignment);
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

export async function setAssignmentDoneViaRest(
  assignmentId: string,
  done: boolean,
  userId?: string | null,
): Promise<Assignment | null> {
  const config = requireSupabaseRestConfig();
  const url = new URL(`${config.url}/rest/v1/assignments`);
  url.searchParams.set("id", `eq.${assignmentId}`);
  url.searchParams.set("user_id", userId ? `eq.${encodeURIComponent(userId)}` : "is.null");

  const response = await fetch(url, {
    method: "PATCH",
    headers: assignmentsRestHeaders({
      "Content-Type": "application/json",
      Prefer: "return=representation",
    }),
    body: JSON.stringify({ done }),
  });
  if (!response.ok) {
    throw new Error(`Assignments REST update failed: ${response.status} ${await response.text()}`);
  }

  const rows = (await response.json()) as AssignmentRow[];
  return rows[0] ? mapAssignment(rows[0]) : null;
}

export async function deleteAssignmentViaRest(
  assignmentId: string,
  userId?: string | null,
): Promise<boolean> {
  const config = requireSupabaseRestConfig();
  const url = new URL(`${config.url}/rest/v1/assignments`);
  url.searchParams.set("id", `eq.${assignmentId}`);
  url.searchParams.set("user_id", userId ? `eq.${encodeURIComponent(userId)}` : "is.null");

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
