/** Progress tracker — Thor. Guide: docs/tasks/progress.md */
import { Router } from "express";
import { getPool } from "../db/index.js";
import { getPlanById } from "../services/planGenerator.js";
import { buildPlanProgressResult } from "../services/progress.js";

export const progressRouter = Router();

function progressError(error: unknown): { status: number; body: { error: string; hint?: string } } {
  const message = error instanceof Error ? error.message : "Failed to load progress";

  if (message.includes("No database configured") || message.includes("SUPABASE_DB_URL")) {
    return {
      status: 503,
      body: {
        error: message,
        hint: "Set SUPABASE_DB_URL in apps/api/.env (ask the database maintainer).",
      },
    };
  }

  if (
    message.includes("connection timeout") ||
    message.includes("ECONNREFUSED") ||
    message.includes("Connection terminated")
  ) {
    return {
      status: 503,
      body: {
        error: message,
        hint: "Check SUPABASE_DB_URL and your network. Ask the database maintainer if the project is running.",
      },
    };
  }

  if (message.includes("degree_plans") || message.includes("does not exist")) {
    return {
      status: 503,
      body: {
        error: message,
        hint: "Ask the database maintainer to run npm run supabase:push.",
      },
    };
  }

  return { status: 500, body: { error: message } };
}

progressRouter.get("/", async (req, res) => {
  const planId = typeof req.query.planId === "string" ? req.query.planId.trim() : "";

  if (!planId) {
    res.status(400).json({
      error: "planId query parameter is required",
      hint: "Open /progress?planId=<uuid> after importing a degree plan.",
    });
    return;
  }

  try {
    const plan = await getPlanById(getPool(), planId);
    if (!plan) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }

    const result = buildPlanProgressResult(plan);
    res.json({
      feature: "progress",
      status: "ready",
      ...result,
    });
  } catch (error) {
    const response = progressError(error);
    res.status(response.status).json(response.body);
  }
});
