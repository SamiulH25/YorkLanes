# Maintainer guide (database owner)

**Audience:** the team member who owns the hosted Supabase project (migrations, dashboard access, shared env secrets).

Other developers **do not** need Supabase login, the CLI, or dashboard access. They only copy `.env` files you provide and run `npm run dev`. See [Development guide](./development.md).

## Responsibilities

- Keep the hosted database schema in sync with `supabase/migrations/`
- Share connection strings and keys with teammates over a **secure channel** (never commit to git)
- Apply migrations after merges that add SQL files
- Rotate credentials if they are leaked

## One-time CLI setup

```bash
npx supabase login
npx supabase link --project-ref edrbocogcqmqalexgajq
```

Project dashboard: https://supabase.com/dashboard/project/edrbocogcqmqalexgajq

## Push migrations

After pulling new files under `supabase/migrations/`:

```bash
npm run supabase:push
npx supabase migration list   # confirm local and remote match
```

If a migration is marked applied but a column is missing (schema drift), add a **new** migration with `ADD COLUMN IF NOT EXISTS` — do not edit history on the remote.

## What to share with developers

Send each teammate a filled copy of these (values redacted in docs):

**`apps/api/.env`**

```env
SUPABASE_DB_URL=postgresql://postgres.edrbocogcqmqalexgajq:[PASSWORD]@aws-1-ca-central-1.pooler.supabase.com:5432/postgres
API_PORT=3001
WEB_ORIGIN=http://localhost:4321
```

**`apps/web/.env.local`**

```env
PUBLIC_API_URL=http://localhost:3001
```

Developers paste these files locally and run `npm run dev`. No further database setup.

**Do not share:** database owner password in chat logs, service role key (unless a specific server task needs it), or Supabase personal access tokens.

## Adding schema changes

1. Add `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
2. `npm run supabase:push`
3. Notify the team on Slack/Discord that they should `git pull` (no CLI action needed on their side)
4. Update API queries in `apps/api/src/services/` in the same PR when possible

Optional local test with Docker:

```bash
npm run supabase:start
npm run supabase:reset
```

## Scraper / course data imports

Course catalogue population uses the same `SUPABASE_DB_URL` as the API. See [`services/scraper/README.md`](../services/scraper/README.md). The maintainer usually runs `scrape_courses.py db` or delegates with a shared env file.

## Production releases

See [Deployment](./deployment.md). Migration push is part of the release checklist before deploying API/web.

## Related

- [`supabase/README.md`](../supabase/README.md) — CLI command reference
- [Database](./database.md) — table reference
