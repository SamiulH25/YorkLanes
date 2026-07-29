# Assignments (`/assignments`)

## Purpose

Track coursework: list or calendar view, due dates, star important items, mark done.

## Implementation

- **Page:** `apps/web/src/pages/assignments/index.astro`
- **Script:** `apps/web/src/scripts/assignments-page.ts`

### Views

| View | URL | Rendering |
|------|-----|-----------|
| List | default | SSR sorted table |
| Calendar | `?view=calendar&month=YYYY-MM` | SSR month grid |

Sort: `?sort=due` (default) or `?sort=course` — starred items always first.

### Server-side

- `fetchAssignments(cookie)` → `GET /api/assignments`
- Server-side sort before HTML render
- Calendar cells built in Astro from assignment `due_at` dates (UTC keys)

### Client-side

- `registerPageBoot("#assignments-root", ...)`
- **All mutations via fetch** (not HTML form POST — View Transitions broke form POST)
- Create, update, delete, toggle star, toggle done
- After save: `sessionStorage` flash (`yorklanes-assignments-flash`) + `window.location.reload()` to refresh SSR list
- Delete confirmation modal
- Calendar day click → opens add form with pre-filled date

### API endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/assignments` | GET | List user’s assignments |
| `/api/assignments` | POST | Create |
| `/api/assignments/:id` | PUT | Full update |
| `/api/assignments/:id` | PATCH | Toggle `done` / `starred` |
| `/api/assignments/:id` | DELETE | Remove |

### Database

- **Table:** `assignments` (scoped by `user_id`)
- **Columns:** `title`, `course_code`, `description`, `due_at`, `done`, `starred`, timestamps

### Visual cues

- Overdue: red tone
- Due within 7 days: gold tone

## Demo script

1. List view — add assignment with course code and due date.
2. Star one item — shows at top when sorting by due.
3. Toggle done — strikethrough styling.
4. Switch to calendar view — click a day to add.
5. Show dashboard widget picks up upcoming items.

## Q&A

**Q: Why full page reload after save?**  
A: Keeps SSR list in sync without a client-side state framework; flash message via `sessionStorage`.

**Q: Can guests use assignments?**  
A: Page loads, but API requires auth — SSR shows error if not signed in.

**Q: Timezone for due dates?**  
A: Stored as timestamps; calendar uses UTC date keys for cell placement.

**Q: Do assignments link to courses?**  
A: `course_code` is a free-text field (e.g. `EECS 1011`), not a foreign key.
