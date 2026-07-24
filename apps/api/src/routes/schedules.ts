/** Schedule builder — Nabeela. Guide: docs/tasks/schedule.md */
import { Router } from "express";
import { getPool } from "../db/index.js";
import {
  deleteScheduleWeek,
  getScheduleWeek,
  listSavedSchedules,
  setActiveSchedule,
  upsertScheduleWeek,
} from "../services/schedules.js";

export const schedulesRouter = Router();

function parseWeekQuery(req: { query: Record<string, unknown> }) {
  const planYear = Number(req.query.plan_year ?? req.query.planYear);
  const planSeason = String(req.query.plan_season ?? req.query.planSeason ?? "all");
  const cdmTerm = String(req.query.cdm_term ?? req.query.cdmTerm ?? "").trim();
  return { planYear, planSeason, cdmTerm };
}

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "42P01" || message.includes("does not exist");
}

async function handleScheduleRoute<T>(
  res: import("express").Response,
  handler: () => Promise<T>,
  fallback: T,
): Promise<void> {
  try {
    const result = await handler();
    res.json(result);
  } catch (error) {
    if (isMissingTableError(error)) {
      res.json(fallback);
      return;
    }
    throw error;
  }
}

schedulesRouter.get("/", async (req, res) => {
  const pool = getPool();
  await handleScheduleRoute(res, async () => {
    const schedules = await listSavedSchedules(pool, req.session.userId!);
    return { schedules };
  }, { schedules: [] });
});

schedulesRouter.get("/week", async (req, res) => {
  const { planYear, planSeason, cdmTerm } = parseWeekQuery(req);
  if (!Number.isFinite(planYear) || planYear < 1 || !cdmTerm) {
    return res.status(400).json({ error: "plan_year and cdm_term are required" });
  }

  const pool = getPool();
  try {
    const week = await getScheduleWeek(pool, req.session.userId!, planYear, planSeason, cdmTerm);
    if (!week) {
      return res.status(404).json({ error: "Schedule not found" });
    }
    return res.json(week);
  } catch (error) {
    if (isMissingTableError(error)) {
      return res.status(404).json({ error: "Schedule not found" });
    }
    throw error;
  }
});

schedulesRouter.put("/week", async (req, res) => {
  const body = req.body ?? {};
  const planYear = Number(body.planYear ?? body.plan_year);
  const planSeason = String(body.planSeason ?? body.plan_season ?? "all");
  const cdmTerm = String(body.cdmTerm ?? body.cdm_term ?? "").trim();
  const entries = Array.isArray(body.entries) ? body.entries : [];

  if (!Number.isFinite(planYear) || planYear < 1 || !cdmTerm) {
    return res.status(400).json({ error: "planYear and cdmTerm are required" });
  }

  const pool = getPool();
  try {
    const saved = await upsertScheduleWeek(pool, req.session.userId!, {
      planYear,
      planSeason,
      cdmTerm,
      entries,
      bundles: Array.isArray(body.bundles) ? body.bundles : [],
    });
    return res.json(saved);
  } catch (error) {
    if (isMissingTableError(error)) {
      return res.status(503).json({
        error: "Schedule tables are not set up yet. Run npm run supabase:push.",
      });
    }
    throw error;
  }
});

schedulesRouter.patch("/active", async (req, res) => {
  const planYear = Number(req.body?.planYear ?? req.body?.plan_year);
  const planSeason = String(req.body?.planSeason ?? req.body?.plan_season ?? "all");
  const cdmTerm = String(req.body?.cdmTerm ?? req.body?.cdm_term ?? "").trim();

  if (!Number.isFinite(planYear) || planYear < 1 || !cdmTerm) {
    return res.status(400).json({ error: "planYear and cdmTerm are required" });
  }

  const pool = getPool();
  try {
    const updated = await setActiveSchedule(pool, req.session.userId!, planYear, planSeason, cdmTerm);
    if (!updated) {
      return res.status(404).json({ error: "Schedule not found" });
    }
    return res.json({ ok: true });
  } catch (error) {
    if (isMissingTableError(error)) {
      return res.status(503).json({
        error: "Schedule tables are not set up yet. Run npm run supabase:push.",
      });
    }
    throw error;
  }
});

schedulesRouter.delete("/week", async (req, res) => {
  const { planYear, planSeason, cdmTerm } = parseWeekQuery(req);
  if (!Number.isFinite(planYear) || planYear < 1 || !cdmTerm) {
    return res.status(400).json({ error: "plan_year and cdm_term are required" });
  }

  const pool = getPool();
  try {
    const deleted = await deleteScheduleWeek(pool, req.session.userId!, planYear, planSeason, cdmTerm);
    if (!deleted) {
      return res.status(404).json({ error: "Schedule not found" });
    }
    return res.json({ ok: true });
  } catch (error) {
    if (isMissingTableError(error)) {
      return res.json({ ok: true });
    }
    throw error;
  }
});
