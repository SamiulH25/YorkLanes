# Supabase

Local development and migration tooling for the YorkLanes database.

Remote project: `edrbocogcqmqalexgajq`  
Dashboard: https://supabase.com/dashboard/project/edrbocogcqmqalexgajq

## Folder layout

```
supabase/
├── config.toml          CLI configuration (ports, auth, storage)
├── migrations/          Versioned SQL migrations (source of truth for schema)
├── seed.sql             Dev seed data (runs on db reset)
└── README.md            This file
```

Generated locally (gitignored):

```
supabase/.temp/          Link state, CLI cache
```

## Prerequisites

- Docker Desktop (runs local Supabase stack)
- Node.js 20+

## Quick start (local)

From the repo root:

```bash
npm run supabase:start
```

This starts local Supabase on:

| Service | URL |
|---------|-----|
| API | http://localhost:54321 |
| Studio (DB UI) | http://localhost:54323 |
| PostgreSQL | postgresql://postgres:postgres@localhost:54322/postgres |

Apply migrations and seed:

```bash
npm run supabase:reset
```

Stop local stack:

```bash
npm run supabase:stop
```

## Link to hosted project (one time per machine)

You need a [Supabase access token](https://supabase.com/dashboard/account/tokens).

```bash
npx supabase login
npx supabase link --project-ref edrbocogcqmqalexgajq
```

The CLI will prompt for your database password (from Project Settings > Database).

## Push migrations to hosted project

After linking:

```bash
npm run supabase:push
```

This applies everything in `supabase/migrations/` to the remote database.

## Add a new table or column

1. Create a new file in `supabase/migrations/` with a timestamp prefix:

   ```
   supabase/migrations/20250620120000_add_assignments.sql
   ```

2. Write your SQL migration.

3. Test locally:

   ```bash
   npm run supabase:reset
   ```

4. Push to remote:

   ```bash
   npm run supabase:push
   ```

5. Mirror the change in `apps/api/src/db/schema.sql` as a reference comment, or remove that file once the API reads only from Supabase migrations.

## Environment variables

### Frontend (`apps/web/.env.local`)

Already configured for the JS client:

```
SUPABASE_URL=https://edrbocogcqmqalexgajq.supabase.co
SUPABASE_KEY=<publishable-or-anon-key>
```

For local Supabase during development, override with:

```
SUPABASE_URL=http://localhost:54321
SUPABASE_KEY=<local-anon-key-from-supabase-start-output>
```

### API (`apps/api/.env`)

Use the direct Postgres connection string for Express + `pg`:

```
# Hosted (Project Settings > Database > Connection string > URI)
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# Local Supabase
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
```

For server-side writes that bypass RLS, use the service role key only in the API, never in the frontend.

## How this connects to the app

| App part | Uses Supabase via |
|----------|-------------------|
| `apps/web/src/db/supabase.js` | `@supabase/supabase-js` (REST + RLS) |
| `apps/web/src/pages/todos.astro` | Reads `todos` table (connection test) |
| `apps/api/src/db/index.ts` | `pg` pool via `DATABASE_URL` (direct SQL) |
| `services/scraper/` (future) | Writes to `courses` using service role or direct SQL |

## Migration history

| File | Purpose |
|------|---------|
| `20250619000001_todos_quickstart.sql` | Supabase quickstart `todos` table |
| `20250619000002_yorklanes_core_schema.sql` | Users, programmes, courses |
| `20250619000003_yorklanes_rls.sql` | Row Level Security policies |

## Useful commands

```bash
npm run supabase:start     # Start local Docker stack
npm run supabase:stop      # Stop local stack
npm run supabase:status    # Show URLs and keys
npm run supabase:reset     # Drop, migrate, seed
npm run supabase:push      # Push migrations to linked remote project
npm run supabase:diff      # Generate migration from schema changes
npm run supabase:studio    # Open local Studio in browser
```
