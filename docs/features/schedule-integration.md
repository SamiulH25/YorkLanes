# Schedule integration — course sections → personal schedule

**Audience:** Nabeela (schedule page) and anyone wiring scraped timetables into the week grid.

This doc explains how to use **scraped York section data** (`course_sections`) together with the **personal schedule builder** (`/schedule`). They are two different stores.

---

## Two data sources (do not mix writes)

| Source | What it is | API | Writable? |
|--------|------------|-----|-----------|
| **Course sections** | Public York CDM timetables scraped into Postgres | `GET /api/course-sections` | No — scraper only |
| **User schedules** | One student's chosen meetings for their week | `GET/POST /api/schedules` | Yes — per signed-in user |

Rule of thumb:

- **Read** section times from `course_sections` to suggest or pre-fill slots.
- **Write** the user's picks into `schedules` (your table/API).
- Never `INSERT`/`UPDATE` `course_sections` from the schedule page.

---

## What the scraper already loaded

Migration: `supabase/migrations/20250901000000_course_sections.sql`

| Column | Example | Notes |
|--------|---------|-------|
| `term` | `2026-2027 FW` | CDM term code |
| `course_code` | `EECS 3421` | Same format as catalogue / plan |
| `section_code` | `LEC A`, `TUT 01` | One logical section |
| `day` | `MON` | Abbreviated day |
| `start_time` / `end_time` | `14:30` | 24h `HH:MM` |
| `campus`, `room`, `instructor`, `delivery_mode` | optional | |

One DB row = **one meeting**. A lecture that meets Mon + Wed is **two rows** with the same `section_code`.

### Term → season mapping

York often publishes Fall/Winter as a single CDM term:

| Scraped `term` | Seasons it counts as |
|----------------|----------------------|
| `2026-2027 FW` | Fall **and** Winter |
| `2026 F` | Fall |
| `2026 W` | Winter |
| `2026 S` | Summer |

Shared helpers live in `apps/api/src/services/termSeason.ts`. The degree plan uses the same rules for season offering warnings.

### Import commands (dev data)

```powershell
npm run scraper:schedule:fixture
npm run scraper:schedule:db
# or live:
npm run scraper:schedule          # one subject (EECS), current term
npm run scraper:schedule:all        # default subject list, current term
npm run scraper:schedule:db
```

Details: [`services/scraper/README.md`](../../services/scraper/README.md)

---

## APIs you should call

### 1. List sections for a course

```http
GET /api/course-sections?course_code=EECS%203421
GET /api/course-sections?course_code=EECS%203421&term=2026-2027%20FW
```

Web client: `fetchCourseSections()` in `apps/web/src/lib/course-sections.ts`

Response (simplified):

```ts
{
  groups: [
    {
      course_code: "EECS 3421",
      term: "2026-2027 FW",
      title: "...",
      sections: [
        {
          section_code: "LEC A",
          meetings: [
            { day: "MON", start_time: "14:30", end_time: "16:00", campus: "Keele", room: "...", instructor: "...", delivery_mode: "In Person" },
            { day: "WED", start_time: "14:30", end_time: "16:00", campus: "Keele", room: "...", instructor: "...", delivery_mode: "In Person" }
          ]
        }
      ]
    }
  ]
}
```

Types: `apps/web/src/types/course-sections.ts`

### 2. Typical offering summary (seasons + usual meeting)

```http
GET /api/course-sections/summary?course_code=EECS%203421
```

Web client: `fetchCourseOfferingSummary(code)`

Useful for:

- Showing “usually Fall/Winter, Mon/Wed 2:30–4:00”
- Filtering “only courses offered in the term I’m building”

```ts
{
  summary: {
    course_code: "EECS 3421",
    has_history: true,
    terms_seen: ["2026-2027 FW", "2025-2026 FW"],
    seasons: { fall: true, winter: true, summer: false },
    seasons_offered: ["fall", "winter"],
    section_count: 12,
    typical: {
      days: ["MON", "WED"],
      start_time: "14:30",
      end_time: "16:00",
      campuses: ["Keele"],
      delivery_modes: ["In Person"],
      sample_section: "LEC A"
    },
    last_scraped_at: "2026-..."
  }
}
```

