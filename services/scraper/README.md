# Course catalogue + schedule scrapers

Populates Supabase:

- `courses` / `course_prerequisites` — catalogue for the Course Explorer
- `course_sections` — section meeting times for courses, plan warnings, and the schedule builder

## Sources

| Mode | Command | When to use |
|------|---------|-------------|
| **Fixture** (offline) | `python scrape_courses.py fixture` | CI, local dev, always works |
| **Yoki cache** | `python scrape_courses.py yoki --subject eecs` | Real York data without hitting CDM |
| **CDM live** | `python scrape_courses.py cdm --subject eecs` | From your machine if York does not block you |
| **Database import** | `python scrape_courses.py db --input output/...json` | After scrape, writes to Supabase |

Primary live target: [York CDM](https://w2prod.sis.yorku.ca/Apps/WebObjects/cdm) (WebObjects, faculty/subject search).

CDM may return **HTTP 403** for plain `requests` clients. York CDM is behind **Cloudflare bot protection** — this happens on campus networks too, not just cloud/VPN IPs.

**Live scrape workflow (pick one):**

### A) Cookie import — best for lab machines with disk quotas

No Playwright download (~200 MB). Use the lab desktop browser:

1. Open https://w2prod.sis.yorku.ca/Apps/WebObjects/cdm in Firefox/Chrome
2. Complete the Cloudflare check if shown
3. Export cookies for `w2prod.sis.yorku.ca` using a **cookies.txt** browser extension
   (search: "cookies.txt" for Firefox or Chrome)
4. Copy the file to the lab (e.g. `~/cdm-cookies.txt`)
5. Import and scrape:

```bash
npm run scraper:cdm:import-cookies -- ~/cdm-cookies.txt
npm run scraper:schedule:all
npm run scraper:schedule:db
```

### B) Playwright bootstrap — if you have disk space

Installs Chromium to `/tmp` (avoids home directory quota error `-122`):

```bash
npm run scraper:cdm:browser-setup   # once: Playwright + Chromium in /tmp
npm run scraper:cdm:bootstrap       # once per session: opens browser, saves cookies
npm run scraper:schedule:all
npm run scraper:schedule:db
```

`cdm-bootstrap` opens Chromium. Complete any Cloudflare check in the window; cookies are saved to `services/scraper/cdm_session.json` for later scrapes.

Use `schedule-fixture` or `yoki` when you cannot run a browser (CI, headless SSH).

## Setup

From repo root (recommended):

```bash
npm run scraper:setup
```

Or manually:

```bash
cd services/scraper
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt   # Linux/macOS
# .venv\Scripts\pip install -r requirements.txt   # Windows
```

## Quick test (no network)

```powershell
python test_scraper.py
python scrape_courses.py fixture
```

Output: `output/fixture_courses.json`

## Test with real EECS data (Yoki public cache)

```powershell
python scrape_courses.py yoki --subject eecs --out output/eecs.json
```

## Import courses into Supabase

Uses `SUPABASE_DB_URL` or `DATABASE_URL` from `apps/api/.env`.

```powershell
python scrape_courses.py db --input output/eecs.json --dry-run
python scrape_courses.py db --input output/eecs.json
```

## Live CDM scrape (one subject)

```powershell
python scrape_courses.py cdm --subject eecs --out output/cdm_eecs.json
```

Respectful defaults: 1.5s delay between requests, identifiable User-Agent.

## Schedule / section scraper

Scrapes per-course CDM detail tables into `course_sections` (one row per meeting day).

| Mode | From repo root | Notes |
|------|----------------|-------|
| Fixture | `npm run scraper:schedule:fixture` | Offline HTML → `output/sections.json` |
| Live one subject | `npm run scraper:schedule` | EECS, current term |
| Live all subjects | `npm run scraper:schedule:all` | Default subject list, current term |
| Live all terms (one subject) | `npm run scraper:schedule:all-terms` | EECS across every CDM term |
| DB import | `npm run scraper:schedule:db` | Upserts `course_sections` |

`scraper:schedule:all` uses the same default subjects as `scraper:yoki:batch` (eecs, math, phys, chem, biol, psyc, econ, adms, engl, phil). Override with:

```powershell
python scrape_courses.py schedule-batch --subjects eecs,math,psyc --out output/sections.json
```

Term codes look like `2026-2027 FW`, `2026 F`, `2026 W`, `2026 S`.  
`FW` counts as both Fall and Winter for plan season warnings and offering summaries.

Consumed by:

- `GET /api/course-sections`
- `GET /api/course-sections/summary`
- Degree plan `schedule_warnings` on `GET /api/plans/:id/graph`
- Course detail **Typical scheduling** panel

Integration guide for the schedule page: [`docs/features/schedule-integration.md`](../../docs/features/schedule-integration.md)

## From repo root

```powershell
npm run scraper:test
npm run scraper:fixture
npm run scraper:yoki
npm run scraper:yoki:batch
npm run scraper:db
npm run scraper:import
npm run scraper:schedule:fixture
npm run scraper:schedule:db
```

`scraper:import` runs fixture scrape + DB import (offline dev bootstrap).

`scraper:yoki:batch` downloads multiple subjects into `output/catalogue.json` (skips subjects that 404).

Course codes are normalized to `SUBJECT NUMBER` (e.g. `EECS 4314`) on import.
