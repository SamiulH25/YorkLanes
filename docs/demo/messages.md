# Messages (`/messages`)

## Purpose

Full-page inbox of hub messages: assignment reminders, workspace updates, setup prompts.

## Implementation

- **Page:** `apps/web/src/pages/messages/index.astro`
- **Component:** `PortalHubFeed.astro` (`kind="messages"`)
- **Hub logic:** `apps/web/src/lib/portal-hub.ts`

### Server-side

- `fetchSessionUser(cookie)`
- **Guest:** `guestHubFallback()` — single “Sign in to YorkLanes” item
- **Signed in:** `fetchDashboardHub(cookie)` → `GET /api/dashboard/hub`
- On error: `emptyHubFallback()`
- `hubMessagesForPanels(hub)` transforms API response for UI

### Client-side

- **None** — static SSR markup from `PortalHubFeed`

### API

| Endpoint | Auth |
|----------|------|
| `GET /api/dashboard/hub` | Required for real data |

Hub assembled server-side from: assignments (upcoming), schedules, finance alerts, onboarding state.

### Styling

- `hub-inbox.css` — inbox panel layout

## Demo script

1. Show inbox with upcoming assignment previews (needs assignments with due dates).
2. Contrast guest view (single sign-in prompt).
3. Link header to `/assignments` for full tracker.

## Q&A

**Q: Are these real emails?**  
A: No — in-app hub items generated from YorkLanes data, not an email integration.

**Q: Why is inbox empty?**  
A: No upcoming hub events, or API offline (empty fallback).

**Q: Difference from Notifications?**  
A: Messages = inbox/conversational style; Notifications = activity feed with type icons (due, finance, schedule).

**Q: Read/unread state?**  
A: Not persisted — regenerated on each hub fetch.
