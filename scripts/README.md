# Developer scripts

Runnable from the repo root via `npm run …`.

| Command | Script | What it does |
|---------|--------|--------------|
| `npm run tools` | `tools.mjs help` | List all dev commands |
| `npm run setup` | `tools.mjs setup` | Verify `apps/api/.env`, `apps/web/.env.local`, Python parser |
| `npm run doctor` | `tools.mjs doctor` | Setup + `/health` check (**run `npm run start:dev` first**) |
| `npm run smoke` | `tools.mjs smoke` | Hit health, faculties, dashboard API routes |
| `npm run test:parser` | `tools.mjs parser` | `pytest` in `services/checklist-parser/` |

## Typical workflow

```bash
npm install
# copy env files from maintainer
npm run setup
npm run start:dev    # separate terminal
npm run doctor       # confirm API + DB
npm run smoke        # optional endpoint check
npm run check        # before opening a PR
```

## Adding a new tool

Add a function in `scripts/tools.mjs`, register it in `commands`, and expose an `npm run` script in root `package.json`.
