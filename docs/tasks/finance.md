# Finance module — Taziz

**Goal:** log income/expense entries, track monthly budgets, and review spending on `/finance`.

## Files to edit

| File | Purpose |
|------|---------|
| `apps/web/src/pages/finance/index.astro` | Page UI |
| `apps/web/src/scripts/finance.ts` | Client form, charts, edit mode, kind-aware categories |
| `apps/web/src/lib/finance.ts` | API client |
| `apps/web/src/lib/finance-categories.ts` | Student expense/income category lists |
| `apps/api/src/routes/finance.ts` | entries, budget, categories, and monthly summary API routes |
| `apps/api/src/services/finance.ts` | SQL + Supabase REST helpers |
| `apps/api/src/services/financeCategories.ts` | Category lists + alias normalization |
| `supabase/migrations/` | `finance_entries`, `finance_monthly_budgets` tables |
| `apps/web/src/components/dashboard/FinanceWidget.astro` | Dashboard card (later) |

## Student categories

**Expenses:** Tuition, Textbooks, Rent, Food, Transit, Personal, Fees, Other  
**Income:** OSAP, Scholarship, Job, Family support, Other income

The category dropdown switches with Expense / Income. The API normalizes common aliases (`Books` → `Textbooks`, `OSAP loan` → `OSAP`, empty → kind default).

## Steps

1. Open http://localhost:4321/finance.
2. Migration: `finance_entries (id, user_id, label, amount_cents, category, kind, occurred_on, recurrence, created_at)`.
3. `GET /api/finance/categories` — expense and income category lists.
4. `POST /api/finance/entries` with `{ label, amount, category, kind, occurredOn, recurrence }` — insert one row. Recurrence is `none`, `weekly`, `monthly`, or `yearly`.
5. `PATCH /api/finance/entries/:entryId` — update label, amount, category, kind, date, or recurrence.
6. `DELETE /api/finance/entries/:entryId` — remove mistakes.
7. `POST /api/finance/entries/:entryId/next` — create the next dated occurrence for a recurring entry.
8. `GET /api/finance` — returns `recurrenceSupported` so the web app can safely gate recurring controls while a remote database migration is pending.
9. `GET /api/finance/entries` — return rows, balance, income/expense totals, and category totals.
10. `GET` + `PUT /api/finance/budget/:month` — save a monthly budget in `YYYY-MM` format.
11. `GET /api/finance/monthly-summary` — return income, expenses, and balance by month.
12. Use `/finance` to filter the selected month, review monthly trends, and export CSV.
13. PR + maintainer migration push.

The API uses `SUPABASE_DB_URL` when available. For this module only, it can also fall back to Supabase REST when `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are set and the finance migrations have been applied.

## Check-in 2 progress

- [x] Edit support for existing entries (`PATCH` + Edit button on the list)
- [x] Student-specific categories (OSAP, tuition, textbooks, rent, personal, …)
- [x] Recurring income or expenses (one-time, weekly, monthly, yearly; log-next action)

Before using recurring entries against the remote database, the maintainer must run `supabase push` to apply `20250710000000_finance_entry_recurrence.sql`. Until then, the web app keeps API-backed entries one-time while local drafts can use recurrence.

## Check-in 3 progress

- [x] Enforce signed-in access on finance entry/budget/summary routes with `requireAuth` (categories stay public)
- [x] Send credentials on all finance client API calls
- [x] Guest UX: sign-in prompt + local draft only (no shared guest `user_id is null` cloud pool)
- [x] Keep dashboard reachable for demos when Google OAuth is not configured (redirect only once OAuth is enabled)
- [ ] Tighter Supabase RLS with the maintainer once OAuth is configured for demos

Signed-in users read and write only their own `finance_entries` and `finance_monthly_budgets` rows via `req.session.userId`. Guests see a sign-in banner and keep drafts in localStorage so demos still work without Google OAuth.

## After that

- Maintainer RLS coordination
- Recurrence migration re-test after `supabase push`

Keep amounts in cents (integer) to avoid float bugs.
