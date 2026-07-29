# YorkLanes — Manual testing guide

Use this checklist to walk through every major feature in the browser. Mark each item **Pass**, **Fail**, or **N/A** and note bugs in the **Notes** column.

**Last updated:** July 2026

---

## Before you start

### Environment

| Check | Local | Production (Render) |
|-------|-------|---------------------|
| API running | `npm run start:dev` | `https://<api-host>/health` returns `"status": "ok"` |
| Web app | http://localhost:4321 | `https://<web-host>` |
| Database | `SUPABASE_DB_URL` set in `apps/api/.env` | Set in Render API service |
| Python parser | `services/checklist-parser/.venv` + deps installed | Installed during API build |
| Google OAuth (optional) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` in API `.env` | Same + callback = `https://<web-host>/api/auth/google/callback` |

### Quick smoke (terminal)

With dev servers running:

```bash
npm run doctor    # API + DB reachable
npm run smoke     # health, auth status, faculties, dashboard summary
npm run test      # automated unit tests (optional baseline)
```

### Test accounts & files

- **Signed-in testing:** Google account allowed in your OAuth app.
- **Guest testing:** Sign out or use a private window.
- **Checklist file:** Download a faculty PDF/DOCX from the links on `/plan/setup`, or ask the maintainer for a sample. Complementary studies PDF optional (BEng-style plans).
- **Browser:** Test at least one desktop width (≥1024px) and one mobile width (≤430px).

### Recording results

Copy this template for each session:

```
Date:
Tester:
Environment: local | Render
Browser:
Build/commit:

| ID | Result (P/F/N/A) | Notes |
|----|------------------|-------|
| A-01 | | |
```

---

## A. Global & shell

| ID | Steps | Expected |
|----|-------|----------|
| A-01 | Open `/` | Landing page loads; YorkLanes branding; CTA to sign in or dashboard |
| A-02 | Open `/login` while signed out | Sign-in page; Google button (or message if OAuth not configured) |
| A-03 | First visit (clear site data) | Cookie consent banner appears at bottom |
| A-04 | Dismiss cookie banner (“Essential only” or “Accept”) | Banner hides; preference remembered on reload |
| A-05 | Open **Settings** (gear) from any page | Panel opens: color themes, light/dark mode |
| A-06 | Switch color theme (e.g. York → another palette) | Colors update immediately; persists after navigation |
| A-07 | Toggle light ↔ dark | Mode applies across pages; persists after reload |
| A-08 | Resize to mobile width | Bottom mobile nav shows key items (Home, Plan, Progress, Courses, Assignments) |
| A-09 | Desktop: collapse/expand sidebar | Sidebar toggles; preference persists |
| A-10 | Click each sidebar link | Correct page loads; active nav highlight updates |

---

## B. Authentication

| ID | Steps | Expected |
|----|-------|----------|
| B-01 | Sign in with Google (OAuth configured) | Redirect back to app; session established |
| B-02 | Check “Remember me” then sign in | Session survives browser restart (up to ~30 days) |
| B-03 | Sign in without “Remember me” | Session works but may expire sooner on browser close |
| B-04 | Visit `/dashboard` while signed out | Guest dashboard or redirect to login (depends on page) |
| B-05 | Visit protected route (e.g. `/onboarding`) signed out | Redirect to `/login?returnTo=...` |
| B-06 | Sign in with `returnTo` param | Lands on intended page after OAuth |
| B-07 | Sign out (Settings → Sign out or `/api/auth/logout`) | Session cleared; guest state on dashboard |
| B-08 | OAuth misconfiguration | Login page shows helpful error (not a blank crash) |

---

## C. Onboarding

| ID | Steps | Expected |
|----|-------|----------|
| C-01 | New user: visit `/dashboard` after first sign-in | “Finish setting up YorkLanes” banner may appear |
| C-02 | Click **Continue setup** → `/onboarding` step 1 | Overview of 3 setup steps |
| C-03 | Step 2: fill faculty, programme, starting year → Continue | Programme saved via API |
| C-04 | Step 4: review summary → continue to import | Redirects toward checklist upload |
| C-05 | Complete onboarding (import a plan) | Banner disappears on dashboard reload |
| C-06 | Revisit `/onboarding` after completion | Redirects to dashboard (unless step 4 import flow) |

---

## D. Dashboard (`/dashboard`)

| ID | Steps | Expected |
|----|-------|----------|
| D-01 | Load dashboard signed in | Greeting with your name; today’s date |
| D-02 | Stat row | Shows: Classes today, Due this week, Degree progress %, Balance |
| D-03 | **Progress** widget | Ring or empty state; link to plan/progress |
| D-04 | **Today’s classes** widget | Lists today’s blocks from dashboard schedule, or helpful empty message |
| D-05 | **Assignments** widget | Upcoming items or empty message |
| D-06 | **Finance** widget | Balance / month summary or sign-in CTA for guests |
| D-07 | Guest dashboard | Placeholder copy; no crash; links to sign in or feature pages |
| D-08 | API offline | Yellow error banner with `npm run start:dev` hint (local only) |
| D-09 | Widget links | Each “View all” / link opens the correct feature page |

