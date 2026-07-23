/**
 * Course explorer — catalogue list, search, and detail.
 */
import { Router } from "express";
import { getCourseByCode, listCourses, listDepartments } from "../services/courses.js";

export const coursesRouter = Router();

function dbErrorResponse(res: import("express").Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Failed to load courses";
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

coursesRouter.get("/departments", async (_req, res) => {
  try {
    const departments = await listDepartments();
    res.json({
      feature: "courses",
      status: "ok",
      departments,
    });
  } catch (error) {
    dbErrorResponse(res, error);
  }
});

coursesRouter.get("/:code", async (req, res) => {
  try {
    const course = await getCourseByCode(decodeURIComponent(req.params.code));
    if (!course) {
      res.status(404).json({ error: `Course not found: ${req.params.code}` });
      return;
    }

    res.json({
      feature: "courses",
      status: "ok",
      course,
    });
  } catch (error) {
    dbErrorResponse(res, error);
  }
});

coursesRouter.get("/", async (req, res) => {
  try {
    const department = typeof req.query.department === "string" ? req.query.department : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const offset = typeof req.query.offset === "string" ? Number(req.query.offset) : undefined;

    const { courses, total } = await listCourses({ department, search, limit, offset });

    res.json({
      feature: "courses",
      status: "ok",
      message: `Loaded ${courses.length} of ${total} course(s).`,
      total,
      courses,
    });
  } catch (error) {
    dbErrorResponse(res, error);
  }
});
