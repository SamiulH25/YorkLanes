# YorkLanes developer documentation

Technical documentation for contributors working on **YorkLanes** (YorkPath): an EECS4314 capstone student dashboard for York University.

## Reading order

| Document | What you will learn |
|----------|---------------------|
| [Architecture](./architecture.md) | How the monorepo fits together, request flows, and where each feature lives |
| [Development guide](./development.md) | Local setup, environment variables, scripts, and day-to-day workflow |
| [Database](./database.md) | Postgres schema, migrations, and how the API vs web app connect |
| [Deployment](./deployment.md) | Production hosting, env configuration, and release checklist |
| [Degree plan feature](./features/degree-plan.md) | Checklist import, parser, plan editor, prerequisite graph (most complete feature today) |

## Service-specific READMEs

These live next to the code they describe:

| Path | Topic |
|------|-------|
| [`supabase/README.md`](../supabase/README.md) | Supabase CLI, migrations, local stack |
| [`services/checklist-parser/README.md`](../services/checklist-parser/README.md) | Python PDF/DOCX checklist parser |
| [`services/scraper/README.md`](../services/scraper/README.md) | Course catalogue scraper for `courses` table |
| [`apps/api/src/routes/README.md`](../apps/api/src/routes/README.md) | Express route conventions |
| [`apps/web/FEATURE_PAGES.md`](../apps/web/FEATURE_PAGES.md) | How to add a new Astro feature page |

## Repository map

```
YorkLanes/
├── apps/
│   ├── web/                    Astro frontend (SSR + client scripts)
│   └── api/                    Express REST API (direct Postgres)
├── docs/                       You are here
├── services/
│   ├── checklist-parser/       Python: degree checklist → JSON
│   └── scraper/                Python: York course catalogue → JSON/DB
├── supabase/
│   └── migrations/             Schema source of truth
└── package.json                npm workspaces root
```

## Feature status (high level)

| Feature | Status | Primary paths |
|---------|--------|---------------|
| Dashboard shell | Built | `apps/web/src/pages/dashboard/` |
| Degree plan editor | Built | `apps/web/src/pages/plan/`, `apps/api/src/routes/plans.ts` |
| Course explorer | Planned | `services/scraper/`, `courses` table |
| Schedule builder | Planned | — |
| Progress tracker | Planned | — |
| Finance module | Planned | — |
| Assignment calendar | Planned | — |
| Google OAuth | Planned | `apps/api/src/middleware/auth.ts` |

## Team

EECS4314 Group 7 — see root [`README.md`](../README.md) for names and external York U links.
