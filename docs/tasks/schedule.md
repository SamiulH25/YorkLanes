# Schedule builder — Nabeela

**Goal for your first PR:** save and load one manual schedule entry via the API.

## Files to edit

| File | Purpose |
|------|---------|
| `apps/web/src/pages/schedule/index.astro` | Page UI |
| `apps/web/src/lib/schedules.ts` | API client |
| `apps/api/src/routes/schedules.ts` | `GET /api/schedules` (extend with `POST` later) |
| `supabase/migrations/` | New migration for `schedules` table (maintainer pushes) |

## Steps

1. Open http://localhost:4321/schedule with `npm run dev` running.
2. Add a migration, e.g. `schedules (id, user_id, course_code, day, start_time, end_time)`.
3. Change `GET /api/schedules` to read from that table (empty list is fine at first).
4. Add a minimal form on the page: course code + day + time → `POST` to your route.
5. `npm run check`, PR, ping maintainer for migration push.

## After that (Phase 2 — scraped sections)

Pull real York meeting times into the builder using the schedule scraper data.

**Read this next:** [Schedule integration guide](../features/schedule-integration.md)

It covers:

- `GET /api/course-sections` and `GET /api/course-sections/summary`
- Day code conversion (`MON` ↔ `Monday`)
- Reading planned courses from `readActivePlanGraphSnapshot()`
- Keeping `course_sections` read-only vs writing to your `schedules` table

Also useful:

- Degree plan season warnings (`schedule_warnings` on the plan graph)
- Course detail **Typical scheduling** panel on `/courses/[code]`

See the degree plan editor for drag-and-drop ideas: `apps/web/src/scripts/plan-editor.ts`.
