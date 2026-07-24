#!/usr/bin/env python3
"""YorkLanes course catalogue scraper CLI."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

from catalog import CourseRecord, SectionRecord, from_yoki_entry
from cdm_http import CdmChallengeError
from cdm_scraper import CdmScraper
from db_importer import upsert_courses, upsert_sections
from data_lake import DataLakeError, maybe_archive_json_file
from schedule_scraper import DEFAULT_WORKERS, ScheduleScraper
from timetable_parser import PassportYorkRequiredError

ROOT = Path(__file__).parent
FIXTURES = ROOT / "fixtures"
OUTPUT = ROOT / "output"
YOKI_BASE = "https://raw.githubusercontent.com/SSADC-at-york/Yoki/main/docs/data/courses"


def report_cdm_challenge(url: str | None = None) -> int:
    where = f"\nBlocked URL: {url}\n" if url else "\n"
    print(
        "York CDM is protected by Cloudflare and rejected this HTTP client (HTTP 403)."
        f"{where}"
        "This is not a York network problem — curl/requests cannot pass the bot check,"
        " even on campus.\n\n"
        "One-time fixes:\n"
        "  A) Import cookies from a browser (no Playwright download):\n"
        "     1. Open CDM in Firefox/Chrome on the lab desktop\n"
        "     2. Export cookies for w2prod.sis.yorku.ca (cookies.txt extension)\n"
        "     3. npm run scraper:cdm:import-cookies -- path/to/cookies.txt\n"
        "  B) Playwright bootstrap (needs ~200MB disk; use /tmp if home quota is full):\n"
        "     npm run scraper:cdm:browser-setup\n"
        "     npm run scraper:cdm:bootstrap\n\n"
        "Then retry your scrape command.\n\n"
        "Offline alternative:\n"
        "  npm run scraper:schedule:fixture\n"
        "  npm run scraper:schedule:db",
        file=sys.stderr,
    )
    return 1


def report_cdm_block() -> int:
    return report_cdm_challenge()


def handle_cdm_failure(exc: Exception) -> int | None:
    if isinstance(exc, PassportYorkRequiredError):
        print(str(exc), file=sys.stderr)
        return 1
    if isinstance(exc, CdmChallengeError):
        return report_cdm_challenge(exc.url)
    if isinstance(exc, requests.HTTPError) and exc.response is not None and exc.response.status_code == 403:
        return report_cdm_challenge(str(exc.response.url))
    return None
DEFAULT_YOKI_SUBJECTS = (
    "eecs",
    "math",
    "phys",
    "chem",
    "biol",
    "psyc",
    "econ",
    "adms",
    "engl",
    "phil",
)


def load_json_courses(path: Path) -> list[CourseRecord]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    entries = payload.get("courses", payload)
    courses: list[CourseRecord] = []

    for entry in entries:
        if "title" in entry and "code" in entry:
            courses.append(
                CourseRecord(
                    code=str(entry["code"]),
                    title=str(entry["title"]),
                    credits=float(entry["credits"]) if entry.get("credits") is not None else None,
                    department=entry.get("department"),
                    description=entry.get("description"),
                    prerequisite_codes=list(entry.get("prerequisite_codes") or []),
                    source=entry.get("source"),
                )
            )
            continue

        courses.append(from_yoki_entry(entry, source=f"json:{path.name}"))

    return courses


def save_json(courses: list[CourseRecord], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"courses": [course.to_dict() for course in courses]}, indent=2),
        encoding="utf-8",
    )


def load_json_sections(path: Path) -> list[SectionRecord]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    entries = payload.get("sections", payload.get("courses", []))
    sections: list[SectionRecord] = []
    for entry in entries:
        sections.append(
            SectionRecord(
                term=str(entry.get("term", "")),
                course_code=str(entry.get("course_code", "")),
                section_code=str(entry.get("section_code", "")),
                day=str(entry.get("day", "")),
                start_time=str(entry.get("start_time", "")),
                end_time=str(entry.get("end_time", "")),
                duration=entry.get("duration"),
                campus=entry.get("campus"),
                room=entry.get("room"),
                instructor=entry.get("instructor"),
                delivery_mode=entry.get("delivery_mode"),
                source=entry.get("source"),
            )
        )
    return sections


def cmd_fixture(args: argparse.Namespace) -> int:
    fixture = Path(args.fixture)
    courses = load_json_courses(fixture)
    out = Path(args.out)
    save_json(courses, out)
    print(f"Loaded {len(courses)} courses from {fixture}")
    print(f"Wrote {out}")
    _archive_to_data_lake(args, out, dataset_kind="courses", label=fixture.stem)
    return 0


def download_yoki_subject(subject: str) -> list[CourseRecord]:
    url = f"{YOKI_BASE}/{subject.lower()}.json"
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    payload = response.json()
    return [from_yoki_entry(entry, source="yoki") for entry in payload.get("courses", [])]


def cmd_yoki(args: argparse.Namespace) -> int:
    courses = download_yoki_subject(args.subject)
    out = Path(args.out)
    save_json(courses, out)
    print(f"Downloaded {len(courses)} {args.subject.upper()} courses from Yoki cache")
    print(f"Wrote {out}")
    _archive_to_data_lake(
        args,
        out,
        dataset_kind="courses",
        label=f"yoki-{args.subject.lower()}",
        metadata={"source": "yoki", "subject": args.subject.lower()},
    )
    return 0


def cmd_yoki_batch(args: argparse.Namespace) -> int:
    subjects = [item.strip().lower() for item in args.subjects.split(",") if item.strip()]
    all_courses: list[CourseRecord] = []
    seen: set[str] = set()

    for subject in subjects:
        try:
            courses = download_yoki_subject(subject)
        except requests.HTTPError as exc:
            print(f"Skipping {subject.upper()}: {exc}", file=sys.stderr)
            continue

        added = 0
        for course in courses:
            if course.code in seen:
                continue
            seen.add(course.code)
            all_courses.append(course)
            added += 1
        print(f"  {subject.upper()}: {added} courses")

    out = Path(args.out)
    save_json(all_courses, out)
    print(f"Wrote {len(all_courses)} total courses to {out}")
    _archive_to_data_lake(
        args,
        out,
        dataset_kind="courses",
        label="yoki-batch",
        metadata={"source": "yoki", "subjects": subjects},
    )
    return 0


def cmd_cdm(args: argparse.Namespace) -> int:
    scraper = CdmScraper()
    try:
        courses = scraper.scrape_subject(args.subject)
    except Exception as exc:
        code = handle_cdm_failure(exc)
        if code is not None:
            return code
        raise
    out = Path(args.out)
    save_json(courses, out)
    print(f"Scraped {len(courses)} {args.subject.upper()} courses from CDM")
    print(f"Wrote {out}")
    _archive_to_data_lake(
        args,
        out,
        dataset_kind="courses",
        label=f"cdm-{args.subject.lower()}",
        metadata={"source": "cdm", "subject": args.subject.lower()},
    )
    return 0


def _resolve_term(scraper: ScheduleScraper, term_arg: str):
    from catalog import default_current_terms, normalize_term

    terms = scraper.list_terms()
    if term_arg in ("current", ""):
        return terms[0]

    for term in terms:
        if term.code.lower() == term_arg.lower():
            return term

    parsed = normalize_term(term_arg)
    if parsed.term_kind != "UNKNOWN":
        return parsed

    codes = ", ".join(t.code for t in default_current_terms())
    raise ValueError(f"Unknown term '{term_arg}'. Try: current, or one of {codes}")


def _write_sections_json(sections: list[SectionRecord], out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps({"sections": [s.to_dict() for s in sections]}, indent=2),
        encoding="utf-8",
    )


def _archive_to_data_lake(
    args: argparse.Namespace,
    path: Path,
    *,
    dataset_kind: str,
    label: str,
    metadata: dict | None = None,
) -> None:
    if getattr(args, "skip_lake", False):
        return

    try:
        result = maybe_archive_json_file(
            path,
            dataset_kind=dataset_kind,
            label=label,
            metadata=metadata,
        )
    except DataLakeError as exc:
        print(f"Data lake upload failed: {exc}", file=sys.stderr)
        return

    if result is None:
        return

    print(
        f"Archived to data lake: {result.bucket_id}/{result.object_path} "
        f"({result.byte_size} bytes)"
    )


def cmd_schedule(args: argparse.Namespace) -> int:
    scraper = ScheduleScraper(verbose=not args.quiet, workers=args.workers)
    try:
        term = _resolve_term(scraper, args.term)
        worker_note = f", {scraper.workers} workers" if scraper.workers > 1 else ""
        print(f"Scraping {args.subject.upper()} for {term.code}{worker_note}...", flush=True)
        sections = scraper.scrape_subject_term(args.subject, term, all_terms=args.all_terms)
    except Exception as exc:
        code = handle_cdm_failure(exc)
        if code is not None:
            return code
        raise
    out = Path(args.out)
    _write_sections_json(sections, out)
    scope = "all terms" if args.all_terms else term.code
    print(f"Scraped {len(sections)} section meetings for {args.subject.upper()} ({scope})")
    print(f"Wrote {out}")
    _archive_to_data_lake(
        args,
        out,
        dataset_kind="sections",
        label=f"{args.subject.lower()}-{term.code.replace(' ', '-')}",
        metadata={"source": "cdm", "subject": args.subject.lower(), "term": term.code},
    )
    return 0


def cmd_schedule_batch(args: argparse.Namespace) -> int:
    subjects = [item.strip().lower() for item in args.subjects.split(",") if item.strip()]
    scraper = ScheduleScraper(verbose=not args.quiet, workers=args.workers)
    try:
        term = _resolve_term(scraper, args.term)
    except Exception as exc:
        code = handle_cdm_failure(exc)
        if code is not None:
            return code
        raise

    scope = "all terms" if args.all_terms else term.code
    worker_note = f", {scraper.workers} workers per subject" if scraper.workers > 1 else ""
    print(f"Scraping {len(subjects)} subjects for {scope}{worker_note}...", flush=True)

    all_sections: list[SectionRecord] = []
    seen: set[tuple[str, str, str, str, str, str]] = set()

    for index, subject in enumerate(subjects, start=1):
        print(f"\n[{index}/{len(subjects)}] {subject.upper()}", flush=True)
        try:
            sections = scraper.scrape_subject_term(subject, term, all_terms=args.all_terms)
        except Exception as exc:
            code = handle_cdm_failure(exc)
            if code is not None:
                return code
            print(f"Skipping {subject.upper()}: {exc}", file=sys.stderr)
            continue

        added = 0
        for record in sections:
            key = (
                record.term,
                record.course_code,
                record.section_code,
                record.day,
                record.start_time,
                record.end_time,
            )
            if key in seen:
                continue
            seen.add(key)
            all_sections.append(record)
            added += 1
        print(f"  {subject.upper()}: {added} section meetings")

    out = Path(args.out)
    _write_sections_json(all_sections, out)
    print(f"\nWrote {len(all_sections)} total section meetings ({scope}) to {out}")
    _archive_to_data_lake(
        args,
        out,
        dataset_kind="sections",
        label=f"batch-{scope.replace(' ', '-')}",
        metadata={"source": "cdm", "subjects": subjects, "term": scope},
    )
    return 0


def cmd_schedule_fixture(args: argparse.Namespace) -> int:
    scraper = ScheduleScraper()
    sections = scraper.scrape_from_html(Path(args.fixture), args.subject, args.term)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps({"sections": [s.to_dict() for s in sections]}, indent=2),
        encoding="utf-8",
    )
    print(f"Parsed {len(sections)} section meetings from fixtures in {args.fixture}")
    print(f"Wrote {out}")
    _archive_to_data_lake(
        args,
        out,
        dataset_kind="sections",
        label=f"fixture-{args.subject.lower()}",
        metadata={"source": "fixture", "subject": args.subject.lower(), "term": args.term},
    )
    return 0


def cmd_cdm_bootstrap(args: argparse.Namespace) -> int:
    from cdm_browser import bootstrap_cdm_session

    try:
        path = bootstrap_cdm_session(headless=args.headless)
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        print(
            "\nIf Playwright failed to download Chromium (disk quota error -122), "
            "use cookie import instead:\n"
            "  npm run scraper:cdm:import-cookies -- path/to/cookies.txt",
            file=sys.stderr,
        )
        return 1

    print(f"Saved CDM browser session to {path}")
    print("Retry your scrape command (for example: npm run scraper:schedule:all)")
    return 0


def cmd_cdm_import_cookies(args: argparse.Namespace) -> int:
    from cdm_cookies import import_cookie_file

    source = Path(args.cookies_file)
    if not source.is_file():
        print(f"Cookie file not found: {source}", file=sys.stderr)
        return 1

    out = Path(args.out) if args.out else None
    try:
        target = import_cookie_file(source, out)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        print(
            "\nMake sure you exported cookies while logged into York CDM in a real browser.",
            file=sys.stderr,
        )
        return 1

        print(f"Imported CDM cookies to {target}")
        print(
            "For schedule scraping, export cookies while logged into Passport York on CDM "
            "(meeting times are hidden without a PPY session)."
        )
        print("Retry your scrape command (for example: npm run scraper:schedule:all)")
    return 0


def cmd_db(args: argparse.Namespace) -> int:
    load_dotenv(ROOT.parent.parent / "apps" / "api" / ".env")
    input_path = Path(args.input)
    if args.kind == "sections":
        sections = load_json_sections(input_path)
        stats = upsert_sections(sections, dry_run=args.dry_run)
        action = "Would import" if args.dry_run else "Imported"
        print(f"{action} {stats['sections']} section meetings")
        if not args.dry_run:
            _archive_to_data_lake(
                args,
                input_path,
                dataset_kind="sections",
                label=input_path.stem,
                metadata={"source": "db-import", "kind": "sections"},
            )
        return 0

    courses = load_json_courses(input_path)
    stats = upsert_courses(courses, dry_run=args.dry_run)
    action = "Would import" if args.dry_run else "Imported"
    print(f"{action} {stats['courses']} courses, {stats['prerequisites']} prerequisite edges")
    if not args.dry_run:
        _archive_to_data_lake(
            args,
            input_path,
            dataset_kind="courses",
            label=input_path.stem,
            metadata={"source": "db-import", "kind": "courses"},
        )
    return 0


def cmd_lake_upload(args: argparse.Namespace) -> int:
    from data_lake import archive_json_file

    try:
        result = archive_json_file(
            Path(args.input),
            dataset_kind=args.kind,
            label=args.label or Path(args.input).stem,
            metadata={"source": "manual-upload"},
        )
    except DataLakeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(
        f"Uploaded {result.byte_size} bytes to {result.bucket_id}/{result.object_path}"
        + (f" ({result.record_count} records)" if result.record_count is not None else "")
    )
    if result.catalog_id:
        print(f"Catalog id: {result.catalog_id}")
    return 0


def add_lake_flags(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--skip-lake",
        action="store_true",
        help="Do not archive output JSON to Supabase Storage data lake",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="YorkLanes course catalogue scraper")
    sub = parser.add_subparsers(dest="command", required=True)

    fixture = sub.add_parser("fixture", help="Load local fixture JSON (offline test)")
    fixture.add_argument("--fixture", default=str(FIXTURES / "eecs_sample.json"))
    fixture.add_argument("--out", default=str(OUTPUT / "fixture_courses.json"))
    add_lake_flags(fixture)
    fixture.set_defaults(func=cmd_fixture)

    yoki = sub.add_parser("yoki", help="Download a subject JSON cache from SSADC Yoki")
    yoki.add_argument("--subject", default="eecs")
    yoki.add_argument("--out", default=str(OUTPUT / "yoki_courses.json"))
    add_lake_flags(yoki)
    yoki.set_defaults(func=cmd_yoki)

    yoki_batch = sub.add_parser("yoki-batch", help="Download multiple subjects from Yoki")
    yoki_batch.add_argument(
        "--subjects",
        default=",".join(DEFAULT_YOKI_SUBJECTS),
        help="Comma-separated subject codes (default: common faculties)",
    )
    yoki_batch.add_argument("--out", default=str(OUTPUT / "catalogue.json"))
    add_lake_flags(yoki_batch)
    yoki_batch.set_defaults(func=cmd_yoki_batch)

    cdm = sub.add_parser("cdm", help="Live scrape one subject from York CDM (may be blocked)")
    cdm.add_argument("--subject", default="eecs")
    cdm.add_argument("--out", default=str(OUTPUT / "cdm_courses.json"))
    add_lake_flags(cdm)
    cdm.set_defaults(func=cmd_cdm)

    schedule = sub.add_parser("schedule", help="Live scrape section timetables for a subject (may be blocked)")
    schedule.add_argument("--subject", default="eecs")
    schedule.add_argument("--term", default="current", help="Term code (e.g. '2026-2027 FW') or 'current'")
    schedule.add_argument("--all-terms", action="store_true", help="Scrape every available term for this subject")
    schedule.add_argument("--quiet", action="store_true", help="Suppress per-course progress output")
    schedule.add_argument(
        "--workers",
        type=int,
        default=DEFAULT_WORKERS,
        help=f"Parallel course detail fetches (default: {DEFAULT_WORKERS}; use 1 for sequential)",
    )
    schedule.add_argument("--out", default=str(OUTPUT / "sections.json"))
    add_lake_flags(schedule)
    schedule.set_defaults(func=cmd_schedule)

    schedule_batch = sub.add_parser(
        "schedule-batch",
        help="Live scrape section timetables for multiple subjects (may be blocked)",
    )
    schedule_batch.add_argument(
        "--subjects",
        default=",".join(DEFAULT_YOKI_SUBJECTS),
        help="Comma-separated subject codes (default: common faculties)",
    )
    schedule_batch.add_argument("--term", default="current", help="Term code (e.g. '2026-2027 FW') or 'current'")
    schedule_batch.add_argument("--all-terms", action="store_true", help="Scrape every available term per subject")
    schedule_batch.add_argument("--quiet", action="store_true", help="Suppress per-course progress output")
    schedule_batch.add_argument(
        "--workers",
        type=int,
        default=DEFAULT_WORKERS,
        help=f"Parallel course detail fetches per subject (default: {DEFAULT_WORKERS}; use 1 for sequential)",
    )
    schedule_batch.add_argument("--out", default=str(OUTPUT / "sections.json"))
    add_lake_flags(schedule_batch)
    schedule_batch.set_defaults(func=cmd_schedule_batch)

    schedule_fixture = sub.add_parser("schedule-fixture", help="Parse section timetables from saved HTML (offline)")
    schedule_fixture.add_argument("--fixture", default=str(FIXTURES / "sections"))
    schedule_fixture.add_argument("--subject", default="eecs")
    schedule_fixture.add_argument("--term", default="2026-2027 FW")
    schedule_fixture.add_argument("--out", default=str(OUTPUT / "sections.json"))
    add_lake_flags(schedule_fixture)
    schedule_fixture.set_defaults(func=cmd_schedule_fixture)

    bootstrap = sub.add_parser(
        "cdm-bootstrap",
        help="Open a browser to pass Cloudflare and save CDM cookies for live scrapes",
    )
    bootstrap.add_argument(
        "--headless",
        action="store_true",
        help="Run Chromium headless (may fail the challenge; omit on SSH without a display)",
    )
    bootstrap.set_defaults(func=cmd_cdm_bootstrap)

    import_cookies = sub.add_parser(
        "cdm-import-cookies",
        help="Import cookies.txt or Playwright JSON from a browser session on York CDM",
    )
    import_cookies.add_argument("cookies_file", help="Path to cookies.txt or cdm_session.json export")
    import_cookies.add_argument("--out", default=str(ROOT / "cdm_session.json"))
    import_cookies.set_defaults(func=cmd_cdm_import_cookies)

    db = sub.add_parser("db", help="Upsert scraped JSON into Postgres")
    db.add_argument("--input", default=str(OUTPUT / "fixture_courses.json"))
    db.add_argument("--kind", choices=("courses", "sections"), default="courses")
    db.add_argument("--dry-run", action="store_true")
    add_lake_flags(db)
    db.set_defaults(func=cmd_db)

    lake_upload = sub.add_parser("lake-upload", help="Upload a JSON file to the Supabase data lake")
    lake_upload.add_argument("--input", required=True, help="Local JSON file to archive")
    lake_upload.add_argument(
        "--kind",
        choices=("courses", "sections", "catalogue", "raw"),
        default="raw",
        help="Dataset folder prefix in the data-lake bucket",
    )
    lake_upload.add_argument("--label", help="Filename label (default: input stem)")
    lake_upload.set_defaults(func=cmd_lake_upload)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return args.func(args)
    except Exception as exc:  # noqa: BLE001
        code = handle_cdm_failure(exc)
        if code is not None:
            return code
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
