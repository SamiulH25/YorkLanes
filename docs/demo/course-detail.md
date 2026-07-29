# Course Detail (`/courses/[code]`)

## Purpose

Single course view: description, prerequisite chain, typical offering seasons, scraped section timetables by term.

## Implementation

- **Page:** `apps/web/src/pages/courses/[code].astro`
- **Route param:** `code` (e.g. `EECS-1011` → normalized course code)

### Server-side (parallel fetches, no cookie)

| Fetch | Endpoint |
|-------|----------|
| Course metadata | `GET /api/courses/:code` |
| Section groups | `GET /api/course-sections?course_code=` |
| Offering summary | `GET /api/course-sections/summary?course_code=` (optional, `.catch(null)`) |

### Client-side

- Inline script **only when multiple terms** exist — tab switching for section panels (`data-term-tab`)

### API & data

- **Tables:** `courses`, `course_prerequisites`, `course_sections`, `course_offering_summaries` (materialized view)
- **Services:** `courseOfferings`, `listCourseSections` in API

### UI sections

- Description, credits, department
- Prerequisite / corequisite chain (linked course codes)
- **Typical scheduling** — Fall/Winter/Summer chips from scraped history
- **Sections by term** — meeting days, times, rooms, instructors
- Sidebar link to `/plan` and schedule builder

### Auth

- **None** — public

## Demo script

1. Open a popular course (e.g. EECS 1011).
2. Show prerequisite links → navigate to prereq courses.
3. Switch term tabs for section data.
4. If empty: explain CDM scraper hasn’t imported that term yet.

## Q&A

**Q: Why are sections empty?**  
A: Section data comes from CDM timetable scraper (`course_sections` table). Not live on each page load.

**Q: What is “typical scheduling”?**  
A: Aggregated from historical scraped offerings — which seasons the course usually runs.

**Q: How does this connect to Schedule?**  
A: Schedule page loads the same `course-sections` API for bundle picking when building a weekly timetable.

**Q: Cloudflare on York CDM?**  
A: Scraper uses browser bootstrap to pass Cloudflare; catalogue/sections in DB are pre-imported.
