import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type pg from "pg";
import {
  coerceScheduleUuid,
  listTodayClasses,
  normalizeScheduleDay,
  parseWallClockTime,
  scheduleClock,
  setActiveSchedule,
} from "../../apps/api/src/services/schedules.js";

type QueryResult = { rowCount: number | null; rows?: unknown[] };

function createMockPool(
  handler: (sql: string, params?: unknown[]) => QueryResult,
): pg.Pool {
  const client = {
    async query(sql: string, params?: unknown[]) {
      return handler(sql, params);
    },
    release() {},
  };

  return {
    async connect() {
      return client;
    },
    async query(sql: string, params?: unknown[]) {
      return handler(sql, params);
    },
  } as unknown as pg.Pool;
}

describe("coerceScheduleUuid", () => {
  it("accepts valid UUIDs and rejects stable client entry keys", () => {
    assert.equal(coerceScheduleUuid("550e8400-e29b-41d4-a716-446655440000"), "550e8400-e29b-41d4-a716-446655440000");
    assert.equal(coerceScheduleUuid("CHEM 1100|LECT 01 (M)|Thursday|08:30"), null);
    assert.equal(coerceScheduleUuid(null), null);
  });
});

describe("normalizeScheduleDay", () => {
  it("maps scraper abbreviations and preserves full day names", () => {
    assert.equal(normalizeScheduleDay("MON"), "Monday");
    assert.equal(normalizeScheduleDay("fri"), "Friday");
    assert.equal(normalizeScheduleDay("F"), "Friday");
    assert.equal(normalizeScheduleDay("W"), "Wednesday");
    assert.equal(normalizeScheduleDay("Wednesday"), "Wednesday");
  });
});

describe("parseWallClockTime", () => {
  it("reads node-pg TIME values from UTC epoch dates", () => {
    const parsed = parseWallClockTime(new Date("1970-01-01T17:30:00.000Z"));
    assert.deepEqual(parsed, { hours: 17, minutes: 30 });
  });
});

describe("scheduleClock", () => {
  it("uses America/Toronto so late UTC evenings still count as the same York day", () => {
  // 2026-07-25 01:30 UTC is still Friday evening in Toronto.
    const clock = scheduleClock(new Date("2026-07-25T01:30:00Z"));
    assert.equal(clock.dayName, "Friday");
    assert.equal(clock.minutesSinceMidnight, 21 * 60 + 30);
  });
});

describe("listTodayClasses", () => {
  it("returns all Toronto weekday matches including finished blocks", async () => {
    const pool = createMockPool((sql) => {
      if (sql.includes("from public.user_schedules") && sql.includes("is_active = true")) {
        return {
          rowCount: 1,
          rows: [{ plan_year: 1, plan_season: "fall", cdm_term: "2026-2027 FW" }],
        };
      }
      if (sql.includes("count(*)::text as count from public.user_schedules")) {
        return { rowCount: 1, rows: [{ count: "1" }] };
      }
      if (sql.includes("select id from public.user_schedules")) {
        return { rowCount: 1, rows: [{ id: "sched-1" }] };
      }
      if (sql.includes("from public.schedule_entries")) {
        return {
          rowCount: 4,
          rows: [
            {
              id: "past-mon",
              course_code: "EECS 1012",
              section_code: "LEC A",
              component_type: "lec",
              day: "MON",
              start_time: "08:00",
              end_time: "09:00",
              room: "DB",
              campus: "Keele",
            },
            {
              id: "past-fri",
              course_code: "EECS 1011",
              section_code: "LEC A",
              component_type: "lec",
              day: "FRI",
              start_time: "10:00",
              end_time: "11:00",
              room: "DB",
              campus: "Keele",
            },
            {
              id: "now",
              course_code: "EECS 2030",
              section_code: "LEC B",
              component_type: "lec",
              day: "Friday",
              start_time: "22:00",
              end_time: "23:00",
              room: "LAS",
              campus: "Keele",
            },
            {
              id: "later",
              course_code: "EECS 3421",
              section_code: "TUT 01",
              component_type: "tut",
              day: "FRI",
              start_time: "23:30",
              end_time: "23:59",
              room: "TEL",
              campus: "Keele",
            },
          ],
        };
      }
      return { rowCount: 0, rows: [] };
    });

    const result = await listTodayClasses(
      pool,
      "user-1",
      8,
      new Date("2026-07-25T01:30:00Z"),
    );

    assert.equal(result.hasPrimary, true);
    assert.equal(result.todayBlockCount, 3);
    assert.equal(result.today.length, 3);
    assert.deepEqual(
      result.today.map((item) => item.id),
      ["past-fri", "now", "later"],
    );
    assert.equal(result.today[0]?.status, "past");
    assert.equal(result.today[1]?.status, "upcoming");
  });

  it("reports saved schedules without an active dashboard timetable", async () => {
    const pool = createMockPool((sql) => {
      if (sql.includes("is_active = true")) {
        return { rowCount: 0, rows: [] };
      }
      if (sql.includes("count(*)::text as count from public.user_schedules")) {
        return { rowCount: 1, rows: [{ count: "2" }] };
      }
      return { rowCount: 0, rows: [] };
    });

    const result = await listTodayClasses(pool, "user-1");

    assert.equal(result.hasPrimary, false);
    assert.equal(result.savedCount, 2);
    assert.equal(result.today.length, 0);
    assert.equal(result.primarySchedule, null);
  });
});

describe("setActiveSchedule", () => {
  it("returns false without clearing active schedules when the target is missing", async () => {
    const calls: string[] = [];
    const pool = createMockPool((sql) => {
      calls.push(sql.trim().split("\n")[0] ?? sql);
      if (sql.startsWith("select 1")) {
        return { rowCount: 0 };
      }
      return { rowCount: 1 };
    });

    const updated = await setActiveSchedule(pool, "user-1", 2025, "fall", "2025-2026 FW");

    assert.equal(updated, false);
    assert.deepEqual(calls, ["begin", "select 1 from public.user_schedules", "rollback"]);
  });

  it("clears and sets active only when the target schedule exists", async () => {
    const calls: string[] = [];
    const pool = createMockPool((sql) => {
      calls.push(sql.trim().split("\n")[0] ?? sql);
      return { rowCount: 1 };
    });

    const updated = await setActiveSchedule(pool, "user-1", 2025, "fall", "2025-2026 FW");

    assert.equal(updated, true);
    assert.deepEqual(calls, [
      "begin",
      "select 1 from public.user_schedules",
      "update public.user_schedules set is_active = false where user_id = $1",
      "update public.user_schedules",
      "commit",
    ]);
  });
});
