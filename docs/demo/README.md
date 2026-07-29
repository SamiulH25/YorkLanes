# YorkLanes Demo & Q&A — Page Reference

One document per user-facing route. Use these for demos, presentations, and technical Q&A.

| Page | Route | Doc |
|------|-------|-----|
| Home | `/` | [home.md](./home.md) |
| Login | `/login` | [login.md](./login.md) |
| Onboarding | `/onboarding` | [onboarding.md](./onboarding.md) |
| Dashboard | `/dashboard` | [dashboard.md](./dashboard.md) |
| Degree plan | `/plan` | [plan.md](./plan.md) |
| Checklist import | `/plan/setup` | [plan-setup.md](./plan-setup.md) |
| Course catalogue | `/courses` | [courses.md](./courses.md) |
| Course detail | `/courses/[code]` | [course-detail.md](./course-detail.md) |
| Schedule | `/schedule` | [schedule.md](./schedule.md) |
| Assignments | `/assignments` | [assignments.md](./assignments.md) |
| Finance | `/finance` | [finance.md](./finance.md) |
| Progress | `/progress` | [progress.md](./progress.md) |
| Settings | `/settings` | [settings.md](./settings.md) |
| Messages | `/messages` | [messages.md](./messages.md) |
| Notifications | `/notifications` | [notifications.md](./notifications.md) |

## Test cases (presentation rubric)

- **[test-cases.md](./test-cases.md)** — Testing strategy, 167 unit tests inventory, critical-path manual tests, RTM traceability, Q&A
- **[../manual-testing.md](../manual-testing.md)** — Full browser checklist (sections A–L)

## Architecture diagrams (presentation)

See **[diagrams.md](./diagrams.md)** for slide order and rubric mapping.

Pre-rendered PNGs: [`../diagrams/png/`](../diagrams/png/) — `npm run diagrams:render` to regenerate.

## Cross-cutting architecture (say this once in the intro)

- **Stack:** Astro SSR (`apps/web`) + Express API (`apps/api`) + hosted Supabase Postgres + Python checklist parser.
- **Auth:** Google OAuth via Express session cookie `yorklanes.sid` on the web origin; API routes use `requireAuth` where data is user-specific.
- **SSR pattern:** Server fetches with forwarded `Cookie` header; critical JSON embedded via `serializeForScript` to avoid client cold-start failures.
- **Client boot:** `registerPageBoot` runs on first load and Astro View Transitions (`astro:page-load`).
- **Plan sharing:** Active plan ID in `sessionStorage` (`yorklanes-plan-id`) links plan → schedule → progress.

## Auth at a glance

| Needs sign-in for full features | Works as guest |
|--------------------------------|----------------|
| Onboarding, cloud save (plan, schedule, assignments, finance) | Home, courses, dashboard (placeholders), finance (local draft), schedule (local) |
