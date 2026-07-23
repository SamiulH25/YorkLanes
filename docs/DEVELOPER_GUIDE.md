# YorkLanes developer guide

This is the main reference for where things live and how they work. Written in plain English for the whole team.

**Quick start:** [CONTRIBUTING.md](../CONTRIBUTING.md) → copy env files → `npm run setup` → `npm run start:dev`

---

## What this project is

YorkLanes is a student dashboard for York University (EECS4314, Group 7). Students can upload their degree checklist, get a term-by-term plan, drag courses around, and see prerequisite links.

Right now the **degree plan editor** is the most complete feature. The dashboard shell, login, and other feature pages exist, but many API routes still return stub data.

---

## The big picture

Four main pieces talk to each other:

```
Browser  →  Astro web app (port 4321)
              ↓  /api/* requests (dev proxy)
           Express API (port 3001)
              ↓  SQL
           Postgres on Supabase (hosted)
```

Two Python tools sit beside the API:

- **checklist-parser** — reads PDF/DOCX checklists when you import a plan
- **scraper** — pulls York course catalogue data into the `courses` table

There is **no shared npm package** between web and API. Types are copied per app when needed.

---

## Repository map

```
YorkLanes/
├── apps/
│   ├── web/                 Astro frontend (what users see)
│   └── api/                 Express REST API (data + business logic)
├── services/
│   ├── checklist-parser/    Python: checklist file → JSON
│   └── scraper/             Python: York courses → JSON or DB
├── supabase/
│   └── migrations/          Database schema (source of truth)
├── docs/                    Documentation (you are here)
├── scripts/
│   └── tools.mjs            setup, doctor, smoke helpers
├── package.json             Root scripts + npm workspaces
├── CONTRIBUTING.md          Onboarding + PR workflow
└── README.md                Project overview
```

### Who needs what access

| Role | Needs |
|------|--------|
| Feature developer | Node, Python venv, `.env` files from maintainer |
| Database maintainer | Above + Supabase dashboard + `npm run supabase:push` |

Most developers **do not** need a Supabase login. The API connects to the hosted database using a connection string in `apps/api/.env`.

---

## Frontend (`apps/web`)

### Tech stack

- **Astro** with server-side rendering (SSR)
- **TypeScript**
- **Tailwind CSS** for styling
- **@astrojs/node** adapter (runs as a Node server, not static files)

Dev server: **http://localhost:4321**

### Folder layout

```
apps/web/
├── public/                      Files served as-is (logos, favicon)
├── astro.config.mjs             Astro + Tailwind + dev proxy config
├── tailwind.config.mjs          York brand colors, fonts, shadows
├── FEATURE_PAGES.md             Short index of feature pages
└── src/
    ├── middleware.ts            Dev-only proxy for /api and /health
    ├── layouts/
    │   ├── BaseLayout.astro     HTML shell, fonts, theme bootstrap
    │   └── DashboardLayout.astro Sidebar, mobile nav, user block
    ├── pages/                   One file per URL (see table below)
    ├── components/
    │   ├── FeatureStarter.astro Template for stub feature pages
    │   ├── ThemeToggle.astro    Light/dark mode control
    │   ├── YorkMark.astro       York U logo mark
    │   └── dashboard/           Home page widgets
    ├── lib/                     Fetch helpers + auth utilities
    ├── scripts/                 Client-side TypeScript (runs in browser)
    ├── styles/global.css        Shared CSS classes + plan editor styles
    └── types/                   TypeScript types for API responses
```

### Every page and what it does

