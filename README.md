# YorkLanes (YorkPath)

York University student dashboard designed to help students navigate their chaotic student lives.

YorkLanes replaces the fragmented York student workflow (degree checklists, course catalogue, Visual Schedule Builder, spreadsheets, generic calendars) with one web dashboard for degree planning, scheduling, progress tracking, finances, and assignments.

**EECS4314 Group 7** — monorepo with a York-themed dashboard, **degree plan editor** (checklist import + prerequisite graph), and stub pages for upcoming features.

**Developer docs:** [`docs/README.md`](docs/README.md) · **Onboarding:** [`CONTRIBUTING.md`](CONTRIBUTING.md)

**Repository:** https://github.com/SamiulH25/YorkLanes

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Astro.js, TypeScript, Tailwind CSS |
| Backend | Node.js, Express.js, TypeScript |
| Database | PostgreSQL via **hosted Supabase** |
| Client DB access | `@supabase/supabase-js` (web app) |
| Auth (planned) | Google OAuth 2.0 (Passport.js or Firebase Auth) |
| Scraper (future) | Python (BeautifulSoup / Scrapy) |
| Deploy (planned) | Vercel (web), Render (API) |

## What is built today

- York U themed dashboard with **dark mode** toggle (persists in localStorage)
- Sidebar layout, welcome header, and bento-style widget grid
- Placeholder widgets: degree progress, deadlines, student budget, feature tools
- **Degree plan editor** — upload faculty checklist (PDF/DOCX), term layout, drag-and-drop, prerequisite/co-requisite lines, completion tracking
- Login and onboarding page shells (OAuth not wired yet)
- Express API with health check, dashboard summary, and plans routes
- Python checklist parser and course scraper services
- Supabase migrations for core schema, degree plans, and course catalogue
- Expansion READMEs, [`docs/`](docs/README.md), and `EXPAND HERE` comments throughout the codebase

## What is NOT built (by design)

| Feature | Owner | Create at |
|---------|-------|-----------|
| Google OAuth | Foundation | `apps/api/src/routes/auth.ts` |
| Course Explorer | Jericho | `apps/web/src/pages/courses/` |
| Schedule Builder | Nabeela | `apps/web/src/pages/schedule/` |
| Progress Tracker | Thor | `apps/web/src/pages/progress/` |
| Finance Module | Taziz | `apps/web/src/pages/finance/` |
| Assignment Calendar | Sarah | `apps/web/src/pages/assignments/` |
| Course scraper data | Shared | `services/scraper/README.md` |

Degree plan is **built** — see [`docs/features/degree-plan.md`](docs/features/degree-plan.md).

## Repository layout

```
YorkLanes/
├── apps/
│   ├── web/              Astro frontend (dashboard UI, plan editor)
│   └── api/              Express REST API (direct Postgres via pg)
├── docs/                 Developer documentation (start at docs/README.md)
├── services/
│   ├── checklist-parser/ Python degree checklist parser
│   └── scraper/          Python course catalogue scraper
├── supabase/
│   ├── migrations/       Schema source of truth (pushed to hosted Supabase)
│   └── seed.sql          Dev seed data
├── package.json          npm workspaces root
└── .env.example
```

## Quick start

### Prerequisites

- Node.js 20+
- Python 3.10+ (degree plan checklist import)
- **`.env` files from the database maintainer** — you do not need Supabase login or dashboard access

The app uses a **shared hosted database** in the cloud. Your local API connects through connection strings in `apps/api/.env`.

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Ask the **database maintainer** for pre-filled env files, or copy templates:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Fill in values the maintainer provides. Never commit `.env` or `.env.local`.

### 3. Python parser + verify

```bash
cd services/checklist-parser
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cd ../..
npm run setup
```

### 4. Run development servers

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:4321 |
| Dashboard | http://localhost:4321/dashboard |
| Backend API | http://localhost:3001 |
| Health check | http://localhost:3001/health |
| Degree plan | http://localhost:4321/plan/setup |

Use the **moon/sun button** in the dashboard header to toggle dark mode.

## Database architecture

| App part | How it connects |
|----------|-----------------|
| `apps/web/src/db/supabase.js` | Supabase JS client (REST + RLS) |
| `apps/api/src/db/index.ts` | `pg` pool via `SUPABASE_DB_URL` / `DATABASE_URL` (direct SQL) |
| `supabase/migrations/` | Versioned schema pushed to hosted Postgres |

Hosted Supabase **replaces** the need to run local Postgres or `docker compose`. Local Supabase (`npm run supabase:start`) and `docker-compose.yml` exist only as optional offline alternatives.

## How to add a new feature

1. **Frontend page:** `apps/web/src/pages/<feature>/index.astro` using `DashboardLayout.astro`
2. **Nav link:** uncomment the entry in `apps/web/src/layouts/DashboardLayout.astro`
3. **API route:** `apps/api/src/routes/<feature>.ts`, mount in `apps/api/src/index.ts`
4. **Database:** add a migration file in `supabase/migrations/` — the **maintainer** runs `npm run supabase:push` after merge
5. **Dashboard widget:** update `apps/api/src/routes/dashboard.ts` with real summary data
6. **Types:** keep `apps/web/src/types/` and `apps/api/src/types/` in sync

See also:

- **[`CONTRIBUTING.md`](CONTRIBUTING.md)** — onboarding checklist for new developers
- **[`docs/README.md`](docs/README.md)** — full developer documentation
- `supabase/README.md`
- `apps/api/src/routes/README.md`
- `apps/web/FEATURE_PAGES.md`
- `docs/features/degree-plan.md`
- `apps/web/src/components/dashboard/README.md`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run setup` | Verify env files and Python parser |
| `npm run check` | Typecheck API + Astro (run before PRs) |
| `npm run dev` | Run API and web together |
| `npm run dev:web` | Astro dev server only |
| `npm run dev:api` | Express dev server only |
| `npm run build` | Compile API + Astro typecheck |
| `npm run supabase:push` | Push migrations (**maintainer only**) |
| `npm run supabase:start` | Optional: local Supabase stack (requires Docker) |
| `npm run supabase:reset` | Optional: reset local Supabase after `supabase:start` |

## Team

EECS4314 Group 7:

- Taziz Ahsan
- Nabeela Ansari
- Sarah Asghar
- Samiul Hossain
- Thor Laski
- Jericho Marc Mendoza

## External references

- [York program search / calendars](https://futurestudents.yorku.ca/program-search)
- [Degree checklists](https://www.yorku.ca/laps/degree-checklist/2025-2026/)
- [Course catalogue](https://w2prod.sis.yorku.ca/Apps/WebObjects/cdm)
- [Visual Schedule Builder](https://registrar.yorku.ca/enrol/guide/vsb)
