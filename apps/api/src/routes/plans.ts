import { Router } from "express";
import multer from "multer";
import { FACULTY_CHECKLISTS, getFacultyChecklist } from "../data/faculty-checklists.js";
import { getPool } from "../db/index.js";
import { parseChecklistFile } from "../services/checklistParser.js";
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
    const facultyKey = String(req.body.facultyKey ?? "");
    const startingYear = Number(req.body.startingYear);
    const programmeName = req.body.programmeName ? String(req.body.programmeName) : undefined;

    if (!getFacultyChecklist(facultyKey)) {
      res.status(400).json({ error: "Invalid faculty selection" });
      return;
    }

    if (!Number.isInteger(startingYear) || startingYear < 2015 || startingYear > 2035) {
      res.status(400).json({ error: "Invalid starting year" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "Checklist file is required" });
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

    const plan = await createPlanFromChecklist(getPool(), {
      facultyKey,
      programmeName,
      startingYear,
      sourceFilename: req.file.originalname,
      sourceType: req.file.mimetype,
      parsed,
    });

    res.status(201).json({ plan, parsed });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to import checklist",
    });
  }
});
