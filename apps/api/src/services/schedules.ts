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
  status: "upcoming" | "in_progress" | "past";
}

/** York campus wall-clock for "today" filtering on the dashboard. */
export const SCHEDULE_TIMEZONE = "America/Toronto";

const DAY_ABBREV_TO_FULL: Record<string, string> = {
  SUN: "Sunday",
  SUNDAY: "Sunday",
  MON: "Monday",
  MONDAY: "Monday",
  M: "Monday",
  TUE: "Tuesday",
  TUESDAY: "Tuesday",
  T: "Tuesday",
  WED: "Wednesday",
  WEDNESDAY: "Wednesday",
  W: "Wednesday",
  THU: "Thursday",
  THURSDAY: "Thursday",
  R: "Thursday",
  FRI: "Friday",
  FRIDAY: "Friday",
  F: "Friday",
  SAT: "Saturday",
  SATURDAY: "Saturday",
};

export function parseWallClockTime(value: string | Date): { hours: number; minutes: number } {
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      return { hours: Number(match[1]), minutes: Number(match[2]) };
    }
    return { hours: 0, minutes: 0 };
  }
  // node-pg returns TIME columns as Date anchored at UTC epoch.
  return { hours: value.getUTCHours(), minutes: value.getUTCMinutes() };
}

export function formatWallClockTime(value: string | Date): string {
  const { hours, minutes } = parseWallClockTime(value);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function normalizeScheduleDay(day: string): string {
  const trimmed = day.trim();
  const upper = trimmed.toUpperCase();
  if (DAY_ABBREV_TO_FULL[upper]) return DAY_ABBREV_TO_FULL[upper];
  const match = Object.values(DAY_ABBREV_TO_FULL).find(
    (full) => full.toLowerCase() === trimmed.toLowerCase(),
  );
  return match ?? trimmed;
}

export function scheduleClock(
  now = new Date(),
  timeZone = SCHEDULE_TIMEZONE,
): { dayName: string; minutesSinceMidnight: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);

  const dayName = parts.find((part) => part.type === "weekday")?.value ?? "Monday";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return { dayName, minutesSinceMidnight: hour * 60 + minute };
}

function formatTime(value: string | Date): string {
  return formatWallClockTime(value);
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
    day: normalizeScheduleDay(row.day),
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
          normalizeScheduleDay(entry.day),
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

    const activeCheck = await client.query<{ has_active: boolean }>(
      `select exists(
         select 1 from public.user_schedules
         where user_id = $1 and is_active = true
       ) as has_active`,
      [userId],
    );
    if (!activeCheck.rows[0]?.has_active) {
      await client.query(`update public.user_schedules set is_active = true where id = $1`, [scheduleId]);
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

export interface HubScheduleEntryRow {
  id: string;
  course_code: string;
  section_code: string;
  day: string;
  start_time: string | Date;
  end_time: string | Date;
  room: string | null;
  campus: string | null;
}

export async function listTodayClasses(
  pool: pg.Pool,
  userId: string,
  limit = 8,
  now = new Date(),
): Promise<{
  today: TodayClassPreview[];
  primarySchedule: { planYear: number; planSeason: string; cdmTerm: string } | null;
  hasPrimary: boolean;
  savedCount: number;
  todayBlockCount: number;
  totalBlockCount: number;
  /** Full-week rows for hub calendar; avoids a second schedule query in dashboard buildHub. */
  hubScheduleEntries: HubScheduleEntryRow[];
}> {
  const [primary, savedCount] = await Promise.all([
    getPrimaryScheduleMeta(pool, userId),
    countSavedSchedules(pool, userId),
  ]);

  if (!primary) {
    return {
      today: [],
      primarySchedule: null,
      hasPrimary: false,
      savedCount,
      todayBlockCount: 0,
      totalBlockCount: 0,
      hubScheduleEntries: [],
    };
  }

  const header = await pool.query<{ id: string }>(
    `select id from public.user_schedules
     where user_id = $1 and plan_year = $2 and plan_season = $3 and cdm_term = $4`,
    [userId, primary.planYear, primary.planSeason, primary.cdmTerm],
  );
  if (header.rows.length === 0) {
    return {
      today: [],
      primarySchedule: primary,
      hasPrimary: true,
      savedCount,
      todayBlockCount: 0,
      totalBlockCount: 0,
      hubScheduleEntries: [],
    };
  }

  const { dayName, minutesSinceMidnight: nowMinutes } = scheduleClock(now);

  const result = await pool.query<{
    id: string;
    course_code: string;
    section_code: string;
    component_type: string;
    day: string;
    start_time: string | Date;
    end_time: string | Date;
    room: string | null;
    campus: string | null;
  }>(
    `select id, course_code, section_code, component_type, day, start_time, end_time, room, campus
     from public.schedule_entries
     where schedule_id = $1
     order by start_time asc`,
    [header.rows[0].id],
  );

  const todayRows = result.rows.filter((row) => normalizeScheduleDay(row.day) === dayName);

  const today = todayRows
    .map((row) => {
      const startTime = formatTime(row.start_time);
      const endTime = formatTime(row.end_time);
      const start = parseWallClockTime(row.start_time);
      const end = parseWallClockTime(row.end_time);
      const startMinutes = start.hours * 60 + start.minutes;
      const endMinutes = end.hours * 60 + end.minutes;
      let status: TodayClassPreview["status"] = "upcoming";
      if (nowMinutes >= endMinutes) {
        status = "past";
      } else if (nowMinutes >= startMinutes) {
        status = "in_progress";
      }
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
        status,
      };
    })
    .sort((a, b) => a.startMinutes - b.startMinutes)
    .slice(0, limit)
    .map(({ startMinutes: _s, ...item }) => item);

  return {
    today,
    primarySchedule: primary,
    hasPrimary: true,
    savedCount,
    todayBlockCount: todayRows.length,
    totalBlockCount: result.rows.length,
    hubScheduleEntries: result.rows,
  };
}
