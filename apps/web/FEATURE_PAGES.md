# Feature Pages

Add one folder per major feature under `src/pages/`. Each owner adds a nav link in `src/layouts/DashboardLayout.astro`.

| Folder | Feature | Owner | Status |
|--------|---------|-------|--------|
| `plan/` | Degree Plan Editor | Samiul | **Built** — see [`docs/features/degree-plan.md`](../../docs/features/degree-plan.md) |
| `courses/` | Course Explorer | Jericho | Planned |
| `schedule/` | Schedule Builder | Nabeela | Planned |
| `progress/` | Progress Tracker | Thor | Planned |
| `finance/` | Finance Module | Taziz | Planned |
| `assignments/` | Assignment Calendar | Sarah | Planned |

## New feature checklist

1. `apps/web/src/pages/<feature>/index.astro` using `DashboardLayout.astro`
2. `apps/api/src/routes/<feature>.ts` mounted in `apps/api/src/index.ts`
3. `supabase/migrations/` SQL file (maintainer applies after merge)
4. Uncomment nav in `DashboardLayout.astro`
5. Update dashboard `quickLinks` in `apps/api/src/routes/dashboard.ts`

## Example starter page

```astro
---
import DashboardLayout from "../../layouts/DashboardLayout.astro";
---

<DashboardLayout title="Course Explorer | YorkLanes" activeNav="dashboard">
  <Fragment slot="header">
    <h1 class="heading-page">Course Explorer</h1>
  </Fragment>
  <p>Feature UI goes here.</p>
</DashboardLayout>
```

See [`CONTRIBUTING.md`](../../CONTRIBUTING.md) for branch workflow and env setup.
