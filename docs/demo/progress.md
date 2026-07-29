# Progress (`/progress`)

## Purpose

Visual degree completion: ring chart, requirement categories (major, gen ed, electives), completed vs remaining courses.

## Implementation

- **Page:** `apps/web/src/pages/progress/index.astro`
- **No bundled client script** — inline `is:inline` scripts only for plan ID redirect

### Server-side

- Requires `?planId=` or `?id=` query param
- Parallel: `fetchPlan(planId, cookie)` + `fetchProgress(planId, cookie)`
- If progress API fails: fallback `computePlanProgress(plan)` / `computeRequirementCategories(plan)` client-side helpers run server-side in Astro
- SVG ring segments computed in frontmatter (`segmentsFromProgressResponse`)
- **No planId:** empty state with manual plan ID form

### Client-side (inline only)

- Auto-redirect: reads `sessionStorage.yorklanes-plan-id` → `/progress?planId=...`
- `html[data-progress-restoring]` hides flash during redirect
- `html[data-progress-empty]` when no stored plan ID

### API endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/plans/:id` | Plan structure |
| `GET /api/progress?planId=` | Computed progress breakdown |

### Database & services

- `degree_plans`, `plan_terms`, `plan_courses` (completion flags)
- Complementary progress from uploaded PDF catalogue
- **Service:** `apps/api/src/services/progress.ts` → `buildPlanProgressResult`

### Categories

- Derived from checklist section labels (major, general education, etc.)
- Complementary/electives use uploaded complementary catalogue when available

## Demo script

1. Open `/plan` first (sets plan ID in session).
2. Navigate to Progress — auto-loads same plan.
3. Walk through ring % and category bars.
4. Mark a course complete on Plan → refresh Progress to show update.
5. Link to complementary planner if electives incomplete.

## Q&A

**Q: How is % calculated?**  
A: Completed courses vs total required credits/courses in plan graph; categories weighted by section.

**Q: Why empty state?**  
A: No `planId` in URL and nothing in `sessionStorage` — user must open a plan first.

**Q: Does it update live?**  
A: SSR per navigation — toggle completion on Plan, then revisit Progress.

**Q: Complementary electives?**  
A: Progress uses complementary PDF catalogue when uploaded on Plan page.
