# Feature pages

| Folder | Feature | Owner | Status | First task |
|--------|---------|-------|--------|------------|
| `plan/` | Degree plan | Samiul | **Built** | [degree-plan.md](../../docs/features/degree-plan.md) |
| `courses/` | Course explorer | Jericho | Stub | [courses.md](../../docs/tasks/courses.md) |
| `schedule/` | Schedule builder | Nabeela | Stub | [schedule.md](../../docs/tasks/schedule.md) |
| `progress/` | Progress tracker | Thor | Stub | [progress.md](../../docs/tasks/progress.md) |
| `finance/` | Finance | Taziz | Working first pass | [finance.md](../../docs/tasks/finance.md) |
| `assignments/` | Assignments | Sarah | Stub | [assignments.md](../../docs/tasks/assignments.md) |
| `login.astro` | Google OAuth | Foundation | **Built** (needs OAuth env) | [auth.md](../../docs/tasks/auth.md) |

Each stub page calls its API route and shows the task guide path. Open the guide, follow the steps, ship a PR.

See [docs/DEVELOPER_GUIDE.md](../../docs/DEVELOPER_GUIDE.md) for the full codebase map.

Index of all tasks: [docs/tasks/README.md](../../docs/tasks/README.md)

## File layout per feature

```
apps/web/src/pages/<feature>/index.astro   ← UI
apps/web/src/lib/<feature>.ts              ← fetch helper
apps/api/src/routes/<feature>.ts           ← API (mounted in index.ts)
```

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for branch workflow.
