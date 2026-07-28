/**
 * Dashboard API route.
 *
 * Returns the data shape the dashboard widgets expect.
 * Hub calendar reuses schedule rows from listTodayClasses to avoid duplicate DB round-trips.
 */
import { Router } from "express";
import type pg from "pg";
import { getPool } from "../db/index.js";
import {
  canUseAssignmentsRest,
  listAssignmentsDueThisWeek,
  listAssignmentsDueThisWeekViaRest,
} from "../services/assignments.js";
import {
  canUseFinanceRest,
  getFinanceBudget,
  getFinanceBudgetViaRest,
  getFinanceSummary,
  getFinanceSummaryViaRest,
  listFinanceEntries,
  listFinanceEntriesViaRest,
} from "../services/finance.js";
import { getLatestPlanForUser } from "../services/planGenerator.js";
import { buildPlanProgressResult } from "../services/progress.js";
import {
  formatWallClockTime,
  getPrimaryScheduleMeta,
  getScheduleWeek,
  listTodayClasses,
  normalizeScheduleDay,
  SCHEDULE_TIMEZONE,
  type HubScheduleEntryRow,
} from "../services/schedules.js";
import { findUserById } from "../services/users.js";
import type {
  AssignmentPreview,
  DashboardSummary,
  HubCalendarDay,
  HubMessage,
  HubNotification,
  TodayClassPreview,
} from "../types/dashboard.js";

export const dashboardRouter = Router();

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "42P01" || message.includes("does not exist");
}

function emptyFinance(message: string): DashboardSummary["finance"] {
  const month = currentMonth();
  return {
    balance: 0,
    income: 0,
    expenses: 0,
    currency: "CAD",
    month,
    monthSpent: 0,
    monthBudget: 0,
    monthRemaining: 0,
    linked: false,
    message,
  };
}

async function loadUserProgramme(
  userId: string,
): Promise<{ programme: string | null; startingYear: number | null }> {
  try {
    const result = await getPool().query<{ programme_name: string; starting_year: number }>(
      `select programme_name, starting_year
       from public.user_programmes
       where user_id = $1`,
      [userId],
    );
    const row = result.rows[0];
    if (row) {
      return { programme: row.programme_name, startingYear: row.starting_year };
    }
  } catch {
    // Programme table may not exist yet.
  }
  return { programme: null, startingYear: null };
}

function formatHubDate(value: string | Date, now = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat("en-CA", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: SCHEDULE_TIMEZONE,
    }).format(now);
  }

  const sameDay =
    new Intl.DateTimeFormat("en-CA", { timeZone: SCHEDULE_TIMEZONE }).format(date) ===
    new Intl.DateTimeFormat("en-CA", { timeZone: SCHEDULE_TIMEZONE }).format(now);

  if (sameDay) return "Today";

  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: SCHEDULE_TIMEZONE,
  }).format(date);
}

function nextSevenCalendarDays(now = new Date()): Array<{ date: string; dayName: string }> {
  const days: Array<{ date: string; dayName: string }> = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const probe = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: SCHEDULE_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "long",
    }).formatToParts(probe);
    const year = parts.find((part) => part.type === "year")?.value ?? "1970";
    const month = parts.find((part) => part.type === "month")?.value ?? "01";
    const day = parts.find((part) => part.type === "day")?.value ?? "01";
    const dayName = parts.find((part) => part.type === "weekday")?.value ?? "Monday";
    days.push({ date: `${year}-${month}-${day}`, dayName });
  }
  return days;
}

function mapTodayToCalendarEvents(today: TodayClassPreview[]): HubCalendarDay["events"] {
  return today.map((item) => ({
    id: item.id,
    title: `${item.courseCode} ${item.sectionCode}`.trim(),
    time: `${item.startTime}–${item.endTime}`,
    location: item.room ?? item.campus ?? undefined,
  }));
}

function mapHubCalendarEntries(entries: HubScheduleEntryRow[]): HubCalendarDay["events"] {
  return entries
    .map((entry) => ({
      id: entry.id,
      title: `${entry.course_code} ${entry.section_code}`.trim(),
      time: `${formatWallClockTime(entry.start_time)}–${formatWallClockTime(entry.end_time)}`,
      location: entry.room ?? entry.campus ?? undefined,
    }))
    .sort((left, right) => left.time.localeCompare(right.time));
}

