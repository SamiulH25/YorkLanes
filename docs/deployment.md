# Deployment

Guide for running YorkLanes outside local development. The stack is not fully production-hardened (no OAuth, open RLS on plans); treat this as a **staging / demo** checklist until auth and policies are tightened.

## Components to deploy

| Component | Suggested host | Build output |
|-----------|----------------|--------------|
| `apps/web` | Vercel, Netlify, or Cloudflare Pages | Astro static + SSR adapter |
| `apps/api` | Render, Railway, Fly.io, or similar | `npm run build -w apps/api` → `node dist/index.js` |
| Database | Supabase (already hosted) | Migrations via CI or manual `supabase db push` |
| Python parser | Bundled with API container | Must have Python + `requirements.txt` on API host |

## Web app (Astro)

### SSR requirement

`/plan` and `/plan/setup` use `export const prerender = false`. You **must** install an Astro SSR adapter before `astro build` for production.

Example for Node:

```bash
npm install @astrojs/node -w apps/web
```

```js
// astro.config.mjs
import node from "@astrojs/node";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  // ...
});
```

Vercel: use `@astrojs/vercel`. Match adapter docs to your host.

### Environment variables (production)

| Variable | Context | Example |
|----------|---------|---------|
| `PUBLIC_API_URL` | Build + runtime | `https://api.yorklanes.example.com` |

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
| `WEB_ORIGIN` | Yes | Exact frontend origin for CORS, e.g. `https://yorklanes.vercel.app` |
| `API_PORT` | Often set by host | Render/Railway inject `PORT` — map in `index.ts` if needed |
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
- [ ] Web env: `PUBLIC_API_URL` points to deployed API
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
