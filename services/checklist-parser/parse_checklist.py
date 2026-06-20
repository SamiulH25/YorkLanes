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

# Checklist sections that should become a single placeholder instead of importing every listed course.
STUB_SECTION_RULES: list[tuple[re.Pattern[str], str, str]] = [
    (re.compile(r"complementar", re.I), "COMPLEMENTARY", "Complementary Studies"),
    (re.compile(r"general\s+education|\bgen\s+ed\b", re.I), "GENERAL_ED", "General Education"),
    (re.compile(r"free\s+choice", re.I), "FREE_CHOICE", "Free Choice"),
    (re.compile(r"\belectives?\b", re.I), "ELECTIVE", "Electives"),
    (re.compile(r"outside\s+the\s+major|credits\s+outside", re.I), "OUTSIDE_MAJOR", "Outside the Major"),
    (re.compile(r"breadth\s+requirement", re.I), "BREADTH", "Breadth Requirement"),
    (re.compile(r"humanities\s+requirement|social\s+science\s+requirement|natural\s+science\s+requirement", re.I), "BREADTH", "Breadth Requirement"),
]

REQUIRED_SECTION_RULES: list[re.Pattern[str]] = [
    re.compile(r"required\s+core|core\s+courses?", re.I),
    re.compile(r"major\s*[–-]\s*required|programme\s+requirements?", re.I),
    re.compile(r"^\s*required\b", re.I),
]

LIST_REFERENCE_PATTERN = re.compile(
    r"(one of|choose from|select from|from the following|any of|pick\s+\d+|choose\s+\d+|"
    r"complete\s+\d+\s+credit|students?\s+must\s+select)",
    re.I,
)

CREDIT_REQUIREMENT_PATTERN = re.compile(
    r"(\d+(?:\.\d+)?)\s*(?:credit|credits|cr\.?)",
    re.I,
)

COURSE_CODE_PATTERN = re.compile(r"^[A-Z]{2,6} \d{4}$")

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


def detect_stub_section(line: str) -> tuple[str, str] | None:
    for pattern, stub_type, label in STUB_SECTION_RULES:
        if pattern.search(line):
            return stub_type, label
    return None


def is_required_section(line: str) -> bool:
    return any(pattern.search(line) for pattern in REQUIRED_SECTION_RULES)


def parse_credit_requirement(line: str) -> float | None:
    match = CREDIT_REQUIREMENT_PATTERN.search(line)
    if not match:
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None


def is_concrete_course_code(code: str) -> bool:
    return bool(COURSE_CODE_PATTERN.match(code))


def make_stub_course(
    stub_type: str,
    label: str,
    section: str,
    credits: float | None,
    raw: str,
) -> dict:
    return {
        "code": stub_type,
        "credits": credits,
        "raw": raw[:200],
        "section": section,
        "kind": "stub",
        "stub_type": stub_type,
        "section_label": label,
    }


def should_collapse_line_to_stub(line: str, course_count: int, in_stub_section: bool) -> bool:
    if in_stub_section:
        return True
    if course_count >= 3 and LIST_REFERENCE_PATTERN.search(line):
        return True
    if course_count >= 5:
        return True
    return False


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
    seen_stub_keys: set[str] = set()
    in_stub_section = False
    active_stub: dict | None = None

    def append_course(course: dict) -> None:
        code = course["code"]
        if course.get("kind") == "stub":
            stub_key = f"{code}:{course.get('section_label', '')}:{course.get('section', '')}"
            if stub_key in seen_stub_keys:
                return
            seen_stub_keys.add(stub_key)
        else:
            if code in seen_codes:
                return
            seen_codes.add(code)
        course.setdefault("kind", "course")
        course["section"] = current_section
        year_buckets.setdefault(current_year, []).append(course)

    def finalize_active_stub() -> None:
        nonlocal active_stub, in_stub_section
        if active_stub is not None:
            append_course(active_stub)
            active_stub = None
        in_stub_section = False

    def start_stub_section(line: str, stub_type: str, label: str) -> None:
        nonlocal active_stub, in_stub_section, current_section
        finalize_active_stub()
        current_section = line[:80]
        credits = parse_credit_requirement(line)
        active_stub = make_stub_course(stub_type, label, current_section, credits, line)
        in_stub_section = True

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or SKIP_LINE_PATTERN.search(line):
            continue

        year_num = parse_year_header(line)
        if year_num is not None and len(line) < 60 and not COURSE_PATTERN.search(line):
            finalize_active_stub()
            current_year = year_num
            continue

        stub_match = detect_stub_section(line)
        if stub_match is not None and COURSE_PATTERN.search(line) is None:
            stub_type, label = stub_match
            start_stub_section(line, stub_type, label)
            continue

        if is_required_section(line) and COURSE_PATTERN.search(line) is None:
            finalize_active_stub()
            current_section = line[:80]
            section_year = parse_section_year_hint(line)
            if section_year is not None:
                current_year = section_year
            continue

        section_year = parse_section_year_hint(line)
        if section_year is not None and COURSE_PATTERN.search(line) is None:
            if detect_stub_section(line) is None:
                finalize_active_stub()
            current_year = section_year
            current_section = line[:80]
            continue

        line_courses = extract_courses_from_line(line)

        if in_stub_section:
            if active_stub is not None and active_stub.get("credits") is None:
                credits = parse_credit_requirement(line)
                if credits is not None:
                    active_stub["credits"] = credits
            continue

        if should_collapse_line_to_stub(line, len(line_courses), in_stub_section):
            stub_type = "ELECTIVE"
            label = "Electives"
            for pattern, candidate_type, candidate_label in STUB_SECTION_RULES:
                if pattern.search(current_section) or pattern.search(line):
                    stub_type = candidate_type
                    label = candidate_label
                    break
            credits = parse_credit_requirement(line) or parse_credit_requirement(current_section)
            append_course(
                make_stub_course(
                    stub_type,
                    label,
                    current_section,
                    credits,
                    line,
                )
            )
            continue

        for course in line_courses:
            append_course(course)

    finalize_active_stub()

    years = merge_year_buckets(year_buckets)

    if not years or all(len(y["courses"]) == 0 for y in years):
        warnings.append(
            "No course codes found. Use a text-based PDF or DOCX checklist from your faculty site."
        )

    stub_count = sum(
        1 for year in years for course in year["courses"] if course.get("kind") == "stub"
    )
    if stub_count:
        warnings.append(
            f"Summarized {stub_count} complementary/elective checklist section(s) as placeholders "
            "(not every optional course was imported)."
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
