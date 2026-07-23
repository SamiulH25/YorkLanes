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
from schedule_scraper import ScheduleScraper

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
        "One-time fix (opens a real browser, saves cookies for later scrapes):\n"
        "  npm run scraper:cdm:bootstrap\n\n"
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
    return 0


def _resolve_term(scraper: ScheduleScraper, term_arg: str):
    terms = scraper.list_terms()
    if not terms:
        raise RuntimeError("Could not enumerate CDM session terms")
    if term_arg in ("current", ""):
        return terms[0]
    for term in terms:
        if term.code.lower() == term_arg.lower():
            return term
    codes = ", ".join(t.code for t in terms)
    raise ValueError(f"Unknown term '{term_arg}'. Available: {codes}")


def _write_sections_json(sections: list[SectionRecord], out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps({"sections": [s.to_dict() for s in sections]}, indent=2),
        encoding="utf-8",
    )


def cmd_schedule(args: argparse.Namespace) -> int:
    scraper = ScheduleScraper()
    try:
        term = _resolve_term(scraper, args.term)
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
    return 0


def cmd_schedule_batch(args: argparse.Namespace) -> int:
    subjects = [item.strip().lower() for item in args.subjects.split(",") if item.strip()]
    scraper = ScheduleScraper()
    try:
        term = _resolve_term(scraper, args.term)
    except Exception as exc:
        code = handle_cdm_failure(exc)
        if code is not None:
            return code
        raise

    all_sections: list[SectionRecord] = []
    seen: set[tuple[str, str, str, str, str, str]] = set()

    for subject in subjects:
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
    scope = "all terms" if args.all_terms else term.code
    print(f"Wrote {len(all_sections)} total section meetings ({scope}) to {out}")
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
    return 0


def cmd_cdm_bootstrap(args: argparse.Namespace) -> int:
    from cdm_browser import bootstrap_cdm_session

    try:
        path = bootstrap_cdm_session(headless=args.headless)
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(f"Saved CDM browser session to {path}")
    print("Retry your scrape command (for example: npm run scraper:schedule:all)")
    return 0


def cmd_db(args: argparse.Namespace) -> int:
    load_dotenv(ROOT.parent.parent / "apps" / "api" / ".env")
    if args.kind == "sections":
        sections = load_json_sections(Path(args.input))
        stats = upsert_sections(sections, dry_run=args.dry_run)
        action = "Would import" if args.dry_run else "Imported"
        print(f"{action} {stats['sections']} section meetings")
        return 0

    courses = load_json_courses(Path(args.input))
    stats = upsert_courses(courses, dry_run=args.dry_run)
    action = "Would import" if args.dry_run else "Imported"
    print(f"{action} {stats['courses']} courses, {stats['prerequisites']} prerequisite edges")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="YorkLanes course catalogue scraper")
    sub = parser.add_subparsers(dest="command", required=True)

    fixture = sub.add_parser("fixture", help="Load local fixture JSON (offline test)")
    fixture.add_argument("--fixture", default=str(FIXTURES / "eecs_sample.json"))
    fixture.add_argument("--out", default=str(OUTPUT / "fixture_courses.json"))
    fixture.set_defaults(func=cmd_fixture)

    yoki = sub.add_parser("yoki", help="Download a subject JSON cache from SSADC Yoki")
    yoki.add_argument("--subject", default="eecs")
    yoki.add_argument("--out", default=str(OUTPUT / "yoki_courses.json"))
    yoki.set_defaults(func=cmd_yoki)

    yoki_batch = sub.add_parser("yoki-batch", help="Download multiple subjects from Yoki")
    yoki_batch.add_argument(
        "--subjects",
        default=",".join(DEFAULT_YOKI_SUBJECTS),
        help="Comma-separated subject codes (default: common faculties)",
    )
    yoki_batch.add_argument("--out", default=str(OUTPUT / "catalogue.json"))
    yoki_batch.set_defaults(func=cmd_yoki_batch)

    cdm = sub.add_parser("cdm", help="Live scrape one subject from York CDM (may be blocked)")
    cdm.add_argument("--subject", default="eecs")
    cdm.add_argument("--out", default=str(OUTPUT / "cdm_courses.json"))
    cdm.set_defaults(func=cmd_cdm)

    schedule = sub.add_parser("schedule", help="Live scrape section timetables for a subject (may be blocked)")
    schedule.add_argument("--subject", default="eecs")
    schedule.add_argument("--term", default="current", help="Term code (e.g. '2026-2027 FW') or 'current'")
    schedule.add_argument("--all-terms", action="store_true", help="Scrape every available term for this subject")
    schedule.add_argument("--out", default=str(OUTPUT / "sections.json"))
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
    schedule_batch.add_argument("--out", default=str(OUTPUT / "sections.json"))
    schedule_batch.set_defaults(func=cmd_schedule_batch)

    schedule_fixture = sub.add_parser("schedule-fixture", help="Parse section timetables from saved HTML (offline)")
    schedule_fixture.add_argument("--fixture", default=str(FIXTURES / "sections"))
    schedule_fixture.add_argument("--subject", default="eecs")
    schedule_fixture.add_argument("--term", default="2026-2027 FW")
    schedule_fixture.add_argument("--out", default=str(OUTPUT / "sections.json"))
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

    db = sub.add_parser("db", help="Upsert scraped JSON into Postgres")
    db.add_argument("--input", default=str(OUTPUT / "fixture_courses.json"))
    db.add_argument("--kind", choices=("courses", "sections"), default="courses")
    db.add_argument("--dry-run", action="store_true")
    db.set_defaults(func=cmd_db)

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
