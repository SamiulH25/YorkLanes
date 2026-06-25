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
import { getPool } from "../db/index.js";
import { findUserById } from "../services/users.js";
import type { DashboardSummary } from "../types/dashboard.js";

export const dashboardRouter = Router();

dashboardRouter.get("/summary", async (req, res) => {
  let displayName = "Student";
  if (req.session.userId) {
    const user = await findUserById(getPool(), req.session.userId);
    if (user) {
      displayName = user.display_name;
    }
  }

  const summary: DashboardSummary = {
    user: {
      displayName,
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
      { label: "Course Explorer", href: "/courses", featureOwner: "Jericho", status: "in-progress" },
      { label: "Schedule Builder", href: "/schedule", featureOwner: "Nabeela", status: "in-progress" },
      { label: "Progress Tracker", href: "/progress", featureOwner: "Thor", status: "in-progress" },
      { label: "Finance", href: "/finance", featureOwner: "Taziz", status: "in-progress" },
      { label: "Assignments", href: "/assignments", featureOwner: "Sarah", status: "in-progress" },
    ],
  };

  res.json(summary);
});
