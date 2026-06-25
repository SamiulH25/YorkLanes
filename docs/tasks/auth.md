# Auth — Foundation (OAuth)

**Goal for your first PR:** wire `/login` to a real `GET /api/auth/status` and document the OAuth env vars.

## Files to edit

| File | Purpose |
|------|---------|
| `apps/web/src/pages/login.astro` | Login UI |
| `apps/api/src/routes/auth.ts` | Auth routes |
| `apps/api/src/middleware/auth.ts` | `requireAuth` stub → real check |
| `apps/api/src/index.ts` | Mount `/api/auth` |

## Steps

1. `GET /api/auth/status` already returns whether OAuth is configured — call it from `login.astro` and show the message.
2. Add Google OAuth routes (`/api/auth/google`, callback) using `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` from `apps/api/.env.example`.
3. On success, create or find a row in `users` and set a session cookie.
4. Replace `requireAuth` no-op with a real session check; uncomment on routes that need it.

## After that

- Protect `degree_plans` with `user_id`
- Show real name in `DashboardLayout` sidebar instead of “Guest”
- Tighten Supabase RLS policies

Do not put client secrets in the frontend. Session secret: `SESSION_SECRET` in API `.env`.
