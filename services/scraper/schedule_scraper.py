"""Scrape course section / timetable data from York CDM (WebObjects).

Requires a browser-bootstrapped CDM session (Cloudflare). Schedule meeting times
also require Passport York cookies — export cookies while logged into CDM.
"""
from __future__ import annotations

import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup

from catalog import (
    SectionRecord,
    SessionTerm,
    default_current_terms,
    faculty_for_subject,
    normalize_course_code,
    normalize_section_code,
    parse_meeting_cell,
)
from cdm_http import CDM_ROOT_URL, CdmHttp
from cdm_scraper import CdmScraper, USER_AGENT
from timetable_parser import (
    CDM_ACTIVE_TIMETABLES_URL,
    PassportYorkRequiredError,
    decode_timetable_bytes,
    discover_active_timetables_url,
    extract_timetable_links,
    filename_matches_term,
    has_passport_york_cookies,
    is_login_gated_schedule,
    parse_active_timetable_html,
    parse_cdm_course_schedule_tables,
    parse_meeting_schedule_cell,
)

DEFAULT_WORKERS = 4

SECTION_HEADER_LABELS = ("section", "day", "time", "campus", "room", "instructor", "mode", "location")
SECTION_KEYWORDS = ("lecture", "tutorial", "lab", "seminar", "section")

SectionKey = tuple[str, str, str, str, str, str]
CourseRow = tuple[str, str, str]

_SUMMER_TIMETABLE_SUFFIXES = ("UG", "GS", "LW", "SB")


