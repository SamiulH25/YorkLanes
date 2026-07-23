# Dashboard Components

Placeholder widgets for the main dashboard page. Each maps to a major feature in the design doc.

| Component | Feature owner | Expand in |
|-----------|---------------|-----------|
| `ProgressWidget.astro` | Thor | `src/pages/progress/`, `apps/api/src/routes/progress.ts` |
| `AssignmentsWidget.astro` | Sarah | `src/pages/assignments/`, `apps/api/src/routes/assignments.ts` |
| `FinanceWidget.astro` | Taziz | `src/pages/finance/`, `apps/api/src/routes/finance.ts` |
| `QuickLinksWidget.astro` | All | Update links as pages are added under `src/pages/` |

The dashboard page (`src/pages/dashboard/index.astro`) composes these widgets. Do not put full feature logic here; keep widgets as summary views only.
