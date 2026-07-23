# API Routes

One router per feature in this folder. Mount in `src/index.ts`.

## Live routes

| File | Path | Owner |
|------|------|-------|
| `health.ts` | `GET /health` | Shared |
| `auth.ts` | `GET /api/auth/status` | Foundation — [docs/tasks/auth.md](../../../docs/tasks/auth.md) |
| `dashboard.ts` | `GET /api/dashboard/summary` | Shared |
| `plans.ts` | `/api/plans/*` | Samiul — [docs/features/degree-plan.md](../../../docs/features/degree-plan.md) |
| `courses.ts` | `GET /api/courses` | Jericho — [docs/tasks/courses.md](../../../docs/tasks/courses.md) |
| `schedules.ts` | `GET /api/schedules` | Nabeela — [docs/tasks/schedule.md](../../../docs/tasks/schedule.md) |
| `progress.ts` | `GET /api/progress` | Thor — [docs/tasks/progress.md](../../../docs/tasks/progress.md) |
| `finance.ts` | `GET /api/finance`, `/api/finance/categories`, `/api/finance/entries`, `PATCH /api/finance/entries/:entryId`, `POST /api/finance/entries/:entryId/next`, `/api/finance/monthly-summary`, `/api/finance/budget/:month` | Taziz — [docs/tasks/finance.md](../../../docs/tasks/finance.md) |
| `assignments.ts` | `GET /api/assignments` | Sarah — [docs/tasks/assignments.md](../../../docs/tasks/assignments.md) |

Stub routes return JSON with `status: "stub"` and `nextSteps` until the owner implements real logic.

## Add a route

```ts
import { Router } from "express";

export const myRouter = Router();
myRouter.get("/", async (_req, res) => {
  res.json({ ok: true });
});
```

```ts
// src/index.ts
import { myRouter } from "./routes/my.js";
app.use("/api/my", myRouter);
```

Architecture: [docs/architecture.md](../../../docs/architecture.md)
