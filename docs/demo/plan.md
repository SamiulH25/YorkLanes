# Degree Plan (`/plan`)

## Purpose

Interactive degree plan editor: year/term grid, drag-and-drop courses, prerequisite graph, complementary studies, warnings.

## Implementation

- **Page:** `apps/web/src/pages/plan/index.astro`
- **Script:** `apps/web/src/scripts/plan-editor.ts` (~large, `registerPageBoot`)
- **Layout:** `DashboardLayout` with collapsed sidebar for wide canvas

### Server-side

- Query `?id=` → `fetchPlan(planId, cookie)`
- No `id` → `fetchMyPlan(cookie)`; if found, redirect to `/plan?id={id}`
- `fetchPlanGraph(plan.id, cookie)` → embedded in `<script id="plan-graph-ssr" type="application/json">` via `serializeForScript`
- Server computes: term grouping by year, credit summaries, complementary toolbar visibility

### Client-side

- Hydrates from SSR JSON, or fetches `GET /api/plans/:id/graph` on failure
- **Drag-and-drop** layout → `PATCH /api/plans/:id/layout`
- **Completion checkboxes** → `PATCH /api/plans/:id/courses/:courseId`
- Add/remove courses, add summer terms, complementary PDF upload + search
- **SVG dependency lines:** prerequisites (blue), corequisites (amber dashed)
- Sets `sessionStorage` keys: `yorklanes-plan-id`, `yorklanes-plan-graph:{id}`
- Dispatches `yorklanes:plan-id` event for nav

### API endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/plans/mine` | GET | User’s plan |
| `/api/plans/:id` | GET | Plan metadata |
| `/api/plans/:id/graph` | GET | Full graph (terms, courses, edges) |
| `/api/plans/:id/layout` | PATCH | Drag positions |
| `/api/plans/:id/courses/:courseId` | PATCH | Completion, notes |
| `/api/plans/:id/courses` | POST/DELETE | Add/remove course |
| `/api/plans/:id/terms` | POST | Add summer term |
| `/api/plans/:id/complementary` | GET/POST | Complementary catalogue |
| `/api/plans/:id/complementary/search` | GET | Search electives |
| `/api/courses?search=` | GET | Course picker search |

### Database & services

- **Tables:** `degree_plans`, `plan_terms`, `plan_courses`, `courses`, `course_prerequisites`, complementary catalogue tables
- **Services:** `planGraph`, `planGenerator`, `complementaryParser`, `courseOfferings`

### Notable patterns

- `serializeForScript` prevents JSON/script injection in SSR embed
- **“S” badge** on courses = scraped offering history shows no section in that season slot
- Empty state (no plan) → CTA to `/plan/setup`
- Required-course warnings: `plan-required-courses.ts` + local/session storage

## Demo script

1. Open plan with `?id=` — show year columns and term rows.
2. Drag a course between terms → auto-saves layout.
3. Toggle completion checkbox → feeds `/progress`.
4. Open prerequisite graph lines by selecting a course.
5. Optional: complementary studies upload + “Find complementary”.

## Q&A

**Q: How is the plan created?**  
A: Checklist import on `/plan/setup` (`POST /api/plans/import`) runs Python PDF/DOCX parser + `planGenerator`.

**Q: What does the “S” badge mean?**  
A: “Season gap” — historical scrape data suggests the course isn’t typically offered in that Fall/Winter/Summer slot.

**Q: Is the plan stored in the browser?**  
A: Primary store is Postgres. `sessionStorage` caches the graph for schedule/progress without re-fetching.

**Q: Can two users share a plan?**  
A: Plans are tied to `user_id` on import; no public share link today.

**Q: What broke with “Unterminated string in JSON”?**  
A: Client tried to parse a non-JSON error page (502 HTML) from a flaky API — fixed with SSR embed + `readJsonResponse`.
