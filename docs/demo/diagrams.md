# Architecture diagrams — presentation guide

Use these PNGs in slides and your PDF submission. All share the same York-red theme (`docs/diagrams/mermaid.config.json`).

## Recommended slide order (Architecture + Design Artifacts rubric)

| Slide | PNG | What to say |
|-------|-----|-------------|
| 1 | `01-system-overview.png` | Monorepo: Astro web, Express API, Python parsers, Supabase |
| 2 | `07-monorepo-layers.png` | Presentation → application → data access → persistence |
| 3 | `02-deployment-self-hosted.png` | Production at yorklanes.samiulh25.com: nginx + Docker + GitHub deploy |
| 4 | `05-database-er.png` | Core entities: users, plans, schedules, assignments, finance |
| 5 | `06-auth-oauth.png` | Google OAuth; session cookie on web origin |
| 6 | `03-ssr-request-flow.png` | SSR loads data server-side; embeds JSON for client hydration |
| 7 | `04-plan-import-sequence.png` | Checklist PDF → Python parser → Postgres → plan editor |

## File locations

```
docs/diagrams/png/*.png      ← embed in slides/PDF
docs/diagrams/src/*.mmd      ← edit sources here
```

Regenerate after edits:

```bash
npm run diagrams:render
```

## Rubric mapping

| Criterion | Diagrams |
|-----------|----------|
| **Architecture (4 pts)** | 01, 02, 07 |
| **Design artifacts — arch/seq/class (4 pts)** | 03, 04 (sequence), 05 (ER/class), 06 |
