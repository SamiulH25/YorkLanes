# Development guide

## Who does what

| Role | You need |
|------|----------|
| **Feature developer** | Node.js, Python (for checklist import), `.env` files from the maintainer, `npm run dev` |
| **Database maintainer** | Everything above **plus** Supabase dashboard + CLI — see [Maintainer guide](./maintainer.md) |

You do **not** need a Supabase account, `supabase login`, Docker, or `npm run supabase:push` to work on the app. The hosted database is already running; your local API connects to it via env vars.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ | Web, API, npm workspaces |
| Python | 3.10+ | Checklist parser (degree plan import) |

Ask the **database maintainer** for a pre-filled `apps/api/.env` and `apps/web/.env.local`. Do not sign up for Supabase or open the dashboard unless you are the maintainer.

## First-time setup

```bash
git clone https://github.com/SamiulH25/YorkLanes.git
cd YorkLanes
npm install
```

### Environment files

Copy the env files the maintainer sent you into:

- `apps/api/.env`
- `apps/web/.env.local`

If you are bootstrapping from templates:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Then **replace placeholders** with values from the maintainer (not from the Supabase dashboard yourself).

**`apps/web/.env.local`** should look like:

```env
PUBLIC_API_URL=http://localhost:4321
```

**`apps/api/.env`** should look like:

```env
SUPABASE_DB_URL=<from-maintainer>
API_PORT=3001
WEB_ORIGIN=http://localhost:4321
```

Never commit `.env` or `.env.local`. Run `npm run setup` from the repo root to verify.

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

### Run dev servers

```bash
npm run start:dev
```

| Service | URL |
|---------|-----|
| Web | http://localhost:4321 |
| Dashboard | http://localhost:4321/dashboard |
| Degree plan | http://localhost:4321/plan |
| API health | http://localhost:4321/health (proxied in dev) or http://localhost:3001/health |

For production-mode local runs (`npm run start:prod`), the web app is built and served without the dev proxy — set `PUBLIC_API_URL=http://localhost:3001` in `apps/web/.env.local`.

If the API prints `Database target: …` on startup and `/health` returns OK, you are connected. No migration step required on your machine.

## npm scripts (developers)

| Command | Description |
|---------|-------------|
| `npm run tools` | List dev helper commands |
| `npm run setup` | Verify env files and Python parser |
| `npm run doctor` | Setup + live API/DB health check |
| `npm run smoke` | Test key API endpoints |
| `npm run test:parser` | Checklist parser pytest suite |
| `npm run start:dev` | API + web with hot reload (use this day to day) |
| `npm run start:prod` | Build both apps, run API + web in production mode |
| `npm run dev` | Alias for `start:dev` |
| `npm run dev:web` | Astro only (4321) |
| `npm run dev:api` | Express only (3001) |
| `npm run check` | Typecheck API + Astro before PRs |
| `npm run build` | Compile API + Astro check |
| `npm run build:prod` | Production web build + API compile |
| `npm run scraper:fixture` | Offline course JSON (no DB write) |

Commands like `npm run supabase:push` are **maintainer-only**. See [Maintainer guide](./maintainer.md).

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

If your feature needs new tables or columns:

1. Add a migration file under `supabase/migrations/` in your PR
2. Update API queries in `apps/api/src/services/`
3. Ask the **maintainer** to run `npm run supabase:push` after merge (or coordinate before testing on shared hosted DB)

You do not run migrations yourself unless you are the maintainer.

### Styling

- Tailwind utility classes in components
- Shared component classes in `apps/web/src/styles/global.css` under `@layer components`
- York brand tokens in `tailwind.config.mjs` (`york-red`, `york-cream`, etc.)
- Dark mode: `class` strategy on `<html>`, toggle in `ThemeToggle.astro`

## Adding a new feature (checklist)

1. **Migration** — SQL file in `supabase/migrations/` (maintainer applies)
2. **API** — `apps/api/src/routes/<feature>.ts` + `src/services/<feature>.ts`
3. **Types** — `apps/web/src/types/<feature>.ts`
4. **Page** — `apps/web/src/pages/<feature>/index.astro`
5. **Nav** — uncomment link in `DashboardLayout.astro`
6. **Dashboard widget** — optional summary in `apps/api/src/routes/dashboard.ts`

## Debugging tips

| Problem | What to check |
|---------|----------------|
| API won't start / DB error | `SUPABASE_DB_URL` in `apps/api/.env` — ask maintainer for a fresh copy |
| Plan import fails | API terminal for `[plans/import]`; verify Python venv and `PYTHON_PATH` |
| “Failed to load degree plan” | `GET /api/plans/:id` in browser; if schema error, tell maintainer to push migrations |
| No prerequisite lines | `courses` table may be empty — maintainer runs scraper import |
| CORS errors | `WEB_ORIGIN` in API `.env` must match Astro origin (`http://localhost:4321`) |
| SSR fetch fails in dev | `getApiUrl()` uses `:3001` on the server — that is correct. Browser must use `PUBLIC_API_URL=http://localhost:4321` |

## Testing

| Area | How |
|------|-----|
| Checklist parser | `cd services/checklist-parser && python -m pytest` |
| Scraper (offline) | `npm run scraper:fixture` |
| API | Manual curl / browser network tab (no automated suite yet) |

## Related docs

- **[Developer guide](./DEVELOPER_GUIDE.md)** — full codebase map (start here for “where is X?”)
- [Architecture](./architecture.md)
- [Database](./database.md) — table reference (read-only for most devs)
- [Maintainer guide](./maintainer.md) — database owner only
- [Degree plan deep dive](./features/degree-plan.md)