class ScheduleScraper(CdmScraper):
    def __init__(self, http=None, *, verbose: bool = True, workers: int = DEFAULT_WORKERS) -> None:
        super().__init__(http)
        self.verbose = verbose
        self.workers = max(1, workers)
        self._timetable_links: list[str] | None = None
        self._active_timetables_url: str | None = None

    def _active_timetables_index_url(self) -> str:
        if self._active_timetables_url:
            return self._active_timetables_url

        root_html = self._get(CDM_ROOT_URL)
        discovered = discover_active_timetables_url(root_html)
        if discovered:
            self._active_timetables_url = discovered
            return discovered

        self._active_timetables_url = CDM_ACTIVE_TIMETABLES_URL
        return CDM_ACTIVE_TIMETABLES_URL

    def _load_timetable_links(self) -> list[str]:
        if self._timetable_links is not None:
            return self._timetable_links

        index_url = self._active_timetables_index_url()
        index_html = self._get(index_url)
        links = extract_timetable_links(index_html)
        if not links and index_url != CDM_ACTIVE_TIMETABLES_URL:
            index_html = self._get(CDM_ACTIVE_TIMETABLES_URL)
            links = extract_timetable_links(index_html)
            if links:
                self._active_timetables_url = CDM_ACTIVE_TIMETABLES_URL

        self._timetable_links = links
        return links

    def _progress(self, message: str) -> None:
        if self.verbose:
            print(message, file=sys.stderr, flush=True)

    def list_terms(self) -> list[Any]:
        """Return likely-active terms without relying on the legacy subject search form."""
        return default_current_terms()

    def _cookie_names(self) -> list[str]:
        return [cookie.name for cookie in self.http.session.cookies]

    def _ensure_passport_york(self, html: str) -> None:
        if is_login_gated_schedule(html) and not has_passport_york_cookies(self._cookie_names()):
            raise PassportYorkRequiredError(
                "CDM is hiding meeting day/time/location behind Passport York login. "
                "Export cookies from a browser session where you are logged into York CDM "
                "(not just past Cloudflare), then run: npm run scraper:cdm:import-cookies"
            )

    def _timetable_urls_for_term(self, term: SessionTerm, subject_code: str) -> list[str]:
        links = self._load_timetable_links()
        faculty = faculty_for_subject(subject_code)
        selected: list[str] = []
        for link in links:
            filename = link.rsplit("/", 1)[-1].upper()
            if not filename_matches_term(filename, term.term_kind, term.year):
                continue
            if term.term_kind == "SUMMER":
                if any(filename.endswith(f"{suffix}.HTML") for suffix in _SUMMER_TIMETABLE_SUFFIXES):
                    selected.append(link)
                continue
            if filename.endswith(f"{faculty}.HTML"):
                selected.append(link)

        if term.term_kind == "SUMMER" and not selected:
            for link in links:
                filename = link.rsplit("/", 1)[-1].upper()
                if filename_matches_term(filename, term.term_kind, term.year):
                    selected.append(link)

        return selected

    def _fetch_timetable_html(self, url: str) -> str:
        raw = self.http.fetch_bytes(url, referer=self._active_timetables_index_url())
        html = decode_timetable_bytes(raw)
        if "passport york login" in html.lower():
            raise PassportYorkRequiredError(
                "Active timetable export requires Passport York cookies. "
                "Log into CDM in your browser, export cookies, and import them with "
                "npm run scraper:cdm:import-cookies"
            )
        return html

    def scrape_from_active_timetable(self, subject_code: str, term: SessionTerm) -> list[SectionRecord]:
        subject_code = subject_code.upper()
        urls = self._timetable_urls_for_term(term, subject_code)
        if not urls:
            return []

        records: list[SectionRecord] = []
        for url in urls:
            filename = url.rsplit("/", 1)[-1]
            self._progress(
                f"  loading active timetable {filename} (CDM bulk export for {term.code})..."
            )
            html = self._fetch_timetable_html(url)
            parsed = parse_active_timetable_html(
                html,
                subject_code=subject_code,
                term_code=term.code,
                term_kind=term.term_kind,
            )
            self._progress(f"  {filename}: {len(parsed)} meetings for {subject_code}")
            records.extend(parsed)
        return records

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
        records = parse_cdm_course_schedule_tables(html, course_code, term)
        if records:
            return records

        soup = BeautifulSoup(html, "html.parser")
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

                schedule_cell = cells[headers["time"]]
                meetings = parse_meeting_schedule_cell(schedule_cell)
                if not meetings:
                    time_cell = schedule_cell.get_text(" ", strip=True)
                    meetings = [
                        (day, start, end, None, None)
                        for day, start, end in parse_meeting_cell(time_cell)
                    ]
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

                for day, start, end, meeting_room, meeting_campus in meetings:
                    records.append(
                        SectionRecord(
                            term=term,
                            course_code=course_code,
                            section_code=section_code,
                            day=day,
                            start_time=start,
                            end_time=end,
                            campus=meeting_campus or campus or None,
                            room=meeting_room or room or None,
                            instructor=instructor or None,
                            delivery_mode=delivery_mode or None,
                            source="cdm",
                        )
                    )

        return records

    def _fetch_course_sections(
        self,
        http: CdmHttp,
        href: str,
        subject: str,
        number: str,
        term_code: str,
    ) -> tuple[str, list[SectionRecord]]:
        code = normalize_course_code(subject, number)
        url = href if href.startswith("http") else self.base_url + href
        detail_html = http.get(url)
        self._ensure_passport_york(detail_html)
        return code, self.parse_detail_sections(detail_html, code, term_code)

    def _merge_course_sections(
        self,
        course_sections: list[SectionRecord],
        seen: set[SectionKey],
        sections: list[SectionRecord],
    ) -> int:
        added = 0
        for record in course_sections:
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
            added += 1
        return added

    def _scrape_course_rows(
        self,
        course_rows: list[CourseRow],
        term_code: str,
        seen: set[SectionKey],
        sections: list[SectionRecord],
    ) -> None:
        total = len(course_rows)
        if total == 0:
            return

        if self.workers <= 1:
            for index, (href, subject, number) in enumerate(course_rows, start=1):
                code = normalize_course_code(subject, number)
                self._progress(f"  [{index}/{total}] {code} ...")
                _, course_sections = self._fetch_course_sections(self.http, href, subject, number, term_code)
                added = self._merge_course_sections(course_sections, seen, sections)
                self._progress(f"  [{index}/{total}] {code} — {added} meetings")
            return

        self._progress(f"  scraping {total} courses with {self.workers} workers...")
        merge_lock = threading.Lock()
        completed = 0

        def worker(row: CourseRow) -> tuple[str, list[SectionRecord]]:
            href, subject, number = row
            return self._fetch_course_sections(self.http.fork(), href, subject, number, term_code)

        with ThreadPoolExecutor(max_workers=self.workers) as executor:
            futures = {executor.submit(worker, row): row for row in course_rows}
            for future in as_completed(futures):
                href, subject, number = futures[future]
                code = normalize_course_code(subject, number)
                try:
                    code, course_sections = future.result()
                except Exception as exc:
                    self._progress(f"  failed {code}: {exc}")
                    continue

                with merge_lock:
                    added = self._merge_course_sections(course_sections, seen, sections)
                    completed += 1
                    progress_index = completed

                self._progress(f"  [{progress_index}/{total}] {code} — {added} meetings")

    def scrape_subject_term(self, subject_code: str, term: Any, all_terms: bool = False) -> list[SectionRecord]:
        subject_code = subject_code.upper()
        terms = [term]
        if all_terms:
            terms = self.list_terms()

        sections: list[SectionRecord] = []
        seen: set[SectionKey] = set()

        for current in terms:
            if len(terms) > 1:
                self._progress(f"  term {current.code}")

            self._progress(f"  trying active timetable export for {subject_code} ({current.code})...")
            try:
                bulk_sections = self.scrape_from_active_timetable(subject_code, current)
            except PassportYorkRequiredError:
                raise
            except Exception as exc:
                self._progress(f"  active timetable unavailable: {exc}")
                bulk_sections = []

            if bulk_sections:
                self._merge_course_sections(bulk_sections, seen, sections)
                continue

            self._progress(f"  fetching course list for {subject_code} ({current.code})...")
            list_html = self.fetch_subject_list_crsq1(subject_code, current)
            rows = self.parse_crsq1_rows(list_html)
            seen_hrefs: set[str] = set()
            course_rows: list[CourseRow] = []

            for href, subject, number, _credits, _title in rows:
                if subject != subject_code:
                    continue
                if href in seen_hrefs:
                    continue
                seen_hrefs.add(href)
                course_rows.append((href, subject, number))

            self._progress(f"  found {len(course_rows)} courses")
            before = len(sections)
            self._scrape_course_rows(course_rows, current.code, seen, sections)
            if len(sections) == before and course_rows:
                sample_href = course_rows[0][0]
                sample_url = sample_href if sample_href.startswith("http") else self.base_url + sample_href
                sample_html = self._get(sample_url)
                self._ensure_passport_york(sample_html)

        self._progress(f"  done: {len(sections)} total meetings for {subject_code}")
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


__all__ = ["DEFAULT_WORKERS", "PassportYorkRequiredError", "ScheduleScraper", "USER_AGENT"]
