# Course catalogue scraper

Populates Supabase `courses` and `course_prerequisites` for Jericho's Course Explorer.

## Sources

| Mode | Command | When to use |
|------|---------|-------------|
| **Fixture** (offline) | `python scrape_courses.py fixture` | CI, local dev, always works |
| **Yoki cache** | `python scrape_courses.py yoki --subject eecs` | Real York data without hitting CDM |
| **CDM live** | `python scrape_courses.py cdm --subject eecs` | From your machine if York does not block you |
| **Database import** | `python scrape_courses.py db --input output/...json` | After scrape, writes to Supabase |

Primary live target: [York CDM](https://w2prod.sis.yorku.ca/Apps/WebObjects/cdm) (WebObjects, faculty/subject search).

CDM may return **403** from cloud IPs or automated clients. Use `fixture` or `yoki` for testing when that happens.

## Setup

```powershell
cd services/scraper
python -m pip install -r requirements.txt
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

## Import into Supabase

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

## From repo root

```powershell
npm run scraper:test
npm run scraper:fixture
npm run scraper:yoki
```
