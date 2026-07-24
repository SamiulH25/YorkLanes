# Data lake (Supabase Storage)

YorkLanes uses a **two-layer data architecture**:

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Data lake** | Supabase Storage bucket `data-lake` | Append-only raw JSON archives from scrapes |
| **Warehouse** | Postgres tables (`courses`, `course_sections`, …) | Curated data the API and web app query |

The lake preserves every scrape snapshot for auditing, reprocessing, and coursework requirements. Postgres holds the latest normalized rows the product uses.

## Components

- **Storage bucket:** `data-lake` (private) — created by `supabase/migrations/20260723000000_data_lake.sql`
- **Catalog table:** `data_lake_catalog` — index of uploaded objects (path, size, record count, metadata)
- **Uploader:** `services/scraper/data_lake.py` — called automatically by scraper commands when configured

## Object layout

```
data-lake/
  sections/2026/07/23/20260723T153045Z_batch-2026-S.json
  courses/2026/07/23/20260723T153100Z_cdm-eecs.json
```

Paths are UTC-dated so repeated scrapes never overwrite history.

## Setup (maintainer)

1. Apply the migration:

```bash
npm run supabase:push
```

2. Add to `apps/api/.env` (from Supabase dashboard → **Settings → API**):

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-secret>
SUPABASE_DB_URL=<existing postgres url>
```

**Never** commit or expose `SUPABASE_SERVICE_ROLE_KEY` in the web app. Scraper and maintainer machines only.

3. Verify upload:

```bash
npm run scraper:lake:upload
```

## Automatic archiving

When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, these commands archive output JSON to the lake:

- `scraper:schedule`, `scraper:schedule:all`, `scraper:schedule:fixture`
- `scraper:yoki`, `scraper:yoki:batch`, `scraper:cdm`, `scraper:fixture`
- `scraper:schedule:db` (archives the input file after a successful warehouse import)

Skip with `--skip-lake` on any scraper command.

Typical lab workflow:

```bash
npm run scraper:schedule:all -- --term "2026-2027 FW"
npm run scraper:schedule:db
```

You should see:

```
Archived to data lake: data-lake/sections/2026/07/23/...json (123456 bytes)
```

## Inspect the catalog

In Supabase SQL editor or `psql`:

```sql
select dataset_kind, object_path, record_count, byte_size, uploaded_at
from data_lake_catalog
order by uploaded_at desc
limit 20;
```

Browse raw files in Supabase dashboard → **Storage** → `data-lake`.

## Related

- [database.md](./database.md) — warehouse tables
- [services/scraper/README.md](../services/scraper/README.md) — scrape commands
- [architecture.md](./architecture.md) — system overview