### 3. Planned courses from the degree plan

After the user opens `/plan` once in the session:

```ts
import { readActivePlanGraphSnapshot } from "../lib/plan-store";

const graph = readActivePlanGraphSnapshot();
const codes = graph?.course_codes ?? [];
// or filter placements by term_label / entry_kind === "course"
```

Graph also includes:

- `schedule_warnings` — courses placed in a season with **no** scraped history for that F/W/S slot
- `offering_seasons` — per-code `{ fall, winter, summer, has_history }`

Server builder: `apps/api/src/services/planGraph.ts`  
Endpoint: `GET /api/plans/:id/graph`

---

## Day / time conversion helpers

Schedule UI today uses full day names (`Monday`) and `<input type="time">` (`HH:MM`).
Scraped data uses `MON` and `14:30`.

```ts
const DAY_TO_FULL: Record<string, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

const FULL_TO_DAY: Record<string, string> = Object.fromEntries(
  Object.entries(DAY_TO_FULL).map(([abbr, full]) => [full, abbr]),
);

function toScheduleDay(sectionDay: string): string {
  return DAY_TO_FULL[sectionDay.toUpperCase()] ?? sectionDay;
}

function toSectionDay(scheduleDay: string): string {
  return FULL_TO_DAY[scheduleDay] ?? scheduleDay.slice(0, 3).toUpperCase();
}
```

Times are already `HH:MM` — you can pass them straight into the grid positioning math.

---

## Recommended integration flow (Phase 2)

```
1. User opens /schedule (must be signed in)
2. readActivePlanGraphSnapshot() → planned course codes for the active term
3. For each code: fetchCourseSections({ courseCode, term: selectedTerm })
4. Render section chips / picker (LEC preferred over TUT/LAB for main blocks)
5. On pick: POST /api/schedules with converted Monday + HH:MM
6. Paint week grid from GET /api/schedules
```

### Term picker

Distinct terms come from section groups (`group.term`). Default to the most recent string sort (API already returns newest first per course).

FW terms cover both Fall and Winter plan slots — if the user is building a Fall week, still show `… FW` sections.

### Conflict detection (later)

Two meetings conflict when same day and overlapping `[start, end)`. Compare after converting everything to minutes-from-midnight.

---

## Where this already shows up in the app

| Surface | Behaviour |
|---------|-----------|
| `/courses/[code]` | **Typical scheduling** panel + full section/timetable browser |
| `/plan` | **S** badge when a course has history but was never offered in that F/W/S slot |
| `/schedule` | Manual grid today — wire the APIs above for Phase 2 |

---

## File map

| Concern | Path |
|---------|------|
| Section API | `apps/api/src/routes/course-sections.ts` |
| Section query | `apps/api/src/services/course-sections.ts` |
| Offering summary | `apps/api/src/services/courseOfferings.ts` |
| Season bridging | `apps/api/src/services/termSeason.ts` |
| Plan warnings | `apps/api/src/services/planGraph.ts` |
| Web section client | `apps/web/src/lib/course-sections.ts` |
| Plan graph cache | `apps/web/src/lib/plan-store.ts` |
| Schedule page (yours) | `apps/web/src/pages/schedule/index.astro` |
| Schedule API stub | `apps/api/src/routes/schedules.ts` |
| First-PR task | [`docs/tasks/schedule.md`](../tasks/schedule.md) |

---

## Checklist for your next PR

- [ ] Persist `schedules` table + wire `GET`/`POST /api/schedules`
- [ ] Load planned course codes via `readActivePlanGraphSnapshot()`
- [ ] Fetch sections with `fetchCourseSections` / `fetchCourseOfferingSummary`
- [ ] Convert `MON` ↔ `Monday` before painting the grid
- [ ] Keep scraper data read-only
- [ ] Optional: highlight plan `schedule_warnings` when suggesting sections
