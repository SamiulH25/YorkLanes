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


# ---------------------------------------------------------------------------
# Scheduling / section timetable models
# ---------------------------------------------------------------------------

SESSION_TERM_LABEL = re.compile(
    r"(Fall/Winter|Summer|Fall|Winter)\s+(\d{4})(?:-(\d{4}))?",
    re.IGNORECASE,
)


@dataclass
class SessionTerm:
    code: str
    label: str
    cdm_value: int
    term_kind: str
    year: int


def normalize_term(label: str) -> SessionTerm:
    """Map a CDM session label (e.g. 'Fall/Winter 2026-2027') to a canonical term."""
    match = SESSION_TERM_LABEL.search(label or "")
    if not match:
        code = (label or "UNKNOWN").strip().upper().replace(" ", "")
        return SessionTerm(code=code, label=label or code, cdm_value=0, term_kind="UNKNOWN", year=0)

    kind_word = match.group(1).lower()
    start_year = int(match.group(2))
    if kind_word == "fall/winter":
        term_kind = "FULL_YEAR"
        end_year = int(match.group(3)) if match.group(3) else start_year + 1
        code = f"{start_year}-{end_year} FW"
    elif kind_word == "summer":
        term_kind = "SUMMER"
        code = f"{start_year} S"
    elif kind_word == "fall":
        term_kind = "FALL"
        code = f"{start_year} F"
    else:  # winter
        term_kind = "WINTER"
        code = f"{start_year} W"

    return SessionTerm(code=code, label=match.group(0), cdm_value=0, term_kind=term_kind, year=start_year)


_MEETING_CELL = re.compile(
    r"(MON|TUE|WED|THU|FRI|SAT|SUN|M|T|W|R|F|S|U)\s*"
    r"(\d{1,2}:?\d{2}\s*[AP]?M?)\s*[-–]\s*"
    r"(\d{1,2}:?\d{2}\s*[AP]?M?)",
    re.IGNORECASE,
)

_DAY_CODES = {
    "MON": "MON", "M": "MON",
    "TUE": "TUE", "T": "TUE",
    "WED": "WED", "W": "WED",
    "THU": "THU", "R": "THU",
    "FRI": "FRI", "F": "FRI",
    "SAT": "SAT", "S": "SAT",
    "SUN": "SUN", "U": "SUN",
}


def _normalize_time(raw: str) -> str:
    text = raw.strip().upper().replace(" ", "")
    meridiem = "AM" if text.endswith("AM") else "PM" if text.endswith("PM") else ""
    digits = text.rstrip("AMP")
    if ":" in digits:
        hh, mm = digits.split(":", 1)
    else:
        hh = digits[:-2] or digits[0]
        mm = digits[-2:] if len(digits) >= 3 else "00"
    hh = int(hh)
    mm = int(mm)
    if meridiem == "PM" and hh != 12:
        hh += 12
    if meridiem == "AM" and hh == 12:
        hh = 0
    return f"{hh:02d}:{mm:02d}"


def parse_meeting_cell(text: str) -> list[tuple[str, str, str]]:
    """Extract (day, start, end) tuples from a combined meeting cell."""
    results: list[tuple[str, str, str]] = []
    for day_raw, start_raw, end_raw in _MEETING_CELL.findall(text or ""):
        day = _DAY_CODES.get(day_raw.upper())
        if not day:
            continue
        results.append((day, _normalize_time(start_raw), _normalize_time(end_raw)))
    return results


def normalize_section_code(raw: str) -> str:
    return (raw or "").strip()


@dataclass
class SectionRecord:
    term: str
    course_code: str
    section_code: str
    day: str
    start_time: str
    end_time: str
    duration: str | None = None
    campus: str | None = None
    room: str | None = None
    instructor: str | None = None
    delivery_mode: str | None = None
    source: str = "cdm"

    def to_dict(self) -> dict:
        return asdict(self)


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
