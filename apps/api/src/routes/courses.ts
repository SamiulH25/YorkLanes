/**
 * Course explorer — Jericho
 * Task guide: docs/tasks/courses.md
 */
import { Router } from "express";
import { getPool } from "../db/index.js";

export const coursesRouter = Router();

interface Course {
  code: string;
  title: string;
  credits: number;
}

coursesRouter.get("/", async (_req, res) => {
  try {
    const result = await getPool().query<Course[]>(
      `SELECT code, title, credits FROM courses`,
    );
    res.json({
      feature: "courses",
      status: "ok",
      message: `Loaded ${result.rows.length} course(s).`,
      courses: result.rows,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load courses",
    });
  }
});
