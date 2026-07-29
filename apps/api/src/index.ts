/**
 * YorkLanes API — Express entry point.
 *
 * Routes live in src/routes/ (one file per feature). Mount new routers here.
 * Database access: getPool() from src/db/index.ts
 *
 * Auth: src/routes/auth.ts (Google OAuth + express-session)
 */
import "dotenv/config";
import cors from "cors";
import express from "express";
import { getAuthConfig } from "./config/auth.js";
import { getDatabaseTarget } from "./db/index.js";
import { requireAuth } from "./middleware/auth.js";
import { createSessionMiddleware } from "./middleware/session.js";
import { assignmentsRouter } from "./routes/assignments.js";
import { authRouter } from "./routes/auth.js";
import { courseSectionsRouter } from "./routes/course-sections.js";
import { coursesRouter } from "./routes/courses.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { financeRouter } from "./routes/finance.js";
import { healthRouter } from "./routes/health.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { plansRouter } from "./routes/plans.js";
import { progressRouter } from "./routes/progress.js";
import { schedulesRouter } from "./routes/schedules.js";

const app = express();
const port = Number(process.env.PORT ?? process.env.API_PORT) || 3001;
const host =
  process.env.API_BIND?.trim() ||
  (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

const authConfig = getAuthConfig();
if (authConfig.configured && !process.env.SESSION_SECRET?.trim()) {
  console.warn("[auth] SESSION_SECRET is not set — using an insecure dev default");
}

app.use(cors({ origin: authConfig.webOrigin, credentials: true }));
app.use(express.json());
app.use(createSessionMiddleware());

app.get("/", (_req, res) => {
  res.json({
    service: "yorklanes-api",
    message: "YorkLanes API — use the web app in your browser, not this URL.",
    webApp: authConfig.webOrigin,
    health: "/health",
    ready: "/health/ready",
  });
});

app.use("/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/dashboard", requireAuth, dashboardRouter);
app.use("/api/onboarding", requireAuth, onboardingRouter);
app.use("/api/plans", requireAuth, plansRouter);
app.use("/api/courses", coursesRouter);
app.use("/api/course-sections", courseSectionsRouter);
app.use("/api/schedules", requireAuth, schedulesRouter);
app.use("/api/progress", requireAuth, progressRouter);
app.use("/api/finance", financeRouter);
app.use("/api/assignments", requireAuth, assignmentsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not Found", service: "yorklanes-api" });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[api] unhandled error:", error);
  if (res.headersSent) return;
  res.status(503).json({
    error: "Service temporarily unavailable.",
    hint: "Try again in a few seconds.",
  });
});

app.listen(port, host, () => {
  console.log(`YorkLanes API listening on http://${host}:${port}`);
  console.log(`Database target: ${getDatabaseTarget()}`);
});