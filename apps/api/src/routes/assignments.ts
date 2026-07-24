/** Assignment calendar — Sarah. Guide: docs/tasks/assignments.md */
import { Router } from "express";
import { getPool } from "../db/index.js";
import {
  canUseAssignmentsRest,
  createAssignment,
  createAssignmentViaRest,
  deleteAssignment,
  deleteAssignmentViaRest,
  listAssignments,
  listAssignmentsViaRest,
  setAssignmentDone,
  setAssignmentDoneViaRest,
  setAssignmentStarred,
  setAssignmentStarredViaRest,
  updateAssignment,
  updateAssignmentViaRest,
} from "../services/assignments.js";

export const assignmentsRouter = Router();

const NO_DATABASE = new Error(
  "No database configured. Set SUPABASE_DB_URL or SUPABASE_URL plus SUPABASE_PUBLISHABLE_KEY.",
);

function usePostgres(): boolean {
  return Boolean(process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim());
}

function assignmentsError(error: unknown): { status: number; body: { error: string; hint?: string } } {
  const message = error instanceof Error ? error.message : "Assignments request failed";
  const needsMigration =
    message.includes("assignments") ||
    message.includes("relation") ||
    message.includes("does not exist") ||
    message.includes("404");
  const missingDatabase = message.includes("No database configured") || message.includes("SUPABASE_DB_URL");

  return {
    status: missingDatabase ? 503 : needsMigration ? 503 : 500,
    body: {
      error: message,
      hint: missingDatabase
        ? "Set SUPABASE_DB_URL or SUPABASE_URL plus SUPABASE_PUBLISHABLE_KEY in apps/api/.env."
        : needsMigration
          ? "Ask the database maintainer to apply the assignments migrations."
          : undefined,
    },
  };
}

// GET /api/assignments — list this user's assignments (starred first, then soonest due).
assignmentsRouter.get("/", async (req, res) => {
  try {
    const assignments = usePostgres()
      ? await listAssignments(getPool(), req.session.userId)
      : canUseAssignmentsRest()
        ? await listAssignmentsViaRest(req.session.userId)
        : await Promise.reject(NO_DATABASE);

    res.json({
      feature: "assignments",
      status: "ok",
      message: `Loaded ${assignments.length} assignment(s).`,
      assignments,
    });
  } catch (error) {
    const response = assignmentsError(error);
    res.status(response.status).json(response.body);
  }
});

// POST /api/assignments — create one assignment for the logged-in user.
assignmentsRouter.post("/", async (req, res) => {
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

  try {
    // Always attach the assignment to the signed-in user (requireAuth guarantees this).
    const input = {
      title,
      courseCode,
      description: description || null,
      dueAt: dueAt.toISOString(),
      userId: req.session.userId ?? null,
    };
    const assignment = usePostgres()
      ? await createAssignment(getPool(), input)
      : canUseAssignmentsRest()
        ? await createAssignmentViaRest(input)
        : await Promise.reject(NO_DATABASE);

    res.status(201).json({ assignment });
  } catch (error) {
    const response = assignmentsError(error);
    res.status(response.status).json(response.body);
  }
});

// PATCH /api/assignments/:assignmentId — toggle done and/or starred.
assignmentsRouter.patch("/:assignmentId", async (req, res) => {
  const { assignmentId } = req.params;
  const hasDone = typeof req.body?.done === "boolean";
  const hasStarred = typeof req.body?.starred === "boolean";

  if (!hasDone && !hasStarred) {
    res.status(400).json({ error: "Provide a boolean 'done' and/or 'starred'." });
    return;
  }

  try {
    const userId = req.session.userId;
    let assignment = undefined;

    if (hasStarred) {
      assignment = usePostgres()
        ? await setAssignmentStarred(getPool(), assignmentId, req.body.starred, userId)
        : canUseAssignmentsRest()
          ? await setAssignmentStarredViaRest(assignmentId, req.body.starred, userId)
          : await Promise.reject(NO_DATABASE);
    }

    if (hasDone) {
      assignment = usePostgres()
        ? await setAssignmentDone(getPool(), assignmentId, req.body.done, userId)
        : canUseAssignmentsRest()
          ? await setAssignmentDoneViaRest(assignmentId, req.body.done, userId)
          : await Promise.reject(NO_DATABASE);
    }

    if (!assignment) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    res.json({ assignment });
  } catch (error) {
    const response = assignmentsError(error);
    res.status(response.status).json(response.body);
  }
});

// PUT /api/assignments/:assignmentId — update an assignment.
assignmentsRouter.put("/:assignmentId", async (req, res) => {
  const { assignmentId } = req.params;

  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const courseCode = typeof req.body?.courseCode === "string" ? req.body.courseCode.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  const dueDate = typeof req.body?.dueDate === "string" ? req.body.dueDate.trim() : "";
  const done = typeof req.body?.done === "boolean" ? req.body.done : undefined;

  if (!title || !courseCode || !dueDate) {
    res.status(400).json({ error: "title, courseCode, and dueDate are required." });
    return;
  }

  const dueAt = new Date(dueDate);
  if (Number.isNaN(dueAt.getTime())) {
    res.status(400).json({ error: "dueDate is not a valid date." });
    return;
  }

  try {
    const data = {
      title,
      courseCode,
      description: description || null,
      dueAt: dueAt.toISOString(),
      done,
    };
    const updated = usePostgres()
      ? await updateAssignment(getPool(), assignmentId, data, req.session.userId)
      : canUseAssignmentsRest()
        ? await updateAssignmentViaRest(assignmentId, data, req.session.userId)
        : await Promise.reject(NO_DATABASE);

    if (!updated) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    res.json({ assignment: updated });
  } catch (error) {
    const response = assignmentsError(error);
    res.status(response.status).json(response.body);
  }
});

// DELETE /api/assignments/:assignmentId — remove one assignment.
assignmentsRouter.delete("/:assignmentId", async (req, res) => {
  try {
    const deleted = usePostgres()
      ? await deleteAssignment(getPool(), req.params.assignmentId, req.session.userId)
      : canUseAssignmentsRest()
        ? await deleteAssignmentViaRest(req.params.assignmentId, req.session.userId)
        : await Promise.reject(NO_DATABASE);

    if (!deleted) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    res.json({ deleted: true });
  } catch (error) {
    const response = assignmentsError(error);
    res.status(response.status).json(response.body);
  }
});
