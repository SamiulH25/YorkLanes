# TA check-in reference

Quick sheet for YorkLanes (EECS 4314, Group 7). Use this when the TA asks what we built, how it works, or what stack we use.

---

## One-liner

YorkLanes is a student dashboard for York University. Students sign in, upload their official degree checklist (PDF/DOCX), and get a term-by-term plan they can edit. Other tabs (schedule, courses, progress, finance, assignments) are being built by teammates.

**Repo:** [github.com/SamiulH25/YorkLanes](https://github.com/SamiulH25/YorkLanes)

---

## Team

| Name | Feature area |
|------|----------------|
| Samiul Hossain | Degree plan, database maintainer, onboarding |
| Taziz Ahsan | Finance |
| Sarah Asghar | Assignments |
| Nabeela Ansari | Schedule builder |
| Thor Laski | Progress tracker |
| Jericho Marc Mendoza | Course explorer |

---

## Frameworks and stack

| Layer | Technology | Version / notes |
|-------|------------|-----------------|
| **Frontend** | [Astro](https://astro.build) | 5.x, SSR (`output: "server"`) |
| **Frontend adapter** | `@astrojs/node` | Standalone Node server for production |
| **Styling** | [Tailwind CSS](https://tailwindcss.com) | 3.4, custom York palette in `tailwind.config.mjs` |
| **Frontend language** | TypeScript | 5.7 |
| **Backend** | [Express](https://expressjs.com) | 4.x, TypeScript via `tsx` in dev |
| **Database** | PostgreSQL on [Supabase](https://supabase.com) | Raw SQL with `pg` (no ORM) |
| **Auth** | Google OAuth 2.0 | `google-auth-library` + `express-session` cookie sessions |
| **Checklist parser** | Python 3.10+ | `pdfplumber`, `python-docx` |
| **Course scraper** | Python 3.10+ | Separate service, not fully wired to UI yet |
| **Monorepo** | npm workspaces | `apps/web`, `apps/api` |
| **Migrations** | Supabase CLI | `supabase/migrations/` is source of truth |

### Why these choices

- **Astro:** file-based routing, SSR for pages that need cookies/DB, small client JS bundles for interactive bits (plan editor drag-and-drop).
- **Express:** simple REST API, easy for the team to add one router file per feature.
- **Raw SQL + migrations:** one shared hosted DB; schema changes are reviewed in PRs and applied by the maintainer.
- **Python sidecar for parsing:** PDF/DOCX checklist formats vary a lot; Python libs handle documents better than Node for this use case.

---

## Architecture (30-second version)

```
Browser
  → Astro pages (port 4321, SSR)
  → fetch /api/* (proxied to Express on 3001)
  → Express routes → services → PostgreSQL (Supabase)
  → checklist import spawns Python parser, then writes plan tables
```

**Dev proxy:** Astro dev server proxies `/api` and `/health` to `localhost:3001` (`apps/web/astro.config.mjs`).

**Auth flow:** `GET /api/auth/google` → Google → callback sets session cookie → `GET /api/auth/me` returns user.

---

## What is actually built vs stub

| Feature | Route | Status | Notes |
|---------|-------|--------|-------|
| Hero / landing | `/` | **Built** | Sign-in required messaging |
| Onboarding | `/onboarding` | **Built** | 4 steps: intro → programme → Google sign-in → checklist import |
| Google login | `/login` | **Built** | Needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in API `.env` |
| Dashboard | `/dashboard` | **Partial** | Shell + widgets; some data is placeholder |
| Degree plan | `/plan`, `/plan/setup` | **Built** | Main feature: import, drag terms, prereq graph, mark complete |
| Finance | `/finance` | **Working first pass** | Entries + monthly budgets in DB |
| Assignments | `/assignments` | **Partial** | UI + API CRUD; not per-user yet |
| Courses | `/courses` | Stub | Task doc for Jericho |
| Schedule | `/schedule` | Stub | Task doc for Nabeela |
| Progress | `/progress` | Stub | Task doc for Thor |

---

## Demo path (good for live check-in)

1. `npm run start:dev` from repo root.
2. Open `http://localhost:4321/`.
3. Sign in with Google (if OAuth env is configured).
4. Go through `/onboarding` or straight to `/plan/setup`.
5. Upload a faculty checklist PDF or DOCX.
6. Land on `/plan?id=...`: drag courses between terms, click a course to see prerequisite arrows.

**Health check:** `http://localhost:3001/health`  
**Parser tests:** `npm run test:parser`

---

## Repo layout

```
apps/web/                 Astro frontend
  src/pages/              Routes (index, dashboard, plan, onboarding, …)
  src/scripts/            Client JS (plan-editor, plan-setup, onboarding)
  src/lib/                API fetch helpers
  src/layouts/            BaseLayout, DashboardLayout, OnboardingLayout
  src/components/         Widgets, ThemeToggle, YorkMark

apps/api/                 Express API
  src/routes/             One file per feature (plans, auth, finance, …)
  src/services/           Business logic (planGenerator, planGraph, …)
  src/db/                 Postgres pool
  src/middleware/         Session middleware

services/checklist-parser/   Python PDF/DOCX → JSON
services/scraper/            Python course catalogue scraper

supabase/migrations/      SQL schema (degree_plans, users, finance, …)
docs/                     Architecture, feature write-ups, task guides
```

---

## Code structure

How the codebase is organized if the TA asks about separation of concerns, patterns, or “where would you put X?”

### Big idea: feature slices in a monorepo

Each feature (plan, finance, assignments, …) usually touches **three layers**, not one giant file:

```
apps/web/src/pages/<feature>/     UI (Astro)
apps/web/src/lib/<feature>.ts     Browser/server fetch helpers
apps/api/src/routes/<feature>.ts  HTTP handlers (thin)
apps/api/src/services/<feature>.ts   Business logic + SQL (when non-trivial)
supabase/migrations/              New tables/columns (if needed)
```

Routers are mounted once in `apps/api/src/index.ts`. Nav links live in `DashboardLayout.astro`.

There is **no shared npm package** between web and API. Types are duplicated in `apps/web/src/types/` and `apps/api/src/types/` when both sides need the same shape.

### Frontend (`apps/web`) layers

| Layer | Folder | Responsibility |
|-------|--------|----------------|
| **Routes** | `src/pages/` | One URL per file (Astro file-based routing). Example: `pages/plan/index.astro` → `/plan` |
| **Layouts** | `src/layouts/` | Page shells. `BaseLayout` (HTML, theme), `DashboardLayout` (sidebar nav), `OnboardingLayout` (setup wizard) |
| **Components** | `src/components/` | Reusable UI chunks (widgets, `ThemeToggle`, `FeatureStarter` for stubs) |
| **Lib** | `src/lib/` | `fetch()` wrappers, auth helpers, `getApiUrl()`. No DOM code here |
| **Scripts** | `src/scripts/` | Browser-only TypeScript (drag-and-drop, form submit, charts). Imported from a `<script>` tag on the page that needs it |
| **Types** | `src/types/` | TypeScript interfaces for API JSON |
| **Styles** | `src/styles/global.css` | Shared component classes (`.btn-york`, `.surface`, `.plan-*`) + Tailwind |

**SSR vs client JS (Astro pattern):**

- Pages that need cookies or DB data set `export const prerender = false` and `await fetch(...)` in the frontmatter `---` block (runs on the server).
- Interactive behavior (plan editor, file upload, finance charts) lives in `src/scripts/*.ts` and runs in the browser.
- Astro components (`.astro`) are mostly HTML + Tailwind; we do not use React/Vue for the main UI.

**Example: degree plan page**

```
plan/setup.astro          Server: load faculty list via fetchFaculties()
                          Client:  plan-setup.ts handles file drop + POST /import

plan/index.astro          Server: load plan by ?id= from API
                          Client:  plan-editor.ts handles DnD, SVG prereq lines, PATCH layout
```

### Backend (`apps/api`) layers

| Layer | Folder | Responsibility |
|-------|--------|----------------|
| **Entry** | `src/index.ts` | Express app, CORS, JSON body, session middleware, mount all routers |
| **Routes** | `src/routes/` | Parse request, validate input, call service, send JSON/status. Keep thin |
| **Services** | `src/services/` | SQL queries, multi-step workflows, spawning Python, OAuth logic |
| **DB** | `src/db/` | `getPool()` — shared `pg` connection pool |
| **Middleware** | `src/middleware/` | Session cookies (`session.ts`), `requireAuth` helper (exists, not wired everywhere yet) |
| **Config** | `src/config/` | Auth env vars |
| **Data** | `src/data/` | Static reference data (faculty checklist download links) |
| **Types** | `src/types/` | Session augmentation, response shapes |

**Route → service rule:** if a handler needs more than a one-line query, move logic to `services/`. Example: `routes/plans.ts` calls `planGenerator.ts` and `planGraph.ts`, not raw SQL inline.

**Module style:** ESM throughout (`"type": "module"`), imports use `.js` extension in API TypeScript (Node resolution).

### Python services (`services/`)

Not imported as npm packages. The API **spawns a subprocess** when needed:

```
POST /api/plans/import
  → routes/plans.ts
  → services/checklistParser.ts  (runs parse_checklist.py)
  → JSON back to Node
  → services/planGenerator.ts      (INSERT into plan tables)
```

Parser tests live beside the Python code (`pytest` via `npm run test:parser`). Scraper is separate and optional for catalogue data.

### Request flow (end-to-end example)

Importing a checklist:

1. **Browser** — `plan-setup.ts` builds `FormData`, `POST /api/plans/import` with `credentials: "include"`.
2. **Astro dev proxy** — forwards `/api/*` to Express `:3001`.
3. **Express** — `plansRouter` receives multipart file (`multer`).
4. **Service** — `checklistParser.ts` runs Python; `inferChecklistMetadata.ts` guesses faculty/year; `planGenerator.ts` writes `degree_plans`, `plan_terms`, `plan_courses`.
5. **Response** — `{ plan: { id } }`; browser redirects to `/plan?id=...`.
6. **Plan page SSR** — `plans.ts` helper fetches full plan server-side; `plan-editor.ts` takes over in the browser for edits.

### Conventions we follow

| Topic | Convention |
|-------|------------|
| Feature ownership | Comment at top of route/page file (`/** Finance — Taziz */`) |
| API paths | `/api/<feature>/...`, mounted in `index.ts` |
| Auth session | Cookie `yorklanes.sid`, `req.session.userId` on API |
| DB schema | New file in `supabase/migrations/`, never edit old migrations |
| Styling | Tailwind utilities in `.astro` files; repeated patterns in `global.css` `@layer components` |
| API URL in web | Always `getApiUrl()` from `lib/api-url.ts` (dev uses proxy on 4321) |
| Stub features | `FeatureStarter.astro` + API returns `{ status: "stub", ... }` |

### Adding a new feature (structural checklist)

1. `apps/web/src/pages/<name>/index.astro` — `DashboardLayout`, `prerender = false` if fetching API
2. `apps/web/src/lib/<name>.ts` — fetch helpers
3. `apps/api/src/routes/<name>.ts` — `export const fooRouter = Router()`
4. `apps/api/src/services/<name>.ts` — if logic is non-trivial
5. Mount router in `apps/api/src/index.ts`
6. Sidebar link in `DashboardLayout.astro`
7. Optional: `supabase/migrations/YYYYMMDD_<name>.sql`

Use **degree plan** (`docs/features/degree-plan.md`) as the reference implementation.

### What we intentionally avoid

- **No ORM** — SQL in services, schema in migrations (easier PR review for the team).
- **No React app shell** — Astro pages + small client scripts only where needed.
- **No shared types package** — keeps repo simple; copy interfaces when both sides need them.

---

## Main database tables

| Table | Purpose |
|-------|---------|
| `users` | Google OAuth users |
| `user_programmes` | Onboarding programme name + start year |
| `degree_plans` | One row per imported plan |
| `plan_terms` | Fall/winter columns per academic year |
| `plan_courses` | Courses and elective stubs in each term |
| `courses` / `course_prerequisites` | Catalogue (for prereq graph) |
| `assignments` | Assignment calendar data |
| `finance_entries` / `finance_monthly_budgets` | Finance module |

Schema changes: add a new file under `supabase/migrations/`, merge PR, maintainer runs `npm run supabase:push`.

---

## API routes (mounted in `apps/api/src/index.ts`)

| Prefix | Feature |
|--------|---------|
| `/health` | API + DB connectivity |
| `/api/auth` | Google OAuth, session, logout |
| `/api/onboarding` | Programme setup status for signed-in users |
| `/api/plans` | Checklist import, plan CRUD, graph, layout moves |
| `/api/dashboard` | Dashboard summary JSON |
| `/api/courses` | Course explorer (stub) |
| `/api/schedules` | Schedule builder (stub) |
| `/api/progress` | Progress tracker (stub) |
| `/api/finance` | Finance entries and budgets |
| `/api/assignments` | Assignment CRUD |

---

## Degree plan (main feature) in more detail

**User flow:** upload checklist → API runs Python parser → `planGenerator` inserts plan/terms/courses → user edits layout in browser.

**Key files if TA asks “where is X?”**

| Question | File |
|----------|------|
| Upload UI | `apps/web/src/pages/plan/setup.astro` |
| Plan editor UI | `apps/web/src/pages/plan/index.astro` |
| Drag-and-drop / SVG prereqs | `apps/web/src/scripts/plan-editor.ts` |
| Import endpoint | `apps/api/src/routes/plans.ts` → `POST /import` |
| Save plan to DB | `apps/api/src/services/planGenerator.ts` |
| Prerequisite edges | `apps/api/src/services/planGraph.ts` |
| Parse PDF/DOCX | `services/checklist-parser/parse_checklist.py` |

**Parser handles:** course codes, credit slots, elective stubs, multi-year redistribution for LA&PS checklists without explicit year headers.

---

## Running locally (short)

**Requirements:** Node 20+, Python 3.10+, env files from maintainer.

```bash
npm install
# copy apps/api/.env and apps/web/.env.local from maintainer
cd services/checklist-parser && python -m venv .venv && pip install -r requirements.txt
npm run setup
npm run start:dev
```

| Command | What it does |
|---------|----------------|
| `npm run start:dev` | API :3001 + web :4321 |
| `npm run check` | Typecheck API + Astro |
| `npm run doctor` | Env + API health (servers must be running) |
| `npm run test:parser` | Python parser tests |

---

## Known limitations (honest answers if asked)

- **Plan ownership:** `GET/PATCH /api/plans/:id` does not yet verify the plan belongs to the signed-in user.
- **Assignments:** global table, not scoped to `user_id` yet.
- **Some dashboard widgets:** placeholder or sample data until features land.
- **OAuth:** works when env vars are set; otherwise login page shows a config message.
- **Credits column:** migration `20250630100000_widen_plan_course_credits.sql` widens `plan_courses.credits` past 99.9 (needed for 120-credit degree totals). Maintainer must push migrations.
- **Production deploy:** documented in `docs/deployment.md`, not fully automated in repo.

We are intentionally deferring some auth/security fixes until teammate PRs merge.

---

## Common TA questions and short answers

**What course is this?**  
EECS 4314, Group 7, York University.

**What problem are you solving?**  
Students juggle faculty checklists, course calendars, and planning tools. We centralize degree planning and are building surrounding student tools on one dashboard.

**Why a monorepo?**  
One repo for frontend, API, migrations, and Python services so the team can PR together and share types/docs.

**Why not Next.js / React SPA?**  
Astro gives us SSR for auth cookies, mostly static pages, and targeted client scripts only where we need interactivity (plan editor).

**Why not Prisma / Drizzle?**  
Small team, explicit SQL in migrations, easier for everyone to read schema diffs in PRs.

**How do teammates add a feature?**  
Page in `apps/web/src/pages/<feature>/`, router in `apps/api/src/routes/<feature>.ts`, mount in `index.ts`, optional migration. See `docs/tasks/` for each owner’s guide.

**How is the code structured?**  
Monorepo with vertical feature slices: Astro pages + `lib/` fetch helpers on the web, thin Express routes + `services/` for logic on the API, Python sidecars for parsing. Routes stay thin; SQL and workflows live in services. See [Code structure](#code-structure) above.

**How do you test?**  
`npm run check`, `npm run doctor`, manual checklist import, `npm run test:parser` for parser regressions.

**What would you do next?**  
Per-user auth on plans and assignments, wire course scraper to explorer, finish schedule/progress features, production deploy.

---

## Pointers for deeper reading

| Doc | Contents |
|-----|----------|
| [README.md](../README.md) | Project overview |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Onboarding for teammates |
| [docs/architecture.md](architecture.md) | System diagram and design principles |
| [docs/DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) | Full codebase map and folder reference |
| [docs/features/degree-plan.md](features/degree-plan.md) | Degree plan API and parser detail |
| [docs/database.md](database.md) | Database workflow |
| [apps/web/FEATURE_PAGES.md](../apps/web/FEATURE_PAGES.md) | Page ownership table |

---

*Last updated for TA check-in prep. Adjust “built vs stub” if teammates land PRs before the meeting.*
