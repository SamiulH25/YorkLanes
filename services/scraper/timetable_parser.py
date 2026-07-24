"""Parse York CDM active timetable exports and course schedule tables."""
from __future__ import annotations

import re
from typing import Iterable

from bs4 import BeautifulSoup, Tag

from catalog import SectionRecord, normalize_course_code, normalize_section_code

CDM_TIMETABLE_BASE = "https://apps1.sis.yorku.ca/WebObjects/cdm.woa/Contents/WebServerResources/"
CDM_BASE_URL = "https://w2prod.sis.yorku.ca"
# Legacy fallback; prefer discover_active_timetables_url().
CDM_ACTIVE_TIMETABLES_URL = (
    f"{CDM_BASE_URL}/Apps/WebObjects/cdm.woa/wo/c6yCxCphc3WGvzEqcAy8og/2.3.4.37.0"
)
_ACTIVE_TIMETABLES_LINK = re.compile(
    r'href="(/Apps/WebObjects/cdm\.woa/wo/[^"]+/(?:0|2)\.3\.4\.37\.0)"',
    re.IGNORECASE,
)

_DAY_LETTER_TO_CODE = {
    "M": "MON",
    "T": "TUE",
    "W": "WED",
    "R": "THU",
    "F": "FRI",
    "S": "SAT",
    "U": "SUN",
}

_TIMETABLE_FILE = re.compile(r"(SU|FW)(\d{4})([A-Z]{2})\.html", re.IGNORECASE)
_COURSE_ID_CELL = re.compile(
    r"^\s*(\d{4}[A-Z]?)\s+([\d.]+)\s+([A-Z])\s*$",
    re.IGNORECASE,
)
_LOGIN_GATED_MARKERS = (
    "loginppy",
    "please click here to see details",
    "please click here to see availability",
)


class PassportYorkRequiredError(RuntimeError):
    """Raised when CDM hides meeting times behind Passport York login."""


def decode_timetable_bytes(raw: bytes) -> str:
    if raw.startswith(b"\xfe\xff"):
        return raw.decode("utf-16-be")
    if raw.startswith(b"\xff\xfe"):
        return raw.decode("utf-16-le")
    return raw.decode("utf-8", errors="replace")


def is_login_gated_schedule(html: str) -> bool:
    lowered = html.lower()
    return any(marker in lowered for marker in _LOGIN_GATED_MARKERS)


def has_passport_york_cookies(cookie_names: Iterable[str]) -> bool:
    for name in cookie_names:
        lowered = name.lower()
        if "mayaauth" in lowered or lowered.startswith("ppy") or "passport" in lowered:
            return True
    return False


def duration_minutes_to_end(start_time: str, duration_minutes: int) -> str:
    hours, minutes = (int(part) for part in start_time.split(":", 1))
    total = hours * 60 + minutes + duration_minutes
    return f"{total // 60:02d}:{total % 60:02d}"


def normalize_day_code(raw: str) -> str | None:
    token = (raw or "").strip().upper()
    if not token:
        return None
    if token in _DAY_LETTER_TO_CODE:
        return _DAY_LETTER_TO_CODE[token]
    if token in {"MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"}:
        return token
    return None


def parse_nested_meeting_table(table: Tag) -> list[tuple[str, str, str, str | None, str | None]]:
    """Return (day, start, end, room, campus) tuples from a nested schedule table."""
    meetings: list[tuple[str, str, str, str | None, str | None]] = []
    for row in table.find_all("tr"):
        cells = row.find_all("td")
        if len(cells) < 3:
            continue

        day = normalize_day_code(cells[0].get_text(" ", strip=True))
        start_raw = cells[1].get_text(" ", strip=True)
        duration_raw = cells[2].get_text(" ", strip=True)
        if len(cells) >= 5:
            campus = cells[3].get_text(" ", strip=True) or None
            room = cells[4].get_text(" ", strip=True) or None
        else:
            room = cells[3].get_text(" ", strip=True) if len(cells) > 3 else None
            campus = None

        if not day or not re.match(r"\d{1,2}:\d{2}", start_raw):
            continue

        start_time = start_raw if len(start_raw.split(":")) == 2 else start_raw
        if ":" not in start_time and len(start_time) >= 3:
            start_time = f"{start_time[:-2]}:{start_time[-2:]}"

        end_time = None
        if duration_raw.isdigit():
            end_time = duration_minutes_to_end(start_time, int(duration_raw))

        meetings.append((day, start_time, end_time or start_time, room or None, campus or None))

    return meetings


