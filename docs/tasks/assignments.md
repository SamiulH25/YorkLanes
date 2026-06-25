# Assignment calendar — Sarah

**Goal for your first PR:** create one assignment with a due date and list it on `/assignments`.

## Files to edit

| File | Purpose |
|------|---------|
| `apps/web/src/pages/assignments/index.astro` | Page UI |
| `apps/web/src/lib/assignments.ts` | API client |
| `apps/api/src/routes/assignments.ts` | `GET` + `POST /api/assignments` |
| `supabase/migrations/` | `assignments` table |
| `apps/web/src/components/dashboard/AssignmentsWidget.astro` | Dashboard list (later) |

## Steps

1. Open http://localhost:4321/assignments.
2. Migration: `assignments (id, title, course_code, due_at, done)`.
3. Form on the page: title, course, due date → `POST`.
4. List upcoming assignments sorted by `due_at`.
5. PR + maintainer migration push.

## After that

- Mark complete
- Filter by course
- Push next three items to `dashboard.ts` `assignments.upcoming`

Match the shape in `apps/web/src/types/dashboard.ts` → `AssignmentPreview`.
