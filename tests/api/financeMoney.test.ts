import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  budgetProgress,
  classifyFinanceError,
  monthExpenseCents,
  normalizeDate,
  normalizeKind,
  normalizeMonth,
  summarizeEntryAmounts,
  toAmountCents,
} from "../../apps/api/src/services/financeMoney.js";

describe("toAmountCents (FR-FIN-01, NFR-FIN-01)", () => {
  it("converts dollars to integer cents", () => {
    assert.equal(toAmountCents(12.34), 1234);
    assert.equal(toAmountCents("89.99"), 8999);
    assert.equal(toAmountCents(0.1 + 0.2), 30);
  });

  it("rejects invalid amounts", () => {
    assert.equal(toAmountCents(null), null);
    assert.equal(toAmountCents(""), null);
    assert.equal(toAmountCents("abc"), null);
    assert.equal(toAmountCents(Number.NaN), null);
  });
});

describe("normalizeKind / normalizeDate / normalizeMonth (FR-FIN-01, FR-FIN-04)", () => {
  it("defaults unknown kind to expense", () => {
    assert.equal(normalizeKind("income"), "income");
    assert.equal(normalizeKind("expense"), "expense");
    assert.equal(normalizeKind("other"), "expense");
    assert.equal(normalizeKind(undefined), "expense");
  });

  it("accepts YYYY-MM-DD dates only", () => {
    assert.equal(normalizeDate("2026-07-29"), "2026-07-29");
    assert.equal(normalizeDate("07/29/2026"), undefined);
    assert.equal(normalizeDate(""), undefined);
  });

  it("accepts YYYY-MM budget months only", () => {
    assert.equal(normalizeMonth("2026-07"), "2026-07");
    assert.equal(normalizeMonth("2026-7"), null);
    assert.equal(normalizeMonth("July 2026"), null);
  });
});

describe("summarizeEntryAmounts (FR-FIN-02)", () => {
  it("computes income, expense, and balance from demo seed data", () => {
    const summary = summarizeEntryAmounts([
      { kind: "income", amountCents: 180_000 },
      { kind: "expense", amountCents: 95_000 },
      { kind: "expense", amountCents: 12_815 },
    ]);
    assert.equal(summary.incomeCents, 180_000);
    assert.equal(summary.expenseCents, 107_815);
    assert.equal(summary.balanceCents, 72_185);
  });
});

describe("budgetProgress (FR-FIN-04)", () => {
  it("stays on track before textbook tip", () => {
    const spent = monthExpenseCents(
      [
        { kind: "expense", amountCents: 95_000, occurredOn: "2026-07-01" },
        { kind: "expense", amountCents: 12_815, occurredOn: "2026-07-05" },
        { kind: "income", amountCents: 180_000, occurredOn: "2026-07-01" },
      ],
      "2026-07",
    );
    assert.equal(spent, 107_815);
    const progress = budgetProgress(spent, 115_000);
    assert.equal(progress.remainingCents, 7_185);
    assert.equal(progress.overspent, false);
    assert.equal(progress.hasBudget, true);
  });

  it("flags overspend after textbook tip", () => {
    const spent = 107_815 + 8_999;
    const progress = budgetProgress(spent, 115_000);
    assert.equal(progress.remainingCents, -1_814);
    assert.equal(progress.overspent, true);
    assert.equal(progress.percent, 100);
  });

  it("ignores zero budget", () => {
    const progress = budgetProgress(5_000, 0);
    assert.equal(progress.hasBudget, false);
    assert.equal(progress.overspent, false);
    assert.equal(progress.percent, 0);
  });
});

describe("classifyFinanceError (NFR-FIN-03)", () => {
  it("returns 503 with migration hint when tables are missing", () => {
    const result = classifyFinanceError(new Error('relation "finance_entries" does not exist'));
    assert.equal(result.status, 503);
    assert.match(result.body.hint ?? "", /finance migrations/i);
  });

  it("returns 503 with env hint when database is not configured", () => {
    const result = classifyFinanceError(new Error("No database configured. Set SUPABASE_DB_URL"));
    assert.equal(result.status, 503);
    assert.match(result.body.hint ?? "", /SUPABASE_DB_URL/);
  });

  it("returns 500 for unexpected errors", () => {
    const result = classifyFinanceError(new Error("boom"));
    assert.equal(result.status, 500);
    assert.equal(result.body.hint, undefined);
  });
});
