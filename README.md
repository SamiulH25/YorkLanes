# YorkLanes (YorkPath)

York University student dashboard designed to help students navigate their chaotic student lives.

Unified student dashboard for York University. This repo contains **dashboard scaffolding only**. Individual features (Course Explorer, Degree Plan, Schedule Builder, etc.) are stubbed with clear expansion points for each team member.

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Astro.js, TypeScript, Tailwind CSS |
| Backend | Node.js, Express.js, TypeScript |
| Database | PostgreSQL via hosted Supabase |
| Auth (planned) | Google OAuth 2.0 (Passport.js or Firebase Auth) |
| Scraper (future) | Python (BeautifulSoup / Scrapy) |
| Deploy (planned) | Vercel (web), Render (API + DB) |

## Repository layout

```
YorkLanes/
├── apps/
│   ├── web/          Astro frontend (dashboard UI)
│   └── api/          Express REST API
├── supabase/         Migrations, seed, local CLI config
├── services/
│   └── scraper/      Python scraper placeholder (not built yet)
├── docker-compose.yml
├── package.json      npm workspaces root
└── .env.example
```

## Quick start

### Prerequisites

- Node.js 20+
- A Supabase project (hosted, no Docker required)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy env templates and add your Supabase credentials from the [project dashboard](https://supabase.com/dashboard/project/edrbocogcqmqalexgajq):

```bash
cp .env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

**`apps/web/.env.local`** (Supabase JS client):

```
SUPABASE_URL=https://edrbocogcqmqalexgajq.supabase.co
SUPABASE_KEY=<your-publishable-or-anon-key>
```

**`apps/api/.env`** (Express direct SQL):

```
DATABASE_URL=<connection string from Supabase > Database > Connect>
```

You do **not** need to run `npm run supabase:start` or Docker for normal development. The app talks to your hosted database in the cloud.

### 3. Apply schema to hosted Supabase (one time)

If migrations are not on the remote yet:

```bash
npx supabase login
npx supabase link --project-ref edrbocogcqmqalexgajq
npm run supabase:push
```

The `supabase/` folder holds migration SQL files. You edit those and push to cloud. It is not a local database you run day to day.

### 4. Run development servers

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend (Astro) | http://localhost:4321 |
| Backend (Express) | http://localhost:3001 |
| Health check | http://localhost:3001/health |
| Dashboard API | http://localhost:3001/api/dashboard/summary |

Open http://localhost:4321 to see the dashboard.

## What is built today

- Dashboard layout with sidebar navigation
- Four placeholder widgets: progress ring, assignments, finance snapshot, quick links
- Login and onboarding page shells (not wired to OAuth yet)
- Express API with health check and dashboard summary endpoint
- PostgreSQL schema with users, programmes, and courses tables (feature tables commented as TODO)
- README files in each expansion zone explaining where to add code

## What is NOT built (by design)

These are left for feature owners. Each has a README or inline `EXPAND HERE` comments:

| Feature | Owner | Start here |
|---------|-------|------------|
| Google OAuth | Foundation | `apps/api/src/middleware/auth.ts` |
| Course Explorer | Jericho | `apps/web/src/pages/courses/`, `apps/api/src/routes/courses.ts` |
| Degree Plan Editor | Samiul | `apps/web/src/pages/plan/`, `apps/api/src/routes/plans.ts` |
| Schedule Builder | Nabeela | `apps/web/src/pages/schedule/`, `apps/api/src/routes/schedules.ts` |
| Progress Tracker | Thor | `apps/web/src/pages/progress/`, `apps/api/src/routes/progress.ts` |
| Finance Module | Taziz | `apps/web/src/pages/finance/`, `apps/api/src/routes/finance.ts` |
| Assignment Calendar | Sarah | `apps/web/src/pages/assignments/`, `apps/api/src/routes/assignments.ts` |
| Course scraper | Shared | `services/scraper/README.md` |

## How to add a new feature

1. **Frontend page**: create `apps/web/src/pages/<feature>/index.astro` using `DashboardLayout.astro`
2. **Nav link**: uncomment the matching entry in `apps/web/src/layouts/DashboardLayout.astro`
3. **API route**: create `apps/api/src/routes/<feature>.ts` and mount it in `apps/api/src/index.ts`
4. **Database**: add a migration in `supabase/migrations/`, then `npm run supabase:reset` or `npm run supabase:push`
5. **Dashboard widget**: update `apps/api/src/routes/dashboard.ts` to return real summary data
6. **Types**: keep `apps/web/src/types/` and `apps/api/src/types/` in sync

See also:

- `apps/api/src/routes/README.md`
- `apps/web/FEATURE_PAGES.md`
- `apps/web/src/components/dashboard/README.md`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run API and web together |
| `npm run dev:web` | Astro dev server only |
| `npm run dev:api` | Express dev server only |
| `npm run build` | Build both apps |
| `npm run supabase:start` | Start local Supabase stack |
| `npm run supabase:reset` | Migrate and seed local database |
| `npm run supabase:push` | Push migrations to hosted Supabase |

Full Supabase docs: `supabase/README.md`

## Team

EECS4314 Group 7: Taziz Ahsan, Nabeela Ansari, Sarah Asghar, Samiul Hossain, Thor Laski, Jericho Marc Mendoza
