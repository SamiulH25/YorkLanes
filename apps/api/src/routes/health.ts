import { Router } from "express";
import { checkDatabaseConnection, checkDegreePlanTables } from "../db/index.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const dbConnected = await checkDatabaseConnection();
  const planTables = dbConnected ? await checkDegreePlanTables() : { ok: false, error: "Database not connected" };

  res.json({
    status: dbConnected && planTables.ok ? "ok" : "degraded",
    service: "yorklanes-api",
    database: dbConnected,
    degreePlanTables: planTables.ok,
    degreePlanError: planTables.ok ? undefined : planTables.error,
  });
});
