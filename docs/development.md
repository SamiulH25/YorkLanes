# Development guide

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Web, API, npm workspaces |
| Python | 3.10+ | Checklist parser (degree plan import) |
| Supabase CLI | via `npm install` at root | Push migrations to hosted DB |
| Docker | Optional | Local Supabase only (`npm run supabase:start`) |

**Day-to-day dev uses hosted Supabase**, not Docker. Ask a maintainer for project credentials over a secure channel.

## First-time setup

```bash
git clone https://github.com/SamiulH25/YorkLanes.git
cd YorkLanes
npm install
```

### Environment files

```bash
cp .env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Create **`apps/web/.env.local`** (gitignored):

```env
PUBLIC_API_URL=http://localhost:3001
SUPABASE_URL=https://edrbocogcqmqalexgajq.supabase.co
SUPABASE_KEY=<anon-or-publishable-key>
```

Set **`apps/api/.env`**:

```env
SUPABASE_DB_URL=postgresql://postgres.edrbocogcqmqalexgajq:[PASSWORD]@aws-1-ca-central-1.pooler.supabase.com:5432/postgres
API_PORT=3001
WEB_ORIGIN=http://localhost:4321
```

Get `SUPABASE_DB_URL` from **Supabase Dashboard → Project Settings → Database → Connect → Session pooler → URI**.

### Python parser (required for checklist import)

```bash
cd services/checklist-parser
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
```

If `python` is not on PATH, set in `apps/api/.env`:

```env
PYTHON_PATH=C:\Path\To\.venv\Scripts\python.exe
```

### Database migrations

One time per machine (needs Supabase login):

```bash
npx supabase login
npx supabase link --project-ref edrbocogcqmqalexgajq
npm run supabase:push
```

Re-run `npm run supabase:push` after pulling migration files from `main`.

### Run dev servers

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| Web | http://localhost:4321 |
| Dashboard | http://localhost:4321/dashboard |
| Degree plan | http://localhost:4321/plan |
| API health | http://localhost:3001/health |
| API plans | http://localhost:3001/api/plans/faculties |

## npm scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | API + web concurrently |
| `npm run dev:web` | Astro only (4321) |
| `npm run dev:api` | Express only (3001) |
| `npm run build` | Build web + compile API TypeScript |
| `npm run supabase:push` | Apply migrations to linked remote DB |
| `npm run supabase:reset` | Reset **local** DB after `supabase:start` |
| `npm run scraper:fixture` | Offline course JSON for testing |

## Project conventions

### TypeScript

- API uses **NodeNext** modules; import paths end in `.js` even for `.ts` sources.
- Web Astro components use relative imports without `.js`.

### API routes

One router per feature in `apps/api/src/routes/`. Mount in `src/index.ts`. Keep handlers thin — call `src/services/`.

### Frontend pages

- Use `DashboardLayout.astro` with `activeNav` set appropriately.
- Server-side data fetching in the Astro frontmatter (`---` block).
- Client behavior in `src/scripts/*.ts`, initialized from a `<script>` tag on the page.

### Database changes

1. Add `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
2. `npm run supabase:reset` if using local Supabase, else test against hosted cautiously
3. `npm run supabase:push`
4. Update queries in `apps/api/src/services/`

Never edit an already-pushed migration file; add a new one instead.

### Styling

- Tailwind utility classes in components
- Shared component classes in `apps/web/src/styles/global.css` under `@layer components`
- York brand tokens in `tailwind.config.mjs` (`york-red`, `york-cream`, etc.)
- Dark mode: `class` strategy on `<html>`, toggle in `ThemeToggle.astro`

## Adding a new feature (checklist)

1. **Migration** — tables in `supabase/migrations/`
2. **API** — `apps/api/src/routes/<feature>.ts` + `src/services/<feature>.ts`
3. **Types** — `apps/web/src/types/<feature>.ts`
4. **Page** — `apps/web/src/pages/<feature>/index.astro`
5. **Nav** — uncomment link in `DashboardLayout.astro`
6. **Dashboard widget** — optional summary in `apps/api/src/routes/dashboard.ts`

## Debugging tips

| Problem | What to check |
|---------|----------------|
| Plan import fails | API terminal for `[plans/import]`; verify Python venv and `PYTHON_PATH` |
| “Failed to load degree plan” | `GET /api/plans/:id` in browser or curl; often missing DB column → run `supabase:push` |
| No prerequisite lines | `courses` / `course_prerequisites` empty — run scraper import |
| CORS errors | `WEB_ORIGIN` in API `.env` must match Astro origin |
| SSR fetch fails | `PUBLIC_API_URL` must be reachable from the machine running Astro |

## Testing

| Area | How |
|------|-----|
| Checklist parser | `cd services/checklist-parser && python -m pytest` |
| Scraper | `npm run scraper:test` |
| API | Manual curl / browser network tab (no automated suite yet) |

## Related docs

- [Architecture](./architecture.md)
- [Database](./database.md)
- [Degree plan deep dive](./features/degree-plan.md)
