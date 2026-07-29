# Finance test cases (RTM-linked)

**Owner:** Taziz Ahsan  
**RTM:** `docs/rtm/finance-rtm.md`  
**Run unit suite:** `npx tsx --test tests/api/finance*.test.ts tests/web/finance-logic.test.ts`  
**Or:** `npm run test:api` and `npm run test:web` (includes finance with the rest)

## Unit tests and data

| UT ID | RTM | File | Data used | Expected |
|-------|-----|------|-----------|----------|
| UT-FIN-01 | FR-FIN-01, NFR-FIN-01 | `tests/api/financeMoney.test.ts` | `12.34`, `"89.99"`, `0.1+0.2` | cents `1234`, `8999`, `30` |
| UT-FIN-02 | FR-FIN-01 | same | `null`, `""`, `"abc"`, `NaN` | `null` |
| UT-FIN-03 | FR-FIN-01, FR-FIN-04 | same | kinds/dates/months | income only for `"income"`; date/month format gates |
| UT-FIN-04 | FR-FIN-02 | same | OSAP 180000 + rent 95000 + transit 12815 | balance `72185` |
| UT-FIN-05 | FR-FIN-04 | same | spent `107815`, budget `115000` | not overspent, remaining `7185` |
| UT-FIN-06 | FR-FIN-04 | same | spent `116814`, budget `115000` | overspent, remaining `-1814` |
| UT-FIN-07 | FR-FIN-03 | `tests/api/financeCategories.test.ts` | category lists | includes Tuition, OSAP, … |
| UT-FIN-08 | FR-FIN-03 | same | aliases `books`, `TTC`, `OSAP loan` | Textbooks, Transit, OSAP |
| UT-FIN-09 | FR-FIN-03 | same | empty / Other cross-kind | kind defaults; Other↔Other income |
| UT-FIN-10 | FR-FIN-01, NFR-FIN-01 | `tests/web/finance-logic.test.ts` | form amounts | cents parse; rejects ≤0 |
| UT-FIN-11 | FR-FIN-05 | same | July seed + June row | month filter keeps 3 July rows |
| UT-FIN-12 | FR-FIN-02, FR-FIN-05 | same | seed entries | monthly totals newest-first |
| UT-FIN-13 | FR-FIN-04 | same | budget 115000 ± textbook 8999 | overspend after tip |
| UT-FIN-14 | FR-FIN-06 | `tests/api/financeRecurrence.test.ts` | recurrence strings | normalize + labels |
| UT-FIN-15 | FR-FIN-06 | same | `2026-07-01` weekly | `2026-07-08` |
| UT-FIN-16 | FR-FIN-06 | same | `2026-01-31` monthly | `2026-02-28` (clamp) |
| UT-FIN-17 | FR-FIN-06 | same | `2024-02-29` yearly | `2025-02-28` |
| UT-FIN-18 | FR-FIN-06 | `tests/web/finance-logic.test.ts` | monthly rent/OSAP/TTC | due in Aug; hidden when logged |
| UT-FIN-19 | NFR-FIN-03 | `tests/api/financeMoney.test.ts` | missing relation error | status 503 + migration hint |
| UT-FIN-20 | NFR-FIN-03 | same | missing `SUPABASE_DB_URL` | status 503 + env hint |
| UT-FIN-21 | NFR-FIN-03 | same | generic error | status 500, no hint |

Seed amounts match the finance demo: OSAP `$1800`, rent `$950`, TTC `$128.15`, budget `$1150`, textbook tip `$89.99`.

## Manual tests (RTM refs)

| Manual ID | RTM | Steps | Expected |
|-----------|-----|-------|----------|
| MT-K-01 | FR-FIN-09, NFR-FIN-02 | Open `/finance` signed out | Sign-in prompt; local draft only |
| MT-K-02 | FR-FIN-02, FR-FIN-09, NFR-FIN-02, NFR-FIN-04 | Open `/finance` signed in | Synced entries; CAD totals |
| MT-K-03 | FR-FIN-01 | Add expense | List + totals update |
| MT-K-04 | FR-FIN-01, FR-FIN-03 | Add income | Income categories (OSAP, Job, …) |
| MT-K-05 | FR-FIN-07 | Edit entry | PATCH persists |
| MT-K-06 | FR-FIN-07 | Delete entry | Removed; balance updates |
| MT-K-07 | FR-FIN-04 | Set budget under/over spend | Overspend or on-track alert |
| MT-K-08 | FR-FIN-05 | Month-only filter | Month-scoped rows/totals |
| MT-K-09 | FR-FIN-05 | Search + kind filter | Composed filters |
| MT-K-10 | FR-FIN-06 | Recurring + Log next | Due strip / next row |
| MT-K-11 | FR-FIN-08 | Export CSV | File downloads |
| MT-K-12 | FR-FIN-10 | Dashboard widget | Matches signed-in finance |
| MT-L-06 | FR-FIN-02, FR-FIN-10 | Add entry → dashboard | Widget balance/spend updates |

Same flows are listed as `K-01`…`K-12` and `L-06` in `docs/manual-testing.md`.

## Demonstrated unit outcomes

Command:

```bash
npx tsx --test tests/api/financeMoney.test.ts tests/api/financeCategories.test.ts tests/api/financeRecurrence.test.ts tests/web/finance-logic.test.ts
```

Result (2026-07-29, local):

```
ℹ tests 29
ℹ suites 15
ℹ pass 29
ℹ fail 0
ℹ duration_ms ~355
```

All UT-FIN-01…21 cases above passed in that run.

## How to re-demonstrate

1. From repo root: run the command in the previous section.
2. Confirm `pass 29` / `fail 0`.
3. For manual RTM rows, walk `docs/manual-testing.md` §K and L-06 while signed in against the hosted DB.
