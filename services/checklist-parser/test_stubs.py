"""Unit tests for complementary / elective stub collapsing."""
from __future__ import annotations

from parse_checklist import extract_courses_from_text


def codes(result: dict) -> list[str]:
    return [c["code"] for y in result["years"] for c in y["courses"]]


def kinds(result: dict) -> list[str]:
    return [c.get("kind", "course") for y in result["years"] for c in y["courses"]]


def test_complementary_section_collapses_course_list() -> None:
    text = """
    Third Year Courses
    Complementary Studies — 6.0 credits
    Choose from the following:
    HUMA 1110 3.00, HUMA 1120 3.00, SOCI 2030 3.00, PHIL 2010 3.00
  Required Core
    EECS 3311 3.00
    EECS 3214 3.00
    """
    result = extract_courses_from_text(text)
    assert "COMPLEMENTARY" in codes(result)
    assert "HUMA 1110" not in codes(result)
    assert "EECS 3311" in codes(result)
    assert "stub" in kinds(result)


def test_general_education_becomes_stub() -> None:
    text = """
    First Year Courses
    General Education Requirements — 9 credits
    NATS 1510 3.00 or NATS 1610 3.00 or HUMA 1105 3.00
    """
    result = extract_courses_from_text(text)
    assert codes(result) == ["GENERAL_ED"]
    complementary = result["years"][0]["courses"][0]
    assert complementary["kind"] == "stub"
    assert complementary["stub_type"] == "GENERAL_ED"


def test_free_choice_stub() -> None:
    text = """
    Fourth Year Courses
    Free Choice Electives — 12.0 credits
    Any 3000- or 4000-level course
    """
    result = extract_courses_from_text(text)
    assert "FREE_CHOICE" in codes(result)


def test_required_courses_not_collapsed() -> None:
    text = """
    First Year Courses
    EECS 1012 3.00
    EECS 1015 3.00
    """
    result = extract_courses_from_text(text)
    assert codes(result) == ["EECS 1012", "EECS 1015"]
    assert all(c.get("kind", "course") == "course" for y in result["years"] for c in y["courses"])
