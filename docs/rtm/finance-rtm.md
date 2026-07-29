# Finance RTM (Requirements Traceability Matrix)

**Module owner:** Taziz Ahsan  
**Surfaces:** `/finance`, dashboard Finance widget, `/api/finance*`  
**Source:** Project proposal/design (student finance tracking) + shipped finance scope in `docs/tasks/finance.md`

## Functional requirements

| ID | Requirement | Priority | Implementation | Verification |
|----|-------------|----------|----------------|--------------|
| FR-FIN-01 | User can create income and expense entries with label, amount, category, kind, and date | Must | `POST /api/finance/entries`, `/finance` form | UT-FIN-01…03, MT-K-03, MT-K-04 |
| FR-FIN-02 | System shows balance, income total, and expense total | Must | summary helpers + `/finance` cards + dashboard widget | UT-FIN-04, UT-FIN-12, MT-K-02, MT-K-12, MT-L-06 |
| FR-FIN-03 | Categories are York-student-specific and switch by income/expense | Must | `financeCategories.ts`, category dropdown | UT-FIN-07…09, MT-K-04 |
| FR-FIN-04 | User can set a monthly budget and see spent vs remaining / overspend | Must | `PUT /api/finance/budget/:month`, budget UI | UT-FIN-05…06, UT-FIN-13, MT-K-07 |
| FR-FIN-05 | User can filter by month, kind, and search text | Should | `finance-logic` filters + UI controls | UT-FIN-10…12, MT-K-08, MT-K-09 |
| FR-FIN-06 | User can mark entries recurring and log the next occurrence when due | Should | `recurrence` column, `POST …/next`, Due strip | UT-FIN-14…18, MT-K-10 |
| FR-FIN-07 | User can edit and delete entries | Must | `PATCH` / `DELETE` routes + UI | MT-K-05, MT-K-06 |
| FR-FIN-08 | User can export visible entries as CSV | Should | Export button on `/finance` | MT-K-11 |
| FR-FIN-09 | Signed-in users only read/write their own finance rows; guests use local draft | Must | `requireAuth` on entry/budget routes; localStorage draft | MT-K-01, MT-K-02 |
| FR-FIN-10 | Dashboard Finance widget reflects signed-in finance totals and budget progress | Must | `FinanceWidget.astro` + `dashboard.ts` aggregate | MT-K-12, MT-L-06 |

## Non-functional requirements

| ID | Requirement | Priority | Implementation | Verification |
|----|-------------|----------|----------------|--------------|
| NFR-FIN-01 | Money amounts are stored and totaled as integer cents (no float ledger) | Must | `amount_cents`, `toAmountCents`, `parseAmountCents` | UT-FIN-01, UT-FIN-10 |
| NFR-FIN-02 | Finance API mutations require an authenticated session cookie | Must | `requireAuth` after `/categories` | MT-K-01, MT-K-02 |
| NFR-FIN-03 | Missing DB/migrations return actionable 503 hints | Should | `classifyFinanceError` | UT-FIN-19…21 |
| NFR-FIN-04 | Currency display uses CAD formatting in the UI | Should | `Intl.NumberFormat("en-CA")` | MT-K-02 |

## Requirement → test index

| Requirement | Unit tests | Manual tests |
|-------------|------------|--------------|
| FR-FIN-01 | UT-FIN-01…03, UT-FIN-10 | K-03, K-04 |
| FR-FIN-02 | UT-FIN-04, UT-FIN-12 | K-02, K-12, L-06 |
| FR-FIN-03 | UT-FIN-07…09 | K-04 |
| FR-FIN-04 | UT-FIN-05…06, UT-FIN-13 | K-07 |
| FR-FIN-05 | UT-FIN-10…12 | K-08, K-09 |
| FR-FIN-06 | UT-FIN-14…18 | K-10 |
| FR-FIN-07 | — (HTTP/UI) | K-05, K-06 |
| FR-FIN-08 | — (browser download) | K-11 |
| FR-FIN-09 | — (session/UI) | K-01, K-02 |
| FR-FIN-10 | — (dashboard integration) | K-12, L-06 |
| NFR-FIN-01 | UT-FIN-01, UT-FIN-10 | — |
| NFR-FIN-02 | — | K-01, K-02 |
| NFR-FIN-03 | UT-FIN-19…21 | — |
| NFR-FIN-04 | — | K-02 |

Manual IDs `K-*` / `L-*` live in `docs/manual-testing.md`. Unit IDs `UT-FIN-*` live in `docs/testing/finance-test-cases.md`.
