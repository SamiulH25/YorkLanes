# Progress tracker — Thor

**Goal for your first PR:** compute % complete from courses marked done on a degree plan.

## Files to edit

| File | Purpose |
|------|---------|
| `apps/web/src/pages/progress/index.astro` | Page UI |
| `apps/web/src/lib/progress.ts` | API client |
| `apps/api/src/routes/progress.ts` | `GET /api/progress` |
| `apps/web/src/components/dashboard/ProgressWidget.astro` | Dashboard ring (optional second PR) |

## Steps

1. Open http://localhost:4321/progress.
2. In the API route, accept a `planId` query param and load the plan via `getPlanById` (import from `planGenerator.ts`).
3. Count `plan_courses` where `entry_kind = 'course'` vs `completed = true`.
4. Return `{ percentComplete, completed, total }` and show it on the page.
5. Optionally update `dashboard.ts` `progress` block to call the same logic.

## After that

- Credit-weighted progress
- Requirements vs electives breakdown
- Compare against checklist stubs

Plan completion flags are set in `PATCH /api/plans/:planId/courses/:courseId`.
