# Finance module — Taziz

**Goal for your first PR:** add income/expense entries and list them on `/finance`.

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
2. Migration: `finance_entries (id, user_id, label, amount_cents, category, kind, occurred_on, created_at)`.
3. `POST /api/finance/entries` with `{ label, amount, category, kind, occurredOn }` — insert one row.
4. `GET /api/finance/entries` — return rows, balance, income/expense totals, and category totals.
5. PR + maintainer migration push.

The API uses `SUPABASE_DB_URL` when available. For this module only, it can also fall back to Supabase REST when `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are set and the `finance_entries` migration has been applied.

## After that

- OSAP / tuition categories
- Monthly budget vs spent

Keep amounts in cents (integer) to avoid float bugs.
