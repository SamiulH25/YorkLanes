# Dashboard (`/dashboard`)

## Purpose

Signed-in academic hub: stats, widgets for progress, today’s classes, assignments, and finance. Guest mode shows placeholders.

## Implementation

- **Page:** `apps/web/src/pages/dashboard/index.astro`
- **Layout:** `DashboardLayout` (sidebar nav, plan-aware links)
- **Hub logic:** `apps/web/src/lib/portal-hub.ts`

### Server-side

- `fetchSessionUser(cookie)`
- **Signed in:** `fetchDashboardSummary(cookie)` + `fetchOnboardingStatus(cookie)`
- **Guest:** `guestDashboardSummary()` — static placeholder widgets, no API
- **API error:** partial user info + `emptyHubFallback()`

### Widgets (SSR)

| Widget | Data source |
|--------|-------------|
| Stats row | Classes today, due this week, degree %, balance |
| Progress | Plan completion % |
| Today’s classes | Active schedule entries for current day |
| Assignments | Upcoming due items |
| Finance | Month balance snapshot |
| Onboarding banner | Shown when `signedIn && !completed` |

### Client-side

- `sidebar.ts` — collapse state in `localStorage` (`sidebar-collapsed`)
- Widgets are mostly SSR; some read `sessionStorage` plan ID

### API & data

| Endpoint | Auth |
|----------|------|
| `GET /api/dashboard/summary` | Required |
| `GET /api/dashboard/hub` | Required (messages/notifications) |
| `GET /api/onboarding/status` | Required |

**Aggregated from:** `user_programmes`, `degree_plans`, `plan_courses`, `assignments`, `user_schedules`, `schedule_entries`, `finance_entries`, `finance_monthly_budgets`

### Services

- `apps/api/src/routes/dashboard.ts`
- `listTodayClasses` from schedules service

## Demo script

1. Open dashboard signed in — walk through stat cards.
2. Show “today’s classes” (requires an **active** schedule on `/schedule`).
3. Show onboarding banner for new users.
4. Optional: open as guest to show “Sign in to sync” placeholders.

## Q&A

**Q: Why is finance $0 on the dashboard?**  
A: Guest mode uses placeholders. Signed-in users need finance entries in the current month.

**Q: Where do “today’s classes” come from?**  
A: The schedule marked **active** via “Use on dashboard” on `/schedule` (`is_active` on `user_schedules`).

**Q: Does the dashboard update in real time?**  
A: No — it’s SSR per navigation. Refresh or navigate away and back to see updates.

**Q: Messages vs notifications?**  
A: Both use the same hub API; messages are inbox-style previews, notifications are activity alerts (see their page docs).
