# Course explorer — Jericho

**Goal for your first PR:** show a real course from the database on `/courses`.

## Files to edit

| File | Purpose |
|------|---------|
| `apps/web/src/pages/courses/index.astro` | Page UI |
| `apps/web/src/lib/courses.ts` | `fetch` helper for the API |
| `apps/api/src/routes/courses.ts` | `GET /api/courses` |
| `services/scraper/README.md` | How to load `courses` table data |

## Steps

1. Run `npm run dev` and open http://localhost:4321/courses — you should see the stub page and API message.
2. Ask the maintainer to run the scraper import if `courses` is empty (`npm run scraper:fixture` works offline).
3. In `courses.ts` (API), replace the empty array with `SELECT code, title, credits FROM courses LIMIT 20`.
4. On the page, render the list in a simple `<ul>` or table.
5. Run `npm run check`, open a PR.

## After that

- Search/filter by department
- Course detail view with prerequisites (join `course_prerequisites`)
- Wire summary data into `apps/api/src/routes/dashboard.ts` quick links → set status to `ready`

Copy patterns from `apps/api/src/routes/plans.ts` and `apps/web/src/lib/plans.ts`.
