# YorkLanes — Test Cases (Demo & Presentation)

Use this document for the **Test Cases** rubric (3 pts) and Q&A. It ties requirements → automated tests → manual verification.

**Related docs**

| Doc | Purpose |
|-----|---------|
| [manual-testing.md](../manual-testing.md) | Full browser checklist (A–L, 80+ cases) |
| [testing/finance-test-cases.md](../testing/finance-test-cases.md) | Finance RTM ↔ unit test traceability |
| [rtm/finance-rtm.md](../rtm/finance-rtm.md) | Finance requirements matrix |

---

## 1. Testing strategy (30-second pitch)

YorkLanes uses a **three-layer** approach:

```
                    ┌─────────────────────────┐
                    │   Manual / demo tests   │  Browser E2E, OAuth, upload flows
                    │   docs/manual-testing   │
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │   Integration smoke     │  npm run doctor, npm run smoke
                    └───────────┬─────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        │              Automated unit tests                │
        │  Node: 167 tests (tests/)  |  Python: pytest    │
        └─────────────────────────────────────────────────┘
```

- **Unit tests** — Pure logic (no browser): money in cents, schedule conflicts, plan credits, course search, complementary studies, SSR helpers.
- **Smoke tests** — Live API health when dev server is running.
- **Manual tests** — OAuth, file upload, drag-and-drop, cloud sync — documented with Pass/Fail IDs.

**Why not full E2E automation?** Astro SSR + Google OAuth + file upload are expensive to automate; we unit-test business logic and manually verify critical user journeys before release.

---

## 2. Run tests live (for presentation)

```bash
# Automated unit tests (fast — ~1 second)
npm test
# 167 tests, 90 suites — all should pass

# API health (dev or production URL in .env)
npm run doctor
npm run smoke

# Checklist parser (Python — needs venv + pytest)
cd services/checklist-parser && pip install -r requirements.txt && python -m pytest -q
# Or: npm run test:parser
```

**One-liner for slides:** `npm test` → **167 passing** unit tests covering finance, schedule, plan, courses, and infrastructure.

---

## 3. Automated unit test inventory

### Summary

| Layer | Location | Count | Framework |
|-------|----------|-------|-----------|
| Web / shared logic | `tests/web/` | ~90 tests | Node `node:test` + `tsx` |
| API services | `tests/api/` | ~77 tests | Node `node:test` + `tsx` |
| Checklist parser | `services/checklist-parser/test_*.py` | pytest | Python `pytest` |
| Scraper (optional) | `services/scraper/test_scraper.py` | smoke | Python |

### By feature area

#### Degree plan & complementary studies

| Test file | What it verifies |
|-----------|------------------|
| `tests/api/complementaryStudies.test.ts` | Complementary progress, catalogue search, stub reconciliation, warnings |
| `tests/api/complementaryPlanCourses.test.ts` | Stub slot consumption when adding electives |
| `tests/api/planGraph.scheduleWarnings.test.ts` | Season/offering warnings on plan courses |
| `tests/web/plan-credits.test.ts` | Term/year credit summaries |
| `tests/web/plan-alerts.test.ts` | Schedule + complementary alert formatting |
| `tests/web/plan-required-courses.test.ts` | Required course detection from checklist |
| `tests/web/plan-complementary.test.ts` | When complementary UI should appear |
| `tests/web/complementary-stub.test.ts` | Stub card helpers |

**Maps to manual:** E-06 (import), F-01–F-19 (editor)

#### Schedule builder

| Test file | What it verifies |
|-----------|------------------|
| `tests/web/schedule-shuffle.test.ts` | Bundle options, conflict-free enumeration, pinned courses |
| `tests/web/schedule-grid.test.ts` | Time overlap, event layout, conflict index |
| `tests/web/schedule-sections.test.ts` | LEC/TUT/LAB parsing, BLEN as lecture, weekly patterns |
| `tests/api/schedules.test.ts` | UUID coercion, today’s classes, active schedule, Toronto TZ |

**Maps to manual:** I-04–I-07, I-10, I-14

#### Finance

