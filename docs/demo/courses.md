# Course Catalogue (`/courses`)

## Purpose

Searchable, paginated York course catalogue with department filters.

## Implementation

- **Page:** `apps/web/src/pages/courses/index.astro`
- **No client script** — pure SSR + HTML form GET navigation

### Server-side

- `fetchCourses({ department, search, limit: 100, offset })` → `GET /api/courses`
- `fetchDepartments()` → `GET /api/courses/departments`
- Query params: `?search=`, `?department=`, `?page=` (offset = `(page-1) * 100`)
- **No cookie** — public API

### API & data

| Endpoint | Purpose |
|----------|---------|
| `GET /api/courses` | Paginated list |
| `GET /api/courses/departments` | Department chips |

- **Tables:** `courses`, `course_prerequisites`
- **Service:** `courseSearch` in API

### UI patterns

- Ledger-style grid with staggered row animation (`--row-index`)
- Department chips are plain links (full page navigation)
- Course links preserve `?return=` for back-navigation from detail page

### Auth

- **None** — fully public

## Demo script

1. Search “EECS” — show instant SSR results.
2. Click a department chip — filtered view.
3. Open a course → detail page.
4. Mention data comes from **scraped catalogue** in Postgres, not live York website per request.

## Q&A

**Q: How fresh is course data?**  
A: Updated when maintainers run the scraper import (`services/scraper/` → `courses` table).

**Q: Why 100 per page?**  
A: Hardcoded `pageSize = 100` in page frontmatter for performance.

**Q: Are prerequisites shown here?**  
A: Briefly in list; full chain on course detail page.
