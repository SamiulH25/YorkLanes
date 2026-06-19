# API Routes

This folder holds Express routers. Only dashboard scaffolding exists today.

## Existing routes

| File | Path | Purpose |
|------|------|---------|
| `health.ts` | `GET /health` | Service health check |
| `dashboard.ts` | `GET /api/dashboard/summary` | Dashboard widget data |

## Add new route files here

Create one router per feature and mount it in `src/index.ts`.

| Feature | Owner | Suggested file | Mount path |
|---------|-------|----------------|------------|
| Google OAuth | All (foundation) | `auth.ts` | `/auth` |
| Course Explorer | Jericho | `courses.ts` | `/api/courses` |
| Degree Plan Editor | Samiul | `plans.ts` | `/api/plans` |
| Schedule Builder | Nabeela | `schedules.ts` | `/api/schedules` |
| Progress Tracker | Thor | `progress.ts` | `/api/progress` |
| Finance Module | Taziz | `finance.ts` | `/api/finance` |
| Assignment Calendar | Sarah | `assignments.ts` | `/api/assignments` |

## Pattern

```ts
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

export const coursesRouter = Router();
coursesRouter.use(requireAuth);

coursesRouter.get("/", async (_req, res) => {
  // query PostgreSQL via getPool() from ../db/index.js
  res.json([]);
});
```

Then in `src/index.ts`:

```ts
import { coursesRouter } from "./routes/courses.js";
app.use("/api/courses", coursesRouter);
```