---

## E. Degree plan — setup (`/plan/setup`)

| ID | Steps | Expected |
|----|-------|----------|
| E-01 | Open `/plan/setup` | Faculty dropdown; file upload area |
| E-02 | Select faculty | Checklist download link appears for that faculty |
| E-03 | Drag-and-drop PDF or DOCX onto dropzone | File name shown; clear/remove works |
| E-04 | Submit without file | Validation error |
| E-05 | Submit invalid file type | Error message |
| E-06 | Submit valid checklist | Import succeeds; redirect to `/plan?id=<uuid>` |
| E-07 | Import failure (bad PDF / parser down) | Clear error; API log shows `[plans/import]` details |

---

## F. Degree plan — editor (`/plan`)

| ID | Steps | Expected |
|----|-------|----------|
| F-01 | Open `/plan` with existing plan | Term columns load; courses in correct years/seasons |
| F-02 | Open `/plan` with no plan | Empty state → link to setup |
| F-03 | Reload page | Same plan restores (sessionStorage + API) |
| F-04 | Click a course card | Prerequisite/co-requisite SVG lines appear (if catalogue data exists) |
| F-05 | Click empty space | Selection clears; lines hide |
| F-06 | Unmet prereq course | Red `!` badge on card; red edge lines |
| F-07 | Season warning course | Amber **S** badge when scraped data says wrong season |
| F-08 | Drag course to another term | Course moves; layout persists after reload |
| F-09 | Drag course to trash zone | Course removed from plan |
| F-10 | Mark course complete / incomplete | Toggle persists after reload |
| F-11 | Add course from catalogue | Search/add flow works; course appears in term |
| F-12 | Complementary stub card | Draggable; consistent stub label |
| F-13 | Upload complementary studies PDF | Parses; warnings update; filename shown in toolbar |
| F-14 | **Find complementary** search | Search results; add course to open slot |
| F-15 | Complementary warnings panel | Lists issues; links work |
| F-16 | `/plan?focus=complementary` | Scrolls/highlights complementary section |
| F-17 | Move course to summer term | Summer bubble / empty summer term creation works |
| F-18 | Plan alerts summary | Shows prereq, schedule, complementary issue counts |
| F-19 | Sidebar collapsed on plan page | Wide canvas for editor (if configured) |

---

## G. Progress (`/progress`)

| ID | Steps | Expected |
|----|-------|----------|
| G-01 | Open `/progress` without `planId` | Prompt to open a plan or empty state |
| G-02 | Open `/progress?planId=<uuid>` | Progress ring, category bars, course lists |
| G-03 | Completed vs remaining courses | Correct split; credits tally makes sense |
| G-04 | BEng plan + complementary PDF uploaded | Electives bar reflects complementary credits |
| G-05 | Link to complementary on plan | `/plan?focus=complementary` from progress section works |
| G-06 | Link from plan to progress | `#progress-electives` anchor works |

---

## H. Courses (`/courses`, `/courses/[code]`)

| ID | Steps | Expected |
|----|-------|----------|
| H-01 | Open `/courses` | Course list loads (or API error banner if DB empty) |
| H-02 | Search by code (e.g. `EECS`) | Results filter |
| H-03 | Filter by department | Department chips/filter work |
| H-04 | Clear filters | Full list returns |
| H-05 | Open a course detail page | Title, credits, description, prerequisites |
| H-06 | Typical scheduling panel | Section history / scheduling hints (if scraper data loaded) |
| H-07 | Link to schedule with course param | `/schedule?course=...` pre-fills focus |

---

## I. Schedule (`/schedule`)

| ID | Steps | Expected |
|----|-------|----------|
| I-01 | Open `/schedule` | Saved schedules list or empty state |
| I-02 | **New schedule** | Year, semester, CDM term selectors |
| I-03 | Start building | Editor opens; plan courses listed in side panel |
| I-04 | Search course + load sections | Scraped sections appear |
| I-05 | Add section to timetable | Block appears on weekly grid |
| I-06 | BLEN (blended) section | Treated as lecture on grid |
| I-07 | Overlapping sections | Conflict detected; warning/blocked add |
| I-08 | Toggle build ↔ timetable view | Views switch; data preserved |
| I-09 | Save schedule (signed in) | Persists to cloud; appears in saved list |
| I-10 | **Use on dashboard** / **Dashboard schedule** | Marks active; dashboard today’s classes update |
| I-11 | Open saved schedule | Loads previous week state |
| I-12 | Delete schedule | Removed from list |
| I-13 | Guest / signed out | Local draft or sign-in prompt for cloud sync |
| I-14 | Friday (or today) classes | Dashboard widget shows classes on correct weekday (Toronto TZ) |

---