| Test file | What it verifies |
|-----------|------------------|
| `tests/api/financeMoney.test.ts` | Cents storage, totals, budget, error classification |
| `tests/api/financeCategories.test.ts` | York-specific categories + aliases |
| `tests/api/financeRecurrence.test.ts` | Weekly/monthly/yearly next occurrence |
| `tests/web/finance-logic.test.ts` | Client filters, due recurring, budget tips |

**Maps to manual:** K-01–K-12 (see RTM doc)

#### Courses & catalogue

| Test file | What it verifies |
|-----------|------------------|
| `tests/api/courseSearch.test.ts` | Search query classification, subject prefix |
| `tests/api/courses.test.ts` | Faculty prefix stripping, code normalization |
| `tests/api/termSeason.test.ts` | Plan season ↔ scraped term mapping |

**Maps to manual:** H-01–H-07

#### Progress & assignments

| Test file | What it verifies |
|-----------|------------------|
| `tests/api/progress.test.ts` | Complementary electives progress calculation |
| `tests/web/progress.test.ts` | Progress linking helpers, category labels |
| `tests/web/assignment-dates.test.ts` | Due date urgency, dashboard labels, week bounds |
| `tests/api/assignments.test.ts` | “Due this week” UTC boundaries |

**Maps to manual:** G-01–G-06, J-01–J-08

#### Infrastructure (reliability)

| Test file | What it verifies |
|-----------|------------------|
| `tests/web/serialize-for-script.test.ts` | SSR JSON safe from `</script>` injection |
| `tests/web/page-boot.test.ts` | Client init on View Transitions |
| `tests/web/fetch-retry.test.ts` | Retry on network errors, user-friendly messages |
| `tests/web/auth-urls.test.ts` | OAuth URL building, returnTo safety |
| `tests/api/pythonPath.test.ts` | Python executable resolution for parser |

**Maps to:** Production stability fixes (502 handling, SSR-first loading)

#### Checklist parser (Python)

| Test file | What it verifies |
|-----------|------------------|
| `test_samples.py` | Real faculty checklist PDFs parse to expected courses |
| `test_complementary.py` | Complementary studies PDF extraction |
| `test_edge_cases.py` | Malformed / edge PDF handling |
| `test_stubs.py` | Stub course placeholders |
| `test_creative_writing_docx.py` | DOCX format support |

**Maps to manual:** E-03–E-07

---

## 4. Requirements traceability (example: Finance)

Full RTM: `docs/rtm/finance-rtm.md`

| Req ID | Requirement | Automated | Manual |
|--------|-------------|-----------|--------|
| FR-FIN-01 | Create income/expense entries | UT-FIN-01…03, UT-FIN-10 | K-03, K-04 |
| FR-FIN-02 | Balance / income / expense totals | UT-FIN-04, UT-FIN-12 | K-02, K-12 |
| FR-FIN-04 | Monthly budget + overspend | UT-FIN-05…06, UT-FIN-13 | K-07 |
| FR-FIN-06 | Recurring entries | UT-FIN-14…18 | K-10 |
| NFR-FIN-01 | Integer cents (no float money) | UT-FIN-01, UT-FIN-10 | — |

Other features follow the same pattern: **logic in unit tests**, **user flows in manual IDs**.

---

## 5. Critical-path manual tests (8-minute demo)

Run these before recording the YouTube demo. Full list: `docs/manual-testing.md`.

| ID | Feature | Steps | Expected | Auto backup |
|----|---------|-------|----------|-------------|
| **B-01** | Auth | Google sign-in | Session on web origin | `auth-urls.test.ts` |
| **E-06** | Import | Upload checklist PDF | Redirect to `/plan?id=` | `test_samples.py` |
| **F-08** | Plan | Drag course between terms | Persists after reload | `plan-credits.test.ts` |
| **F-10** | Plan | Mark course complete | Toggle persists | `progress.test.ts` |
| **G-02** | Progress | Open with planId | Ring + categories update | `progress.test.ts` (API) |
| **H-02** | Courses | Search `EECS` | Filtered results | `courseSearch.test.ts` |
| **I-04** | Schedule | Load sections for course | Grid populates | `schedule-shuffle.test.ts` |
| **I-09** | Schedule | Save + Use on dashboard | Cloud + dashboard widget | `schedules.test.ts` |
| **J-02** | Assignments | Create with due date | Appears in list + widget | `assignment-dates.test.ts` |
| **K-03** | Finance | Add expense | Balance updates | `financeMoney.test.ts` |

