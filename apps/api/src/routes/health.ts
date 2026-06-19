import { Router } from "express";
import { checkDatabaseConnection, checkDegreePlanTables } from "../db/index.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  let dbTarget = "not configured";
  try {
    const { getDatabaseTarget } = await import("../db/index.js");
    dbTarget = getDatabaseTarget();
  } catch {
    // leave as not configured
  }

  const db = await checkDatabaseConnection();
  const planTables = db.ok ? await checkDegreePlanTables() : { ok: false, error: db.error };

  res.json({
    status: db.ok && planTables.ok ? "ok" : "degraded",
    service: "yorklanes-api",
    databaseTarget: dbTarget,
    database: db.ok,
    databaseError: db.ok ? undefined : db.error,
    degreePlanTables: planTables.ok,
    degreePlanError: planTables.ok ? undefined : planTables.error,
    hint: planTables.ok ? undefined : planTables.hint,
  });
});