function buildHubCalendarDaysFromEntries(
  weekDays: Array<{ date: string; dayName: string }>,
  entries: HubScheduleEntryRow[],
): HubCalendarDay[] {
  return weekDays.map((day) => ({
    date: day.date,
    events: mapHubCalendarEntries(
      entries.filter((entry) => normalizeScheduleDay(entry.day) === day.dayName),
    ),
  }));
}

async function buildHubCalendarDays(
  pool: pg.Pool | null,
  userId: string | undefined,
  today: TodayClassPreview[],
  prefetchedEntries?: HubScheduleEntryRow[],
): Promise<HubCalendarDay[]> {
  const weekDays = nextSevenCalendarDays();

  if (prefetchedEntries && prefetchedEntries.length > 0) {
    return buildHubCalendarDaysFromEntries(weekDays, prefetchedEntries);
  }

  if (!pool || !userId) {
    return weekDays.length > 0
      ? [{ date: weekDays[0].date, events: mapTodayToCalendarEvents(today) }]
      : [];
  }

  try {
    const primary = await getPrimaryScheduleMeta(pool, userId);
    if (!primary) {
      return [{ date: weekDays[0].date, events: mapTodayToCalendarEvents(today) }];
    }

    const week = await getScheduleWeek(
      pool,
      userId,
      primary.planYear,
      primary.planSeason,
      primary.cdmTerm,
    );
    if (!week || week.entries.length === 0) {
      return [{ date: weekDays[0].date, events: mapTodayToCalendarEvents(today) }];
    }

    return weekDays.map((day) => ({
      date: day.date,
      events: week.entries
        .filter((entry) => normalizeScheduleDay(entry.day) === day.dayName)
        .map((entry) => ({
          id: entry.id,
          title: `${entry.course_code} ${entry.section_code}`.trim(),
          time: `${entry.start_time}–${entry.end_time}`,
          location: entry.room ?? entry.campus ?? undefined,
        }))
        .sort((left, right) => left.time.localeCompare(right.time)),
    }));
  } catch {
    return [{ date: weekDays[0].date, events: mapTodayToCalendarEvents(today) }];
  }
}

function buildHubMessages(assignments: AssignmentPreview[]): HubMessage[] {
  const messages: HubMessage[] = [];

  for (const assignment of assignments.slice(0, 3)) {
    messages.push({
      id: `assignment-${assignment.id}`,
      title: `${assignment.courseCode} assignment due`,
      preview: `${assignment.title} is due ${formatHubDate(assignment.dueAt)}.`,
      date: formatHubDate(assignment.dueAt),
      href: "/assignments",
    });
  }

  return messages;
}

function buildHubNotifications(input: {
  assignments: AssignmentPreview[];
  today: TodayClassPreview[];
  finance: DashboardSummary["finance"];
  onboardingIncomplete: boolean;
}): HubNotification[] {
  const notifications: HubNotification[] = [];

  for (const assignment of input.assignments) {
    notifications.push({
      id: `assignment-${assignment.id}`,
      title: `Due: ${assignment.title}`,
      body: assignment.courseCode
        ? `${assignment.courseCode} is due ${formatHubDate(assignment.dueAt)}.`
        : `Due ${formatHubDate(assignment.dueAt)}.`,
      date: formatHubDate(assignment.dueAt),
      type: "assignment",
      href: "/assignments",
    });
  }

  for (const item of input.today) {
    notifications.push({
      id: `class-${item.id}`,
      title: `${item.courseCode} today`,
      body: `${item.componentType} ${item.startTime}–${item.endTime}${
        item.room ? ` · ${item.room}` : ""
      }`,
      date: "Today",
      type: "schedule",
      href: "/schedule",
    });
  }

  if (input.finance.linked && input.finance.balance < 0) {
    notifications.push({
      id: "finance-balance",
      title: "Negative balance",
      body: `Your tracked balance is ${input.finance.currency} ${input.finance.balance.toFixed(2)}.`,
      date: "Today",
      type: "finance",
      href: "/finance",
    });
  }

  if (input.finance.linked && input.finance.monthRemaining < 0) {
    notifications.push({
      id: "finance-budget",
      title: "Over monthly budget",
      body: `You are ${input.finance.currency} ${Math.abs(input.finance.monthRemaining).toFixed(2)} over your ${input.finance.month} budget.`,
      date: "Today",
      type: "finance",
      href: "/finance",
    });
  }

  if (input.onboardingIncomplete) {
    notifications.push({
      id: "onboarding-incomplete",
      title: "Finish YorkLanes setup",
      body: "Tell us your programme and import your checklist to build your degree plan.",
      date: "Today",
      type: "system",
      href: "/onboarding",
    });
  }

  return notifications;
}