## J. Assignments (`/assignments`)

| ID | Steps | Expected |
|----|-------|----------|
| J-01 | Open `/assignments` | List loads (empty or populated) |
| J-02 | Create assignment (title, course, due date) | Appears in list |
| J-03 | Toggle done / not done | State updates; dashboard “due this week” updates |
| J-04 | Star / unstar | Star state persists |
| J-05 | Edit assignment | Fields update |
| J-06 | Delete assignment | Removed from list |
| J-07 | Sort / filter (if UI present) | Correct ordering |
| J-08 | Dashboard widget | Shows same upcoming items as full page |

---

## K. Finance (`/finance`)

RTM: `docs/rtm/finance-rtm.md`. Unit outcomes: `docs/testing/finance-test-cases.md`.

| ID | RTM | Steps | Expected |
|----|-----|-------|----------|
| K-01 | FR-FIN-09, NFR-FIN-02 | Open `/finance` signed out | Sign-in prompt; local draft mode may work |
| K-02 | FR-FIN-02, FR-FIN-09, NFR-FIN-02, NFR-FIN-04 | Open `/finance` signed in | Entries, balance, charts load |
| K-03 | FR-FIN-01 | Add expense entry | Amount, category, date; list updates |
| K-04 | FR-FIN-01, FR-FIN-03 | Add income entry | Category list switches (OSAP, Job, etc.) |
| K-05 | FR-FIN-07 | Edit entry | PATCH saves correctly |
| K-06 | FR-FIN-07 | Delete entry | Removed; balance recalculates |
| K-07 | FR-FIN-04 | Set monthly budget | Budget bar / overspend alert appears |
| K-08 | FR-FIN-05 | Change month filter | Entries and summary match selected month |
| K-09 | FR-FIN-05 | Search / kind filter | Filters compose correctly |
| K-10 | FR-FIN-06 | Recurring entry (if enabled) | Recurrence option + “Log next” for due items |
| K-11 | FR-FIN-08 | Export CSV | File downloads with expected rows |
| K-12 | FR-FIN-10 | Dashboard finance widget | Reflects signed-in totals |

---

## L. Cross-feature flows

These end-to-end paths catch integration bugs.

| ID | Flow | Expected |
|----|------|----------|
| L-01 | Sign in → onboarding → import checklist → open plan | Full new-user path works |
| L-02 | Plan → schedule for a term → set dashboard schedule → dashboard | Today’s classes widget populated |
| L-03 | Plan → mark courses complete → progress page | Percentages increase |
| L-04 | Upload complementary PDF on plan → progress electives bar | Complementary credits reflected |
| L-05 | Add assignments due this week → dashboard stat | “Due this week” count increases |
| L-06 | Add finance entries → dashboard balance stat (RTM FR-FIN-02, FR-FIN-10) | Balance updates |
| L-07 | Theme change on dashboard → navigate to plan | Theme persists |
| L-08 | Sign out → sign back in | Data still on server (plans, schedules, assignments, finance) |

---

## M. API & health (optional)

| ID | Steps | Expected |
|----|-------|----------|
| M-01 | `GET /health` | Instant `{ "status": "ok", "service": "yorklanes-api" }` |
| M-02 | `GET /health/ready` | DB + plan tables status |
| M-03 | `GET /` on API host | JSON pointer to web app (not HTML 404) |
| M-04 | `GET /api/auth/status` | `oauthEnabled` flag matches env |
| M-05 | Web `/health` in production | Proxied to API health |

---

## N. Production (Render) only

| ID | Steps | Expected |
|----|-------|----------|
| N-01 | Open **web** URL (not API URL) | Astro app loads |
| N-02 | Google OAuth with production callback | Sign-in completes on web origin |
| N-03 | Session cookie on web domain | Authenticated API calls work via proxy |
| N-04 | Checklist import on Render | Python parser runs (`PYTHON_PATH=python3`) |
| N-05 | Cold start (free tier) | App wakes within ~1 min; no permanent hang |

---

## Known limitations (not bugs)

Record as **N/A** if you hit these by design:

- Guest users cannot sync cloud schedules, assignments, or finance (local drafts only where implemented).
- Prerequisite arrows need `courses` / `course_prerequisites` data from the scraper.
- Schedule section times need `course_sections` scraper data.
- Scanned PDF checklists often fail parsing.
- OAuth disabled locally → sign-in button shows configuration message.
- Free Render tier sleeps after inactivity.

---

## Bug report template

When something fails, file an issue with:

```
**ID:** (e.g. F-08)
**Environment:** local / Render
**Browser:**
**Steps:**
1.
2.
**Expected:**
**Actual:**
**Screenshot/console errors:**
**API terminal output:** (if relevant)
```

---

## Related docs

- [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) — routes and file map
- [features/degree-plan.md](./features/degree-plan.md) — plan editor details
- [deployment.md](./deployment.md) — Render setup
- [development.md](./development.md) — local run commands
