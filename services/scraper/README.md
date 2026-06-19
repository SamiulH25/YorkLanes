# Python course catalogue scraper (future)

This service is not scaffolded yet. The design doc specifies BeautifulSoup or Scrapy to populate PostgreSQL `courses` and `course_prerequisites` tables from the YorkU catalogue:

https://w2prod.sis.yorku.ca/Apps/WebObjects/cdm

## When to add

After the dashboard foundation is running (auth, DB, deployment), create:

```
services/scraper/
  requirements.txt
  scrape_courses.py
  README.md
```

## Integration

1. Scraper writes to the same PostgreSQL database defined in `apps/api/src/db/schema.sql`
2. Jericho's Course Explorer reads from those tables via `apps/api/src/routes/courses.ts`
3. Run scraper as a manual job or scheduled task (cron, GitHub Action, etc.)

Only build this if no public YorkU course API is available.
