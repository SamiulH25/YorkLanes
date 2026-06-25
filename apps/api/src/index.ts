/**
 * YorkLanes API — Express entry point.
 *
 * Routes live in src/routes/ (one file per feature). Mount new routers here.
 * Database access: getPool() from src/db/index.ts
 *
 * OAuth (later): src/routes/auth.ts + requireAuth middleware
 */
import "dotenv/config";
import cors from "cors";
import express from "express";
import { getDatabaseTarget } from "./db/index.js";
import { assignmentsRouter } from "./routes/assignments.js";
import { authRouter } from "./routes/auth.js";
import { coursesRouter } from "./routes/courses.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { financeRouter } from "./routes/finance.js";
import { healthRouter } from "./routes/health.js";
import { plansRouter } from "./routes/plans.js";
import { progressRouter } from "./routes/progress.js";
import { schedulesRouter } from "./routes/schedules.js";

const app = express();
const port = Number(process.env.PORT ?? process.env.API_PORT) || 3001;

app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:4321", credentials: true }));
app.use(express.json());

app.use("/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/plans", plansRouter);
app.use("/api/courses", coursesRouter);
app.use("/api/schedules", schedulesRouter);
app.use("/api/progress", progressRouter);
app.use("/api/finance", financeRouter);
app.use("/api/assignments", assignmentsRouter);

app.listen(port, () => {
  console.log(`YorkLanes API listening on http://localhost:${port}`);
  console.log(`Database target: ${getDatabaseTarget()}`);
});