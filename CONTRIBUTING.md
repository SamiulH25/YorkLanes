# Contributing to YorkLanes

Thanks for joining EECS4314 Group 7. This guide gets you coding quickly without database admin work.

## Before you code

1. Clone the repo and run `npm install`
2. Ask the **database maintainer** for `apps/api/.env` and `apps/web/.env.local` (pre-filled)
3. Set up the Python checklist parser (degree plan import):

   ```bash
   cd services/checklist-parser
   python -m venv .venv
   .venv\Scripts\activate    # Windows
   pip install -r requirements.txt
   ```

4. Verify setup: `npm run setup`
5. Start dev: `npm run dev`

Full details: [`docs/development.md`](docs/development.md)

## Roles

| You are… | Do this | Do **not** do this |
|----------|---------|---------------------|
| Feature developer | UI + API routes + migration **files** in PRs | `supabase login`, `supabase push`, open Supabase dashboard |
| Database maintainer | Push migrations, share env secrets | — see [`docs/maintainer.md`](docs/maintainer.md) |

## Branch workflow

1. Branch from `main`: `git checkout -b feature/your-name-short-description`
2. Make focused changes; match existing code style
3. Run `npm run check` before opening a PR
4. If your feature needs new tables, add `supabase/migrations/YYYYMMDDHHMMSS_name.sql` and tell the maintainer to push after merge
5. Open a PR with a short summary and how you tested it

## Where to add code

| What | Where |
|------|-------|
| New page | `apps/web/src/pages/<feature>/index.astro` |
| Sidebar link | `apps/web/src/layouts/DashboardLayout.astro` |
| API route | `apps/api/src/routes/<feature>.ts` → mount in `src/index.ts` |
| Business logic | `apps/api/src/services/` |
| Shared web types | `apps/web/src/types/` |
| DB schema | `supabase/migrations/` |

See [`apps/web/FEATURE_PAGES.md`](apps/web/FEATURE_PAGES.md) for feature ownership.

## Environment files (never commit)

| File | Purpose |
|------|---------|
| `apps/api/.env` | API + Postgres (`SUPABASE_DB_URL` from maintainer) |
| `apps/web/.env.local` | Web (`PUBLIC_API_URL`, Supabase keys from maintainer) |

Templates: `apps/api/.env.example`, `apps/web/.env.example`

## Commands

| Command | When |
|---------|------|
| `npm run dev` | Daily development |
| `npm run setup` | After receiving env files |
| `npm run check` | Before PR — TypeScript + Astro check |
| `npm run build` | Release / CI |
| `cd services/checklist-parser && python -m pytest` | After parser changes |

## Getting help

- Architecture: [`docs/architecture.md`](docs/architecture.md)
- Degree plan (reference feature): [`docs/features/degree-plan.md`](docs/features/degree-plan.md)
- Stuck on DB errors: ask the maintainer — do not run migrations yourself
