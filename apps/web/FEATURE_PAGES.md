# Feature Pages

Create one folder per major feature under `src/pages/`. Each owner builds their page here and adds a nav link in `src/layouts/DashboardLayout.astro`.

| Folder to create | Feature | Owner |
|------------------|---------|-------|
| `courses/` | Course Explorer | Jericho |
| `plan/` | Degree Plan Editor | Samiul |
| `schedule/` | Schedule Builder | Nabeela |
| `progress/` | Progress Tracker | Thor |
| `finance/` | Finance Module | Taziz |
| `assignments/` | Assignment Calendar | Sarah |

## Example starter page

```astro
---
import DashboardLayout from "../../layouts/DashboardLayout.astro";
---

<DashboardLayout title="Course Explorer | YorkLanes">
  <Fragment slot="header">
    <h1 class="text-2xl font-bold">Course Explorer</h1>
  </Fragment>
  <p>Feature UI goes here.</p>
</DashboardLayout>
```

Also create the matching API route in `apps/api/src/routes/` and mount it in `apps/api/src/index.ts`.
