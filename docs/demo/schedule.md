# Schedule (`/schedule`)

## Purpose

Weekly timetable builder: pick plan year/semester/CDM term, choose section bundles per course, detect conflicts, save to cloud, set active schedule for dashboard.

## Implementation

- **Page:** `apps/web/src/pages/schedule/index.astro`
- **Script:** `apps/web/src/scripts/schedule-page.ts` (~1800 lines)
- **CSS:** `schedule-page.css`, `schedule-shuffle.css`
- **Algorithms:** `apps/web/src/lib/schedule-shuffle.ts`

### Modes

| Mode | UI |
|------|-----|
| `home` | Saved schedules list |
| `create` | Pick year, season, CDM term |
| `editor` | Course chips, section browser, weekly grid |

### Server-side (SSR payload)

Embedded in `<script id="schedule-ssr">` via `serializeForScript`:

- `fetchCdmTerms(undefined, cookie)` → available academic terms
- `fetchSavedSchedules(cookie)` if signed in
- Query params: `?course=`, `?term=`, `?view=timetable`, `?new=1`

### Client-side

- `registerPageBoot` on `[data-schedule-root]`
- Reads plan courses from `readActivePlanGraphSnapshot()` (`sessionStorage` plan graph)
- **Loads sections sequentially** (active course first) with `fetchWithRetry`
- **Conflict-free shuffle:** `enumerateValidSchedules` + ← → navigation
- **Pin courses** when cycling alternatives
- **Hybrid persistence:**
  - Signed in → `user_schedules`, `schedule_entries`, `schedule_course_bundles` in Postgres
  - Guest → `localStorage` (`yorklanes-schedule-week-v2`)
- Skips cloud week fetch if schedule not yet saved (avoids 404 noise)

### API endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/course-sections/terms` | CDM terms dropdown |
| `GET /api/course-sections?course_code=&term=` | Section bundles |
| `GET /api/schedules` | Saved schedule list |
| `GET /api/schedules/week` | Load week entries + bundles |
| `PUT /api/schedules/week` | Save week |
| `DELETE /api/schedules/week` | Delete saved schedule |
| `PATCH /api/schedules/active` | “Use on dashboard” |

### Database

- `user_schedules`, `schedule_entries`, `schedule_course_bundles`
- `course_sections` (scraped CDM data)

## Demo script

1. **New schedule:** Year 1 → Fall → pick CDM term → “Start building”.
2. Show course chips from degree plan; click course → section browser.
3. Pick lecture + tutorial bundle → events appear on grid.
4. Use ← → shuffle for conflict-free alternatives.
5. Save → “Use on dashboard” → verify dashboard “today’s classes”.
6. Mention guest mode works locally without sign-in.

## Q&A

**Q: What is a CDM term?**  
A: Scraped timetable label (e.g. `2026-2027 FW`) from York’s course management data.

**Q: Why “No scraped terms yet”?**  
A: `course_sections` table empty or API unreachable — fixed with SSR term preload + retries.

**Q: Why did loading take forever / “Failed to fetch”?**  
A: Was firing parallel API calls through a flaky proxy; now sequential load + middleware retries.

**Q: Where does the plan come from?**  
A: Active plan graph in `sessionStorage` — user must open `/plan` first (or have plan ID set).

**Q: What do pinned courses do?**  
A: Stay fixed while shuffle cycles other courses’ section alternatives.

**Q: Local vs cloud?**  
A: Guests edit in browser storage; sign-in syncs to Postgres per user.
