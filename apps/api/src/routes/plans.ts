/**
 * Degree plan REST routes.
 *
 * POST /import  — upload checklist PDF/DOCX, parse, save plan
 * GET  /mine    — latest plan for signed-in user
 * GET  /:id     — plan with terms and courses
 * GET  /:id/graph — placements + prerequisite edges (from courses catalogue)
 * PATCH /:id/layout — drag-and-drop term moves
 * POST /:id/courses — add a catalogue course to a term
 * DELETE /:id/courses/:courseId — remove a course from the plan
 * POST /:id/terms — create an optional summer term for a checklist year
 * PATCH /:id/courses/:courseId — mark course completed
 */
import { Router } from "express";
import multer from "multer";
import { FACULTY_CHECKLISTS, getFacultyChecklist } from "../data/faculty-checklists.js";
import { checkDegreePlanTables, getPool } from "../db/index.js";
import { parseChecklistFile } from "../services/checklistParser.js";
import { parseComplementaryFile } from "../services/complementaryParser.js";
import {
  getComplementaryCatalog,
  saveComplementaryCatalog,
} from "../services/complementaryCatalog.js";
import {
  countComplementaryCatalogMatches,
  searchComplementaryCatalog,
} from "../services/complementaryStudies.js";
import { addComplementaryCourseToPlan, reconcileComplementaryCoursesAfterCatalogUpload } from "../services/complementaryPlanCourses.js";
import { inferChecklistMetadata } from "../services/inferChecklistMetadata.js";
import { addCourseToPlan, removeCourseFromPlan } from "../services/planCourses.js";
import { applyPlanLayoutMoves, buildPlanGraph, setPlanCourseCompletion } from "../services/planGraph.js";
import {
  createPlanFromChecklist,
  createSummerTermForChecklistYear,
  getLatestPlanForUser,
  getPlanById,
} from "../services/planGenerator.js";

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

const complementaryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
    if (ext === ".pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF complementary studies documents are allowed"));
    }
  },
});

export const plansRouter = Router();

plansRouter.get("/faculties", (_req, res) => {
  res.json({ faculties: FACULTY_CHECKLISTS });
});

plansRouter.get("/mine", async (req, res) => {
  try {
    if (!req.session.userId) {
      res.status(401).json({ error: "Sign in to load your saved plan" });
      return;
    }

    const plan = await getLatestPlanForUser(getPool(), req.session.userId);
    if (!plan) {
      res.status(404).json({ error: "No plan found" });
      return;
    }

    res.json(plan);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load plan",
    });
  }
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

