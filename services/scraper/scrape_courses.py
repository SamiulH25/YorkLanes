#!/usr/bin/env python3
"""YorkLanes course catalogue scraper CLI."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

from catalog import CourseRecord, from_yoki_entry
from cdm_scraper import CdmScraper
from db_importer import upsert_courses

ROOT = Path(__file__).parent
FIXTURES = ROOT / "fixtures"
OUTPUT = ROOT / "output"
YOKI_BASE = "https://raw.githubusercontent.com/SSADC-at-york/Yoki/main/docs/data/courses"
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
    courses = scraper.scrape_subject(args.subject)
    out = Path(args.out)
    save_json(courses, out)
    print(f"Scraped {len(courses)} {args.subject.upper()} courses from CDM")
    print(f"Wrote {out}")
    return 0


def cmd_db(args: argparse.Namespace) -> int:
    load_dotenv(ROOT.parent.parent / "apps" / "api" / ".env")
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

    db = sub.add_parser("db", help="Upsert scraped JSON into Postgres")
    db.add_argument("--input", default=str(OUTPUT / "fixture_courses.json"))
    db.add_argument("--dry-run", action="store_true")
    db.set_defaults(func=cmd_db)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return args.func(args)
    except Exception as exc:  # noqa: BLE001
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
