/**
 * Auth routes — Foundation team
 * Task guide: docs/tasks/auth.md
 */
import { Router } from "express";

export const authRouter = Router();

authRouter.get("/status", (_req, res) => {
  const configured = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );

  res.json({
    feature: "auth",
    status: configured ? "configured" : "stub",
    message: configured
      ? "OAuth env vars are set — wire /google and callback routes next."
      : "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to apps/api/.env.",
    oauthEnabled: false,
    nextSteps: [
      "Implement Google OAuth callback",
      "Replace requireAuth stub in middleware/auth.ts",
    ],
  });
});
