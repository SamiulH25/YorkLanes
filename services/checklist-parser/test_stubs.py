"""Unit tests for complementary / elective stub collapsing."""
from __future__ import annotations

from parse_checklist import extract_courses_from_text


def codes(result: dict) -> list[str]:
    return [c["code"] for y in result["years"] for c in y["courses"]]


def kinds(result: dict) -> list[str]:
    return [c.get("kind", "course") for y in result["years"] for c in y["courses"]]


def year_courses(result: dict, year: int) -> list[dict]:
    for block in result["years"]:
        if block["year"] == year:
            return block["courses"]
    return []


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
    stub = next(c for c in year_courses(result, 3) if c.get("kind") == "stub")
    assert "HUMA 1110" in stub.get("option_codes", [])


def test_general_education_becomes_stub_with_options() -> None:
    text = """
    First Year Courses
    General Education Requirements — 9 credits
    NATS 1510 3.00 or NATS 1610 3.00 or HUMA 1105 3.00
    """
    result = extract_courses_from_text(text)
    assert codes(result) == ["GENERAL_ED"]
    stub = result["years"][0]["courses"][0]
    assert stub["kind"] == "stub"
    assert stub["stub_type"] == "GENERAL_ED"
    assert "NATS 1510" in stub["option_codes"]


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


def test_year_one_courses_stay_in_year_one() -> None:
    text = """
    First Year Courses
    EECS 1012 3.00
    EECS 1015 3.00
    Second Year Courses
    EECS 2011 3.00
    """
    result = extract_courses_from_text(text)
    assert [c["code"] for c in year_courses(result, 1)] == ["EECS 1012", "EECS 1015"]
    assert [c["code"] for c in year_courses(result, 2)] == ["EECS 2011"]


def test_low_level_courses_in_upper_year_become_stub_options() -> None:
    text = """
    Third Year Courses
    EECS 3101 3.00
    EECS 3421 3.00
    BIOL 1001 3.00
    CHEM 2011 3.00
    MATH 1019 3.00
    """
    result = extract_courses_from_text(text)
    year3_codes = [c["code"] for c in year_courses(result, 3) if c.get("kind") != "stub"]
    assert year3_codes == ["EECS 3101", "EECS 3421"]
    stub = next(c for c in year_courses(result, 3) if c.get("kind") == "stub")
    assert "BIOL 1001" in stub["option_codes"]
    assert "CHEM 2011" in stub["option_codes"]
    assert "MATH 1019" in stub["option_codes"]


def test_science_complementary_header() -> None:
    text = """
    First Year Courses
    Science Complementary — 6.0 credits
    BIOL 1000 3.00, CHEM 1000 3.00, PHYS 1010 3.00
    """
    result = extract_courses_from_text(text)
    assert codes(result) == ["COMPLEMENTARY"]
    stub = result["years"][0]["courses"][0]
    assert stub["section_label"] == "Science Complementary"
    assert "BIOL 1000" in stub["option_codes"]
