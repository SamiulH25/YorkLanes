/** Progress tracker — Thor. Guide: docs/tasks/progress.md */
import { Router } from "express";

export const progressRouter = Router();

progressRouter.get("/", async (_req, res) => {
  res.json({
    feature: "progress",
    status: "stub",
    message: "Stub route — pass ?planId= to load completion stats from a degree plan.",
    nextSteps: [
      "Import getPlanById from services/planGenerator.js",
      "Count completed plan_courses vs total concrete courses",
    ],
    percentComplete: 0,
  });
});
