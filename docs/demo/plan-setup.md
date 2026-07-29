# Checklist Import (`/plan/setup`)

## Purpose

Upload a York degree checklist (PDF/DOCX) and generate an interactive plan automatically.

## Implementation

- **Page:** `apps/web/src/pages/plan/setup.astro`
- **Script:** `apps/web/src/scripts/plan-setup.ts`

### UI flow

1. Pick faculty (panels with download links and instructions)
2. Upload checklist file → parse → redirect to `/plan?id={newPlanId}`

### Server-side

- `fetchFaculties(cookie)` → `GET /api/plans/faculties`
- Faculty metadata from `apps/api/src/data/faculty-checklists.ts` (static instructions + external URLs)
- Query prefill from onboarding: `?facultyKey`, `programmeName`, `startingYear`

### Client-side

- Faculty panel toggle, drag-and-drop upload zone
- Submit: `POST /api/plans/import` via `FormData` (`checklist` file + optional `facultyKey`)
- Uses relative `/api/...` URL with `credentials: include` (works through web proxy)
- Success → full navigation to `/plan?id=...`

### API & pipeline

| Step | Component |
|------|-----------|
| HTTP | `POST /api/plans/import` (multipart, `requireAuth`) |
| Parse | Python `services/checklist-parser/parse_checklist.py` (spawned by API) |
| Metadata | `inferChecklistMetadata` — programme name, start year |
| Generate | `planGenerator` — terms, course placements, prereq edges |

### Database

- Creates: `degree_plans`, `plan_terms`, `plan_courses`
- Links `user_id` when signed in

### Accepted formats

- PDF, DOCX, DOC

## Demo script

1. Show faculty picker with York-specific instructions.
2. Upload a sample checklist PDF.
3. Wait for parse (Python subprocess) → land on populated plan grid.
4. Mention complementary PDF can be uploaded later on `/plan`.

## Q&A

**Q: Does it work offline?**  
A: No — requires API + Python parser on the server + database connection.

**Q: What if parsing fails?**  
A: API returns error JSON; UI shows message. Common causes: scanned PDF, non-standard checklist layout.

**Q: Can guests import?**  
A: API requires auth (`requireAuth`); import is tied to the signed-in user.

**Q: Where does faculty list come from?**  
A: Static `faculty-checklists.ts` plus API route; degrades gracefully if API is down.
