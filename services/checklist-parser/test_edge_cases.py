"""Edge-case parsing for real York checklists."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from parse_checklist import extract_courses_from_text


def year_codes(result: dict, year: int) -> list[str]:
    for block in result["years"]:
        if block["year"] == year:
            return [c["code"] for c in block["courses"]]
    return []


def test_fourth_year_after_complementary_header() -> None:
    text = """
    Fourth Year Courses
    Complementary Studies (6 credits)
    LE/EECS 4312 3.00 Software Engineering Requirements
    LE/EECS 4313 3.00 Software Engineering Testing
    LE/EECS 4414 3.0 Information Networks
    Full year course LE/ENG 4000 6.00 Engineering Project
    General Prerequisite: Most 2000-, 3000-, and 4000-level EECS courses require the following
    SC/MATH 1028 3.00) and LE/EECS 1019 3.00 (cross-listed to: SC/MATH 1019 3.00).
    """
    result = extract_courses_from_text(text)
    codes = year_codes(result, 4)
    assert "EECS 4312" in codes
    assert "EECS 4313" in codes
    assert "EECS 4414" in codes
    assert "ENG 4000" in codes
    assert "COMPLEMENTARY" in codes
    assert "MOST 2000" not in codes
    assert "MATH 1028" not in codes
    eng = next(c for c in result["years"][-1]["courses"] if c["code"] == "ENG 4000")
    assert eng.get("schedule_note") == "full_year"


def test_beng_pdf_year_four_has_core_courses() -> None:
    pdf = Path(__file__).parent / "samples" / "2023-2024-Degree-Checklist-BEng-Software-Big-Data.pdf"
    if not pdf.exists():
        return
    out = subprocess.check_output([sys.executable, "parse_checklist.py", str(pdf)])
    import json

    result = json.loads(out)
    y4 = year_codes(result, 4)
    assert len(y4) >= 9, y4
    assert "EECS 4312" in y4
    assert "ENG 4000" in y4
    assert "MOST 2000" not in y4
