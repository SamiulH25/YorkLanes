/** Recurring finance helpers — Taziz. */
export type FinanceRecurrence = "none" | "weekly" | "monthly" | "yearly";

const RECURRENCE_SET = new Set<FinanceRecurrence>(["none", "weekly", "monthly", "yearly"]);

export function normalizeRecurrence(value: unknown): FinanceRecurrence {
  if (typeof value !== "string" || !value.trim()) return "none";
  const normalized = value.trim().toLowerCase() as FinanceRecurrence;
  return RECURRENCE_SET.has(normalized) ? normalized : "none";
}

export function recurrenceLabel(recurrence: FinanceRecurrence): string {
  switch (recurrence) {
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "yearly":
      return "Yearly";
    default:
      return "One-time";
  }
}

/** Next calendar date after occurredOn for the given recurrence. */
export function nextOccurredOn(occurredOn: string, recurrence: FinanceRecurrence): string | null {
  if (recurrence === "none") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) return null;

  const [year, month, day] = occurredOn.split("-").map(Number);
  if (!year || !month || !day) return null;

  if (recurrence === "weekly") {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(date.getTime())) return null;
    date.setUTCDate(date.getUTCDate() + 7);
    return date.toISOString().slice(0, 10);
  }

  if (recurrence === "monthly") {
    const totalMonths = year * 12 + (month - 1) + 1;
    const nextYear = Math.floor(totalMonths / 12);
    const nextMonthIndex = totalMonths % 12;
    const daysInMonth = new Date(Date.UTC(nextYear, nextMonthIndex + 1, 0)).getUTCDate();
    const nextDay = Math.min(day, daysInMonth);
    return new Date(Date.UTC(nextYear, nextMonthIndex, nextDay)).toISOString().slice(0, 10);
  }

  if (recurrence === "yearly") {
    const nextYear = year + 1;
    const monthIndex = month - 1;
    const daysInMonth = new Date(Date.UTC(nextYear, monthIndex + 1, 0)).getUTCDate();
    const nextDay = Math.min(day, daysInMonth);
    return new Date(Date.UTC(nextYear, monthIndex, nextDay)).toISOString().slice(0, 10);
  }

  return null;
}
