#!/usr/bin/env python3
"""
Parse York University degree checklist PDF or DOCX files.

Outputs JSON to stdout:
{
  "programme_hint": str | null,
  "years": [{ "year": 1, "courses": [{ "code", "credits", "raw", "section"? }] }],
  "warnings": [str]
}
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# AP/ADMS 1000 3.00 | ADMS 3120 3.0 | LE/EECS 1011 3.00
COURSE_PATTERN = re.compile(
    r"(?:AP/|FA/|HH/|SC/|LE/|SB/|GL/|ES/)?"
    r"([A-Z]{2,6})\s+(\d{4})"
    r"(?:\s+([\d.]+))?",
    re.IGNORECASE,
)

YEAR_HEADER_PATTERN = re.compile(
    r"(?:year\s*(\d)|(\d)(?:st|nd|rd|th)\s+year|"
    r"(first|second|third|fourth)\s+year\s+courses?)",
    re.IGNORECASE,
)

SECTION_YEAR_HINTS: list[tuple[re.Pattern[str], int]] = [
    (re.compile(r"general\s+education", re.I), 1),
    (re.compile(r"required\s+core|major\s*[–-]", re.I), 2),
    (re.compile(r"stream|specialization", re.I), 3),
    (re.compile(r"outside\s+the\s+major|credits\s+outside", re.I), 3),
    (re.compile(r"free\s+choice", re.I), 4),
]

YEAR_WORDS = {"first": 1, "second": 2, "third": 3, "fourth": 4}

SUBJECT_BLOCKLIST = frozenset(
    {
        "THE",
        "FOR",
        "OR",
        "AND",
        "FROM",
        "WITH",
        "NATS",
        "NOTE",
        "YEAR",
        "MUST",
        "TAKE",
        "LIST",
        "THAT",
        "THIS",
        "WHEN",
        "THAN",
        "INTO",
        "OVER",
        "ONLY",
        "ALSO",
        "THES",
    }
)

VALID_COURSE_NUMBER = re.compile(r"^[1-4]\d{3}$")

SKIP_LINE_PATTERN = re.compile(
    r"^(total|upper[\s-]?level|requirement|important|please|academic|department|registration|"
    r"note:|additional|any course:|course outside|\d+\))",
    re.IGNORECASE,
)


def normalize_code(subject: str, number: str) -> str:
    return f"{subject.upper()} {number}"


def parse_year_header(line: str) -> int | None:
    match = YEAR_HEADER_PATTERN.search(line)
    if not match:
        return None
    if match.group(1):
        return int(match.group(1))
    if match.group(2):
        return int(match.group(2))
    if match.group(3):
        return YEAR_WORDS.get(match.group(3).lower())
    return None


def parse_section_year_hint(line: str) -> int | None:
    for pattern, year in SECTION_YEAR_HINTS:
        if pattern.search(line):
            return year
    return None


def extract_courses_from_line(line: str) -> list[dict]:
    found: list[dict] = []
    seen: set[str] = set()

    for match in COURSE_PATTERN.finditer(line):
        subject, number, credits_str = match.groups()
        subject = subject.upper()
        if subject in SUBJECT_BLOCKLIST or not VALID_COURSE_NUMBER.match(number):
            continue
        code = normalize_code(subject, number)
        if code in seen:
            continue
        seen.add(code)

        credits: float | None = None
        if credits_str:
            try:
                credits = float(credits_str)
            except ValueError:
                credits = None

        found.append(
            {
                "code": code,
                "credits": credits,
                "raw": match.group(0).strip(),
            }
        )

    return found


def merge_year_buckets(buckets: dict[int, list[dict]]) -> list[dict]:
    return [
        {"year": year, "courses": courses}
        for year, courses in sorted(buckets.items())
        if courses
    ]


def extract_courses_from_text(text: str) -> dict:
    warnings: list[str] = []
    current_year = 1
    current_section = "Requirements"
    year_buckets: dict[int, list[dict]] = {}
    seen_codes: set[str] = set()

    def append_course(course: dict) -> None:
        if course["code"] in seen_codes:
            return
        seen_codes.add(course["code"])
        course["section"] = current_section
        year_buckets.setdefault(current_year, []).append(course)

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or SKIP_LINE_PATTERN.search(line):
            continue

        year_num = parse_year_header(line)
        if year_num is not None and len(line) < 60 and not COURSE_PATTERN.search(line):
            current_year = year_num
            continue

        section_year = parse_section_year_hint(line)
        if section_year is not None and COURSE_PATTERN.search(line) is None:
            current_year = section_year
            current_section = line[:80]
            continue

        for course in extract_courses_from_line(line):
            append_course(course)

    years = merge_year_buckets(year_buckets)

    if not years or all(len(y["courses"]) == 0 for y in years):
        warnings.append(
            "No course codes found. Use a text-based PDF or DOCX checklist from your faculty site."
        )

    programme_hint = None
    for line in text.splitlines()[:30]:
        stripped = line.strip()
        if not stripped:
            continue
        lower = stripped.lower()
        if any(
            token in lower
            for token in (
                "checklist",
                "honours",
                "bsc",
                "bcom",
                "beng",
                "bachelor",
                "commerce",
                "creative writing",
                "software engineering",
            )
        ):
            programme_hint = stripped[:200]
            break

    return {
        "programme_hint": programme_hint,
        "years": years if years else [{"year": 1, "courses": []}],
        "warnings": warnings,
    }


def read_pdf(path: Path) -> str:
    import pdfplumber

    chunks: list[str] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            chunks.append(page.extract_text() or "")
    return "\n".join(chunks)


def read_docx(path: Path) -> str:
    from docx import Document

    doc = Document(path)
    parts: list[str] = []

    for paragraph in doc.paragraphs:
        if paragraph.text.strip():
            parts.append(paragraph.text.strip())

    for table in doc.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if cells:
                parts.append(" | ".join(cells))

    return "\n".join(parts)


def parse_file(path: Path) -> dict:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        text = read_pdf(path)
    elif suffix in {".docx", ".doc"}:
        if suffix == ".doc":
            return {
                "programme_hint": None,
                "years": [{"year": 1, "courses": []}],
                "warnings": [".doc files are not supported. Save as .docx or export to PDF."],
            }
        text = read_docx(path)
    else:
        return {
            "programme_hint": None,
            "years": [{"year": 1, "courses": []}],
            "warnings": [f"Unsupported file type: {suffix}. Upload PDF or DOCX."],
        }

    return extract_courses_from_text(text)


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: parse_checklist.py <file>"}))
        sys.exit(1)

    path = Path(sys.argv[1])
    if not path.exists():
        print(json.dumps({"error": f"File not found: {path}"}))
        sys.exit(1)

    try:
        result = parse_file(path)
        print(json.dumps(result))
    except Exception as exc:  # noqa: BLE001
        print(
            json.dumps(
                {
                    "error": str(exc),
                    "years": [{"year": 1, "courses": []}],
                    "warnings": [],
                }
            )
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