plansRouter.post("/:planId/terms", async (req, res) => {
  try {
    const checklistYear = Number(req.body?.checklistYear);
    const session = typeof req.body?.session === "string" ? req.body.session.toLowerCase() : "";
    if (!Number.isInteger(checklistYear) || checklistYear < 1) {
      res.status(400).json({ error: "checklistYear is required" });
      return;
    }
    if (session !== "summer") {
      res.status(400).json({ error: "Only summer terms can be created" });
      return;
    }

    const pool = getPool();
    const plan = await createSummerTermForChecklistYear(pool, req.params.planId, checklistYear);
    if (!plan) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }

    const graph = await buildPlanGraph(pool, plan);
    res.status(201).json({ plan, graph });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create term";
    const status =
      message.includes("already exists") || message.includes("No fall or winter") ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

plansRouter.post("/:planId/courses", async (req, res) => {
  try {
    const termId = req.body?.termId;
    const courseCode = req.body?.courseCode;
    const fromComplementary = req.body?.fromComplementary === true;
    if (typeof termId !== "string" || !termId.trim()) {
      res.status(400).json({ error: "termId is required" });
      return;
    }
    if (typeof courseCode !== "string" || !courseCode.trim()) {
      res.status(400).json({ error: "courseCode is required" });
      return;
    }

    const pool = getPool();
    const plan = fromComplementary
      ? await addComplementaryCourseToPlan(pool, req.params.planId, { termId, courseCode })
      : await addCourseToPlan(pool, req.params.planId, { termId, courseCode });
    if (!plan) {
      res.status(404).json({ error: "Plan or term not found" });
      return;
    }

    const graph = await buildPlanGraph(pool, plan);
    res.status(201).json({ plan, graph });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add course";
    const status = message.includes("not found") || message.includes("already on this plan") || message.includes("approved complementary") ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

plansRouter.get("/:planId/complementary", async (req, res) => {
  try {
    const pool = getPool();
    const plan = await getPlanById(pool, req.params.planId);
    if (!plan) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }

    const { filename, catalog } = await getComplementaryCatalog(pool, req.params.planId);
    if (!catalog) {
      res.json({
        filename,
        catalog: null,
        summary: null,
      });
      return;
    }

    res.json({
      filename,
      catalog: {
        programme_hint: catalog.programme_hint,
        rules: catalog.rules,
        subject_area_count: catalog.subject_areas.length,
        listed_course_count: catalog.listed_courses.length,
        warnings: catalog.warnings,
      },
      summary: {
        programme_hint: catalog.programme_hint,
        total_credits: catalog.rules.total_credits,
        min_subject_area_credits: catalog.rules.min_subject_area_credits,
        listed_course_count: catalog.listed_courses.length,
        subject_area_count: catalog.subject_areas.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load complementary catalogue",
    });
  }
});

plansRouter.get("/:planId/complementary/search", async (req, res) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const pool = getPool();
    const plan = await getPlanById(pool, req.params.planId);
    if (!plan) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }

    const { catalog } = await getComplementaryCatalog(pool, req.params.planId);
    if (!catalog) {
      res.status(400).json({ error: "Upload a complementary studies PDF first" });
      return;
    }

    const courses = searchComplementaryCatalog(catalog, query, limit);
    res.json({
      courses,
      total: countComplementaryCatalogMatches(catalog, query),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Complementary search failed",
    });
  }
});

plansRouter.post("/:planId/complementary", complementaryUpload.single("complementary"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Complementary studies PDF is required" });
      return;
    }

    const planId = String(req.params.planId);
    const pool = getPool();
    const existing = await getPlanById(pool, planId);
    if (!existing) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }

    const parsed = await parseComplementaryFile(req.file.buffer, req.file.originalname);
    if (parsed.error || (parsed.listed_courses.length === 0 && parsed.subject_areas.length === 0)) {
      res.status(422).json({
        error: parsed.error ?? "No complementary course data found in PDF",
        warnings: parsed.warnings,
      });
      return;
    }

    const plan = await saveComplementaryCatalog(
      pool,
      planId,
      req.file.originalname,
      parsed,
    );
    if (!plan) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }

    await reconcileComplementaryCoursesAfterCatalogUpload(pool, planId, parsed);
    const refreshedPlan = await getPlanById(pool, planId);
    if (!refreshedPlan) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }

    const graph = await buildPlanGraph(pool, refreshedPlan);
    res.status(201).json({ plan: refreshedPlan, catalog: parsed, graph });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import complementary PDF";
    const needsMigration = message.includes("supabase:push");
    res.status(needsMigration ? 503 : 500).json({
      error: message,
      hint: needsMigration ? message : undefined,
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

plansRouter.delete("/:planId/courses/:courseId", async (req, res) => {
  try {
    const pool = getPool();
    const result = await removeCourseFromPlan(pool, req.params.planId, req.params.courseId);
    if (!result) {
      res.status(404).json({ error: "Plan or course not found" });
      return;
    }

    const graph = await buildPlanGraph(pool, result.plan);
    res.json({
      plan: result.plan,
      graph,
      removed_required_course: result.removedRequiredCourse,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove course";
    const status = message.includes("Cannot remove checklist placeholder") ? 400 : 500;
    res.status(status).json({ error: message });
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

    if (parsed.error) {
      const hint = parsed.error.includes("pdfplumber")
        ? "Run: cd services/checklist-parser && python -m venv .venv && .venv/bin/pip install -r requirements.txt"
        : undefined;
      res.status(422).json({
        error: parsed.error,
        hint,
        warnings: parsed.warnings,
        parsed,
      });
      return;
    }

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
      userId: req.session.userId,
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