| URL | File | What it does | Status |
|-----|------|--------------|--------|
| `/` | `pages/index.astro` | Redirects to `/dashboard` | Done |
| `/dashboard` | `pages/dashboard/index.astro` | Home: greeting, widgets, quick links | Shell done; widget data mostly placeholder |
| `/login` | `pages/login.astro` | Google sign-in button | Done (needs OAuth env on API) |
| `/onboarding` | `pages/onboarding/index.astro` | Intro to setting up your degree | Scaffold (form fields disabled) |
| `/plan` | `pages/plan/index.astro` | Degree plan editor (drag-and-drop) | **Fully built** |
| `/plan/setup` | `pages/plan/setup.astro` | Upload checklist, pick faculty | **Fully built** |
| `/courses` | `pages/courses/index.astro` | Course explorer | Stub (`FeatureStarter`) |
| `/schedule` | `pages/schedule/index.astro` | Weekly schedule | Stub |
| `/progress` | `pages/progress/index.astro` | Degree completion % | Stub |
| `/finance` | `pages/finance/index.astro` | Student budget | Working first pass |
| `/assignments` | `pages/assignments/index.astro` | Due dates | Stub |

Most feature pages set `export const prerender = false` so they can fetch live API data on each request.

### Layouts explained

**`BaseLayout.astro`** — wraps every page.

- Loads `global.css` and Google fonts (Fraunces + Plus Jakarta Sans)
- Runs a small inline script before paint to apply saved light/dark theme
- Loads `scripts/theme.ts` for toggle clicks

**`DashboardLayout.astro`** — wraps all logged-in app pages.

- Left sidebar with navigation (collapsible on desktop)
- Mobile top bar + bottom navigation
- Fetches the current user from `GET /api/auth/me` for the avatar and name
- Pass `activeNav` prop to highlight the current section

Sidebar collapse state is saved in `localStorage` (`sidebar-collapsed`). Script: `scripts/sidebar.ts`.

### Components

| Component | Path | Purpose |
|-----------|------|---------|
| `ProgressWidget` | `components/dashboard/ProgressWidget.astro` | Circular progress on dashboard |
| `AssignmentsWidget` | `components/dashboard/AssignmentsWidget.astro` | Upcoming deadlines |
| `FinanceWidget` | `components/dashboard/FinanceWidget.astro` | Balance summary |
| `QuickLinksWidget` | `components/dashboard/QuickLinksWidget.astro` | Links to other features |
| `FeatureStarter` | `components/FeatureStarter.astro` | “Not built yet” page with task steps |
| `ThemeToggle` | `components/ThemeToggle.astro` | Sun/moon theme picker |
| `YorkMark` | `components/YorkMark.astro` | York U red U logo |

### `src/lib/` — API client helpers

| File | What it does |
|------|--------------|
| `api-url.ts` | **`getApiUrl()`** — returns the right API base URL (see proxy section below) |
| `api.ts` | `fetchDashboardSummary()` |
| `auth.ts` | Session user, auth status, Google sign-in URL, logout URL |
| `plans.ts` | Faculties, import, load plan, graph, layout moves, completion |
| `plan-store.ts` | Caches plan graph in `sessionStorage` for other features |
| `courses.ts` | `fetchCourses()` |
| `schedules.ts` | `fetchSchedules()` |
| `progress.ts` | `fetchProgress()` |
| `finance.ts` | `fetchFinance()` |
| `assignments.ts` | `fetchAssignments()` |

Always use `getApiUrl()` when building fetch URLs. Do not hardcode `localhost:3001` in page code.

### `src/scripts/` — browser JavaScript

| File | Used on | What it does |
|------|---------|--------------|
| `plan-editor.ts` | `/plan` | Drag-and-drop courses, SVG prerequisite lines, mark complete |
| `plan-setup.ts` | `/plan/setup` | File upload UI, POST to `/api/plans/import` |
| `theme.ts` | All pages (via BaseLayout) | Theme toggle clicks, saves to `localStorage` |
| `sidebar.ts` | Dashboard pages | Sidebar collapse/expand, saves to `localStorage` |

Import these from a `<script>` tag on the page that needs them.

### Styling and theming

- **Tailwind utilities** go directly on elements in `.astro` files
- **Shared classes** live in `src/styles/global.css` under `@layer components`:
  - `.surface`, `.surface-elevated` — cards
  - `.btn-york`, `.btn-ghost` — buttons
  - `.link-nav`, `.link-nav-active` — sidebar links
  - `.plan-*` — degree plan editor (many classes)
