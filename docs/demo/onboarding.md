# Onboarding (`/onboarding`)

## Purpose

First-run wizard: collect programme info, then send the user to checklist import.

## Implementation

- **Page:** `apps/web/src/pages/onboarding/index.astro`
- **Layout:** `OnboardingLayout`
- **Script:** `apps/web/src/scripts/onboarding.ts`

### Steps

| Step | Content |
|------|---------|
| 1 | Welcome / intro |
| 2 | Faculty + programme name + start year |
| 3 | Skipped (was sign-in; auth enforced at page level) |
| 4 | Redirect to checklist import |

### Server-side

- **Requires sign-in** — redirects to `/login?returnTo=...` if no session
- `fetchOnboardingStatus(cookie)` → `GET /api/onboarding/status`
  - If onboarding complete → redirect `/dashboard`
- Step 2: `fetchFaculties(cookie)` → `GET /api/plans/faculties`
- Step 3 URL (`?step=3`) hard-redirects to step 4

### Client-side

- Boot via `#onboarding-boot` data attributes
- Step 2 submit: saves draft to `localStorage` (`yorklanes-onboarding-draft`), navigates to step 4
- Step 4: `POST /api/onboarding/programme` → sets `yorklanes-onboarding-complete` → redirect `/plan/setup?facultyKey=...`

### API & data

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/onboarding/status` | GET | Completion state |
| `/api/onboarding/programme` | POST | Save programme metadata |
| `/api/plans/faculties` | GET | Faculty list for dropdown |

- **Tables:** `users`, `user_programmes`

### Storage keys

- `yorklanes-onboarding-draft` (localStorage)
- `yorklanes-onboarding-complete` (localStorage)

## Demo script

1. Sign in as new user → onboarding banner on dashboard or direct `/onboarding`.
2. Step 2: pick faculty, enter programme name and start year.
3. Step 4 → auto-redirect to checklist import with query params pre-filled.

## Q&A

**Q: Why is step 3 missing?**  
A: Sign-in was moved to a global gate; step 3 is redirected to step 4 to avoid a dead step.

**Q: What if the faculties API fails?**  
A: User can still type programme manually; a warning banner is shown.

**Q: Can I skip onboarding?**  
A: You can navigate away, but the dashboard shows a banner until `onboarding/status` reports complete.
