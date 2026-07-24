import { randomUUID } from "node:crypto";
import type pg from "pg";

export interface ScheduleBundlePick {
  courseCode: string;
  bundleId: string;
  picks: Record<string, string>;
}

export interface ScheduleGridEntryRow {
  id: string;
  course_code: string;
  section_code: string;
  component_type: string;
  day: string;
  start_time: string;
  end_time: string;
  room: string | null;
  campus: string | null;
  bundle_id: string;
}

export interface ScheduleWeekPayload {
  planYear: number;
  planSeason: string;
  cdmTerm: string;
  entries: Array<{
    id?: string;
    course_code: string;
    section_code: string;
    component_type: string;
    day: string;
    start_time: string;
    end_time: string;
    room?: string | null;
    campus?: string | null;
    bundle_id?: string;
  }>;
  bundles?: Array<{
    course_code: string;
    bundle_id: string;
    picks: Record<string, string>;
  }>;
}

export interface ScheduleWeekResponse {
  planYear: number;
  planSeason: string;
  cdmTerm: string;
  entries: ScheduleGridEntryRow[];
  bundles: ScheduleBundlePick[];
  isActive: boolean;
  updatedAt: string;
}

export interface SavedScheduleSummary {
  planYear: number;
  planSeason: string;
  cdmTerm: string;
  courseCount: number;
  entryCount: number;
  isActive: boolean;
  updatedAt: string;
}

