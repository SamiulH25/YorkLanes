/** Finance module — Taziz. Guide: docs/tasks/finance.md */
import { Router } from "express";
import { getPool } from "../db/index.js";
import {
  canUseFinanceRest,
  createFinanceEntry,
  createFinanceEntryViaRest,
  deleteFinanceEntry,
  deleteFinanceEntryViaRest,
  getFinanceBudget,
  getFinanceBudgetViaRest,
  getFinanceSummary,
  getFinanceSummaryViaRest,
  listFinanceEntries,
  listFinanceEntriesViaRest,
  listFinanceMonthlyTotals,
  listFinanceMonthlyTotalsViaRest,
  upsertFinanceBudget,
  upsertFinanceBudgetViaRest,
  type FinanceEntryKind,
} from "../services/finance.js";

export const financeRouter = Router();

function toAmountCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
  }
  return null;
}

function normalizeKind(value: unknown): FinanceEntryKind {
  return value === "income" ? "income" : "expense";
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function normalizeMonth(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return /^\d{4}-\d{2}$/.test(value) ? value : null;
}

function financeError(error: unknown): { status: number; body: { error: string; hint?: string } } {
  const message = error instanceof Error ? error.message : "Finance request failed";
  const needsMigration =
    message.includes("finance_entries") ||
    message.includes("finance_monthly_budgets") ||
    message.includes("relation") ||
    message.includes("does not exist") ||
    message.includes("404");
  const missingDatabase = message.includes("No database configured") || message.includes("SUPABASE_DB_URL");

  return {
    status: missingDatabase ? 503 : needsMigration ? 503 : 500,
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

function usePostgres(): boolean {
  return Boolean(process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim());
}

financeRouter.get("/", async (req, res) => {
  try {
    const [entries, summary] = usePostgres()
      ? await (async () => {
          const pool = getPool();
          return Promise.all([
            listFinanceEntries(pool, req.session.userId),
            getFinanceSummary(pool, req.session.userId),
          ]);
        })()
      : canUseFinanceRest()
        ? await Promise.all([
            listFinanceEntriesViaRest(req.session.userId),
            getFinanceSummaryViaRest(req.session.userId),
          ])
        : await Promise.reject(new Error("No database configured. Set SUPABASE_DB_URL or SUPABASE_URL plus SUPABASE_PUBLISHABLE_KEY."));

    res.json({
      feature: "finance",
      status: "ready",
      message: "Finance entries loaded from the database.",
      entries,
      summary,
      balance: summary.balanceCents / 100,
    });
  } catch (error) {
    const response = financeError(error);
    res.status(response.status).json(response.body);
  }
});

financeRouter.get("/entries", async (req, res) => {
  try {
    const [entries, summary] = usePostgres()
      ? await (async () => {
          const pool = getPool();
          return Promise.all([
            listFinanceEntries(pool, req.session.userId),
            getFinanceSummary(pool, req.session.userId),
          ]);
        })()
      : canUseFinanceRest()
        ? await Promise.all([
            listFinanceEntriesViaRest(req.session.userId),
            getFinanceSummaryViaRest(req.session.userId),
          ])
        : await Promise.reject(new Error("No database configured. Set SUPABASE_DB_URL or SUPABASE_URL plus SUPABASE_PUBLISHABLE_KEY."));
    res.json({ entries, summary });
  } catch (error) {
    const response = financeError(error);
    res.status(response.status).json(response.body);
  }
});

financeRouter.get("/monthly-summary", async (req, res) => {
  try {
    const months = usePostgres()
      ? await listFinanceMonthlyTotals(getPool(), req.session.userId)
      : canUseFinanceRest()
        ? await listFinanceMonthlyTotalsViaRest(req.session.userId)
        : await Promise.reject(new Error("No database configured. Set SUPABASE_DB_URL or SUPABASE_URL plus SUPABASE_PUBLISHABLE_KEY."));
    res.json({ months });
  } catch (error) {
    const response = financeError(error);
    res.status(response.status).json(response.body);
  }
});

financeRouter.post("/entries", async (req, res) => {
  const label = typeof req.body?.label === "string" ? req.body.label.trim() : "";
  const category =
    typeof req.body?.category === "string" && req.body.category.trim()
      ? req.body.category.trim()
      : "Other";
  const amountCents = toAmountCents(req.body?.amount);

  if (!label) {
    res.status(400).json({ error: "label is required" });
    return;
  }
  if (!amountCents || amountCents <= 0) {
    res.status(400).json({ error: "amount must be greater than 0" });
    return;
  }

  try {
    const input = {
      label,
      category,
      amountCents,
      kind: normalizeKind(req.body?.kind),
      occurredOn: normalizeDate(req.body?.occurredOn),
      userId: req.session.userId,
    };
    const entry = usePostgres()
      ? await createFinanceEntry(getPool(), input)
      : canUseFinanceRest()
        ? await createFinanceEntryViaRest(input)
        : await Promise.reject(new Error("No database configured. Set SUPABASE_DB_URL or SUPABASE_URL plus SUPABASE_PUBLISHABLE_KEY."));
    const summary = usePostgres()
      ? await getFinanceSummary(getPool(), req.session.userId)
      : await getFinanceSummaryViaRest(req.session.userId);
    res.status(201).json({ entry, summary });
  } catch (error) {
    const response = financeError(error);
    res.status(response.status).json(response.body);
  }
});

financeRouter.delete("/entries/:entryId", async (req, res) => {
  try {
    const deleted = usePostgres()
      ? await deleteFinanceEntry(getPool(), req.params.entryId, req.session.userId)
      : canUseFinanceRest()
        ? await deleteFinanceEntryViaRest(req.params.entryId, req.session.userId)
        : await Promise.reject(new Error("No database configured. Set SUPABASE_DB_URL or SUPABASE_URL plus SUPABASE_PUBLISHABLE_KEY."));

    if (!deleted) {
      res.status(404).json({ error: "Finance entry not found" });
      return;
    }

    const summary = usePostgres()
      ? await getFinanceSummary(getPool(), req.session.userId)
      : await getFinanceSummaryViaRest(req.session.userId);
    res.json({ deleted: true, summary });
  } catch (error) {
    const response = financeError(error);
    res.status(response.status).json(response.body);
  }
});

financeRouter.get("/budget/:month", async (req, res) => {
  const month = normalizeMonth(req.params.month);
  if (!month) {
    res.status(400).json({ error: "month must use YYYY-MM format" });
    return;
  }

  try {
    const budget = usePostgres()
      ? await getFinanceBudget(getPool(), month, req.session.userId)
      : canUseFinanceRest()
        ? await getFinanceBudgetViaRest(month, req.session.userId)
        : await Promise.reject(new Error("No database configured. Set SUPABASE_DB_URL or SUPABASE_URL plus SUPABASE_PUBLISHABLE_KEY."));
    res.json({ budget: budget ?? { month, amountCents: 0 } });
  } catch (error) {
    const response = financeError(error);
    res.status(response.status).json(response.body);
  }
});

financeRouter.put("/budget/:month", async (req, res) => {
  const month = normalizeMonth(req.params.month);
  const amountCents = toAmountCents(req.body?.amount);

  if (!month) {
    res.status(400).json({ error: "month must use YYYY-MM format" });
    return;
  }
  if (amountCents === null || amountCents < 0) {
    res.status(400).json({ error: "amount must be 0 or greater" });
    return;
  }

  try {
    const budget = usePostgres()
      ? await upsertFinanceBudget(getPool(), { month, amountCents, userId: req.session.userId })
      : canUseFinanceRest()
        ? await upsertFinanceBudgetViaRest({ month, amountCents, userId: req.session.userId })
        : await Promise.reject(new Error("No database configured. Set SUPABASE_DB_URL or SUPABASE_URL plus SUPABASE_PUBLISHABLE_KEY."));
    res.json({ budget });
  } catch (error) {
    const response = financeError(error);
    res.status(response.status).json(response.body);
  }
});
