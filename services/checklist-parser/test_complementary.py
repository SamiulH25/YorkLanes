"""Tests for complementary studies PDF parsing."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from parse_complementary import parse_text

SAMPLE_PDF = Path("/home/bob2142/Downloads/BEng-Complementary-Studies-1.pdf")


def test_parses_rules_and_subject_areas() -> None:
    text = """
    Complementary Studies - BEng General Education
    You need to pass a total of 12 credits to satisfy this requirement
    You need to pass at least 3 credits from approved humanities/social science subject areas
    Anthropology (ANTH) Philosophy (PHIL)
    Communications (COMS, CMDS)
    """
    result = parse_text(text)
    assert result["rules"]["total_credits"] == 12
    assert result["rules"]["min_subject_area_credits"] == 3
    prefixes = {prefix for area in result["subject_areas"] for prefix in area["prefixes"]}
    assert "ANTH" in prefixes
    assert "PHIL" in prefixes
    assert "COMS" in prefixes
    assert "CMDS" in prefixes


def test_parses_listed_courses_with_asterisk() -> None:
    text = """
    AP/HUMA 3226 3.00* SC/STS 2110 3.00*
    AP/ADMS 1000 3.00 EU/ENVS4402 3.00
    """
    result = parse_text(text)
    by_code = {course["code"]: course for course in result["listed_courses"]}
    assert by_code["HUMA 3226"]["counts_as_subject_area"] is True
    assert by_code["STS 2110"]["counts_as_subject_area"] is True
    assert by_code["ADMS 1000"]["counts_as_subject_area"] is False
    assert by_code["ENVS 4402"]["credits"] == 3


def test_sample_pdf_when_available() -> None:
    if not SAMPLE_PDF.exists():
        return

    out = subprocess.check_output([sys.executable, "parse_complementary.py", str(SAMPLE_PDF)])
    result = json.loads(out)
    assert result.get("error") is None
    assert len(result["listed_courses"]) >= 80
    assert len(result["subject_areas"]) >= 20
    codes = {course["code"] for course in result["listed_courses"]}
    assert "ADMS 1000" in codes
    assert "HUMA 3226" in codes
