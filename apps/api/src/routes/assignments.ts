/** Assignment calendar — Sarah. Guide: docs/tasks/assignments.md */
import { Router } from "express";

export const assignmentsRouter = Router();

assignmentsRouter.get("/", async (_req, res) => {
  res.json({
    feature: "assignments",
    status: "stub",
    message: "Stub route — add assignments table and POST handler.",
    nextSteps: [
      "Migration for assignments (title, course_code, due_at)",
      "List sorted by due_at on the page",
    ],
    assignments: [],
  });
});
