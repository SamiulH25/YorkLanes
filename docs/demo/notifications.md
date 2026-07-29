# Notifications (`/notifications`)

## Purpose

Activity feed: assignment due alerts, schedule changes, finance reminders, setup nudges.

## Implementation

- **Page:** `apps/web/src/pages/notifications/index.astro`
- **Component:** `PortalHubFeed.astro` (`kind="notifications"`)
- **Hub logic:** `apps/web/src/lib/portal-hub.ts`

### Server-side

- Same data pipeline as `/messages`:
  - `fetchSessionUser(cookie)`
  - Guest → `guestHubFallback()`
  - Signed in → `fetchDashboardHub(cookie)` → `GET /api/dashboard/hub`
- `hubNotificationsForPanels(hub)` with type mapping:
  - `schedule` → `reminder`
  - `finance` → `announcement`
  - assignments → due-style alerts

### Client-side

- **None** — static SSR from `PortalHubFeed`

### Notification types (UI icons)

| Type | Examples |
|------|----------|
| Due | Assignment deadlines |
| Reminder | Schedule / class related |
| Announcement | Finance, system |
| Setup | Onboarding incomplete |

### API

| Endpoint | Auth |
|----------|------|
| `GET /api/dashboard/hub` | Required for real data |

## Demo script

1. Show feed after creating an assignment due soon.
2. Point out icon per notification type.
3. Empty state: “You’re all caught up.”
4. Compare sidebar badge count (if visible) with feed length.

## Q&A

**Q: Messages vs Notifications?**  
A: Same hub API, different presentation — inbox previews vs activity timeline with typed icons.

**Q: Push notifications?**  
A: Not implemented — page is SSR-only, no WebSocket or service worker.

**Q: Can I dismiss a notification?**  
A: No dismiss state — items disappear when underlying data changes (e.g. assignment marked done).

**Q: Where is hub logic maintained?**  
A: `apps/api/src/routes/dashboard.ts` builds hub payload; `portal-hub.ts` shapes it for web UI.
