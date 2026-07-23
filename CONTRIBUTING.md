# Contributing

This is the onboarding guide for Group 7. The [README](README.md) has the project overview; this file is what you follow to get unblocked and ship code.

---

## Your first hour

1. Clone the repo and run `npm install`.
2. Get `apps/api/.env` and `apps/web/.env.local` from the **database maintainer** (Samiul). Do not sign up for Supabase yourself.
3. Install the checklist parser (needed if you touch degree plan import):

   ```bash
   cd services/checklist-parser
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   cd ../..
   ```

4. Run `npm run setup` — it checks your env files and Python install.
5. Run `npm run start:dev` and open http://localhost:4321/dashboard.
6. In another terminal, run `npm run doctor` to confirm the API talks to the database.
7. Pick your feature from [docs/tasks/README.md](docs/tasks/README.md) and open the linked page in the browser.

If setup fails, read the error message first, then ask the maintainer. Do not run `supabase push` unless you are the maintainer.

---

## Maintainer vs everyone else

**Most of us** write features: Astro pages, API routes, migration SQL files in PRs. We test locally with the shared hosted database.

**The maintainer** holds the Supabase project, shares env secrets, and runs `npm run supabase:push` after migrations merge. See [docs/maintainer.md](docs/maintainer.md) if that is you.

---

## Branch and PR workflow

```bash
git checkout -b feature/your-name-short-description
# ... make changes ...
npm run check
git push -u origin HEAD
```

Open a PR with:

- What changed and why
- How you tested it (e.g. “imported Lassonde BEng PDF, dragged a course to winter term”)

If you added a migration file under `supabase/migrations/`, say so in the PR and ping the maintainer to push it after merge.

---

## Adding a feature

Your task guide is in `docs/tasks/` — start there. General checklist:

1. Page at `apps/web/src/pages/<feature>/index.astro` — use `DashboardLayout.astro`
2. Route at `apps/api/src/routes/<feature>.ts` — mount it in `apps/api/src/index.ts`
3. Logic in `apps/api/src/services/` if it is more than a simple query
4. Types in `apps/web/src/types/` (keep API types in sync under `apps/api/src/types/`)
5. Nav link in `apps/web/src/layouts/DashboardLayout.astro`
6. Migration SQL if you need new tables — maintainer applies it

Use the degree plan as a reference: [docs/features/degree-plan.md](docs/features/degree-plan.md)

---

## Env files

| File | What goes in it |
|------|-----------------|
| `apps/api/.env` | `SUPABASE_DB_URL`, `WEB_ORIGIN`, `API_PORT`, OAuth vars (see `docs/tasks/auth.md`) |
| `apps/web/.env.local` | `PUBLIC_API_URL` — use `http://localhost:4321` in dev (proxies `/api` to the API) |

Templates: `apps/api/.env.example`, `apps/web/.env.example`

Never commit real env files.

---

## Commands you will actually use

**Every day**

- `npm run start:dev` — start API (3001) and web (4321) with hot reload
- `npm run start:prod` — build both apps and run in production mode locally
- `npm run dev` — alias for `start:dev`

**After pulling or changing env**

- `npm run setup` — quick sanity check
- `npm run doctor` — setup + live API/DB check (dev server must be running)

**Before a PR**

- `npm run check` — TypeScript + Astro diagnostics

**When debugging the API**

- `npm run smoke` — hits `/health`, `/api/auth/status`, `/api/plans/faculties`, `/api/dashboard/summary`

**Parser work**

- `npm run test:parser` — pytest in `services/checklist-parser/`

**List everything**

- `npm run tools`

More detail: [scripts/README.md](scripts/README.md)

---

## When something breaks

| Symptom | Likely fix |
|---------|------------|
| API won't start | Check `SUPABASE_DB_URL` in `apps/api/.env` — ask maintainer for a fresh copy |
| Plan import fails | API terminal shows `[plans/import]` — usually Python venv or `PYTHON_PATH` |
| “Failed to load degree plan” | Schema drift on remote DB — maintainer runs `npm run supabase:push` |
| No prerequisite arrows | `courses` table empty — maintainer runs scraper import |
| CORS error | `WEB_ORIGIN` in API `.env` must be `http://localhost:4321` |

---

## Docs worth bookmarking

- **[docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)** — full map of folders, pages, routes, and scripts
- [docs/architecture.md](docs/architecture.md) — how the pieces connect
- [docs/development.md](docs/development.md) — short setup reference
- [apps/api/src/routes/README.md](apps/api/src/routes/README.md) — API route layout

---

## Team

Taziz Ahsan · Nabeela Ansari · Sarah Asghar · Samiul Hossain · Thor Laski · Jericho Marc Mendoza
