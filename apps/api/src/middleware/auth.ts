/**
 * Auth middleware placeholder.
 *
 * EXPAND HERE (Google OAuth 2.0 via Passport.js or Firebase Auth):
 * 1. Create apps/api/src/auth/google.ts with OAuth strategy
 * 2. Create apps/api/src/routes/auth.ts with /google and /google/callback
 * 3. Create apps/api/src/middleware/session.ts for session cookies or JWT
 * 4. Replace this stub with real requireAuth that checks the session
 * 5. Mount auth routes in apps/api/src/index.ts
 *
 * Reference: design doc notes Passport York was avoided due to SSO complexity;
 * Google OAuth is the chosen approach but does not provide official enrolment data.
 */
import type { Request, Response, NextFunction } from "express";

export function requireAuth(_req: Request, _res: Response, next: NextFunction): void {
  // TODO: reject unauthenticated requests once OAuth is implemented
  next();
}
