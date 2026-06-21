# Degree plan feature

The degree plan editor lets students upload an official York **degree checklist** (PDF or DOCX), parses required courses into a term layout, and visualizes **prerequisites** and **co-requisites** from the course catalogue.

**Owner:** Samiul  
**Status:** Functional (no per-user auth yet)

## User journey

1. `/plan` — empty state or resume last plan via `sessionStorage`
2. `/plan/setup` — pick faculty, upload checklist
3. Import → redirect to `/plan?id=<uuid>`
4. Click courses to show dependency arrows; drag between terms; mark courses complete

## File map

| Layer | Path | Role |
|-------|------|------|
| Setup UI | `apps/web/src/pages/plan/setup.astro` | Upload form |
| Editor UI | `apps/web/src/pages/plan/index.astro` | Term columns, course cards, SVG layer |
| Setup script | `apps/web/src/scripts/plan-setup.ts` | Drag-drop file, `POST /import` |
| Editor script | `apps/web/src/scripts/plan-editor.ts` | DnD, selection, SVG paths, completion PATCH |
| API client | `apps/web/src/lib/plans.ts` | `fetchPlan`, `fetchPlanGraph`, layout/completion updates |
| Shared graph | `apps/web/src/lib/plan-store.ts` | sessionStorage cache for other features |
| Types | `apps/web/src/types/plan.ts` | `DegreePlan`, `PlanTerm`, `PlanCourse` |
| Routes | `apps/api/src/routes/plans.ts` | REST endpoints |
| Plan persistence | `apps/api/src/services/planGenerator.ts` | INSERT/SELECT plans, term split logic |
| Prereq graph | `apps/api/src/services/planGraph.ts` | Edges, satisfaction, layout moves |
| Parser bridge | `apps/api/src/services/checklistParser.ts` | Spawn Python, parse JSON |
| Metadata | `apps/api/src/services/inferChecklistMetadata.ts` | Faculty / start year hints |
| Faculty links | `apps/api/src/data/faculty-checklists.ts` | Where to download checklists |
| Python parser | `services/checklist-parser/parse_checklist.py` | PDF/DOCX → JSON |
| Styles | `apps/web/src/styles/global.css` | `.plan-*` classes |

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/plans/faculties` | Checklist download links per faculty |
| `POST` | `/api/plans/import` | Multipart `checklist` file → new plan |
| `GET` | `/api/plans/:planId` | Full plan with terms and courses |
| `GET` | `/api/plans/:planId/graph` | Plan + placements + dependency edges |
| `PATCH` | `/api/plans/:planId/layout` | `{ moves: [{ courseId, termId, sortOrder }] }` |
| `PATCH` | `/api/plans/:planId/courses/:courseId` | `{ completed: boolean }` |

## Checklist → term layout

`buildTerms()` in `planGenerator.ts`:

1. Iterates checklist years 1…N (minimum 4 columns of terms)
2. Splits each year’s concrete courses **fall / winter** (first half vs second half)
3. **Full-year** courses (`schedule_note: full_year` from parser) go in fall only
4. **Stubs** (complementary studies, electives) go in winter with `entry_kind: stub`

Parser stub rules live in `parse_checklist.py` — complementary section headers become one card with `option_codes` listed in the subtitle instead of one card per optional course.

## Parser output shape

```json
{
  "programme_hint": "BACHELOR OF ENGINEERING (BEng)",
  "years": [
    { "year": 1, "courses": [{ "code": "EECS 1012", "credits": 3, "kind": "course" }] }
  ],
  "warnings": []
}
```

Course kinds:

- `course` — fixed code from checklist
- `stub` — placeholder with `section_label`, `option_codes[]`, `stub_type`

Run manually:

```bash
python services/checklist-parser/parse_checklist.py path/to/checklist.pdf
```

Tests: `python -m pytest` in `services/checklist-parser/`.

## Prerequisite graph

`buildPlanGraph()`:

1. Builds `placements` from plan rows (concrete courses only for edges)
2. Loads `course_prerequisites` for all codes in the plan
3. Parses co-requisites from `courses.description`
4. Marks each edge `satisfied` or not based on term order and `completed` flags

### UI behavior (`plan-editor.ts`)

- Lines render in SVG `#plan-deps-svg` above cards (`z-30`, `pointer-events-none`)
- Lines appear **only when a course is selected**
- Blue solid = prerequisite; amber dashed = co-requisite
- Red variant = unmet requirement
- Red `!` badge on cards with unmet prereqs
- Click outside cards clears selection and hides lines

## Client state

| Key | Storage | Purpose |
|-----|---------|---------|
| `yorklanes-plan-id` | sessionStorage | Last active plan UUID |
| `yorklanes-plan-graph:{id}` | sessionStorage | Cached graph for cross-feature reads |

Helpers: `readActivePlanGraphSnapshot()`, `listPlannedCourseCodes()`, `findUnmetPrerequisites()` in `plan-store.ts`.

## Known limitations

- No user accounts — anyone with a plan UUID can load it
- Parser accuracy varies by faculty PDF layout; scanned PDFs fail
- Prerequisite lines need `courses` / `course_prerequisites` populated (scraper)
- Re-import after parser upgrades to refresh stub/year logic
- Completion persistence requires `plan_courses.completed` column (`npm run supabase:push`)

## Extending the feature

| Idea | Where to start |
|------|----------------|
| Pick stub option → real course | Replace stub row in `plan_courses` |
| Export plan to ICS/PDF | New API route + template |
| Tie plan to logged-in user | Set `degree_plans.user_id` on import |
| Warn on credit totals | Sum `credits` per term in `planGraph` or new service |

## Related

- [`services/checklist-parser/README.md`](../../services/checklist-parser/README.md)
- [Database](../database.md) — plan tables
- [Architecture](../architecture.md) — import flow diagram
