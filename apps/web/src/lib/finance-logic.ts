/** Pure finance UI logic — Taziz. Unit-tested; used by scripts/finance.ts. */
import { nextOccurredOn, type FinanceRecurrence } from "./finance-recurrence";

export type FinanceKind = "income" | "expense";
export type ListKindFilter = "all" | FinanceKind;

export interface FinanceLogicEntry {
  label: string;
  category: string;
  amountCents: number;
  kind: FinanceKind;
  occurredOn: string;
  recurrence: FinanceRecurrence;
}

export interface MonthlyTotal {
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
}

export function parseAmountCents(value: FormDataEntryValue | string | number | null): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

export function getVisibleEntries<T extends { occurredOn: string }>(
  entries: readonly T[],
  selectedMonth: string,
  monthOnly: boolean,
): T[] {
  return monthOnly ? entries.filter((entry) => entry.occurredOn.startsWith(selectedMonth)) : [...entries];
}

export function filterListEntries<T extends FinanceLogicEntry>(
  entries: readonly T[],
  selectedMonth: string,
  monthOnly: boolean,
  kindFilter: ListKindFilter,
  query: string,
): T[] {
  let list = getVisibleEntries(entries, selectedMonth, monthOnly);
  if (kindFilter !== "all") {
    list = list.filter((entry) => entry.kind === kindFilter);
  }
  const normalized = query.trim().toLowerCase();
  if (!normalized) return list;
  return list.filter(
    (entry) =>
      entry.label.toLowerCase().includes(normalized) ||
      entry.category.toLowerCase().includes(normalized) ||
      entry.occurredOn.includes(normalized),
  );
}

export function getMonthlyTotals(entries: readonly FinanceLogicEntry[]): MonthlyTotal[] {
  const totals = new Map<string, MonthlyTotal>();
  for (const entry of entries) {
    const month = entry.occurredOn.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const current = totals.get(month) ?? { month, incomeCents: 0, expenseCents: 0, balanceCents: 0 };
    if (entry.kind === "income") {
      current.incomeCents += entry.amountCents;
    } else {
      current.expenseCents += entry.amountCents;
    }
    current.balanceCents = current.incomeCents - current.expenseCents;
    totals.set(month, current);
  }

  return [...totals.values()].sort((a, b) => b.month.localeCompare(a.month));
}

export function monthExpenseCents(
  entries: readonly FinanceLogicEntry[],
  selectedMonth: string,
): number {
  return entries
    .filter((entry) => entry.kind === "expense" && entry.occurredOn.startsWith(selectedMonth))
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

function seriesKey(entry: FinanceLogicEntry): string {
  return [entry.kind, entry.label, entry.category, entry.recurrence, String(entry.amountCents)].join("\0");
}

/** Recurring rows whose next date falls in selectedMonth and is not already logged. */
export function getDueRecurring<T extends FinanceLogicEntry>(
  entries: readonly T[],
  selectedMonth: string,
): Array<{ entry: T; nextDate: string }> {
  const candidates: Array<{ entry: T; nextDate: string }> = [];

  for (const entry of entries) {
    if (entry.recurrence === "none") continue;
    const nextDate = nextOccurredOn(entry.occurredOn, entry.recurrence);
    if (!nextDate || !nextDate.startsWith(selectedMonth)) continue;

    const alreadyLogged = entries.some(
      (other) =>
        other.occurredOn === nextDate &&
        other.label === entry.label &&
        other.category === entry.category &&
        other.kind === entry.kind &&
        other.recurrence === entry.recurrence &&
        other.amountCents === entry.amountCents,
    );
    if (alreadyLogged) continue;
    candidates.push({ entry, nextDate });
  }

  const bestBySeries = new Map<string, { entry: T; nextDate: string }>();
  for (const item of candidates) {
    const key = `${seriesKey(item.entry)}\0${item.nextDate}`;
    const existing = bestBySeries.get(key);
    if (!existing || item.entry.occurredOn > existing.entry.occurredOn) {
      bestBySeries.set(key, item);
    }
  }

  return [...bestBySeries.values()].sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}