---

## 6. Sample unit test cases (for slides / PDF)

Format: **ID | Component | Input | Expected output**

### Schedule — conflict detection

| ID | Component | Input | Expected |
|----|-----------|-------|----------|
| UT-SCH-01 | `meetingsOverlap` | Mon 10:00–11:30 vs Mon 11:00–12:00 | `true` (overlap) |
| UT-SCH-02 | `meetingsOverlap` | Mon 10:00–11:00 vs Mon 11:00–12:00 | `false` (adjacent OK) |
| UT-SCH-03 | `enumerateValidSchedules` | 2 courses, pinned CHEM | Alternatives keep CHEM fixed |
| UT-SCH-04 | `parseSectionComponent` | Section code with `(TUT)` | Type `tut` |

### Plan — credits

| ID | Component | Input | Expected |
|----|-----------|-------|----------|
| UT-PLN-01 | `summarizeTerm` | 5 courses × 3 credits | Term total 15.0 |
| UT-PLN-02 | `computeScheduleWarnings` | Course with no Fall offering | Warning with season badge |
| UT-PLN-03 | `isRequiredPlanCourse` | Checklist core course | `true` |

### Finance — money integrity

| ID | Component | Input | Expected |
|----|-----------|-------|----------|
| UT-FIN-01 | `toAmountCents` | `12.34` | `1234` |
| UT-FIN-02 | `toAmountCents` | `0.1 + 0.2` (float) | `30` (not 29) |
| UT-FIN-03 | `budgetProgress` | spent > budget | `overspent: true` |

### Security / SSR

| ID | Component | Input | Expected |
|----|-----------|-------|----------|
| UT-SEC-01 | `serializeForScript` | User content with `</script>` | Escaped, safe in HTML |
| UT-SEC-02 | `googleSignInUrl` | `returnTo=//evil.com` | Rejected / sanitized |

---

## 7. Integration smoke endpoints

`npm run smoke` hits (via web proxy in dev):

| Endpoint | Validates |
|----------|-----------|
| `GET /health` | API up, DB connected |
| `GET /api/auth/status` | OAuth configured |
| `GET /api/plans/faculties` | Plan metadata route |
| `GET /api/dashboard/summary` | Auth + aggregation (401 OK when guest) |

---

## 8. Q&A — likely test questions

**Q: How do you test without a browser?**  
A: 167 Node unit tests on pure functions — schedule conflicts, finance cents, plan credits, course search. Parser has pytest on sample PDFs.

**Q: How do you test Google login?**  
A: Manual B-01–B-08; unit tests cover URL building and `returnTo` validation, not Google’s servers.

**Q: How do you test checklist import?**  
A: Python pytest on real sample files + manual E-06. API spawns `parse_checklist.py`; failures return structured JSON errors.

**Q: What’s your coverage goal?**  
A: Cover **business logic** and **data integrity** (money, conflicts, progress math). UI polish and OAuth are manual checklist items.

**Q: How do you prevent regressions?**  
A: `npm test` in CI/local before deploy; finance has explicit RTM ↔ test ID mapping; manual critical path before demo.

**Q: Do you test the database?**  
A: Service functions are tested with fixtures/mocks; live DB verified via `npm run doctor` and manual flows. No brittle DB integration tests in CI.

---

## 9. Recording checklist (YouTube demo)

Before upload:

- [ ] `npm test` — 167 pass (screen record terminal)
- [ ] Critical path B-01 → E-06 → F-08 → I-09 → K-03 live in browser
- [ ] Mention unit test count + manual checklist in voiceover
- [ ] Note: self-hosted at `yorklanes.samiulh25.com` (if applicable)

---

## 10. Rubric alignment (Test Cases / 3 pts)

| Level | Evidence in YorkLanes |
|-------|----------------------|
| **Outstanding (3)** | 167 automated tests + pytest + RTM for finance + 80+ manual IDs + smoke/doctor |
| **Excellent (2)** | Strong unit coverage; manual doc exists |
| **Satisfactory (1)** | Some tests, incomplete traceability |
| **Missing (0)** | No documented or automated tests |

**Talking point:** “Every major feature has both automated logic tests and numbered manual test cases traceable to requirements.”
