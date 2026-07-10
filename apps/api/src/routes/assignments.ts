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

// GET /api/assignments — list assignments sorted by due date.
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

// POST /api/assignments — create one assignment.
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
    const input = {
      title,
      courseCode,
      description: description || null,
      dueAt: dueAt.toISOString(),
      userId: req.session?.userId || req.body?.userId || null,
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

// PATCH /api/assignments/:assignmentId — toggle completion.
assignmentsRouter.patch("/:assignmentId", async (req, res) => {
  if (typeof req.body?.done !== "boolean") {
    res.status(400).json({ error: "done must be a boolean." });
    return;
  }

  try {
    const done = req.body.done;
    const assignment = usePostgres()
      ? await setAssignmentDone(getPool(), req.params.assignmentId, done, req.session.userId)
      : canUseAssignmentsRest()
        ? await setAssignmentDoneViaRest(req.params.assignmentId, done, req.session.userId)
        : await Promise.reject(NO_DATABASE);

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
  
  // Try to get userId from multiple sources
  let userId = req.session?.userId || req.body?.userId || null;
  
  console.log("=== BACKEND PUT REQUEST ===");
  console.log("Assignment ID from URL:", assignmentId);
  console.log("User ID:", req.session.userId);
  console.log("Request body:", req.body);
  
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const courseCode = typeof req.body?.courseCode === "string" ? req.body.courseCode.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  const dueDate = typeof req.body?.dueDate === "string" ? req.body.dueDate.trim() : "";
  const done = typeof req.body?.done === "boolean" ? req.body.done : undefined;

  // Validate required fields
  if (!title || !courseCode || !dueDate) {
    console.log("❌ Missing required fields:", { title, courseCode, dueDate });
    res.status(400).json({ error: "title, courseCode, and dueDate are required." });
    return;
  }

  // Validate date
  const dueAt = new Date(dueDate);
  if (Number.isNaN(dueAt.getTime())) {
    console.log("❌ Invalid date:", dueDate);
    res.status(400).json({ error: "dueDate is not a valid date." });
    return;
  }

  try {
    console.log("✅ Calling updateAssignment with ID:", assignmentId);
    
    const updatedAssignment = usePostgres()
      ? await updateAssignment(getPool(), assignmentId, {
          title,
          courseCode,
          description: description || null,
          dueAt: dueAt.toISOString(),
          done,
        }, req.session.userId)
      : canUseAssignmentsRest()
        ? await updateAssignmentViaRest(assignmentId, {
            title,
            courseCode,
            description: description || null,
            dueAt: dueAt.toISOString(),
            done,
          }, req.session.userId)
        : await Promise.reject(NO_DATABASE);

    console.log("✅ Update result:", updatedAssignment);

    if (!updatedAssignment) {
      console.log("❌ Assignment not found for ID:", assignmentId);
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    res.json({ assignment: updatedAssignment });
  } catch (error) {
    console.error("❌ PUT error:", error);
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