- **Brand colors** are in `tailwind.config.mjs` under `york.*` (e.g. `york-red`, `york-cream`, `york-navy`)
- **Dark mode** uses `class="dark"` on `<html>`. Toggle sets `localStorage.theme` to `"light"` or `"dark"`

### Environment variables (web)

Copy `apps/web/.env.example` → `apps/web/.env.local`

| Variable | Dev value | Why |
|----------|-----------|-----|
| `PUBLIC_API_URL` | `http://localhost:4321` | Browser talks to the web server; dev proxy forwards `/api` to the API |
| `API_INTERNAL_URL` | (optional) `http://localhost:3001` | Astro server-side fetches hit the API directly |

For `npm run start:prod` locally, set `PUBLIC_API_URL=http://localhost:3001` (no dev proxy in prod build).

---

## API (`apps/api`)

### Tech stack

- **Express** + **TypeScript**
- **`pg`** for Postgres (no ORM)
- **`express-session`** for login cookies
- **Google OAuth** via `google-auth-library`

Dev server: **http://localhost:3001**

### Folder layout

```
apps/api/
├── .env.example
└── src/
    ├── index.ts                 App entry: CORS, session, route mounts
    ├── config/auth.ts           Reads OAuth + session env vars
    ├── middleware/
    │   ├── session.ts           Cookie session (`yorklanes.sid`)
    │   └── auth.ts              `requireAuth` middleware (exists, not used on routes yet)
    ├── routes/                  One file per feature (Express Router)
    ├── services/                Business logic (DB queries, parser, OAuth)
    ├── db/
    │   ├── index.ts             Connection pool
    │   ├── resolveDatabaseUrl.ts Picks SUPABASE_DB_URL or DATABASE_URL
    │   └── planCourseSchema.ts  Runtime check for `completed` column
    ├── data/                    Static JSON (faculty checklist links)
    └── types/                   Shared TypeScript shapes
```

### Every API route

| Method | Path | File | Status |
|--------|------|------|--------|
| GET | `/health` | `routes/health.ts` | Live — checks DB + plan tables |
| GET | `/api/auth/status` | `routes/auth.ts` | Live |
| GET | `/api/auth/google` | `routes/auth.ts` | Live — starts OAuth |
| GET | `/api/auth/google/callback` | `routes/auth.ts` | Live |
| GET | `/api/auth/me` | `routes/auth.ts` | Live — current user or null |
| GET | `/api/auth/logout` | `routes/auth.ts` | Live |
| GET | `/api/dashboard/summary` | `routes/dashboard.ts` | Live — placeholder widget data |
| GET | `/api/plans/faculties` | `routes/plans.ts` | Live |
| POST | `/api/plans/import` | `routes/plans.ts` | Live — multipart file upload |
| GET | `/api/plans/:id` | `routes/plans.ts` | Live |
| GET | `/api/plans/:id/graph` | `routes/plans.ts` | Live — prereq edges |
| PATCH | `/api/plans/:id/layout` | `routes/plans.ts` | Live — drag-and-drop saves |
| PATCH | `/api/plans/:id/courses/:courseId` | `routes/plans.ts` | Live — mark complete |
| GET | `/api/courses` | `routes/courses.ts` | Stub |
| GET | `/api/schedules` | `routes/schedules.ts` | Stub |
| GET | `/api/progress` | `routes/progress.ts` | Stub |
| GET | `/api/finance` | `routes/finance.ts` | Working first pass |
| GET/POST/DELETE | `/api/finance/entries` | `routes/finance.ts` | Working first pass |
| GET | `/api/finance/monthly-summary` | `routes/finance.ts` | Working first pass |
| GET/PUT | `/api/finance/budget/:month` | `routes/finance.ts` | Working first pass |
| GET | `/api/assignments` | `routes/assignments.ts` | Stub |

Stub routes return JSON like `{ status: "stub", message: "...", nextSteps: [...] }`.

Route conventions: `apps/api/src/routes/README.md`

### Services (where the real logic lives)

