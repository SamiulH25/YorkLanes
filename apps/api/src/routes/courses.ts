/**
 * Course explorer — Jericho
 * Task guide: docs/tasks/courses.md
 * Next: query the `courses` table and return real rows.
 */
import { Router } from "express";

export const coursesRouter = Router();

coursesRouter.get("/", async (_req, res) => {
  res.json({
    feature: "courses",
    status: "stub",
    message: "Stub route — no database query yet.",
    nextSteps: [
      "SELECT from public.courses (see services/scraper/README.md)",
      "Render results on apps/web/src/pages/courses/index.astro",
    ],
    courses: [],
  });
});
