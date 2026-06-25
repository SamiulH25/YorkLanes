/**
 * Auth middleware — replace the no-op when OAuth lands.
 * Task guide: docs/tasks/auth.md
 */
import type { Request, Response, NextFunction } from "express";

export function requireAuth(_req: Request, _res: Response, next: NextFunction): void {
  // TODO: reject unauthenticated requests once OAuth is implemented
  next();
}
