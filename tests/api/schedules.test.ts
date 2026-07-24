import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type pg from "pg";
import { setActiveSchedule } from "../../apps/api/src/services/schedules.js";

type QueryResult = { rowCount: number | null };

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
  } as unknown as pg.Pool;
}

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
