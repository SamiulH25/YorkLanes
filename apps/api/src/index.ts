/**
 * YorkLanes API entry point.
 *
 * EXPAND HERE:
 * - Mount auth routes when Google OAuth is implemented (src/routes/auth.ts)
 * - Mount feature routes as each team member builds them (see src/routes/README.md)
 * - Add session middleware after auth is wired up (src/middleware/session.ts)
 */
import "dotenv/config";
import cors from "cors";
import express from "express";
import { dashboardRouter } from "./routes/dashboard.js";
import { healthRouter } from "./routes/health.js";
// import { authRouter } from "./routes/auth.js";  // TODO: enable after OAuth setup

const app = express();
const port = Number(process.env.API_PORT) || 3001;

app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:4321", credentials: true }));
app.use(express.json());

app.use("/health", healthRouter);
app.use("/api/dashboard", dashboardRouter);
// app.use("/auth", authRouter);  // TODO: enable after OAuth setup

app.listen(port, () => {
  console.log(`YorkLanes API listening on http://localhost:${port}`);
});
