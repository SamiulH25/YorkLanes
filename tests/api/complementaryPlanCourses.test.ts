import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type pg from "pg";
import { consumeComplementaryStubSlot } from "../../apps/api/src/services/complementaryPlanCourses.js";

type QueryCall = { sql: string; params?: unknown[] };

function createMockPool(
  handlers: {
    hasConsumedStubColumn?: boolean;
    stubs?: Array<{ id: string; credits: number | null; sort_order: number; term_id: string }>;
    onQuery?: (call: QueryCall) => void;
  },
): pg.Pool {
  const client = {
    async query(sql: string, params?: unknown[]) {
      handlers.onQuery?.({ sql, params });
      if (sql.includes("information_schema.columns")) {
        return { rows: [{ exists: handlers.hasConsumedStubColumn ?? false }] };
      }
      if (sql.includes("SELECT pc.id, pc.credits, pc.sort_order, pc.term_id")) {
        return { rows: handlers.stubs ?? [] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };

  return {
    async connect() {
      return client;
    },
    async query(sql: string, params?: unknown[]) {
      return client.query(sql, params);
    },
  } as unknown as pg.Pool;
}

describe("consumeComplementaryStubSlot", () => {
  it("records consumed_stub_id before deleting a fully consumed stub", async () => {
    const calls: QueryCall[] = [];
    const pool = createMockPool({
      hasConsumedStubColumn: true,
      stubs: [{ id: "stub-1", credits: 3, sort_order: 0, term_id: "term-1" }],
      onQuery: (call) => calls.push(call),
    });

    await consumeComplementaryStubSlot(pool, "plan-1", "term-1", 2, 3, "course-1");

    const updateConsumed = calls.find(
      (call) => call.sql.includes("consumed_stub_id") && call.params?.[0] === "course-1",
    );
    const deleteStub = calls.find(
      (call) => call.sql.startsWith("DELETE FROM plan_courses") && call.params?.[0] === "stub-1",
    );

    assert.ok(updateConsumed, "expected consumed_stub_id update");
    assert.equal(updateConsumed?.params?.[1], "stub-1");
    assert.ok(deleteStub, "expected stub delete");
    assert.ok(
      calls.indexOf(updateConsumed!) < calls.indexOf(deleteStub!),
      "consumed_stub_id should be set before the stub is deleted",
    );
  });
});
