# API Routes

Express routers mounted from `src/index.ts`. Handlers should stay thin; put logic in `src/services/`.

## Existing routes

| File | Path | Purpose |
|------|------|---------|
| `health.ts` | `GET /health` | Service health check |
| `dashboard.ts` | `GET /api/dashboard/summary` | Dashboard widget data |
| `plans.ts` | `/api/plans/*` | Degree plan import, CRUD, graph, layout — see [`docs/features/degree-plan.md`](../../../docs/features/degree-plan.md) |

### Plans endpoints (summary)

| Method | Path |
|--------|------|
| `GET` | `/api/plans/faculties` |
| `POST` | `/api/plans/import` |
| `GET` | `/api/plans/:planId` |
| `GET` | `/api/plans/:planId/graph` |
| `PATCH` | `/api/plans/:planId/layout` |
| `PATCH` | `/api/plans/:planId/courses/:courseId` |

## Planned routes

| Feature | Owner | Suggested file | Mount path |
|---------|-------|----------------|------------|
| Google OAuth | All (foundation) | `auth.ts` | `/auth` |
| Course Explorer | Jericho | `courses.ts` | `/api/courses` |
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

Full architecture: [`docs/architecture.md`](../../../docs/architecture.md).