| Service | File | Purpose |
|---------|------|---------|
| Checklist parser bridge | `services/checklistParser.ts` | Spawns Python `parse_checklist.py` |
| Metadata inference | `services/inferChecklistMetadata.ts` | Guesses faculty, programme, start year from file text |
| Plan generator | `services/planGenerator.ts` | Creates plan rows in DB |
| Plan graph | `services/planGraph.ts` | Prerequisite edges, layout updates, completion |
| Google auth | `services/googleAuth.ts` | OAuth URL + token exchange |
| Users | `services/users.ts` | Create/find user on login |

Keep route handlers thin. Put SQL and logic in `services/`.

### Environment variables (API)

Copy `apps/api/.env.example` → `apps/api/.env`

| Variable | Required? | Purpose |
|----------|-----------|---------|
| `SUPABASE_DB_URL` | Yes | Postgres connection string (from maintainer) |
| `SUPABASE_URL` | Finance fallback | Hosted project URL for Supabase REST |
| `SUPABASE_PUBLISHABLE_KEY` | Finance fallback | Publishable key for Supabase REST |
| `API_PORT` | Yes (default 3001) | Port Express listens on |
| `WEB_ORIGIN` | Yes | CORS allowed origin (`http://localhost:4321`) |
| `GOOGLE_CLIENT_ID` | For login | Google Cloud OAuth client |
| `GOOGLE_CLIENT_SECRET` | For login | Google Cloud OAuth secret |
| `GOOGLE_CALLBACK_URL` | For login | Default: `http://localhost:4321/api/auth/google/callback` |
| `SESSION_SECRET` | Prod login | Random string 32+ chars |
| `PYTHON_PATH` | Optional | Path to venv python if `python` is not on PATH |
| `DATABASE_URL` | Fallback | Used if `SUPABASE_DB_URL` is missing |
| `NODE_ENV` | Prod | Set to `production` for secure cookies |

---

## How the dev proxy works

This trips people up, so read it carefully.

### In development (`npm run start:dev`)

The browser should use **`PUBLIC_API_URL=http://localhost:4321`** (the web port).

When the browser calls `http://localhost:4321/api/plans/...`:

1. Astro `middleware.ts` (dev only) forwards the request to `http://localhost:3001`
2. OR Vite's proxy in `astro.config.mjs` does the same thing

Cookies stay on port **4321**, which is why Google login works through the proxy.

### On the Astro server (SSR)

When a page loads data in its frontmatter (`---` block), `getApiUrl()` returns **`http://localhost:3001`** directly. The middleware does not run for outbound server fetches.

```
Browser  →  :4321/api/...  →  proxy  →  :3001
Astro SSR  →  :3001/api/...  (direct)
```

`npm run setup` and `npm run doctor` warn you if `PUBLIC_API_URL` points at `:3001` during normal dev.

---

## Authentication

Login is **built** but **optional**. Pages do not block guests yet.

### Flow

1. User opens `/login`
2. Page checks `GET /api/auth/status` — is OAuth configured?
3. User clicks “Continue with Google” → `GET /api/auth/google`
4. Google redirects back to `GOOGLE_CALLBACK_URL` → `GET /api/auth/google/callback`
5. API creates/updates a row in `users`, sets session cookie `yorklanes.sid`
6. `DashboardLayout` calls `GET /api/auth/me` to show name and avatar initial

### Important files

| Piece | Location |
|-------|----------|
| Login page | `apps/web/src/pages/login.astro` |
| Web auth helpers | `apps/web/src/lib/auth.ts` |
| API auth routes | `apps/api/src/routes/auth.ts` |
| OAuth config | `apps/api/src/config/auth.ts` |
| Session middleware | `apps/api/src/middleware/session.ts` |
| `requireAuth` (unused) | `apps/api/src/middleware/auth.ts` |

### Google Cloud setup

Redirect URI must be:

```
http://localhost:4321/api/auth/google/callback
```

Full walkthrough: `docs/tasks/auth.md`

When you import a plan while logged in, `user_id` is saved on the plan row.

---

## Database (`supabase/`)

### Where schema lives

**`supabase/migrations/`** is the source of truth. Each file is named `YYYYMMDDHHMMSS_description.sql`.

The maintainer applies migrations to the hosted database with `npm run supabase:push`. Other developers just write migration files in their PRs.

