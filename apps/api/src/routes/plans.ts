/**
 * Degree plan REST routes.
 *
 * POST /import  — upload checklist PDF/DOCX, parse, save plan
 * GET  /:id     — plan with terms and courses
 * GET  /:id/graph — placements + prerequisite edges (from courses catalogue)
 * PATCH /:id/layout — drag-and-drop term moves
 * PATCH /:id/courses/:courseId — mark course completed
 */
import { Router } from "express";
import multer from "multer";
import { FACULTY_CHECKLISTS, getFacultyChecklist } from "../data/faculty-checklists.js";
import { checkDegreePlanTables, getPool } from "../db/index.js";
import { parseChecklistFile } from "../services/checklistParser.js";
import { inferChecklistMetadata } from "../services/inferChecklistMetadata.js";
import { applyPlanLayoutMoves, buildPlanGraph, setPlanCourseCompletion } from "../services/planGraph.js";
import { createPlanFromChecklist, getPlanById } from "../services/planGenerator.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".docx", ".doc"];
    const ext = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF or DOCX checklists are allowed"));
    }
  },
});

export const plansRouter = Router();

plansRouter.get("/faculties", (_req, res) => {
  res.json({ faculties: FACULTY_CHECKLISTS });
});

plansRouter.get("/:planId/graph", async (req, res) => {
  try {
    const pool = getPool();
    const plan = await getPlanById(pool, req.params.planId);
    if (!plan) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }
    const graph = await buildPlanGraph(pool, plan);
    res.json({ plan, graph });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load plan graph",
    });
  }
});

plansRouter.patch("/:planId/courses/:courseId", async (req, res) => {
  try {
    const completed = req.body?.completed;
    if (typeof completed !== "boolean") {
      res.status(400).json({ error: "completed boolean is required" });
      return;
    }

    const pool = getPool();
    const plan = await setPlanCourseCompletion(
      pool,
      req.params.planId,
      req.params.courseId,
      completed,
    );
    if (!plan) {
      res.status(404).json({ error: "Plan or course not found" });
      return;
    }

    const graph = await buildPlanGraph(pool, plan);
    res.json({ plan, graph });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to update course completion",
    });
  }
});

plansRouter.patch("/:planId/layout", async (req, res) => {
  try {
    const moves = req.body?.moves;
    if (!Array.isArray(moves) || moves.length === 0) {
      res.status(400).json({ error: "moves array is required" });
      return;
    }

    const pool = getPool();
    const plan = await applyPlanLayoutMoves(pool, req.params.planId, moves);
    if (!plan) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }

    const graph = await buildPlanGraph(pool, plan);
    res.json({ plan, graph });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to update plan layout",
    });
  }
});

plansRouter.get("/:planId", async (req, res) => {
  try {
    const plan = await getPlanById(getPool(), req.params.planId);
    if (!plan) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }
    res.json(plan);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load plan",
    });
  }
});

plansRouter.post("/import", upload.single("checklist"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Checklist file is required" });
      return;
    }

    const tableCheck = await checkDegreePlanTables();
    if (!tableCheck.ok) {
      res.status(503).json({
        error: tableCheck.error ?? "Degree plan database is not ready",
        hint: "Ask the database maintainer to run npm run supabase:push.",
      });
      return;
    }

    const parsed = await parseChecklistFile(req.file.buffer, req.file.originalname);

    if (parsed.years.every((y) => y.courses.length === 0)) {
      res.status(422).json({
        error: "No courses found in checklist",
        warnings: parsed.warnings,
        parsed,
      });
      return;
    }

    const optionalFacultyKey = req.body.facultyKey ? String(req.body.facultyKey) : undefined;
    const optionalStartingYear = req.body.startingYear ? Number(req.body.startingYear) : undefined;
    const optionalProgrammeName = req.body.programmeName ? String(req.body.programmeName) : undefined;

    if (optionalFacultyKey && !getFacultyChecklist(optionalFacultyKey)) {
      res.status(400).json({ error: "Invalid faculty selection" });
      return;
    }

    if (
      optionalStartingYear !== undefined &&
      (!Number.isInteger(optionalStartingYear) ||
        optionalStartingYear < 2015 ||
        optionalStartingYear > 2035)
    ) {
      res.status(400).json({ error: "Invalid starting year" });
      return;
    }

    const inferred = inferChecklistMetadata(parsed, req.file.originalname, {
      facultyKey: optionalFacultyKey,
      programmeName: optionalProgrammeName,
      startingYear: optionalStartingYear,
    });

    const plan = await createPlanFromChecklist(getPool(), {
      facultyKey: inferred.facultyKey,
      programmeName: inferred.programmeName ?? undefined,
      startingYear: inferred.startingYear,
      sourceFilename: req.file.originalname,
      sourceType: req.file.mimetype,
      parsed,
    });

    res.status(201).json({ plan, parsed, inferred });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import checklist";
    const hint =
      message.includes("row-level security") || message.includes("permission denied")
        ? "Ask the database maintainer to run npm run supabase:push."
        : message.includes("degree_plans")
          ? "Ask the database maintainer to apply degree plan migrations."
          : undefined;

    console.error("[plans/import]", error);
    res.status(500).json({ error: message, hint });
  }
});
