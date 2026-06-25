/** Finance module — Taziz. Guide: docs/tasks/finance.md */
import { Router } from "express";

export const financeRouter = Router();

financeRouter.get("/", async (_req, res) => {
  res.json({
    feature: "finance",
    status: "stub",
    message: "Stub route — add finance_entries table and POST /entries.",
    nextSteps: [
      "Migration for finance_entries",
      "POST /api/finance/entries with label + amount_cents",
    ],
    entries: [],
    balance: 0,
  });
});
