/**
 * Course section timetables — scraped schedule data per course/term.
 */
import { Router } from "express";
import { listCourseSections } from "../services/course-sections.js";

export const courseSectionsRouter = Router();

function dbErrorResponse(res: import("express").Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Failed to load course sections";
  const isConnectionError =
    message.includes("ECONNREFUSED") ||
    message.includes("connect") ||
    message.includes("password authentication failed");

  res.status(isConnectionError ? 503 : 500).json({
    error: message,
    hint: isConnectionError
      ? "Set SUPABASE_DB_URL in apps/api/.env to the hosted database connection string (from the maintainer)."
      : undefined,
  });
}

courseSectionsRouter.get("/", async (req, res) => {
  try {
    const courseCode = typeof req.query.course_code === "string" ? req.query.course_code : undefined;
    const term = typeof req.query.term === "string" ? req.query.term : undefined;
    const department = typeof req.query.department === "string" ? req.query.department : undefined;

    const groups = await listCourseSections({ courseCode, term, department });
    const totalSections = groups.reduce((sum, group) => sum + group.sections.length, 0);

    res.json({
      feature: "course-sections",
      status: "ok",
      message: `Loaded ${totalSections} section${totalSections === 1 ? "" : "s"} across ${groups.length} course-term group(s).`,
      filters: { course_code: courseCode, term, department },
      total_sections: totalSections,
      groups,
    });
  } catch (error) {
    dbErrorResponse(res, error);
  }
});
