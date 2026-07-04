"""Offline tests for the course scraper."""
from __future__ import annotations

import json
from pathlib import Path

from catalog import extract_prerequisite_codes, from_yoki_entry, normalize_stored_code, parse_course_codes
from scrape_courses import load_json_courses, save_json

FIXTURE = Path(__file__).parent / "fixtures" / "eecs_sample.json"


def test_parse_prerequisites_from_description() -> None:
    text = "Prerequisites: LE/EECS 1011 3.00 or LE/EECS 1012 3.00. Course credit exclusions: LE/EECS 1541 3.00."
    codes = extract_prerequisite_codes(text, "1021")
    assert "EECS 1011" in codes
    assert "EECS 1012" in codes
    assert "EECS 1541" not in codes


def test_fixture_load_and_roundtrip() -> None:
    courses = load_json_courses(FIXTURE)
    assert len(courses) == 6
    codes = {course.code for course in courses}
    assert "EECS 1011" in codes
    assert "EECS 1021" in codes

    by_code = {course.code: course for course in courses}
    assert "EECS 1011" in by_code["EECS 1021"].prerequisite_codes

    out = Path(__file__).parent / "output" / "test_roundtrip.json"
    save_json(courses, out)
    reloaded = load_json_courses(out)
    assert len(reloaded) == len(courses)


def test_yoki_entry_mapping() -> None:
    entry = {
        "dept": "eecs",
        "code": "4314",
        "credit": 3.0,
        "name": "Software Team Project",
        "prereqs": "eecs3311 eecs3421",
        "desc": "Capstone team project.",
    }
    course = from_yoki_entry(entry)
    assert course.code == "EECS 4314"
    assert course.department == "EECS"


def test_normalize_stored_code() -> None:
    assert normalize_stored_code("EECS4314") == "EECS 4314"
    assert normalize_stored_code("eecs 1021") == "EECS 1021"
    assert normalize_stored_code("MATH 1013") == "MATH 1013"


def main() -> None:
    test_parse_prerequisites_from_description()
    test_fixture_load_and_roundtrip()
    test_yoki_entry_mapping()
    test_normalize_stored_code()
    print("All scraper tests passed.")


if __name__ == "__main__":
    main()
