/**
 * Dashboard API route.
 *
 * Returns the data shape the dashboard widgets expect.
 * Currently returns placeholder values. Replace each section when the
 * corresponding feature is implemented.
 *
 * EXPAND HERE:
 * - progress      -> Thor (Progress Tracker) writes query logic, expose via this route
 * - assignments   -> Sarah (Assignment Calendar) writes query logic
 * - finance       -> Taziz (Finance Module) writes query logic
 * - quickLinks    -> add links to feature pages as they are built in apps/web
 */
import { Router } from "express";
import type { DashboardSummary } from "../types/dashboard.js";
// import { requireAuth } from "../middleware/auth.js";  // TODO: enable after OAuth

export const dashboardRouter = Router();

// dashboardRouter.use(requireAuth);  // TODO: protect route after OAuth

dashboardRouter.get("/summary", (_req, res) => {
  const summary: DashboardSummary = {
    user: {
      displayName: "Student",
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
    finance: {
      balance: 0,
      currency: "CAD",
      message: "Finance module not connected. Taziz: implement and wire here.",
    },
    quickLinks: [
      { label: "Degree Plan", href: "/plan", featureOwner: "Samiul", status: "ready" },
      { label: "Course Explorer", featureOwner: "Jericho", status: "not-started" },
      { label: "Schedule Builder", featureOwner: "Nabeela", status: "not-started" },
      { label: "Progress Tracker", featureOwner: "Thor", status: "not-started" },
      { label: "Finance", featureOwner: "Taziz", status: "not-started" },
      { label: "Assignments", featureOwner: "Sarah", status: "not-started" },
    ],
  };

  res.json(summary);
});
