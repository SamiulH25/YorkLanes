# Finance (`/finance`)

## Purpose

Student finance tracker: income/expenses, monthly budget, recurring items, category breakdown, CSV export.

## Implementation

- **Page:** `apps/web/src/pages/finance/index.astro`
- **Script:** `apps/web/src/scripts/finance.ts` (~1200 lines)
- **Shared logic:** `apps/web/src/lib/finance-logic.ts` (also unit-tested)

### Server-side

- `fetchSessionUser(cookie)`
- If signed in: parallel `fetchFinance(cookie)` + `fetchFinanceBudget(month, cookie)`
- Embedded in `<script id="finance-ssr">` via `serializeForScript` as `{ data, error }`
- Root element: `data-signed-in`, category lists for forms

### Client modes

| Mode | Storage | Badge |
|------|---------|-------|
| Guest | `localStorage` (`yorklanes.finance.entries`, `yorklanes.finance.budgets`) | “Local” |
| Signed in | Postgres via API | “Database” |

- Hydrates from SSR first, then background API refresh
- If SSR succeeded, background failure **does not** flip to “Sync delayed”
- `fetchWithRetry` on API calls

### Features

- Month picker, balance cards (income / expenses / net)
- Monthly budget form
- Entry CRUD with income/expense toggle
- **Recurrence:** weekly, monthly, yearly → `POST /api/finance/entries/:id/next`
- Search/filter, category breakdown charts
- CSV export
- York-specific categories (OSAP, tuition, rent, etc.) from `finance-categories.ts`

### API endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/finance/categories` | Public | Category list |
| `GET /api/finance` | Required | Summary + recurrence flag |
| `GET /api/finance/entries` | Required | All entries |
| `GET /api/finance/monthly-summary` | Required | Month rollup |
| `GET/PUT /api/finance/budget/:month` | Required | Monthly budget |
| `POST/PATCH/DELETE /api/finance/entries/:id` | Required | CRUD |

### Database

- `finance_entries`, `finance_monthly_budgets`
- Recurrence column on entries

## Demo script

1. Show guest mode — add expense, explain local-only storage.
2. Sign in — data loads from cloud; show “Database” badge.
3. Set monthly budget — compare to spending cards.
4. Add recurring rent/OSAP — show “Due this month” logic.
5. Export CSV.

## Q&A

**Q: What happens to guest data after sign-in?**  
A: Guest `localStorage` data stays separate; cloud loads from API. “Clear local” button available.

**Q: Why “Sync delayed”?**  
A: Background API refresh failed **and** no SSR data was available — fixed to keep SSR data visible.

**Q: Are categories customizable?**  
A: Fixed York-student-oriented set from API/config; not user-editable today.

**Q: Does finance feed the dashboard?**  
A: Yes — month balance in dashboard summary widget.
