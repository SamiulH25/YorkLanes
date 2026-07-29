import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  budgetProgress,
  filterListEntries,
  getDueRecurring,
  getMonthlyTotals,
  getVisibleEntries,
  monthExpenseCents,
  parseAmountCents,
  type FinanceLogicEntry,
} from "../../apps/web/src/lib/finance-logic.ts";

const seed: FinanceLogicEntry[] = [
  {
    label: "OSAP installment",
    category: "OSAP",
    amountCents: 180_000,
    kind: "income",
    occurredOn: "2026-07-01",
    recurrence: "monthly",
  },
  {
    label: "Rent",
    category: "Rent",
    amountCents: 95_000,
    kind: "expense",
    occurredOn: "2026-07-01",
    recurrence: "monthly",
  },
  {
    label: "TTC pass",
    category: "Transit",
    amountCents: 12_815,
    kind: "expense",
    occurredOn: "2026-07-05",
    recurrence: "monthly",
  },
  {
    label: "Old textbooks",
    category: "Textbooks",
    amountCents: 4_000,
    kind: "expense",
    occurredOn: "2026-06-20",
    recurrence: "none",
  },
];

describe("parseAmountCents (FR-FIN-01, NFR-FIN-01)", () => {
  it("parses form amounts into cents and rejects non-positive values", () => {
    assert.equal(parseAmountCents("89.99"), 8999);
    assert.equal(parseAmountCents(12.345), 1235);
    assert.equal(parseAmountCents("0"), 0);
    assert.equal(parseAmountCents("-5"), 0);
    assert.equal(parseAmountCents("nope"), 0);
  });
});

describe("month filter and list filters (FR-FIN-05)", () => {
  it("limits visible entries to the selected month", () => {
    const july = getVisibleEntries(seed, "2026-07", true);
    assert.equal(july.length, 3);
    assert.ok(july.every((entry) => entry.occurredOn.startsWith("2026-07")));
  });

  it("composes kind and search filters", () => {
    const expenses = filterListEntries(seed, "2026-07", true, "expense", "");
    assert.equal(expenses.length, 2);

    const rent = filterListEntries(seed, "2026-07", true, "all", "rent");
    assert.equal(rent.length, 1);
    assert.equal(rent[0]?.label, "Rent");

    const transit = filterListEntries(seed, "2026-07", false, "expense", "transit");
    assert.equal(transit.length, 1);
    assert.equal(transit[0]?.category, "Transit");
  });
});

describe("getMonthlyTotals (FR-FIN-02, FR-FIN-05)", () => {
  it("builds month balance rows newest first", () => {
    const totals = getMonthlyTotals(seed);
    assert.equal(totals[0]?.month, "2026-07");
    assert.equal(totals[0]?.incomeCents, 180_000);
    assert.equal(totals[0]?.expenseCents, 107_815);
    assert.equal(totals[0]?.balanceCents, 72_185);
    assert.equal(totals[1]?.month, "2026-06");
    assert.equal(totals[1]?.expenseCents, 4_000);
  });
});

describe("budgetProgress demo tip (FR-FIN-04)", () => {
  it("matches the presentation seed before and after the textbook tip", () => {
    const before = monthExpenseCents(seed, "2026-07");
    assert.equal(before, 107_815);
    assert.equal(budgetProgress(before, 115_000).overspent, false);

    const after = before + 8_999;
    const progress = budgetProgress(after, 115_000);
    assert.equal(progress.overspent, true);
    assert.equal(progress.remainingCents, -1_814);
  });
});

describe("getDueRecurring (FR-FIN-06)", () => {
  it("lists recurring next dates in the selected month when not already logged", () => {
    const due = getDueRecurring(seed, "2026-08");
    assert.equal(due.length, 3);
    assert.deepEqual(
      due.map((item) => item.nextDate).sort(),
      ["2026-08-01", "2026-08-01", "2026-08-05"],
    );
  });

  it("hides a series once the next occurrence is logged", () => {
    const withNextRent: FinanceLogicEntry[] = [
      ...seed,
      {
        label: "Rent",
        category: "Rent",
        amountCents: 95_000,
        kind: "expense",
        occurredOn: "2026-08-01",
        recurrence: "monthly",
      },
    ];
    const due = getDueRecurring(withNextRent, "2026-08");
    assert.equal(due.some((item) => item.entry.label === "Rent"), false);
    assert.equal(due.length, 2);
  });
});
