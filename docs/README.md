# YorkLanes developer documentation

Technical notes for the capstone repo. **Start with [CONTRIBUTING.md](../CONTRIBUTING.md)** if you are setting up for the first time.

## Start here

| If you are… | Read this |
|-------------|-----------|
| **Any developer** (recommended) | **[Developer guide](./DEVELOPER_GUIDE.md)** — full map of the codebase in plain English |
| Setting up for the first time | [CONTRIBUTING.md](../CONTRIBUTING.md) + [Development guide](./development.md) |
| Owning Supabase / migrations | [Maintainer guide](./maintainer.md) |
| Building your assigned feature | [Feature tasks](./tasks/README.md) |

You do **not** need a Supabase login or dashboard access for normal feature work.

## Reading order

| Document | What you will learn |
|----------|---------------------|
| **[Developer guide](./DEVELOPER_GUIDE.md)** | Where every folder, page, route, and script lives |
| [Architecture](./architecture.md) | How the monorepo fits together and request flows |
| [Development guide](./development.md) | Short setup reference and conventions |
| [Maintainer guide](./maintainer.md) | Database owner: migrations, Supabase CLI, secrets |
| [Database](./database.md) | Postgres schema reference |
| [Deployment](./deployment.md) | Production hosting and release checklist |
| [Degree plan feature](./features/degree-plan.md) | Checklist import, parser, editor, prereq graph |
| [Feature tasks](./tasks/README.md) | First PR scope per teammate |

## Service-specific READMEs

These live next to the code:

| Path | Topic |
|------|-------|
| [`supabase/README.md`](../supabase/README.md) | Supabase CLI (**maintainer only**) |
| [`services/checklist-parser/README.md`](../services/checklist-parser/README.md) | Python checklist parser |
| [`services/scraper/README.md`](../services/scraper/README.md) | Course catalogue scraper |
| [`apps/api/src/routes/README.md`](../apps/api/src/routes/README.md) | Express route conventions |
| [`apps/web/FEATURE_PAGES.md`](../apps/web/FEATURE_PAGES.md) | Web page index by feature |
| [`scripts/README.md`](../scripts/README.md) | `setup`, `doctor`, `smoke` |

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
| Degree plan editor | **Built** | `apps/web/src/pages/plan/`, `apps/api/src/routes/plans.ts` |
| Dashboard shell | Built (placeholder widget data) | `apps/web/src/pages/dashboard/` |
| Google OAuth | **Built** (optional env; not enforced on routes) | `apps/web/src/pages/login.astro`, `apps/api/src/routes/auth.ts` |
| Onboarding | Scaffold | `apps/web/src/pages/onboarding/` |
| Course explorer | Stub | `docs/tasks/courses.md` |
| Schedule builder | Stub | `docs/tasks/schedule.md` |
| Progress tracker | Stub | `docs/tasks/progress.md` |
| Finance module | Stub | `docs/tasks/finance.md` |
| Assignment calendar | Stub | `docs/tasks/assignments.md` |

## Team

EECS4314 Group 7 — see root [`README.md`](../README.md) for names and external York U links.