def parse_compact_meeting_text(text: str) -> list[tuple[str, str, str, str | None, str | None]]:
    """Parse yorku-class-scraper style cells like 'M11:0090 CLH G'."""
    meetings: list[tuple[str, str, str, str | None, str | None]] = []
    for chunk in re.split(r"\s{2,}", text or ""):
        match = re.match(r"^([MTWRFSU])(\d{1,2}:\d{2})(\d{2,3})(.*)$", chunk.strip())
        if not match:
            continue
        day = normalize_day_code(match.group(1))
        if not day:
            continue
        start = match.group(2)
        duration = int(match.group(3))
        room = match.group(4).strip() or None
        meetings.append((day, start, duration_minutes_to_end(start, duration), room, None))
    return meetings


def _records_from_meetings(
    *,
    term_code: str,
    course_code: str,
    section_code: str,
    meetings: list[tuple[str, str, str, str | None, str | None]],
    instructor: str | None = None,
) -> list[SectionRecord]:
    records: list[SectionRecord] = []
    for day, start, end, room, campus in meetings:
        records.append(
            SectionRecord(
                term=term_code,
                course_code=course_code,
                section_code=section_code,
                day=day,
                start_time=start,
                end_time=end,
                campus=campus,
                room=room,
                instructor=instructor,
                source="cdm",
            )
        )
    return records


def parse_meeting_schedule_cell(cell: Tag) -> list[tuple[str, str, str, str | None, str | None]]:
    nested = cell.find("table")
    if nested:
        meetings = parse_nested_meeting_table(nested)
        if meetings:
            return meetings

    text = cell.get_text(" ", strip=True)
    if is_login_gated_schedule(text):
        return []
    return parse_compact_meeting_text(text)


def parse_cdm_course_schedule_tables(html: str, course_code: str, term_code: str) -> list[SectionRecord]:
    """Parse per-course CDM schedule pages (Type/Day/Start Time layout)."""
    if is_login_gated_schedule(html):
        return []

    soup = BeautifulSoup(html, "html.parser")
    records: list[SectionRecord] = []
    current_section_label = ""

    for header in soup.find_all("td", bgcolor=re.compile("#cc0000", re.I)):
        header_text = header.get_text(" ", strip=True)
        match = re.search(r"Term\s+(\S+)\s+Section\s+(\S+)", header_text, re.I)
        if match:
            current_section_label = match.group(2).upper()

    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if not rows:
            continue

        header_text = rows[0].get_text(" ", strip=True).lower()
        if "type" not in header_text or "day" not in header_text:
            continue

        for row in rows[1:]:
            cells = row.find_all("td")
            if len(cells) < 2:
                continue

            meeting_type = cells[0].get_text(" ", strip=True)
            if not re.match(r"^[A-Z]{3,4}\d{0,2}$", meeting_type.replace(" ", "")):
                continue

            section_code = normalize_section_code(meeting_type.replace(" ", ""))
            schedule_cell = cells[1]
            instructor = cells[3].get_text(" ", strip=True) if len(cells) > 3 else None
            meetings = parse_meeting_schedule_cell(schedule_cell)
            if not meetings:
                continue

            full_section = section_code
            if current_section_label and current_section_label not in section_code:
                full_section = f"{section_code} ({current_section_label})"

            records.extend(
                _records_from_meetings(
                    term_code=term_code,
                    course_code=course_code,
                    section_code=full_section,
                    meetings=meetings,
                    instructor=instructor or None,
                )
            )

    return records


def row_term_matches(term_kind: str, row_term: str) -> bool:
    token = (row_term or "").strip().upper()
    if term_kind == "SUMMER":
        return token in {"SU", "S", "S1", "S2", "Y"}
    if term_kind == "FULL_YEAR":
        return token in {"F", "W", "Y", "FW", ""}
    if term_kind == "FALL":
        return token in {"F", "Y"}
    if term_kind == "WINTER":
        return token in {"W", "Y"}
    return True


