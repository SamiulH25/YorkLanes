# Settings (`/settings`)

## Purpose

User preferences: theme accent, light/dark mode, account sign-out.

## Implementation

- **Page:** `apps/web/src/pages/settings/index.astro`
- **Themes:** `apps/web/src/lib/themes.ts` (static palette list)
- **Global script:** `apps/web/src/scripts/theme.ts` (via `BaseLayout`)

### Server-side

- `fetchSessionUser(cookie)` — display name, signed-in state
- `signOutUrl()` for logout link
- Theme list rendered server-side from static config

### Client-side

- **No page-specific bundle** — uses global theme boot
- `localStorage` keys:
  - `yorklanes-theme-id` — accent palette (York red, etc.)
  - `theme` — `light` | `dark` | system
- Buttons: `[data-theme-id]`, `[data-mode-pick]`
- Dispatches `yorklanes:theme-change` (plan editor SVG lines read theme colors)

### API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/auth/me` | SSR account section |
| `GET /api/auth/logout` | Sign out (`data-astro-reload` for full session clear) |

### Auth

- **Optional** — theme works for everyone; account section adapts to guest vs signed-in

## Demo script

1. Switch accent theme — show instant CSS variable update.
2. Toggle dark mode — persists across pages.
3. Show account section: name + sign out (or sign-in link for guests).

## Q&A

**Q: Are theme prefs synced to the cloud?**  
A: No — `localStorage` only, per browser.

**Q: Does dark mode follow system?**  
A: Yes, until user explicitly picks light or dark.

**Q: Why does sign-out use full reload?**  
A: `data-astro-reload` ensures session cookie is cleared and SSR re-renders as guest.