export interface TodayClassPreview {
  id: string;
  courseCode: string;
  sectionCode: string;
  componentType: string;
  startTime: string;
  endTime: string;
  room?: string | null;
  campus?: string | null;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(value: string | Date): string {
  if (typeof value === "string") {
    return value.slice(0, 5);
  }
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function todayName(): string {
  return WEEKDAYS[new Date().getDay()];
}

function mapEntryRow(row: {
  id: string;
  course_code: string;
  section_code: string;
  component_type: string;
  day: string;
  start_time: string | Date;
  end_time: string | Date;
  room: string | null;
  campus: string | null;
  bundle_id: string;
}): ScheduleGridEntryRow {
  return {
    id: row.id,
    course_code: row.course_code,
    section_code: row.section_code,
    component_type: row.component_type,
    day: row.day,
    start_time: formatTime(row.start_time),
    end_time: formatTime(row.end_time),
    room: row.room,
    campus: row.campus,
    bundle_id: row.bundle_id,
  };
}

export async function listSavedSchedules(
  pool: pg.Pool,
  userId: string,
): Promise<SavedScheduleSummary[]> {
  const result = await pool.query<{
    plan_year: number;
    plan_season: string;
    cdm_term: string;
    is_active: boolean;
    updated_at: string;
    entry_count: string;
    course_count: string;
  }>(
    `select
       us.plan_year,
       us.plan_season,
       us.cdm_term,
       us.is_active,
       us.updated_at,
       count(distinct se.course_code)::text as course_count,
       count(se.id)::text as entry_count
     from public.user_schedules us
     left join public.schedule_entries se on se.schedule_id = us.id
     where us.user_id = $1
     group by us.id
     order by us.updated_at desc`,
    [userId],
  );

  return result.rows.map((row) => ({
    planYear: row.plan_year,
    planSeason: row.plan_season,
    cdmTerm: row.cdm_term,
    courseCount: Number(row.course_count) || 0,
    entryCount: Number(row.entry_count) || 0,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  }));
}

export async function getScheduleWeek(
  pool: pg.Pool,
  userId: string,
  planYear: number,
  planSeason: string,
  cdmTerm: string,
): Promise<ScheduleWeekResponse | null> {
  const header = await pool.query<{
    id: string;
    is_active: boolean;
    updated_at: string;
  }>(
    `select id, is_active, updated_at
     from public.user_schedules
     where user_id = $1 and plan_year = $2 and plan_season = $3 and cdm_term = $4`,
    [userId, planYear, planSeason, cdmTerm],
  );

  if (header.rows.length === 0) return null;

  const scheduleId = header.rows[0].id;
  const [entriesResult, bundlesResult] = await Promise.all([
    pool.query(
      `select id, course_code, section_code, component_type, day, start_time, end_time, room, campus, bundle_id
       from public.schedule_entries
       where schedule_id = $1
       order by day, start_time, course_code`,
      [scheduleId],
    ),
    pool.query<{ course_code: string; bundle_id: string; picks: Record<string, string> }>(
      `select course_code, bundle_id, picks
       from public.schedule_course_bundles
       where schedule_id = $1
       order by course_code`,
      [scheduleId],
    ),
  ]);

  return {
    planYear,
    planSeason,
    cdmTerm,
    entries: entriesResult.rows.map(mapEntryRow),
    bundles: bundlesResult.rows.map((row) => ({
      courseCode: row.course_code,
      bundleId: row.bundle_id,
      picks: row.picks ?? {},
    })),
    isActive: header.rows[0].is_active,
    updatedAt: header.rows[0].updated_at,
  };
}

export async function upsertScheduleWeek(
  pool: pg.Pool,
  userId: string,
  payload: ScheduleWeekPayload,
): Promise<ScheduleWeekResponse> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const header = await client.query<{ id: string }>(
      `insert into public.user_schedules (user_id, plan_year, plan_season, cdm_term, updated_at)
       values ($1, $2, $3, $4, now())
       on conflict (user_id, plan_year, plan_season, cdm_term)
       do update set updated_at = now()
       returning id`,
      [userId, payload.planYear, payload.planSeason, payload.cdmTerm],
    );
    const scheduleId = header.rows[0].id;

    await client.query(`delete from public.schedule_entries where schedule_id = $1`, [scheduleId]);
    await client.query(`delete from public.schedule_course_bundles where schedule_id = $1`, [scheduleId]);

    for (const [index, entry] of payload.entries.entries()) {
      const bundleId = entry.bundle_id ?? randomUUID();
      await client.query(
        `insert into public.schedule_entries (
           id, schedule_id, course_code, section_code, component_type, day,
           start_time, end_time, room, campus, bundle_id, sort_order
         ) values (
           coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7::time, $8::time, $9, $10, $11::uuid, $12
         )`,
        [
          entry.id ?? null,
          scheduleId,
          entry.course_code,
          entry.section_code,
          entry.component_type,
          entry.day,
          entry.start_time,
          entry.end_time,
          entry.room ?? null,
          entry.campus ?? null,
          bundleId,
          index,
        ],
      );
    }

    for (const bundle of payload.bundles ?? []) {
      await client.query(
        `insert into public.schedule_course_bundles (schedule_id, course_code, bundle_id, picks)
         values ($1, $2, $3::uuid, $4::jsonb)`,
        [scheduleId, bundle.course_code, bundle.bundle_id, JSON.stringify(bundle.picks ?? {})],
      );
    }

    await client.query("commit");

    const saved = await getScheduleWeek(pool, userId, payload.planYear, payload.planSeason, payload.cdmTerm);
    if (!saved) {
      throw new Error("Failed to load saved schedule after upsert");
    }
    return saved;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function setActiveSchedule(
  pool: pg.Pool,
  userId: string,
  planYear: number,
  planSeason: string,
  cdmTerm: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = await client.query(
      `select 1 from public.user_schedules
       where user_id = $1 and plan_year = $2 and plan_season = $3 and cdm_term = $4`,
      [userId, planYear, planSeason, cdmTerm],
    );
    if ((existing.rowCount ?? 0) === 0) {
      await client.query("rollback");
      return false;
    }

    await client.query(`update public.user_schedules set is_active = false where user_id = $1`, [userId]);
    const activated = await client.query(
      `update public.user_schedules
       set is_active = true, updated_at = now()
       where user_id = $1 and plan_year = $2 and plan_season = $3 and cdm_term = $4`,
      [userId, planYear, planSeason, cdmTerm],
    );
    if ((activated.rowCount ?? 0) === 0) {
      await client.query("rollback");
      return false;
    }

    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteScheduleWeek(
  pool: pg.Pool,
  userId: string,
  planYear: number,
  planSeason: string,
  cdmTerm: string,
): Promise<boolean> {
  const result = await pool.query(
    `delete from public.user_schedules
     where user_id = $1 and plan_year = $2 and plan_season = $3 and cdm_term = $4`,
    [userId, planYear, planSeason, cdmTerm],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getPrimaryScheduleMeta(
  pool: pg.Pool,
  userId: string,
): Promise<{ planYear: number; planSeason: string; cdmTerm: string } | null> {
  const result = await pool.query<{ plan_year: number; plan_season: string; cdm_term: string }>(
    `select plan_year, plan_season, cdm_term
     from public.user_schedules
     where user_id = $1 and is_active = true
     order by updated_at desc
     limit 1`,
    [userId],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return { planYear: row.plan_year, planSeason: row.plan_season, cdmTerm: row.cdm_term };
}

export async function countSavedSchedules(pool: pg.Pool, userId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `select count(*)::text as count from public.user_schedules where user_id = $1`,
    [userId],
  );
  return Number(result.rows[0]?.count) || 0;
}

export async function getActiveScheduleMeta(
  pool: pg.Pool,
  userId: string,
): Promise<{ planYear: number; planSeason: string; cdmTerm: string } | null> {
  const result = await pool.query<{ plan_year: number; plan_season: string; cdm_term: string }>(
    `select plan_year, plan_season, cdm_term
     from public.user_schedules
     where user_id = $1 and is_active = true
     order by updated_at desc
     limit 1`,
    [userId],
  );
  if (result.rows.length > 0) {
    const row = result.rows[0];
    return { planYear: row.plan_year, planSeason: row.plan_season, cdmTerm: row.cdm_term };
  }

  const fallback = await pool.query<{ plan_year: number; plan_season: string; cdm_term: string }>(
    `select plan_year, plan_season, cdm_term
     from public.user_schedules
     where user_id = $1
     order by updated_at desc
     limit 1`,
    [userId],
  );
  if (fallback.rows.length === 0) return null;
  const row = fallback.rows[0];
  return { planYear: row.plan_year, planSeason: row.plan_season, cdmTerm: row.cdm_term };
}

export async function listTodayClasses(
  pool: pg.Pool,
  userId: string,
  limit = 8,
): Promise<{
  today: TodayClassPreview[];
  primarySchedule: { planYear: number; planSeason: string; cdmTerm: string } | null;
  hasPrimary: boolean;
  savedCount: number;
}> {
  const [primary, savedCount] = await Promise.all([
    getPrimaryScheduleMeta(pool, userId),
    countSavedSchedules(pool, userId),
  ]);

  if (!primary) {
    return { today: [], primarySchedule: null, hasPrimary: false, savedCount };
  }

  const header = await pool.query<{ id: string }>(
    `select id from public.user_schedules
     where user_id = $1 and plan_year = $2 and plan_season = $3 and cdm_term = $4`,
    [userId, primary.planYear, primary.planSeason, primary.cdmTerm],
  );
  if (header.rows.length === 0) {
    return { today: [], primarySchedule: primary, hasPrimary: true, savedCount };
  }

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const day = todayName();

  const result = await pool.query<{
    id: string;
    course_code: string;
    section_code: string;
    component_type: string;
    start_time: string | Date;
    end_time: string | Date;
    room: string | null;
    campus: string | null;
  }>(
    `select id, course_code, section_code, component_type, start_time, end_time, room, campus
     from public.schedule_entries
     where schedule_id = $1 and day = $2
     order by start_time asc`,
    [header.rows[0].id, day],
  );

  const today = result.rows
    .map((row) => {
      const startTime = formatTime(row.start_time);
      const endTime = formatTime(row.end_time);
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      const startMinutes = sh * 60 + sm;
      const endMinutes = eh * 60 + em;
      return {
        id: row.id,
        courseCode: row.course_code,
        sectionCode: row.section_code,
        componentType: row.component_type,
        startTime,
        endTime,
        room: row.room,
        campus: row.campus,
        startMinutes,
        endMinutes,
      };
    })
    .filter((item) => item.endMinutes > nowMinutes)
    .slice(0, limit)
    .map(({ startMinutes: _s, endMinutes: _e, ...item }) => item);

  return { today, primarySchedule: primary, hasPrimary: true, savedCount };
}