def filename_matches_term(filename: str, term_kind: str, term_year: int) -> bool:
    match = _TIMETABLE_FILE.search(filename)
    if not match:
        return False
    session, year = match.group(1).upper(), int(match.group(2))
    if term_kind == "SUMMER":
        # Summer timetable files often use the calendar year the session starts in
        # (e.g. SU2025 for "2026 S" when scraped in early 2026).
        return session == "SU" and year in {term_year, term_year - 1}
    if term_kind in {"FULL_YEAR", "FALL", "WINTER"}:
        return session == "FW" and year in {term_year, term_year - 1}
    return False


def discover_active_timetables_url(cdm_root_html: str) -> str | None:
    """Find the current View Active Course Timetables page from CDM root HTML."""
    match = _ACTIVE_TIMETABLES_LINK.search(cdm_root_html)
    if match:
        return f"{CDM_BASE_URL}{match.group(1)}"
    return None


def absolutize_timetable_link(link: str) -> str:
    if link.startswith("http://") or link.startswith("https://"):
        return link
    if link.startswith("/"):
        return f"{CDM_BASE_URL}{link}"
    if link.startswith("WebServerResources/"):
        return f"https://apps1.sis.yorku.ca/WebObjects/cdm.woa/Contents/{link}"
    return link


def parse_active_timetable_html(
    html: str,
    *,
    subject_code: str,
    term_code: str,
    term_kind: str,
) -> list[SectionRecord]:
    """Parse a View Active Course Timetables faculty export."""
    if "not been released yet" in html.lower():
        return []

    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    if not table:
        return []

    records: list[SectionRecord] = []
    current_dept = ""
    current_term = ""
    current_number = ""
    current_section = ""

    for row in table.find_all("tr"):
        if row.find_parent("table") is not table:
            continue

        cells = row.find_all("td", recursive=False)
        if not cells:
            continue

        texts = [cell.get_text("\xa0", strip=True) for cell in cells]
        if (
            len(texts) >= 4
            and re.fullmatch(r"[A-Z]{2}", texts[0] or "")
            and re.fullmatch(r"[A-Z]{2,6}", texts[1] or "")
            and texts[2]
            and texts[3]
        ):
            current_dept = texts[1].upper()
            current_term = texts[2].upper()
            current_number = ""
            current_section = ""
            continue

        if current_dept != subject_code.upper():
            continue
        if not row_term_matches(term_kind, current_term):
            continue

        course_cell_index = next(
            (index for index, text in enumerate(texts) if _COURSE_ID_CELL.match(text)),
            None,
        )
        if course_cell_index is not None and len(cells) > course_cell_index + 5:
            current_number, _credits, current_section = _COURSE_ID_CELL.match(
                texts[course_cell_index]
            ).groups()
            meeting_type = texts[course_cell_index + 2]
            meeting_num = texts[course_cell_index + 3]
            schedule_cell = cells[course_cell_index + 5]
            instructor = texts[course_cell_index + 6] if len(texts) > course_cell_index + 6 else None
        elif current_number:
            type_idx = None
            if texts and re.match(r"^[A-Z]{3,4}", texts[0]):
                type_idx = 0
            elif len(texts) > 1 and re.match(r"^[A-Z]{3,4}", texts[1]):
                type_idx = 1
            else:
                continue
            meeting_type = texts[type_idx]
            meeting_num = texts[type_idx + 1]
            schedule_cell = cells[type_idx + 3] if len(cells) > type_idx + 3 else None
            instructor = texts[type_idx + 5] if len(texts) > type_idx + 5 else None
        else:
            continue

        if not current_number or schedule_cell is None:
            continue

        section_code = normalize_section_code(f"{meeting_type} {meeting_num}".strip())
        meetings = parse_meeting_schedule_cell(schedule_cell)
        if not meetings:
            continue

        course_code = normalize_course_code(current_dept, current_number)
        if current_section:
            section_code = f"{section_code} ({current_section.upper()})"

        records.extend(
            _records_from_meetings(
                term_code=term_code,
                course_code=course_code,
                section_code=section_code,
                meetings=meetings,
                instructor=instructor or None,
            )
        )

    return records


def extract_timetable_links(html: str) -> list[str]:
    links: list[str] = []
    seen: set[str] = set()
    for match in re.finditer(r'href="([^"]+/(?:SU|FW)\d{4}[A-Z]{2}\.html)"', html, re.I):
        url = absolutize_timetable_link(match.group(1))
        if url not in seen:
            seen.add(url)
            links.append(url)
    return links
