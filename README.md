# YorkLanes

Student dashboard for York University — EECS4314, Group 7.

Repo: [github.com/SamiulH25/YorkLanes](https://github.com/SamiulH25/YorkLanes)

York students juggle degree checklists, the course catalogue, VSB, spreadsheets, and random calendars. YorkLanes pulls the useful parts into one place. Right now the **degree plan editor** is the main working feature: upload your faculty checklist (PDF or DOCX), get a term-by-term layout, drag courses around, and see prerequisite links.

Everything else on the dashboard is scaffolded for teammates to build.

**New to the repo?** Read [CONTRIBUTING.md](CONTRIBUTING.md) first.

**Going deeper?** [docs/README.md](docs/README.md)

---

## Stack

- **Web** — Astro, TypeScript, Tailwind (`apps/web`)
- **API** — Express, TypeScript, `pg` (`apps/api`)
- **Database** — Postgres on hosted Supabase (`supabase/migrations/`)
- **Parser** — Python, for checklist import (`services/checklist-parser/`)
- **Scraper** — Python, for the course catalogue (`services/scraper/`)

Auth (Google OAuth) and production deploy are not wired up yet.

---

## Project status

| Area | Status | Owner |
|------|--------|-------|
| Degree plan editor | Working | Samiul |
| Dashboard shell + widgets | Placeholders | Shared |
| Course explorer | Stub — [docs/tasks/courses.md](docs/tasks/courses.md) | Jericho |
| Schedule builder | Stub — [docs/tasks/schedule.md](docs/tasks/schedule.md) | Nabeela |
| Progress tracker | Stub — [docs/tasks/progress.md](docs/tasks/progress.md) | Thor |
| Finance | Stub — [docs/tasks/finance.md](docs/tasks/finance.md) | Taziz |
| Assignments | Stub — [docs/tasks/assignments.md](docs/tasks/assignments.md) | Sarah |
| Google OAuth | Stub — [docs/tasks/auth.md](docs/tasks/auth.md) | Foundation |

Plan editor details: [docs/features/degree-plan.md](docs/features/degree-plan.md)

---

## Repo layout

```
apps/web/          Frontend (pages, components, client scripts)
apps/api/          REST API and business logic
services/          Python parser + scraper
supabase/          SQL migrations
docs/              Architecture and feature write-ups
scripts/           Dev helpers (setup, doctor, smoke)
```

---

## Run it locally

You need **Node 20+**, **Python 3.10+** (for checklist import), and env files from whoever maintains the database. You do **not** need a Supabase account or Docker for normal dev.

```bash
git clone https://github.com/SamiulH25/YorkLanes.git
cd YorkLanes
npm install
```

Copy env templates and fill in values the maintainer gives you:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Set up the checklist parser once:

```bash
cd services/checklist-parser
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
cd ../..
npm run setup
npm run dev
```

Open [localhost:4321/dashboard](http://localhost:4321/dashboard). API health: [localhost:3001/health](http://localhost:3001/health). Try a checklist import at [localhost:4321/plan/setup](http://localhost:4321/plan/setup).

With the dev servers running, `npm run doctor` checks that the API can reach the database.

---

## How data flows

The browser calls the Express API (`PUBLIC_API_URL` in `apps/web/.env.local`). The API runs SQL against Postgres (`SUPABASE_DB_URL` in `apps/api/.env`). Schema changes live in `supabase/migrations/` and get applied by the maintainer — not by every developer.

---

## Common commands

```bash
npm run dev          # API + web
npm run setup        # check env + Python parser
npm run doctor       # setup + API health (dev must be running)
npm run check        # typecheck before a PR
npm run tools        # list all helpers
```

Maintainer-only: `npm run supabase:push`

---

## Team

Taziz Ahsan · Nabeela Ansari · Sarah Asghar · Samiul Hossain · Thor Laski · Jericho Marc Mendoza

---

## York links

- [Program search](https://futurestudents.yorku.ca/program-search)
- [Degree checklists (LA&PS)](https://www.yorku.ca/laps/degree-checklist/2025-2026/)
- [Course catalogue](https://w2prod.sis.yorku.ca/Apps/WebObjects/cdm)
- [Visual Schedule Builder](https://registrar.yorku.ca/enrol/guide/vsb)