### Tables that exist today

| Table | Purpose |
|-------|---------|
| `users` | Google login profiles |
| `user_programmes` | Student programme info (onboarding — not fully wired) |
| `courses` | York course catalogue |
| `course_prerequisites` | Prereq links between courses |
| `degree_plans` | One row per imported plan |
| `plan_terms` | Fall/Winter/etc. columns in a plan |
| `plan_courses` | Courses placed in terms |
| `todos` | Demo/quickstart table |

### Feature tables

Some are commented in the core migration until each feature owner adds a dedicated migration:

- `schedules`, `schedule_sections`
- `requirement_progress`
- `finance_entries` — implemented by `20250629000000_finance_entries.sql`
- `finance_monthly_budgets` — implemented by `20250629010000_finance_monthly_budgets.sql`
- `assignments`

Full reference: `docs/database.md`

### Row Level Security (RLS)

RLS is enabled. Plan tables currently use permissive policies (`using (true)`) so development works without strict auth. Tighten before production.

---

## Python services

### Checklist parser (`services/checklist-parser/`)

**Required for plan import.**

- Entry: `parse_checklist.py`
- Called by: `apps/api/src/services/checklistParser.ts`
- Input: PDF or DOCX faculty checklist
- Output: JSON list of courses and sections

Setup:

```bash
cd services/checklist-parser
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
```

Tests: `npm run test:parser`

### Scraper (`services/scraper/`)

**Optional for most feature work.** Populates the `courses` table so prerequisite lines appear in the plan editor.

- Maintainer runs scraper import
- Offline test: `npm run scraper:fixture`

Docs: `services/scraper/README.md`

---

## Feature ownership

| Feature | Owner | Web page | API route | Task guide |
|---------|-------|----------|-----------|------------|
| Degree plan | Samiul | `/plan`, `/plan/setup` | `/api/plans/*` | `docs/features/degree-plan.md` |
| Dashboard | Shared | `/dashboard` | `/api/dashboard/summary` | — |
| Google OAuth | Foundation | `/login` | `/api/auth/*` | `docs/tasks/auth.md` |
| Onboarding | Samiul | `/onboarding` | (not built) | — |
| Course explorer | Jericho | `/courses` | `/api/courses` | `docs/tasks/courses.md` |
| Schedule | Nabeela | `/schedule` | `/api/schedules` | `docs/tasks/schedule.md` |
| Progress | Thor | `/progress` | `/api/progress` | `docs/tasks/progress.md` |
| Finance | Taziz | `/finance` | `/api/finance` | `docs/tasks/finance.md` |
| Assignments | Sarah | `/assignments` | `/api/assignments` | `docs/tasks/assignments.md` |

---

## How to add a new feature (step by step)

1. **Read your task guide** in `docs/tasks/<feature>.md`
2. **Database** — add a migration in `supabase/migrations/` if you need new tables
3. **API route** — create `apps/api/src/routes/<feature>.ts`, mount in `src/index.ts`
4. **Service** — put logic in `apps/api/src/services/<feature>.ts`
5. **Web types** — add `apps/web/src/types/<feature>.ts` if needed
6. **Fetch helper** — add `apps/web/src/lib/<feature>.ts`
7. **Page** — build `apps/web/src/pages/<feature>/index.astro` using `DashboardLayout`
8. **Navigation** — link already exists in `DashboardLayout.astro`; set `activeNav`
9. **Dashboard widget** (optional) — wire real data in `apps/api/src/routes/dashboard.ts`
10. **PR** — run `npm run check`, note migration in PR description, ask maintainer to push schema

Stub pages use `FeatureStarter.astro` until the real UI is ready.

---

## npm scripts (cheat sheet)

| Command | When to use it |
|---------|----------------|
| `npm run start:dev` | Daily development (API + web hot reload) |
| `npm run setup` | First time or after env changes |
| `npm run doctor` | Servers running — checks live health |
| `npm run smoke` | Quick API endpoint test |
| `npm run check` | Before every PR (typecheck both apps) |
| `npm run test:parser` | After parser changes |
| `npm run start:prod` | Test production build locally |
| `npm run supabase:push` | **Maintainer only** — apply migrations |

