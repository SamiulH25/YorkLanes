# Deployment

Guide for running YorkLanes outside local development. The stack is not fully production-hardened (open RLS on plans); treat this as a **staging / demo** checklist until policies are tightened.

## Components to deploy

| Component | Suggested host | Build output |
|-----------|----------------|--------------|
| `apps/web` | Render (recommended), Vercel, Netlify | Astro SSR (`@astrojs/node` standalone) |
| `apps/api` | Render (recommended), Railway, Fly.io | `npm run build -w apps/api` → `node dist/index.js` |
| Database | Supabase (already hosted) | Migrations via CI or manual `supabase db push` |
| Python parser | Bundled with API service | Python 3 + `pip install -r services/checklist-parser/requirements.txt` |

## Render (Path A — two free web services)

The repo includes [`render.yaml`](../render.yaml) (Render Blueprint) with **yorklanes-api** and **yorklanes-web**.

### Architecture

```
Browser → yorklanes-web.onrender.com (Astro SSR)
              ↓ middleware proxies /api and /health
          yorklanes-api.onrender.com (Express + Python parser)
              ↓
          Supabase Postgres
```

Cookies and OAuth stay on the **web origin**: set `PUBLIC_API_URL` to the web service URL. The Astro middleware proxies `/api/*` to `API_INTERNAL_URL` (the API service URL) in production when that variable is set.

### One-time setup

1. Push this repo to GitHub (or connect an existing remote).
2. In [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint** → connect the repo.
3. Render reads `render.yaml` and creates both services. Before the first deploy succeeds, set **secret** env vars in the dashboard (see table below).
4. **Deploy order:** let **yorklanes-api** finish first (health check `GET /health`), then **yorklanes-web**. On later pushes, Render redeploys both; `fromService` references keep URLs in sync.
5. In Google Cloud Console, add the production redirect URI:
   `https://<yorklanes-web-host>/api/auth/google/callback`
   and set `GOOGLE_CALLBACK_URL` on the API service to that exact value.

### Build and start commands (from `render.yaml`)

| Service | Build | Start |
|---------|-------|-------|
| **yorklanes-api** | `npm ci && npm run build -w apps/api && pip3 install --user -r services/checklist-parser/requirements.txt` | `node apps/api/dist/index.js` |
| **yorklanes-web** | `npm ci && npm run build:prod -w apps/web` | `HOST=0.0.0.0 PORT=$PORT node apps/web/dist/server/entry.mjs` |

API listens on `0.0.0.0` in production (`API_BIND` in blueprint, or default when `NODE_ENV=production`). Health check path: `/health`.

### Environment variables (Render)

| Variable | Service | Required | Notes |
|----------|---------|----------|-------|
| `NODE_VERSION` | both | Yes | `22` (matches `package.json` engines) |
| `NODE_ENV` | both | Yes | `production` |
| `SUPABASE_DB_URL` | api | Yes | Supabase session pooler URI |
| `SESSION_SECRET` | api | Yes | Random 32+ char string |
| `WEB_ORIGIN` | api | Yes | Web service URL (auto via blueprint `fromService`) |
| `API_BIND` | api | Yes | `0.0.0.0` (set in blueprint) |
| `PYTHON_PATH` | api | Recommended | `python3` on Render |
| `GOOGLE_CLIENT_ID` | api | For OAuth | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | api | For OAuth | Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | api | For OAuth | `https://<web-host>/api/auth/google/callback` |
| `PUBLIC_API_URL` | web | Yes | Web service URL — same origin for cookies (auto via blueprint) |
| `API_INTERNAL_URL` | web | Yes | API service URL — SSR + middleware proxy target (auto via blueprint) |

`PORT` is injected by Render on both services. The API reads `PORT` (falls back to `API_PORT` / 3001).

### Verify after deploy

- `https://<api-host>/health` → JSON with `"status": "ok"` when DB is reachable
- `https://<web-host>/health` → proxied API health
- Sign in with Google; session cookie should be on the web host
- Import a checklist on `/plan/setup` (confirms Python parser on API host)

## Web app (Astro)

SSR is configured with `@astrojs/node` (`mode: "standalone"`). Production entry: `apps/web/dist/server/entry.mjs`.

### Environment variables (production)

| Variable | Context | Example (Render) |
|----------|---------|------------------|
| `PUBLIC_API_URL` | Build + runtime | `https://yorklanes-web.onrender.com` (web origin — **not** the API host) |
| `API_INTERNAL_URL` | Runtime (server only) | `https://yorklanes-api.onrender.com` — enables middleware proxy + SSR fetches |

`PUBLIC_*` vars are embedded in client bundles — only expose what the browser needs.

## API (Express)

### Build and start

```bash
npm run start:prod
```

Or manually:

```bash
npm run build -w apps/api
npm run build:prod -w apps/web
cd apps/api && NODE_ENV=production node dist/index.js
cd apps/web && node dist/server/entry.mjs
```

### Environment variables (production)

| Variable | Required | Notes |
|----------|----------|-------|
| `SUPABASE_DB_URL` | Yes | Session pooler URI; use port 5432 or 6543 per Supabase docs |
| `WEB_ORIGIN` | Yes | Exact frontend origin for CORS, e.g. `https://yorklanes-web.onrender.com` |
| `API_PORT` / `PORT` | Often set by host | Render injects `PORT` — API reads it in `index.ts` |
| `API_BIND` | Production hosts | `0.0.0.0` on Render (default when `NODE_ENV=production`) |
| `PYTHON_PATH` | If non-default | Path to venv python with parser deps installed |
| `SESSION_SECRET` | Before auth | Random string when sessions are enabled |
| `GOOGLE_CLIENT_*` | Before OAuth | From Google Cloud Console |

**Never** set `SUPABASE_SERVICE_ROLE_KEY` in the frontend. Use only on API if you bypass RLS for admin tasks.

### Python on API host

The import endpoint spawns `parse_checklist.py`. Options:

1. **Single container** — Dockerfile installs Node + Python, copies `services/checklist-parser/`, runs `pip install -r requirements.txt`
2. **Sidecar** — future: HTTP microservice instead of `execFile` (not implemented today)

## Database (maintainer)

Migrations are applied by the **database maintainer**, not each developer:

1. `supabase link --project-ref edrbocogcqmqalexgajq`
2. `supabase db push` on each release that includes new migration files
3. Confirm with `supabase migration list`

See [`docs/maintainer.md`](./maintainer.md).

Back up before destructive changes (Supabase Dashboard → Database → Backups).

## Suggested release checklist

- [ ] Migrations pushed to production Supabase
- [ ] API env: `SUPABASE_DB_URL`, `WEB_ORIGIN`, Python deps available
- [ ] Web env: `PUBLIC_API_URL` = web origin; `API_INTERNAL_URL` = API URL (Render blueprint sets both)
- [ ] CORS: browser can call API from web origin
- [ ] Health check: `GET /health` returns 200
- [ ] Smoke test: import a checklist PDF on `/plan/setup`
- [ ] Course data: run scraper import if prerequisite lines are required
- [ ] Review RLS policies before public launch with user data

## CI (future)

Not configured in repo today. A minimal pipeline would:

1. `npm ci`
2. `npm run build`
3. `cd services/checklist-parser && pip install -r requirements.txt && pytest`
4. On `main` merge: `supabase db push` with protected credentials

## Monitoring

- API logs: `[plans/import]` errors on failed checklist imports
- Supabase Dashboard: query performance, connection pool usage
- No application-level APM wired yet

## Related

- [Development guide](./development.md)
- [Architecture](./architecture.md)
