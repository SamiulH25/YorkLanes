# Auth — Google OAuth

Google sign-in is wired through the Express API. The web app never sees client secrets.

## Maintainer setup (one time)

1. Open [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Add **Authorized redirect URI** (dev):
   ```
   http://localhost:4321/api/auth/google/callback
   ```
   The Astro dev server proxies `/api` to the API on port 3001 so the session cookie is set on the same origin as the web app.
4. Copy client ID and secret into `apps/api/.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_CALLBACK_URL=http://localhost:4321/api/auth/google/callback
   SESSION_SECRET=<random string, e.g. openssl rand -hex 32>
   ```
5. Set `PUBLIC_API_URL=http://localhost:4321` in `apps/web/.env.local`.
6. Restart `npm run dev`.

## Routes

| Route | Purpose |
|-------|---------|
| `GET /api/auth/status` | Whether OAuth env vars are set |
| `GET /api/auth/google` | Start Google sign-in |
| `GET /api/auth/google/callback` | OAuth callback (Google redirects here) |
| `GET /api/auth/me` | Current session user (JSON) |
| `GET /api/auth/logout` | Destroy session, redirect to `/login` |

## Files

| File | Purpose |
|------|---------|
| `apps/api/src/routes/auth.ts` | OAuth + session endpoints |
| `apps/api/src/services/googleAuth.ts` | Google token exchange |
| `apps/api/src/services/users.ts` | Upsert `users` row on login |
| `apps/api/src/middleware/session.ts` | `express-session` cookie |
| `apps/web/src/lib/auth.ts` | Web helpers (`/me`, sign-in URL) |
| `apps/web/astro.config.mjs` | Dev proxy `/api` → `localhost:3001` |
| `apps/web/src/pages/login.astro` | Sign-in button → API |
| `apps/web/src/layouts/DashboardLayout.astro` | Sidebar name + sign out |

## Behaviour

- Session cookie: `yorklanes.sid` on the web origin in dev (`localhost:4321` via proxy).
- SSR page loads call the API on `localhost:3001` directly; browser OAuth uses `localhost:4321/api` (proxied by `src/middleware.ts`).
- Signed-in users get a `users` row (`google_id`, `email`, `display_name`). New degree plans store `user_id` when imported while logged in.
- Guests can still use the app without signing in; `requireAuth` is available for routes that should be locked down later.

## Verify

```bash
npm run dev
# Visit http://localhost:4321/login — button should be enabled if env is set
curl http://localhost:4321/api/auth/status
npm run setup   # warns if PUBLIC_API_URL still points at :3001
```

## Later

- Protect user-specific routes with `requireAuth` in `apps/api/src/middleware/auth.ts`
- Tighten Supabase RLS to match API user id
- Production: same-origin reverse proxy or shared parent domain; set `SESSION_SECRET`, production callback URL, and `NODE_ENV=production` for secure cookies
