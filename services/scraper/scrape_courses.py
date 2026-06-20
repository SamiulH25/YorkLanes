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


def load_json_courses(path: Path) -> list[CourseRecord]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    entries = payload.get("courses", payload)
    return [from_yoki_entry(entry, source=f"json:{path.name}") for entry in entries]


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


def cmd_yoki(args: argparse.Namespace) -> int:
    subject = args.subject.lower()
    url = f"{YOKI_BASE}/{subject}.json"
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    payload = response.json()
    courses = [from_yoki_entry(entry, source="yoki") for entry in payload.get("courses", [])]
    out = Path(args.out)
    save_json(courses, out)
    print(f"Downloaded {len(courses)} {subject.upper()} courses from Yoki cache")
    print(f"Wrote {out}")
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
