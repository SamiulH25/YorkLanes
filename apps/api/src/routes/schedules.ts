/** Schedule builder — Nabeela. Guide: docs/tasks/schedule.md */
import { randomUUID } from "node:crypto";
import { Router } from "express";

export const schedulesRouter = Router();

type ScheduleEntry = {
  id: string;
  course_code: string;
  day: string;
  start_time: string;
  end_time: string;
};

const scheduleEntries: ScheduleEntry[] = [];

schedulesRouter.get("/", async (_req, res) => {
  res.json({
    feature: "schedules",
    status: "working",
    message: "Schedule API is returning manual entries from memory.",
    nextSteps: ["Connect schedules table migration", "Persist entries in Supabase"],
    entries: scheduleEntries,
  });
});

schedulesRouter.post("/", async (req, res) => {
  const { course_code, day, start_time, end_time } = req.body ?? {};

  if (!course_code || !day || !start_time || !end_time) {
    return res.status(400).json({
      error: "course_code, day, start_time, and end_time are required",
    });
  }

  const entry: ScheduleEntry = {
    id: randomUUID(),
    course_code,
    day,
    start_time,
    end_time,
  };

  scheduleEntries.push(entry);
  return res.status(201).json(entry);
});