/** Onboarding — save programme details for signed-in users. */
import { Router } from "express";
import { getPool } from "../db/index.js";

export const onboardingRouter = Router();

interface ProgrammeRow {
  programme_name: string;
  starting_year: number;
}

onboardingRouter.get("/status", async (req, res) => {
  try {
    if (!req.session.userId) {
      res.json({ signedIn: false, completed: false, programme: null });
      return;
    }

    const result = await getPool().query<ProgrammeRow>(
      `SELECT programme_name, starting_year
       FROM public.user_programmes
       WHERE user_id = $1`,
      [req.session.userId],
    );

    const row = result.rows[0];
    res.json({
      signedIn: true,
      completed: Boolean(row),
      programme: row
        ? {
            programmeName: row.programme_name,
            startingYear: row.starting_year,
          }
        : null,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to load onboarding status",
    });
  }
});

onboardingRouter.post("/programme", async (req, res) => {
  try {
    if (!req.session.userId) {
      res.status(401).json({ error: "Sign in to save your programme" });
      return;
    }

    const programmeName =
      typeof req.body?.programmeName === "string" ? req.body.programmeName.trim() : "";
    const startingYear = Number(req.body?.startingYear);

    if (!programmeName) {
      res.status(400).json({ error: "programmeName is required" });
      return;
    }

    if (!Number.isInteger(startingYear) || startingYear < 2015 || startingYear > 2035) {
      res.status(400).json({ error: "startingYear must be between 2015 and 2035" });
      return;
    }

    const result = await getPool().query<ProgrammeRow>(
      `INSERT INTO public.user_programmes (user_id, programme_name, starting_year)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
       SET programme_name = EXCLUDED.programme_name,
           starting_year = EXCLUDED.starting_year
       RETURNING programme_name, starting_year`,
      [req.session.userId, programmeName, startingYear],
    );

    const row = result.rows[0];
    res.json({
      programme: {
        programmeName: row.programme_name,
        startingYear: row.starting_year,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to save programme",
    });
  }
});
