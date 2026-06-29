/** Assignment calendar — Sarah. Guide: docs/tasks/assignments.md */
import { Router } from "express";
import { getPool } from "../db/index.js";

export const assignmentsRouter = Router();

interface AssignmentRow {
  id: string;
  title: string;
  course_code: string;
  description: string | null;
  due_at: string;
  done: boolean;
}

function toAssignment(row: AssignmentRow) {
  return {
    id: row.id,
    title: row.title,
    courseCode: row.course_code,
    description: row.description,
    dueAt: row.due_at,
    done: row.done,
  };
}

// GET /api/assignments — list assignments sorted by due date.
assignmentsRouter.get("/", async (_req, res) => {
  try {
    const result = await getPool().query<AssignmentRow>(
      `SELECT id, title, course_code, description, due_at, done
       FROM public.assignments
       ORDER BY due_at ASC`,
    );

    res.json({
      feature: "assignments",
      status: "ok",
      message: `Loaded ${result.rows.length} assignment(s).`,
      assignments: result.rows.map(toAssignment),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load assignments",
    });
  }
});

// POST /api/assignments — create one assignment.
assignmentsRouter.post("/", async (req, res) => {
  try {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const courseCode = typeof req.body?.courseCode === "string" ? req.body.courseCode.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    const dueDate = typeof req.body?.dueDate === "string" ? req.body.dueDate.trim() : "";

    if (!title || !courseCode || !dueDate) {
      res.status(400).json({ error: "title, courseCode, and dueDate are required." });
      return;
    }

    const dueAt = new Date(dueDate);
    if (Number.isNaN(dueAt.getTime())) {
      res.status(400).json({ error: "dueDate is not a valid date." });
      return;
    }

    const result = await getPool().query<AssignmentRow>(
      `INSERT INTO public.assignments (title, course_code, description, due_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, course_code, description, due_at, done`,
      [title, courseCode, description || null, dueAt.toISOString()],
    );

    res.status(201).json({ assignment: toAssignment(result.rows[0]) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create assignment";

    if (message.includes("assignments_title_key") || message.includes("duplicate key")) {
      res.status(409).json({ error: "An assignment with that title already exists." });
      return;
    }

    res.status(500).json({ error: message });
  }
});
