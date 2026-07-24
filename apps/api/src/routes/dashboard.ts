/**
 * Dashboard API route.
 *
 * Returns the data shape the dashboard widgets expect.
 */
import { Router } from "express";
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
import { listTodayClasses } from "../services/schedules.js";
import { findUserById } from "../services/users.js";
import type { DashboardSummary } from "../types/dashboard.js";

export const dashboardRouter = Router();

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
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
    const upcoming = usePostgres
      ? await listAssignmentsDueThisWeek(getPool(), req.session.userId)
      : canUseAssignmentsRest()
        ? await listAssignmentsDueThisWeekViaRest(req.session.userId)
        : [];
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
  } catch {
    // Keep the dashboard available when assignments cannot be loaded.
  }

  let schedule: DashboardSummary["schedule"] = {
    today: [],
    hasPrimary: false,
    savedCount: 0,
    message: "Build your weekly timetable to see today's classes.",
  };
  if (req.session.userId && usePostgres) {
    try {
      const result = await listTodayClasses(getPool(), req.session.userId);
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
        })),
        primarySchedule: primary,
        activeSchedule: primary,
        hasPrimary: result.hasPrimary,
        savedCount: result.savedCount,
        message:
          result.today.length === 0
            ? !result.hasPrimary && result.savedCount > 0
              ? "Choose a primary schedule to show today's classes on your dashboard."
              : !result.hasPrimary
                ? "Build your weekly timetable to see today's classes."
                : "No more classes scheduled for today."
            : undefined,
      };
    } catch {
      schedule = {
        today: [],
        hasPrimary: false,
        savedCount: 0,
        message: "Schedule data is unavailable right now.",
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
  };

  res.json(summary);
});
