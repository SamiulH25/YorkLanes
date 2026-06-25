# Finance module — Taziz

**Goal for your first PR:** add one expense entry and list it on `/finance`.

## Files to edit

| File | Purpose |
|------|---------|
| `apps/web/src/pages/finance/index.astro` | Page UI |
| `apps/web/src/lib/finance.ts` | API client |
| `apps/api/src/routes/finance.ts` | `GET` + `POST /api/finance/entries` |
| `supabase/migrations/` | `finance_entries` table |
| `apps/web/src/components/dashboard/FinanceWidget.astro` | Dashboard card (later) |

## Steps

1. Open http://localhost:4321/finance.
2. Migration: `finance_entries (id, label, amount_cents, category, created_at)`.
3. `POST /api/finance/entries` with `{ label, amount }` — insert one row.
4. `GET /api/finance/entries` — return rows, show total on the page.
5. PR + maintainer migration push.

## After that

- Monthly budget vs spent
- OSAP / tuition categories
- Feed `dashboard.ts` `finance.balance` from real data

Keep amounts in cents (integer) to avoid float bugs.
