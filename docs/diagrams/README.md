# YorkLanes architecture diagrams

Consistent Mermaid sources and pre-rendered PNGs for presentations, reports, and docs.

## Files

| PNG | Source | Description |
|-----|--------|-------------|
| `01-system-overview.png` | `src/01-system-overview.mmd` | Logical architecture: web, API, Python, Supabase |
| `02-deployment-self-hosted.png` | `src/02-deployment-self-hosted.mmd` | Production: DNS → nginx → Docker → Supabase |
| `03-ssr-request-flow.png` | `src/03-ssr-request-flow.mmd` | Sequence: SSR page load with session + embed |
| `04-plan-import-sequence.png` | `src/04-plan-import-sequence.mmd` | Sequence: checklist PDF import |
| `05-database-er.png` | `src/05-database-er.mmd` | Core ER diagram |
| `06-auth-oauth.png` | `src/06-auth-oauth.mmd` | Google OAuth + session cookie |
| `07-monorepo-layers.png` | `src/07-monorepo-layers.mmd` | Layered monorepo structure |

Styling is shared via `mermaid.config.json` (York red accents, white background).

## Regenerate PNGs

```bash
npm run diagrams:render
```

Requires Node 22+ and network for first `npx @mermaid-js/mermaid-cli` download.

**First-time setup** (if render fails with missing Chrome):

```bash
npx puppeteer browsers install chrome-headless-shell
```

## Edit workflow

1. Change the `.mmd` file in `src/`
2. Run `npm run diagrams:render`
3. Commit both `src/*.mmd` and `png/*.png`

Do not hand-edit PNGs — always regenerate from source.
