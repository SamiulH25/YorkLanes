/**
 * Courses API route.
 *
 * To be finished.
 * 
 */
import { Router } from "express";
// import { requireAuth } from "../middleware/auth.js";  // TODO: enable after OAuth

export const coursesRouter = Router();

// dashboardRouter.use(requireAuth);  // TODO: protect route after OAuth

coursesRouter.get("/summary", (_req, res) => {
  const summary: any = {};

  res.json(summary);
});
