# Finance module — Taziz

**Goal:** log income/expense entries, track monthly budgets, and review spending on `/finance`.

## Files to edit

| File | Purpose |
|------|---------|
| `apps/web/src/pages/finance/index.astro` | Page UI |
| `apps/web/src/scripts/finance.ts` | Client form, charts, edit mode |
| `apps/web/src/lib/finance.ts` | API client |
| `apps/api/src/routes/finance.ts` | entries, budget, and monthly summary API routes |
| `apps/api/src/services/finance.ts` | SQL + Supabase REST helpers |
| `supabase/migrations/` | `finance_entries`, `finance_monthly_budgets` tables |
| `apps/web/src/components/dashboard/FinanceWidget.astro` | Dashboard card (later) |

## Steps

1. Open http://localhost:4321/finance.
2. Migration: `finance_entries (id, user_id, label, amount_cents, category, kind, occurred_on, created_at)`.
3. `POST /api/finance/entries` with `{ label, amount, category, kind, occurredOn }` — insert one row.
4. `PATCH /api/finance/entries/:entryId` — update label, amount, category, kind, or date.
5. `DELETE /api/finance/entries/:entryId` — remove mistakes.
6. `GET /api/finance/entries` — return rows, balance, income/expense totals, and category totals.
7. `GET` + `PUT /api/finance/budget/:month` — save a monthly budget in `YYYY-MM` format.
8. `GET /api/finance/monthly-summary` — return income, expenses, and balance by month.
9. Use `/finance` to filter the selected month, review monthly trends, and export CSV.
10. PR + maintainer migration push.

The API uses `SUPABASE_DB_URL` when available. For this module only, it can also fall back to Supabase REST when `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are set and the finance migrations have been applied.

## Check-in 2 progress

- [x] Edit support for existing entries (`PATCH` + Edit button on the list)
- [ ] Recurring income or expenses
- [ ] Student-specific categories (OSAP, tuition, textbooks, rent, personal)
- [ ] Enforce auth and scope finance rows to the signed-in user

## After that

- Recurring entries
- OSAP / tuition categories
- Per-user auth scoping

Keep amounts in cents (integer) to avoid float bugs.
