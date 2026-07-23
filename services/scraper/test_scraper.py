"""Offline tests for the course scraper."""
from __future__ import annotations

import json
from pathlib import Path

from catalog import (
    CourseRecord,
    SectionRecord,
    extract_prerequisite_codes,
    from_yoki_entry,
    normalize_stored_code,
    parse_course_codes,
    normalize_term,
    parse_meeting_cell,
)
from schedule_scraper import ScheduleScraper
from scrape_courses import load_json_courses, save_json, load_json_sections

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


def test_normalize_term() -> None:
    fw = normalize_term("Fall/Winter 2026-2027")
    assert fw.code == "2026-2027 FW"
    assert fw.term_kind == "FULL_YEAR"
    assert fw.year == 2026

    summer = normalize_term("Summer 2026")
    assert summer.code == "2026 S"
    assert summer.term_kind == "SUMMER"


def test_parse_meeting_cell() -> None:
    meetings = parse_meeting_cell("MON 14:30 - 16:00, WED 14:30 - 16:00")
    assert ("MON", "14:30", "16:00") in meetings
    assert ("WED", "14:30", "16:00") in meetings

    pm = parse_meeting_cell("FRI 10:00AM - 11:30AM")
    assert pm == [("FRI", "10:00", "11:30")]


def test_parse_detail_sections_from_fixture() -> None:
    fixture = Path(__file__).parent / "fixtures" / "sections" / "EECS_3421.html"
    scraper = ScheduleScraper()
    html = fixture.read_text(encoding="utf-8")
    sections = scraper.parse_detail_sections(html, "EECS 3421", "2026-2027 FW")

    # LEC A: MON+WED = 2 meetings; TUT 01: FRI = 1 meeting
    assert len(sections) == 3

    lec = [s for s in sections if s.section_code == "LEC A"]
    assert len(lec) == 2
    assert all(s.course_code == "EECS 3421" for s in sections)
    assert all(s.term == "2026-2027 FW" for s in sections)
    assert any(s.day == "MON" and s.start_time == "14:30" for s in lec)
    assert any(s.campus == "Keele" and s.instructor == "Jane Smith" for s in lec)

    tut = [s for s in sections if s.section_code == "TUT 01"]
    assert len(tut) == 1
    assert tut[0].start_time == "10:00"
    assert tut[0].end_time == "11:30"


def test_section_fixture_roundtrip() -> None:
    scraper = ScheduleScraper()
    sections = scraper.scrape_from_html(
        Path(__file__).parent / "fixtures" / "sections", "EECS", "2026-2027 FW"
    )
    assert len(sections) > 0
    out = Path(__file__).parent / "output" / "test_sections.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        __import__("json").dumps({"sections": [s.to_dict() for s in sections]}, indent=2),
        encoding="utf-8",
    )
    reloaded = load_json_sections(out)
    assert len(reloaded) == len(sections)



def main() -> None:
    test_parse_prerequisites_from_description()
    test_fixture_load_and_roundtrip()
    test_yoki_entry_mapping()
    test_normalize_stored_code()
    test_normalize_term()
    test_parse_meeting_cell()
    test_parse_detail_sections_from_fixture()
    test_section_fixture_roundtrip()
    print("All scraper tests passed.")


if __name__ == "__main__":
    main()
