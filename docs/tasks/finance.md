# Finance module — Taziz

**Goal:** log income/expense entries, track monthly budgets, and review spending on `/finance`.

## Files to edit

| File | Purpose |
|------|---------|
| `apps/web/src/pages/finance/index.astro` | Page UI |
| `apps/web/src/lib/finance.ts` | API client |
| `apps/api/src/routes/finance.ts` | entries, budget, and monthly summary API routes |
| `supabase/migrations/` | `finance_entries`, `finance_monthly_budgets` tables |
| `apps/web/src/components/dashboard/FinanceWidget.astro` | Dashboard card (later) |

## Steps

1. Open http://localhost:4321/finance.
2. Migration: `finance_entries (id, user_id, label, amount_cents, category, kind, occurred_on, created_at)`.
3. `POST /api/finance/entries` with `{ label, amount, category, kind, occurredOn }` — insert one row.
4. `DELETE /api/finance/entries/:entryId` — remove mistakes.
5. `GET /api/finance/entries` — return rows, balance, income/expense totals, and category totals.
6. `GET` + `PUT /api/finance/budget/:month` — save a monthly budget in `YYYY-MM` format.
7. `GET /api/finance/monthly-summary` — return income, expenses, and balance by month.
8. Use `/finance` to filter the selected month, review monthly trends, and export CSV.
9. PR + maintainer migration push.

The API uses `SUPABASE_DB_URL` when available. For this module only, it can also fall back to Supabase REST when `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are set and the finance migrations have been applied.

## After that

- OSAP / tuition categories

Keep amounts in cents (integer) to avoid float bugs.
