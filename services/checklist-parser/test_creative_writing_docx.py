"""LA&PS credit-slot DOCX checklists (no explicit Year 1–4 headers)."""
from __future__ import annotations

from pathlib import Path

import pytest

from parse_checklist import extract_courses_from_text, parse_file

DOCX = Path(r"C:\Downloads (C)\Bachelor-of-Arts-Honours-Creative-Writing-2025-2026.docx")

CREDIT_SLOT_TEXT = """
GENERAL EDUCATION - 21 Credits
1)Humanities or Social Science: | 9
2)Humanities or Social Science: (whichever is not taken in line 1) | 6
3)Natural Science: | 6
MAJOR – 48 Credits
AP/CWR 2600 Introduction to Creative Writing | 6
18 workshop credits chosen from the following: AP/CWR 3600 6.0, AP/CWR 3610 6.0, AP/CWR 3612 3.0 | 6
18 workshop credits chosen from the following: AP/CWR 3600 6.0, AP/CWR 3610 6.0, AP/CWR 3612 3.0 | 6
18 workshop credits chosen from the following: AP/CWR 3600 6.0, AP/CWR 3610 6.0, AP/CWR 3612 3.0 | 6
24 additional credits chosen from the creative writing list of courses, including at least 18 credits at the 3000 or 4000 level and a maximum of six creative writing workshop credits. | 6
24 additional credits chosen from the creative writing list of courses, including at least 18 credits at the 3000 or 4000 level and a maximum of six creative writing workshop credits. | 6
24 additional credits chosen from the creative writing list of courses, including at least 18 credits at the 3000 or 4000 level and a maximum of six creative writing workshop credits. | 6
24 additional credits chosen from the creative writing list of courses, including at least 18 credits at the 3000 or 4000 level and a maximum of six creative writing workshop credits. | 6
Credits Outside the Major – at least 18 Credits
Course Outside CWR: | 6
Course Outside CWR: | 6
Course Outside CWR: | 6
Free Choice - 33 Credits
Any Course: | 3
Any Course: | 6
Any Course: | 6
Any Course: | 6
Any Course: | 6
Any Course: | 6
TOTAL DEGREE CREDITS | 120
"""


def year_codes(result: dict, year: int) -> list[str]:
    for block in result["years"]:
        if block["year"] == year:
            return [course["code"] for course in block["courses"]]
    return []


def test_credit_slot_checklist_spreads_across_four_years() -> None:
    result = extract_courses_from_text(CREDIT_SLOT_TEXT)
    assert year_codes(result, 1) == ["GENERAL_ED", "GENERAL_ED", "GENERAL_ED", "CWR 2600"]
    assert year_codes(result, 1).count("WORKSHOP") == 0
    assert len(result["years"]) == 4
    assert sum(len(year["courses"]) for year in result["years"]) == 20
    assert year_codes(result, 4).count("FREE_CHOICE") == 6


@pytest.mark.skipif(not DOCX.exists(), reason="Creative Writing sample DOCX not available locally")
def test_creative_writing_docx_matches_expected_layout() -> None:
    result = parse_file(DOCX)
    assert year_codes(result, 1) == ["GENERAL_ED", "GENERAL_ED", "GENERAL_ED", "CWR 2600"]
    assert year_codes(result, 2).count("WORKSHOP") == 2
    assert year_codes(result, 3).count("WORKSHOP") == 1
    assert year_codes(result, 2).count("ADDITIONAL_MAJOR") == 2
    assert year_codes(result, 3).count("ADDITIONAL_MAJOR") == 2
    assert year_codes(result, 3).count("OUTSIDE_MAJOR") == 3
    assert year_codes(result, 4).count("FREE_CHOICE") == 6
