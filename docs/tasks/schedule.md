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

## After that

- Pull planned courses from the degree plan (`readActivePlanGraphSnapshot` in `apps/web/src/lib/plan-store.ts`)
- Week grid layout
- Export to calendar format

See the degree plan editor for drag-and-drop ideas: `apps/web/src/scripts/plan-editor.ts`.
