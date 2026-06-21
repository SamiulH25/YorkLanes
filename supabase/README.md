# Supabase

> **Most developers:** you do not need this file. Copy `.env` from the maintainer and run `npm run dev`. See [`docs/development.md`](../docs/development.md).
>
> **Database maintainer:** CLI setup, migrations, and secrets — [`docs/maintainer.md`](../docs/maintainer.md).

Remote project: `edrbocogcqmqalexgajq`  
Dashboard: https://supabase.com/dashboard/project/edrbocogcqmqalexgajq (maintainer access only)

## Folder layout

```
supabase/
├── config.toml          CLI configuration (ports, auth, storage)
├── migrations/          Versioned SQL migrations (source of truth for schema)
├── seed.sql             Dev seed data (runs on db reset)
└── README.md            This file
```

## Maintainer: link and push

```bash
npx supabase login
npx supabase link --project-ref edrbocogcqmqalexgajq
npm run supabase:push
```

## Maintainer: add a table or column

1. Create `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
2. Optional local test: `npm run supabase:start` then `npm run supabase:reset`
3. `npm run supabase:push`
4. Notify developers to `git pull` (no CLI step on their side)

## Environment variables (shared with team)

The maintainer distributes these; developers do not fetch them from the dashboard.

### Frontend (`apps/web/.env.local`)

```
PUBLIC_API_URL=http://localhost:3001
```

### API (`apps/api/.env`)

```
SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@aws-1-ca-central-1.pooler.supabase.com:5432/postgres
API_PORT=3001
WEB_ORIGIN=http://localhost:4321
```

Never put the service role key in the frontend.

## How the app connects

| App part | Uses Supabase via |
|----------|-------------------|
| `apps/api/src/db/index.ts` | `pg` pool via `SUPABASE_DB_URL` |
| `services/scraper/` | Direct SQL import to `courses` |

## Migration history

| File | Purpose |
|------|---------|
| `20250619000001_todos_quickstart.sql` | Supabase quickstart `todos` table |
| `20250619000002_yorklanes_core_schema.sql` | Users, programmes, courses |
| `20250619000003_yorklanes_rls.sql` | Row Level Security policies |
| `20250619190000_degree_plans.sql` | Degree plan tables |
| `20250619200000_fix_degree_plans_rls.sql` | Dev-friendly plan RLS |
| `20250619210000_plan_course_stubs.sql` | Stub entries for elective sections |
| `20250619220000_plan_course_completed.sql` | Course completion flag |
| `20250619230000_add_plan_course_completed.sql` | Re-apply completion column if drift |

Full schema reference: [`docs/database.md`](../docs/database.md).

## Optional: local Supabase (maintainer / offline)

Requires Docker Desktop.

```bash
npm run supabase:start    # API :54321, Studio :54323, Postgres :54322
npm run supabase:reset    # Apply migrations + seed
npm run supabase:stop
```

## CLI command reference

```bash
npm run supabase:start
npm run supabase:stop
npm run supabase:status
npm run supabase:reset
npm run supabase:push
npm run supabase:diff
npm run supabase:studio
```
