/** Pure finance money/helpers — Taziz. Unit-tested; used by finance routes. */

export type FinanceMoneyKind = "income" | "expense";

export function toAmountCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
  }
  return null;
}

export function normalizeKind(value: unknown): FinanceMoneyKind {
  return value === "income" ? "income" : "expense";
}

export function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export function normalizeMonth(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return /^\d{4}-\d{2}$/.test(value) ? value : null;
}

export function summarizeEntryAmounts(
  entries: ReadonlyArray<{ kind: FinanceMoneyKind; amountCents: number }>,
): { incomeCents: number; expenseCents: number; balanceCents: number } {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const entry of entries) {
    if (entry.kind === "income") incomeCents += entry.amountCents;
    else expenseCents += entry.amountCents;
  }
  return {
    incomeCents,
    expenseCents,
    balanceCents: incomeCents - expenseCents,
  };
}

export function monthExpenseCents(
  entries: ReadonlyArray<{ kind: FinanceMoneyKind; amountCents: number; occurredOn: string }>,
  month: string,
): number {
  return entries
    .filter((entry) => entry.kind === "expense" && entry.occurredOn.startsWith(month))
    .reduce((total, entry) => total + entry.amountCents, 0);
}

export function budgetProgress(
  spentCents: number,
  budgetCents: number,
): {
  remainingCents: number;
  percent: number;
  overspent: boolean;
  hasBudget: boolean;
} {
  const hasBudget = budgetCents > 0;
  const remainingCents = budgetCents - spentCents;
  const percent = hasBudget ? Math.min(100, Math.round((spentCents / budgetCents) * 100)) : 0;
  const overspent = hasBudget && spentCents > budgetCents;
  return { remainingCents, percent, overspent, hasBudget };
}

export function classifyFinanceError(error: unknown): {
  status: number;
  body: { error: string; hint?: string };
} {
  const message = error instanceof Error ? error.message : "Finance request failed";
  const needsMigration =
    message.includes("finance_entries") ||
    message.includes("finance_monthly_budgets") ||
    message.includes("recurrence migration") ||
    message.includes("relation") ||
    message.includes("does not exist") ||
    message.includes("404");
  const missingDatabase =
    message.includes("No database configured") || message.includes("SUPABASE_DB_URL");

  return {
    status: missingDatabase || needsMigration ? 503 : 500,
    body: {
      error: message,
      hint: missingDatabase
        ? "Set SUPABASE_DB_URL or SUPABASE_URL plus SUPABASE_PUBLISHABLE_KEY in apps/api/.env."
        : needsMigration
          ? "Ask the database maintainer to apply the finance migrations."
          : undefined,
    },
  };
}
