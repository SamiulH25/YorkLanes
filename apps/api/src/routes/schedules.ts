/** Schedule builder — Nabeela. Guide: docs/tasks/schedule.md */
import { Router } from "express";

export const schedulesRouter = Router();

schedulesRouter.get("/", async (_req, res) => {
  res.json({
    feature: "schedules",
    status: "stub",
    message: "Stub route — add a schedules table migration first.",
    nextSteps: [
      "Create supabase/migrations/..._schedules.sql",
      "POST handler to save a block",
    ],
    entries: [],
  });
});
