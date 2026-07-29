# YorkLanes

Student dashboard for York University — EECS4314, Group 7.

**Live:** [yorklanes.samiulh25.com](https://yorklanes.samiulh25.com)  
**Repo:** [github.com/SamiulH25/YorkLanes](https://github.com/SamiulH25/YorkLanes)

York students juggle degree checklists, the course catalogue, VSB, spreadsheets, and random calendars. YorkLanes pulls the useful parts into one place: import your checklist, build a term-by-term plan, browse courses and sections, build a weekly schedule, track assignments and finances, and see progress toward your degree.

**New to the repo?** Read [CONTRIBUTING.md](CONTRIBUTING.md) first.

**Going deeper?** [docs/README.md](docs/README.md)

---

## Stack

| Layer | Tech |
|-------|------|
| **Web** | Astro SSR, TypeScript, Tailwind (`apps/web`) |
| **API** | Express, TypeScript, `pg` (`apps/api`) |
| **Database** | Hosted Supabase Postgres (`supabase/migrations/`) |
| **Parser** | Python checklist import (`services/checklist-parser/`) |
| **Scraper** | Python course + CDM sections (`services/scraper/`) |
| **Production** | Docker Compose + nginx on self-hosted Ubuntu |

Google OAuth, cloud sync, and SSR-first data loading are implemented. See [architecture diagrams](docs/diagrams/png/01-system-overview.png) and [deployment](docker/deploy.md).

---

## Features

| Area | Status |
|------|--------|
| Degree plan editor + checklist import | Working |
| Course catalogue + course detail | Working |
| Schedule builder (CDM sections, conflict shuffle) | Working |
| Assignments tracker | Working |
| Finance tracker | Working |
| Progress tracker | Working |
| Dashboard hub (widgets, messages, notifications) | Working |
| Google OAuth + onboarding | Working |
| Self-hosted deploy + GitHub webhook | Working |

Feature details: [docs/features/](docs/features/) · Per-page demo notes: [docs/demo/](docs/demo/)

---

## Repo layout

```
apps/web/          Frontend (pages, components, client scripts)
apps/api/          REST API and business logic
services/          Python parser + scraper
supabase/          SQL migrations
docs/              Architecture, demo/Q&A, diagrams, testing
docker/            nginx, Caddy, deploy webhook
scripts/           Dev helpers + diagram renderer
```

---

## Run it locally

You need **Node 22+**, **Python 3.10+** (for checklist import), and env files from the database maintainer. You do **not** need a Supabase account or Docker for normal dev.

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
source .venv/bin/activate    # macOS / Linux
# .venv\Scripts\activate     # Windows
pip install -r requirements.txt
cd ../..
npm run setup
npm run start:dev
```

Open [localhost:4321/dashboard](http://localhost:4321/dashboard). API health: [localhost:3001/health](http://localhost:3001/health). Try a checklist import at [localhost:4321/plan/setup](http://localhost:4321/plan/setup).

With the dev servers running, `npm run doctor` checks that the API can reach the database.

**Production (Docker):** see [docker/deploy.md](docker/deploy.md) and `.env.docker.example`.

---

## How data flows

The browser talks to the Astro web app on one origin. `/api/*` is proxied to Express (`API_INTERNAL_URL`). SSR pages forward the session cookie for server-side fetches; critical JSON is embedded in HTML via `serializeForScript`. The API runs SQL against hosted Postgres (`SUPABASE_DB_URL`). Schema changes live in `supabase/migrations/` and are applied by the maintainer.

![System overview](docs/diagrams/png/01-system-overview.png)

More diagrams: [docs/diagrams/](docs/diagrams/README.md)

---

## Common commands

```bash
npm run start:dev       # API + web (hot reload)
npm run start:prod      # build + production mode locally
npm run setup           # check env + Python parser
npm run doctor          # setup + API health (servers must be running)
npm run test            # 167+ unit tests
npm run test:parser     # checklist parser pytest
npm run diagrams:render # regenerate architecture PNGs from Mermaid
npm run check           # typecheck before a PR
npm run tools           # list all helpers
```

Maintainer-only: `npm run supabase:push`

---

## Documentation (demo & presentation)

| Doc | Purpose |
|-----|---------|
| [docs/demo/](docs/demo/README.md) | Per-page implementation notes + Q&A |
| [docs/demo/test-cases.md](docs/demo/test-cases.md) | Automated + manual test inventory |
| [docs/demo/diagrams.md](docs/demo/diagrams.md) | Slide order for architecture diagrams |
| [docs/diagrams/png/](docs/diagrams/png/) | Pre-rendered architecture PNGs |
| [docs/manual-testing.md](docs/manual-testing.md) | Full browser QA checklist |
| [docs/architecture.md](docs/architecture.md) | System design and request flows |

---

## Team

Taziz Ahsan · Nabeela Ansari · Sarah Asghar · Samiul Hossain · Thor Laski · Jericho Marc Mendoza

---

## York links

- [Program search](https://futurestudents.yorku.ca/program-search)
- [Degree checklists (LA&PS)](https://www.yorku.ca/laps/degree-checklist/2025-2026/)
- [Course catalogue](https://w2prod.sis.yorku.ca/Apps/WebObjects/cdm)
- [Visual Schedule Builder](https://registrar.yorku.ca/enrol/guide/vsb)
