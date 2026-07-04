"""Course catalogue models and text parsing helpers."""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field

COURSE_CODE_IN_TEXT = re.compile(
    r"(?:AP/|FA/|HH/|SC/|LE/|SB/|GL/|ES/)?"
    r"([A-Z]{2,6})\s+(\d{4}[A-Z]?)"
    r"(?:\s+[\d.]+)?",
    re.IGNORECASE,
)

PREREQ_STOP_WORDS = (
    "credit exclusion",
    "not open to",
    "may not be",
    "may be taken",
    "corequisite",
    "ncr",
    "previously offered",
    "note:",
)


@dataclass
class CourseRecord:
    code: str
    title: str
    credits: float | None = None
    department: str | None = None
    description: str | None = None
    prerequisite_codes: list[str] = field(default_factory=list)
    source: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


def normalize_course_code(subject: str, number: str) -> str:
    return f"{subject.upper()} {number.upper()}"


def normalize_stored_code(code: str) -> str:
    """Normalize legacy codes like EECS4314 to EECS 4314."""
    cleaned = (code or "").strip().upper()
    if not cleaned:
        return cleaned

    if " " in cleaned:
        parts = cleaned.split(None, 1)
        if len(parts) == 2 and parts[1][:1].isdigit():
            return normalize_course_code(parts[0], parts[1].split()[0])

    compact = re.sub(r"[^A-Z0-9]", "", cleaned)
    match = re.match(r"^([A-Z]{2,6})(\d{4}[A-Z]?)$", compact)
    if match:
        return normalize_course_code(match.group(1), match.group(2))

    return cleaned


def parse_course_codes(text: str) -> list[str]:
    seen: set[str] = set()
    codes: list[str] = []
    for match in COURSE_CODE_IN_TEXT.finditer(text or ""):
        code = normalize_course_code(match.group(1), match.group(2))
        if code not in seen:
            seen.add(code)
            codes.append(code)
    return codes


def extract_prerequisite_codes(description: str, course_number: str) -> list[str]:
    if not description:
        return []

    lower = description.lower()
    start = lower.find("prerequisite")
    if start < 0:
        return []

    stop = len(lower)
    for keyword in PREREQ_STOP_WORDS:
        index = lower.find(keyword, start)
        if 0 <= index < stop:
            stop = index

    snippet = description[start:stop]
    level = int(course_number[0]) if course_number and course_number[0].isdigit() else 9

    prereqs: list[str] = []
    seen: set[str] = set()
    for subject, number in COURSE_CODE_IN_TEXT.findall(snippet):
        if not number[0].isdigit():
            continue
        if int(number[0]) > level:
            continue
        if number.upper() == course_number.upper():
            continue
        code = normalize_course_code(subject, number)
        if code not in seen:
            seen.add(code)
            prereqs.append(code)

    return prereqs


def from_yoki_entry(entry: dict, source: str = "yoki") -> CourseRecord:
    department = str(entry.get("dept", "")).upper() or None
    number = str(entry.get("code", "")).strip()
    code = normalize_course_code(department or "UNK", number) if department else number
    description = (entry.get("desc") or "").strip() or None
    prereq_field = (entry.get("prereqs") or "").strip()

    prereq_codes = parse_course_codes(prereq_field) if prereq_field else []
    if not prereq_codes and description:
        prereq_codes = extract_prerequisite_codes(description, number)

    credit_raw = entry.get("credit")
    credits = float(credit_raw) if credit_raw is not None else None

    return CourseRecord(
        code=code,
        title=str(entry.get("name", "")).strip(),
        credits=credits,
        department=department,
        description=description,
        prerequisite_codes=prereq_codes,
        source=source,
    )