async function buildHub(input: {
  pool: pg.Pool | null;
  userId: string | undefined;
  assignments: AssignmentPreview[];
  today: TodayClassPreview[];
  finance: DashboardSummary["finance"];
  onboardingIncomplete: boolean;
  hubScheduleEntries?: HubScheduleEntryRow[];
}): Promise<NonNullable<DashboardSummary["hub"]>> {
  const messages = buildHubMessages(input.assignments);
  const notifications = buildHubNotifications(input);
  const calendarDays = await buildHubCalendarDays(
    input.pool,
    input.userId,
    input.today,
    input.hubScheduleEntries,
  );

  return {
    messageCount: messages.length,
    notificationCount: notifications.length,
    messages,
    notifications,
    calendarDays,
  };
}

dashboardRouter.get("/summary", async (req, res) => {
  let displayName = "Student";
  let programme: string | null = null;
  let startingYear: number | null = null;
  let finance = emptyFinance("Open Finances to track income, expenses, and budgets.");
  const usePostgres = Boolean(process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim());
  const month = currentMonth();

  if (req.session.userId && usePostgres) {
    const user = await findUserById(getPool(), req.session.userId);
    if (user) {
      displayName = user.display_name;
    }
    const programmeInfo = await loadUserProgramme(req.session.userId);
    programme = programmeInfo.programme;
    startingYear = programmeInfo.startingYear;
  }

  if (req.session.userId) {
    try {
      const [financeSummary, budget, entries] = usePostgres
        ? await (async () => {
            const pool = getPool();
            return Promise.all([
              getFinanceSummary(pool, req.session.userId),
              getFinanceBudget(pool, month, req.session.userId),
              listFinanceEntries(pool, req.session.userId),
            ]);
          })()
        : canUseFinanceRest()
          ? await Promise.all([
              getFinanceSummaryViaRest(req.session.userId),
              getFinanceBudgetViaRest(month, req.session.userId),
              listFinanceEntriesViaRest(req.session.userId),
            ])
          : await Promise.reject(new Error("Finance database is not configured"));

      const monthSpentCents = entries
        .filter((entry) => entry.kind === "expense" && entry.occurredOn.startsWith(month))
        .reduce((total, entry) => total + entry.amountCents, 0);
      const monthBudgetCents = budget?.amountCents ?? 0;

      finance = {
        balance: financeSummary.balanceCents / 100,
        income: financeSummary.incomeCents / 100,
        expenses: financeSummary.expenseCents / 100,
        currency: financeSummary.currency,
        month,
        monthSpent: monthSpentCents / 100,
        monthBudget: monthBudgetCents / 100,
        monthRemaining: (monthBudgetCents - monthSpentCents) / 100,
        linked: true,
        message:
          financeSummary.balanceCents === 0 && monthBudgetCents === 0
            ? "No finance entries logged yet. Open Finances to start tracking."
            : monthBudgetCents > 0
              ? `${month} budget tracking is live.`
              : `${financeSummary.categoryTotals.length} expense categories tracked.`,
      };
    } catch {
      finance = emptyFinance("Finance data is unavailable right now. Open Finances to keep a local draft.");
    }
  }

  let assignments: DashboardSummary["assignments"] = {
    upcoming: [],
    message: "No assignments due in the next 7 days.",
  };
  try {
    if (!usePostgres && !canUseAssignmentsRest()) {
      assignments = {
        upcoming: [],
        message: "Assignments are unavailable until the database is configured.",
      };
    } else {
      const upcoming = usePostgres
        ? await listAssignmentsDueThisWeek(getPool(), req.session.userId)
        : await listAssignmentsDueThisWeekViaRest(req.session.userId);
      assignments = {
        upcoming: upcoming.map((item) => ({
          id: item.id,
          title: item.title,
          dueAt: item.dueAt,
          courseCode: item.courseCode,
        })),
        message:
          upcoming.length === 0
            ? "No assignments due in the next 7 days."
            : undefined,
      };
    }
  } catch {
    assignments = {
      upcoming: [],
      message: "Assignment data is unavailable right now.",
    };
  }

  let schedule: DashboardSummary["schedule"] = {
    today: [],
    hasPrimary: false,
    savedCount: 0,
    message: "Build your weekly timetable to see today's classes.",
  };
  let hubScheduleEntries: HubScheduleEntryRow[] = [];
  if (req.session.userId && usePostgres) {
    try {
      const result = await listTodayClasses(getPool(), req.session.userId);
      hubScheduleEntries = result.hubScheduleEntries;
      const primary = result.primarySchedule ?? undefined;
      schedule = {
        today: result.today.map((item) => ({
          id: item.id,
          courseCode: item.courseCode,
          sectionCode: item.sectionCode,
          componentType: item.componentType,
          startTime: item.startTime,
          endTime: item.endTime,
          room: item.room,
          campus: item.campus,
          status: item.status,
        })),
        primarySchedule: primary,
        activeSchedule: primary,
        hasPrimary: result.hasPrimary,
        savedCount: result.savedCount,
        message:
          result.today.length === 0
            ? !result.hasPrimary && result.savedCount > 0
              ? "Your timetables are saved, but none is set for the dashboard yet. Open Schedule and tap Use on dashboard."
              : !result.hasPrimary
                ? "Build a weekly timetable on the Schedule page — it will appear here once saved to your account."
                : result.totalBlockCount === 0
                  ? "Your dashboard timetable has no class blocks saved yet. Open Schedule, add courses, and wait for the sync confirmation."
                  : result.todayBlockCount === 0
                    ? `No ${new Date().toLocaleDateString("en-CA", { weekday: "long", timeZone: SCHEDULE_TIMEZONE })} blocks in your dashboard timetable.`
                    : `No classes left on your dashboard schedule for ${new Date().toLocaleDateString("en-CA", { weekday: "long", timeZone: SCHEDULE_TIMEZONE })}.`
            : undefined,
      };
    } catch (error) {
      schedule = {
        today: [],
        hasPrimary: false,
        savedCount: 0,
        message: isMissingTableError(error)
          ? "Schedule tables are not set up yet. Run npm run supabase:push, then save your timetable."
          : "Schedule data is unavailable right now.",
      };
    }
  }

  let progress: DashboardSummary["progress"] = {
    percentComplete: 0,
    label: "Import your degree checklist to track progress.",
    segments: [],
  };
  if (req.session.userId && usePostgres) {
    try {
      const plan = await getLatestPlanForUser(getPool(), req.session.userId);
      if (plan) {
        const planProgress = await buildPlanProgressResult(getPool(), plan);
        progress = {
          percentComplete: planProgress.percentComplete,
          label: planProgress.message,
          completed: planProgress.completed,
          total: planProgress.total,
          planId: planProgress.planId,
          segments: planProgress.segments,
        };
        if (!programme && planProgress.programmeName) {
          programme = planProgress.programmeName;
        }
        if (!startingYear && planProgress.startingYear) {
          startingYear = planProgress.startingYear;
        }
      }
    } catch {
      // Keep default progress when plan cannot be loaded.
    }
  }

  const summary: DashboardSummary = {
    user: {
      displayName,
      programme,
      startingYear,
    },
    progress,
    assignments,
    finance,
    schedule,
    hub: await buildHub({
      pool: req.session.userId && usePostgres ? getPool() : null,
      userId: req.session.userId,
      assignments: assignments.upcoming,
      today: schedule.today,
      finance,
      onboardingIncomplete: Boolean(req.session.userId && usePostgres && !programme),
      hubScheduleEntries,
    }),
  };

  res.json(summary);
});