Full list: `scripts/README.md`

---

## Coding conventions

### TypeScript imports

- **API:** use `.js` extension in imports (`import { x } from "./foo.js"`) because of NodeNext modules
- **Web:** normal imports without `.js`

### Naming

| Thing | Style | Example |
|-------|-------|---------|
| DB columns | snake_case | `display_name`, `entry_kind` |
| API JSON (public) | camelCase | `displayName` |
| Files | lowercase feature name | `plans.ts`, `plan-editor.ts` |
| Session cookie | fixed name | `yorklanes.sid` |
| localStorage keys | `yorklanes-*` | `yorklanes-plan-id` |

### Frontend page pattern

```astro
---
import DashboardLayout from "../../layouts/DashboardLayout.astro";
import { fetchSomething } from "../../lib/something";

export const prerender = false;

const data = await fetchSomething();
---

<DashboardLayout title="My Feature | YorkLanes" activeNav="myfeature">
  <Fragment slot="header">
    <h1 class="heading-page">My Feature</h1>
  </Fragment>

  <!-- page content -->
</DashboardLayout>
```

### API route pattern

```ts
import { Router } from "express";

export const myRouter = Router();

myRouter.get("/", async (_req, res) => {
  res.json({ feature: "myfeature", status: "stub", message: "Not built yet." });
});
```

Mount in `apps/api/src/index.ts`:

```ts
import { myRouter } from "./routes/my.js";
app.use("/api/my", myRouter);
```

---

## Common problems

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| “Cannot reach the API” on login | API not running | `npm run start:dev` |
| “API route not found” | Wrong `PUBLIC_API_URL` or API down | Use `:4321` in dev; restart both apps |
| Plan import fails | Python not set up | Install checklist-parser venv; set `PYTHON_PATH` |
| No prerequisite lines in editor | `courses` table empty | Ask maintainer to run scraper |
| CORS error | `WEB_ORIGIN` mismatch | Set `WEB_ORIGIN=http://localhost:4321` in API `.env` |
| OAuth redirect error | Wrong redirect URI in Google Cloud | Must match `GOOGLE_CALLBACK_URL` exactly |
| Dashboard shows “API offline” | API not running or DB down | Check terminal + `GET /health` |
| Schema error on plan load | Migration not pushed | Ask maintainer to `supabase:push` |

---

## Other docs (by topic)

| Doc | Use when you need… |
|-----|-------------------|
| [Architecture](./architecture.md) | Diagrams and request flow |
| [Development](./development.md) | Shorter setup reference |
| [Database](./database.md) | Table and column details |
| [Degree plan](./features/degree-plan.md) | Deep dive on the working feature |
| [Feature tasks](./tasks/README.md) | Your first PR scope |
| [Maintainer](./maintainer.md) | Supabase CLI and secrets |
| [Deployment](./deployment.md) | Production hosting |

---

## Degree plan data flow (the working feature)

Understanding this helps you copy the pattern for other features.

```
1. User opens /plan/setup
2. Picks faculty → downloads checklist PDF from York site
3. Uploads file → browser POST /api/plans/import (multipart)
4. API saves file temp → runs Python parser → infers metadata
5. API inserts degree_plans, plan_terms, plan_courses rows
6. Browser redirects to /plan?id=<uuid>
7. Page SSR fetches GET /api/plans/:id and graph data
8. plan-editor.ts handles drag-and-drop → PATCH /api/plans/:id/layout
9. Mark complete → PATCH /api/plans/:id/courses/:courseId
```

Key files to read:

- `apps/web/src/pages/plan/setup.astro` + `scripts/plan-setup.ts`
- `apps/web/src/pages/plan/index.astro` + `scripts/plan-editor.ts`
- `apps/web/src/lib/plans.ts`
- `apps/api/src/routes/plans.ts`
- `apps/api/src/services/planGenerator.ts`, `planGraph.ts`, `checklistParser.ts`

---

*EECS4314 Group 7 — York University*
