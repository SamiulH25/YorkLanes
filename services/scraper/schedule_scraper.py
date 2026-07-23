"""Scrape course section / timetable data from York CDM (WebObjects).

Requires a browser-bootstrapped CDM session (Cloudflare). Run:
  npm run scraper:cdm:bootstrap
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup

from catalog import (
    SectionRecord,
    normalize_course_code,
    normalize_section_code,
    parse_meeting_cell,
    normalize_term,
)
from cdm_scraper import CdmScraper, USER_AGENT

SECTION_HEADER_LABELS = ("section", "day", "time", "campus", "room", "instructor", "mode", "location")
SECTION_KEYWORDS = ("lecture", "tutorial", "lab", "seminar", "section")


class ScheduleScraper(CdmScraper):
    def list_terms(self) -> list[Any]:
        """Return available session terms parsed from the subject search form."""
        attrs = self.get_subject_form_attributes()
        form_html = attrs.get("subject_page_html") or self._get(attrs["form_url"])

        terms: list[Any] = []
        for select in re.findall(
            r"<select[^>]+name=\"[^\"]*(?:session|term)[^\"]*\"[^>]*>(.*?)</select>",
            form_html,
            re.IGNORECASE | re.DOTALL,
        ):
            for value, label in re.findall(
                r'<option\s+value="(\d+)">([^<]+)</option>', select, re.IGNORECASE
            ):
                try:
                    term = normalize_term(label)
                    term.cdm_value = int(value)
                    terms.append(term)
                except ValueError:
                    continue

        if not terms:
            # Fallback: any <option> under a select named with "search" or "session"
            root = self._get(self.course_url)
            for value, label in re.findall(
                r'<option\s+value="(\d+)">([^<]+)</option>', root, re.IGNORECASE
            ):
                if re.search(r"\d{4}", label):
                    term = normalize_term(label)
                    term.cdm_value = int(value)
                    terms.append(term)

        return terms

    def _find_section_tables(self, soup: BeautifulSoup) -> list[BeautifulSoup]:
        tables: list[BeautifulSoup] = []
        for table in soup.find_all("table"):
            text = table.get_text(" ", strip=True).lower()
            if any(keyword in text for keyword in SECTION_KEYWORDS) and any(
                header in text for header in ("day", "time")
            ):
                tables.append(table)
        return tables

    def _header_index_map(self, table: BeautifulSoup) -> dict[str, int]:
        header_cells = table.find_all("th")
        if not header_cells:
            first_row = table.find("tr")
            header_cells = first_row.find_all("td") if first_row else []

        index_map: dict[str, int] = {}
        for index, cell in enumerate(header_cells):
            label = cell.get_text(" ", strip=True).lower()
            for key in SECTION_HEADER_LABELS:
                if label.startswith(key):
                    index_map[key] = index
                    break
        return index_map

    def parse_detail_sections(self, html: str, course_code: str, term: str) -> list[SectionRecord]:
        soup = BeautifulSoup(html, "html.parser")
        records: list[SectionRecord] = []

        for table in self._find_section_tables(soup):
            headers = self._header_index_map(table)
            if "section" not in headers or "time" not in headers:
                continue

            for row in table.find_all("tr"):
                cells = row.find_all(["td", "th"])
                if len(cells) <= max(headers.values()):
                    continue

                section_raw = cells[headers["section"]].get_text(" ", strip=True)
                section_code = normalize_section_code(section_raw)
                if not section_code:
                    continue

                time_cell = cells[headers["time"]].get_text(" ", strip=True)
                meetings = parse_meeting_cell(time_cell)
                if not meetings:
                    continue

                campus = cells[headers["campus"]].get_text(" ", strip=True) if "campus" in headers else None
                room = cells[headers["room"]].get_text(" ", strip=True) if "room" in headers else None
                instructor = (
                    cells[headers["instructor"]].get_text(" ", strip=True) if "instructor" in headers else None
                )
                delivery_mode = (
                    cells[headers["mode"]].get_text(" ", strip=True)
                    if "mode" in headers
                    else (cells[headers["location"]].get_text(" ", strip=True) if "location" in headers else None)
                )

                for day, start, end in meetings:
                    records.append(
                        SectionRecord(
                            term=term,
                            course_code=course_code,
                            section_code=section_code,
                            day=day,
                            start_time=start,
                            end_time=end,
                            campus=campus or None,
                            room=room or None,
                            instructor=instructor or None,
                            delivery_mode=delivery_mode or None,
                            source="cdm",
                        )
                    )

        return records

    def scrape_subject_term(self, subject_code: str, term: Any, all_terms: bool = False) -> list[SectionRecord]:
        attrs = self.get_subject_form_attributes()
        subject_code = subject_code.upper()
        subject_id = next((sid for sid, code in attrs["subjects"] if code == subject_code), None)
        if subject_id is None:
            known = ", ".join(code for _, code in attrs["subjects"][:20])
            raise ValueError(f"Unknown subject '{subject_code}'. Examples: {known}")

        terms = [term]
        if all_terms:
            terms = self.list_terms()

        sections: list[SectionRecord] = []
        seen: set[tuple[str, str, str, str, str, str]] = set()

        for current in terms:
            list_html = self._post(
                attrs["form_url"],
                {
                    "sessionPopUp": current.cdm_value,
                    "subjectPopUp": subject_id,
                    "wosid": attrs["wosid"],
                    "3.10.7.5": "Search Courses",
                },
            )
            rows = self.parse_list_rows(list_html)

            for href, subject, number, _credits, _title, _code in rows:
                code = normalize_course_code(subject, number)
                detail_html = self._get(href if href.startswith("http") else self.base_url + href)
                for record in self.parse_detail_sections(detail_html, code, current.code):
                    key = (
                        record.term,
                        record.course_code,
                        record.section_code,
                        record.day,
                        record.start_time,
                        record.end_time,
                    )
                    if key in seen:
                        continue
                    seen.add(key)
                    sections.append(record)

        self.http.persist_cookies()
        return sections

    def scrape_from_html(self, html_dir: Path, subject_code: str, term: str) -> list[SectionRecord]:
        """Offline parse of saved detail HTML files in html_dir."""
        sections: list[SectionRecord] = []
        for detail_file in sorted(Path(html_dir).glob("*.html")):
            code = detail_file.stem.upper().replace("_", " ")
            if subject_code and not code.startswith(subject_code.upper()):
                continue
            html = detail_file.read_text(encoding="utf-8")
            sections.extend(self.parse_detail_sections(html, code, term))
        return sections


__all__ = ["ScheduleScraper", "USER_AGENT"]
