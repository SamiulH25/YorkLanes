# Login (`/login`)

## Purpose

Google OAuth entry point. Supports safe return URLs after sign-in.

## Implementation

- **Page:** `apps/web/src/pages/login.astro`
- **Layout:** `BaseLayout` (full-viewport split brand panel)

### Server-side

- `fetchSessionUser(cookie)` — if already signed in, **redirect** to `returnTo` (default `/dashboard`)
- `fetchAuthStatus()` → `GET /api/auth/status` — checks if OAuth env vars are configured
- `returnTo` query param validated: must start with `/`, must not be `//` (open redirect protection)
- Builds Google sign-in URL via `googleSignInUrl(returnTo, rememberMe)`

### Client-side

- Inline script: “Keep me signed in” checkbox updates the sign-in link with `rememberMe`
- Re-binds on `astro:page-load` (View Transitions)

### API & data

| Endpoint | Purpose |
|----------|---------|
| `GET /api/auth/status` | OAuth configured? |
| `GET /api/auth/me` | Redirect if session exists |
| `GET /api/auth/google` | Start OAuth (browser navigation) |
| `GET /api/auth/google/callback` | Google redirect target (proxied via web) |
| `GET /api/auth/logout` | Destroy session |

- **Session:** `yorklanes.sid` cookie, `express-session` in API
- **Tables:** `users` — upserted on successful OAuth (`google_id`, `email`, `display_name`)

### Auth config (`apps/api`)

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `WEB_ORIGIN`, `SESSION_SECRET`
- Production: `secure: true` cookies (requires HTTPS)

### Error query params

`oauth-not-configured`, `oauth-start-failed`, `oauth-state-mismatch`, `oauth-callback-failed`, `oauth-denied`

## Demo script

1. Show login page with Google button enabled.
2. Toggle “Keep me signed in” — explain persistent vs browser-session cookie.
3. Complete sign-in → lands on dashboard (or `returnTo`).

## Q&A

**Q: Why does OAuth go through the web URL, not the API host directly?**  
A: The session cookie must be set on the **same origin** as the Astro app. The web middleware proxies `/api/auth/*` to Express so cookies work.

**Q: What does “Keep me signed in” do?**  
A: Sets a longer-lived session (default 30 days, sliding) vs a session cookie cleared when the browser closes.

**Q: Why “Google sign-in is not configured”?**  
A: Missing `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` on the API service.
