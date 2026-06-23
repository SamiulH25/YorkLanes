# Contributing to YorkLanes

York University student dashboard designed to help students navigate their chaotic student lives.

YorkLanes replaces the fragmented York student workflow (degree checklists, course catalogue, Visual Schedule Builder, spreadsheets, generic calendars) with one web dashboard for degree planning, scheduling, progress tracking, finances, and assignments.

**EECS4314 Group 7** — monorepo with a York-themed dashboard, **degree plan editor** (checklist import + prerequisite graph), and stub pages for upcoming features.

**Repository:** https://github.com/SamiulH25/YorkLanes

More docs: [`docs/README.md`](docs/README.md) · Maintainer guide: [`docs/maintainer.md`](docs/maintainer.md)

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Astro.js, TypeScript, Tailwind CSS |
| Backend | Node.js, Express.js, TypeScript |
| Database | PostgreSQL via **hosted Supabase** |
| Auth (planned) | Google OAuth 2.0 (Passport.js or Firebase Auth) |
| Checklist parser | Python (`services/checklist-parser/`) |
| Course scraper | Python (`services/scraper/`) |
| Deploy (planned) | Vercel (web), Render (API) |

The web app talks to the **Express API**; the API connects to Postgres with `pg`. You do not need Supabase login or dashboard access for day-to-day development.

---

## What is built today

- York U themed dashboard with **dark mode** toggle (persists in localStorage)
- Sidebar layout, welcome header, and bento-style widget grid
- Placeholder widgets: degree progress, deadlines, student budget, feature tools
- **Degree plan editor** — upload faculty checklist (PDF/DOCX), term layout, drag-and-drop, prerequisite/co-requisite lines, completion tracking
- Login and onboarding page shells (OAuth not wired yet)
- Express API with health check, dashboard summary, and plans routes
- Python checklist parser and course scraper services
- Supabase migrations for core schema, degree plans, and course catalogue
- [`docs/`](docs/README.md), [`scripts/README.md`](scripts/README.md), and inline comments in key modules

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

---

## Repository layout

```
YorkLanes/
├── apps/
│   ├── web/              Astro frontend (dashboard UI, plan editor)
│   └── api/              Express REST API (direct Postgres via pg)
├── docs/                 Developer documentation
├── scripts/              Dev tools (setup, doctor, smoke)
├── services/
│   ├── checklist-parser/ Python degree checklist parser
│   └── scraper/          Python course catalogue scraper
├── supabase/
│   └── migrations/       Schema source of truth (maintainer pushes)
└── package.json          npm workspaces root
```

---

## Getting started

### Prerequisites

- Node.js 20+
- Python 3.10+ (degree plan checklist import)
- **`.env` files from the database maintainer** — no Supabase login required

### 1. Install dependencies

```bash
git clone https://github.com/SamiulH25/YorkLanes.git
cd YorkLanes
npm install
```

### 2. Configure environment

Ask the **database maintainer** for pre-filled files, or copy templates:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

| File | Purpose |
|------|---------|
| `apps/api/.env` | `SUPABASE_DB_URL`, `WEB_ORIGIN`, `API_PORT` |
| `apps/web/.env.local` | `PUBLIC_API_URL` |

Never commit `.env` or `.env.local`.

### 3. Python parser + verify

```bash
cd services/checklist-parser
python -m venv .venv
.venv\Scripts\activate    # Windows — use source .venv/bin/activate on macOS/Linux
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
| Dashboard | http://localhost:4321/dashboard |
| Degree plan | http://localhost:4321/plan/setup |
| API health | http://localhost:3001/health |

With `npm run dev` running, use `npm run doctor` or `npm run smoke` in another terminal to verify the API and database.

---

## Roles

| You are… | Do this | Do **not** do this |
|----------|---------|---------------------|
| Feature developer | UI + API routes + migration **files** in PRs | `supabase login`, `supabase push`, open Supabase dashboard |
| Database maintainer | Push migrations, share env secrets | — see [`docs/maintainer.md`](docs/maintainer.md) |

---

## Branch workflow

1. Branch from `main`: `git checkout -b feature/your-name-short-description`
2. Make focused changes; match existing code style
3. Run `npm run check` before opening a PR
4. If your feature needs new tables, add `supabase/migrations/YYYYMMDDHHMMSS_name.sql` and tell the maintainer to push after merge
5. Open a PR with a short summary and how you tested it

---

## How to add a new feature

1. **Frontend page:** `apps/web/src/pages/<feature>/index.astro` using `DashboardLayout.astro`
2. **Nav link:** uncomment the entry in `apps/web/src/layouts/DashboardLayout.astro`
3. **API route:** `apps/api/src/routes/<feature>.ts`, mount in `apps/api/src/index.ts`
4. **Database:** migration file in `supabase/migrations/` — maintainer runs `npm run supabase:push` after merge
5. **Dashboard widget:** update `apps/api/src/routes/dashboard.ts` with real summary data
6. **Types:** keep `apps/web/src/types/` and `apps/api/src/types/` in sync

See [`apps/web/FEATURE_PAGES.md`](apps/web/FEATURE_PAGES.md) for feature ownership.

---

## Database architecture

| App part | How it connects |
|----------|-----------------|
| `apps/web` | `fetch` to Express via `PUBLIC_API_URL` |
| `apps/api/src/db/index.ts` | `pg` pool via `SUPABASE_DB_URL` |
| `supabase/migrations/` | Versioned schema (maintainer pushes to hosted Postgres) |

---

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Run API and web together |
| `npm run setup` | Verify env files and Python parser |
| `npm run doctor` | Setup + API health check (dev server must be running) |
| `npm run smoke` | Test key API endpoints |
| `npm run tools` | List all dev commands |
| `npm run check` | Typecheck API + Astro (run before PRs) |
| `npm run test:parser` | Checklist parser pytest suite |
| `npm run dev:web` | Astro dev server only |
| `npm run dev:api` | Express dev server only |
| `npm run build` | Compile API + Astro typecheck |
| `npm run supabase:push` | Push migrations (**maintainer only**) |

See [`scripts/README.md`](scripts/README.md) for tool details.

---

## Team

EECS4314 Group 7:

- Taziz Ahsan
- Nabeela Ansari
- Sarah Asghar
- Samiul Hossain
- Thor Laski
- Jericho Marc Mendoza

---

## Further reading

- [`docs/architecture.md`](docs/architecture.md) — system design and request flows
- [`docs/development.md`](docs/development.md) — conventions and debugging
- [`docs/features/degree-plan.md`](docs/features/degree-plan.md) — reference implementation

## External references

- [York program search / calendars](https://futurestudents.yorku.ca/program-search)
- [Degree checklists](https://www.yorku.ca/laps/degree-checklist/2025-2026/)
- [Course catalogue](https://w2prod.sis.yorku.ca/Apps/WebObjects/cdm)
- [Visual Schedule Builder](https://registrar.yorku.ca/enrol/guide/vsb)
