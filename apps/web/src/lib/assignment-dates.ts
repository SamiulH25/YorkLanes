/** Assignment due dates are stored as UTC midnight for date-only values. */
export const ASSIGNMENT_DUE_TIMEZONE = "America/Toronto";

export function dueCalendarDate(iso: string): string | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso.slice(0, 10);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayCalendarDate(now = new Date(), timeZone = ASSIGNMENT_DUE_TIMEZONE): string {
  return now.toLocaleDateString("en-CA", { timeZone });
}

export function daysUntilDue(
  iso: string,
  now = new Date(),
  timeZone = ASSIGNMENT_DUE_TIMEZONE,
): number | null {
  const due = dueCalendarDate(iso);
  if (!due) return null;
  const today = todayCalendarDate(now, timeZone);
  const dueMs = Date.parse(`${due}T00:00:00Z`);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  return Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24));
}

export function formatAssignmentDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDashboardDueLabel(iso: string, now = new Date()): string {
  const diffDays = daysUntilDue(iso, now);
  if (diffDays === null) return iso;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays < 7) {
    return new Date(iso).toLocaleDateString("en-CA", {
      weekday: "short",
      timeZone: "UTC",
    });
  }
  const due = dueCalendarDate(iso);
  if (!due) return iso;
  return new Date(`${due}T00:00:00Z`).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function isAssignmentDueUrgent(iso: string, now = new Date()): boolean {
  const diffDays = daysUntilDue(iso, now);
  return diffDays !== null && diffDays <= 1;
}

/** Inclusive today through exclusive today+7 (matches API listAssignmentsDueThisWeek). */
export function assignmentDueThisWeekBounds(
  now = new Date(),
  timeZone = ASSIGNMENT_DUE_TIMEZONE,
): { today: string; weekEnd: string } {
  const today = todayCalendarDate(now, timeZone);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const weekEnd = new Date(todayMs + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { today, weekEnd };
}

export function isAssignmentDueInNextWeek(
  iso: string,
  now = new Date(),
  timeZone = ASSIGNMENT_DUE_TIMEZONE,
): boolean {
  const due = dueCalendarDate(iso);
  if (!due) return false;
  const { today, weekEnd } = assignmentDueThisWeekBounds(now, timeZone);
  return due >= today && due < weekEnd;
}
