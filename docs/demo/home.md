# Home (`/`)

## Purpose

Public marketing landing page. Explains YorkLanes value prop and routes visitors to sign in or the dashboard.

## Implementation

- **Page:** `apps/web/src/pages/index.astro`
- **Layout:** `BaseLayout` (marketing shell, no sidebar)
- **Rendering:** SSR (`prerender = false`)

### Server-side

- Calls `fetchSessionUser(cookie)` → `GET /api/auth/me`
- Branches header CTAs: signed-in users see “Dashboard”; guests see “Sign in”
- Feature cards are static data in the Astro frontmatter (not from API)

### Client-side

- No page-specific script
- Inherits global theme, motion, and cookie consent from `BaseLayout`

### API & data

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/auth/me` | Optional | Session user for header |

- **Tables:** `users` (read on session lookup)

### Patterns

- Astro View Transitions (`transition:name`, `transition:persist` on header)
- Marketing styles in `apps/web/src/styles/marketing.css`

## Demo script

1. Open `/` as a guest — show product pitch and feature grid.
2. Point out “Sign in” vs open `/dashboard` if already logged in.
3. Mention the full app lives behind Google OAuth for cloud sync.

## Q&A

**Q: Can I use YorkLanes without an account?**  
A: You can browse the home page and public course catalogue. Saving plans, schedules, assignments, and finance to the cloud requires Google sign-in.

**Q: Is this a static site?**  
A: No — every request is server-rendered Astro (Node adapter), so session state can be read before HTML is sent.

**Q: Where does user data live?**  
A: Hosted Supabase Postgres, accessed only through the Express API — not directly from the browser.
