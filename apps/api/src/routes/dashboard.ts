/**
 * Dashboard API route.
 *
 * Returns the data shape the dashboard widgets expect.
 *
 * EXPAND HERE:
 * - progress      -> Thor (Progress Tracker) writes query logic, expose via this route
 * - assignments   -> Sarah (Assignment Calendar) writes query logic
 * - finance       -> Taziz (Finance Module) writes query logic
 * - quickLinks    -> add links to feature pages as they are built in apps/web
 */
import { Router } from "express";
import { getPool } from "../db/index.js";
import {
  canUseFinanceRest,
  getFinanceBudget,
  getFinanceBudgetViaRest,
  getFinanceSummary,
  getFinanceSummaryViaRest,
  listFinanceEntries,
  listFinanceEntriesViaRest,
} from "../services/finance.js";
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

dashboardRouter.get("/summary", async (req, res) => {
  let displayName = "Student";
  let finance = emptyFinance("Open Finances to track income, expenses, and budgets.");
  const usePostgres = Boolean(process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim());
  const month = currentMonth();

  if (req.session.userId && usePostgres) {
    const user = await findUserById(getPool(), req.session.userId);
    if (user) {
      displayName = user.display_name;
    }
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

  const summary: DashboardSummary = {
    user: {
      displayName,
      programme: null,
      startingYear: null,
    },
    progress: {
      percentComplete: 0,
      label: "Degree progress not configured",
    },
    assignments: {
      upcoming: [],
      message: "Assignment calendar not connected. Sarah: implement in apps/web and wire here.",
    },
    finance,
    quickLinks: [
      { label: "Degree Plan", href: "/plan", featureOwner: "Samiul", status: "ready" },
      { label: "Progress Tracker", href: "/progress", featureOwner: "Thor", status: "in-progress" },
      { label: "Course Explorer", href: "/courses", featureOwner: "Jericho", status: "ready" },
      { label: "Schedule Builder", href: "/schedule", featureOwner: "Nabeela", status: "in-progress" },
      { label: "Assignments", href: "/assignments", featureOwner: "Sarah", status: "in-progress" },
      { label: "Finance", href: "/finance", featureOwner: "Taziz", status: "ready" },
    ],
  };

  res.json(summary);
});
