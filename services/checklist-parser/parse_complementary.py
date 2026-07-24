#!/usr/bin/env python3
"""
Parse York Lassonde complementary studies availability PDFs.

Outputs JSON to stdout:
{
  "programme_hint": str | null,
  "rules": { "total_credits": 12, "min_subject_area_credits": 3 },
  "subject_areas": [{ "name": str, "prefixes": [str] }],
  "listed_courses": [{ "code", "credits", "raw", "counts_as_subject_area" }],
  "warnings": [str]
}
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# AP/ADMS 1000 3.00* | EU/ENVS4402 3.00 | HH/PSYC1010 6.00
LISTED_COURSE_PATTERN = re.compile(
    r"(?:AP/|FA/|HH/|SC/|LE/|SB/|GL/|ES/|EU/|LW/)?"
    r"([A-Z]{2,6})\s*(\d{4}[A-Z]?)"
    r"\s+([\d.]+)"
    r"(\*)?",
    re.IGNORECASE,
)

SUBJECT_PREFIX_PATTERN = re.compile(
    r"\(([A-Z]{2,6}(?:,\s*[A-Z]{2,6})*)\)",
    re.IGNORECASE,
)

TOTAL_CREDITS_PATTERN = re.compile(
    r"pass\s+a\s+total\s+of\s+(\d+)\s+credits",
    re.IGNORECASE,
)
MIN_SUBJECT_CREDITS_PATTERN = re.compile(
    r"at\s+least\s+(\d+)\s+credits\s+from\s+approved\s+humanities",
    re.IGNORECASE,
)

PROGRAMME_PATTERN = re.compile(
    r"complementary\s+studies\s*[-–]\s*(.+)",
    re.IGNORECASE,
)

KNOWN_SUBJECT_AREA_NAMES: dict[str, str] = {
    "ANTH": "Anthropology",
    "CDNS": "Canadian Studies",
    "CCY": "Children, Childhood & Youth Studies",
    "COMS": "Communications",
    "CMDS": "Communications",
    "CLTR": "Culture",
    "EN": "English",
    "GWST": "Gender & Women's Studies",
    "HIST": "History",
    "HREQ": "Human Rights and Equity Studies",
    "HUMA": "Humanities",
    "INDG": "Indigenous Studies",
    "LING": "Linguistics",
    "LIN": "Linguistics",
    "MODR": "Modes of Reasoning",
    "MIST": "Multicultural and Indigenous Studies",
    "PHIL": "Philosophy",
    "POLS": "Political Science",
    "RLST": "Religious Studies",
    "SOSC": "Social Science",
    "SOCI": "Sociology",
    "WRIT": "Writing",
    "ASL": "American Sign Language",
    "ARB": "Arabic",
    "CAT": "Catalan",
    "CH": "Chinese",
    "GK": "Greek",
    "GKM": "Modern Greek",
    "ESL": "English as a Second Language",
    "FSL": "French as a Second Language",
    "FR": "French",
    "FRAN": "French",
    "GR": "German",
    "HEB": "Hebrew",
    "HND": "Hindi",
    "IT": "Italian",
    "JC": "Jamaican Creole",
    "JP": "Japanese",
    "KOR": "Korean",
    "LA": "Latin",
    "PERS": "Persian",
    "POR": "Portuguese",
    "SP": "Spanish",
    "SWAH": "Swahili",
}


def normalize_code(subject: str, number: str) -> str:
    return f"{subject.upper()} {number.upper()}"


def parse_credits(value: str) -> float:
    parsed = float(value)
    if parsed.is_integer():
        return int(parsed)
    return parsed


def extract_rules(text: str) -> dict[str, int]:
    total_match = TOTAL_CREDITS_PATTERN.search(text)
    min_subject_match = MIN_SUBJECT_CREDITS_PATTERN.search(text)
    return {
        "total_credits": int(total_match.group(1)) if total_match else 12,
        "min_subject_area_credits": int(min_subject_match.group(1)) if min_subject_match else 3,
    }


def extract_programme_hint(text: str) -> str | None:
    for line in text.splitlines():
        match = PROGRAMME_PATTERN.search(line)
        if match:
            return match.group(1).strip()[:200]
    return None


def extract_subject_areas(text: str) -> list[dict]:
    prefix_to_name: dict[str, str] = {}
    for match in SUBJECT_PREFIX_PATTERN.finditer(text):
        raw_prefixes = match.group(1).upper()
        prefixes = [part.strip() for part in raw_prefixes.split(",") if part.strip()]
        for prefix in prefixes:
            if prefix in {"SC", "AP", "FA", "HH", "LE", "SB", "EU", "LW", "GL", "ES"}:
                continue
            prefix_to_name.setdefault(prefix, KNOWN_SUBJECT_AREA_NAMES.get(prefix, prefix))

    return [
        {"name": name, "prefixes": [prefix]}
        for prefix, name in sorted(prefix_to_name.items(), key=lambda item: item[1])
    ]


def extract_listed_courses(text: str) -> list[dict]:
    found: list[dict] = []
    seen: set[str] = set()

    for match in LISTED_COURSE_PATTERN.finditer(text):
        code = normalize_code(match.group(1), match.group(2))
        if code in seen:
            continue
        seen.add(code)
        credits = parse_credits(match.group(3))
        counts_as_subject_area = bool(match.group(4))
        found.append(
            {
                "code": code,
                "credits": credits,
                "raw": match.group(0).strip(),
                "counts_as_subject_area": counts_as_subject_area,
            }
        )

    return found


def parse_text(text: str) -> dict:
    warnings: list[str] = []
    rules = extract_rules(text)
    subject_areas = extract_subject_areas(text)
    listed_courses = extract_listed_courses(text)

    if not subject_areas:
        warnings.append("No humanities/social science subject areas were detected.")
    if not listed_courses:
        warnings.append("No listed complementary courses were detected on page 2.")

    return {
        "programme_hint": extract_programme_hint(text),
        "rules": rules,
        "subject_areas": subject_areas,
        "listed_courses": listed_courses,
        "warnings": warnings,
    }


def read_pdf(path: Path) -> str:
    import pdfplumber

    chunks: list[str] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            chunks.append(page.extract_text() or "")
    return "\n".join(chunks)


def parse_file(path: Path) -> dict:
    suffix = path.suffix.lower()
    if suffix != ".pdf":
        return {
            "programme_hint": None,
            "rules": {"total_credits": 12, "min_subject_area_credits": 3},
            "subject_areas": [],
            "listed_courses": [],
            "warnings": [f"Unsupported file type: {suffix}. Upload a PDF."],
            "error": f"Unsupported file type: {suffix}",
        }

    text = read_pdf(path)
    if "complementary studies" not in text.lower():
        return {
            "programme_hint": None,
            "rules": {"total_credits": 12, "min_subject_area_credits": 3},
            "subject_areas": [],
            "listed_courses": [],
            "warnings": ["This PDF does not look like a complementary studies document."],
            "error": "Unrecognized complementary studies PDF",
        }

    result = parse_text(text)
    if not result["listed_courses"] and not result["subject_areas"]:
        result["error"] = "No complementary course data found in PDF"
    return result


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: parse_complementary.py <file>"}))
        sys.exit(1)

    path = Path(sys.argv[1])
    if not path.exists():
        print(json.dumps({"error": f"File not found: {path}"}))
        sys.exit(1)

    print(json.dumps(parse_file(path), ensure_ascii=False))


if __name__ == "__main__":
    main()
