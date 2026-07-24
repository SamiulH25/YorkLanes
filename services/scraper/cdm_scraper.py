"""Scrape course catalogue data from York CDM (WebObjects).

York CDM sits behind Cloudflare bot protection. Plain HTTP requests get HTTP 403
even on campus networks. Bootstrap a browser session first:

  npm run scraper:cdm:bootstrap
"""
from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from bs4 import BeautifulSoup

from catalog import (
    CDM_CRSQ1_PATH,
    CourseRecord,
    SessionTerm,
    default_current_terms,
    extract_prerequisite_codes,
    faculty_for_subject,
    normalize_course_code,
    term_to_crsq1_params,
)
from cdm_http import CdmHttp, REQUEST_DELAY_SEC

USER_AGENT = CdmHttp().session.headers["User-Agent"]

CRSQ1_COURSE_CODE = re.compile(
    r"(?:(?:AP|FA|HH|SC|LE|SB|GL|ES)/)?"
    r"([A-Z]+)\s+(\d{4}[A-Z]?)\s+([\d.]+)",
    re.IGNORECASE,
)

COURSE_LIST_ROW = re.compile(
    r"<a[^>]+href=\"([^\"]+)\"[^>]*>\s*"
    r"(?:AP/|FA/|HH/|SC/|LE/|SB/|GL/|ES/)?"
    r"([A-Z]+)\s+(\d{4}[A-Z]?)\s+([\d.]+)\s*</a>\s*"
    r"</td>\s*<td[^>]*>\s*([^<]+?)\s*</td>",
    re.IGNORECASE | re.DOTALL,
)


class CdmScraper:
    def __init__(self, http: CdmHttp | None = None) -> None:
        self.http = http or CdmHttp()
        self.base_url = self.http.base_url
        self.course_url = self.http.course_url
        self.session = self.http.session

    def _get(self, url: str) -> str:
        return self.http.get(url)

    def _post(self, url: str, data: dict[str, Any]) -> str:
        return self.http.post(url, data)

    def build_crsq1_url(self, subject_code: str, term: SessionTerm) -> str:
        params = term_to_crsq1_params(term)
        query = urlencode(
            {
                "faculty": faculty_for_subject(subject_code),
                "subject": subject_code.upper(),
                "academicyear": params["academicyear"],
                "studysession": params["studysession"],
            }
        )
        return f"{self.base_url}{CDM_CRSQ1_PATH}?{query}"

    def fetch_subject_list_crsq1(self, subject_code: str, term: SessionTerm) -> str:
        return self._get(self.build_crsq1_url(subject_code, term))

    def parse_crsq1_rows(self, list_html: str) -> list[tuple[str, str, str, float, str]]:
        """Parse crsq1 results; returns (schedule_href, subject, number, credits, title)."""
        soup = BeautifulSoup(list_html, "html.parser")
        parsed: list[tuple[str, str, str, float, str]] = []

        for row in soup.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 3:
                continue

            course_text = cells[0].get_text(" ", strip=True)
            match = CRSQ1_COURSE_CODE.match(course_text)
            if not match:
                continue

            subject, number, credits = match.groups()
            title = cells[1].get_text(" ", strip=True)

            schedule_href = None
            for link in cells[2].find_all("a", href=True):
                link_text = link.get_text(" ", strip=True).lower()
                if "schedule" in link_text:
                    schedule_href = link["href"]
                    break
            if not schedule_href:
                fallback = cells[2].find("a", href=True)
                schedule_href = fallback["href"] if fallback else None
            if schedule_href:
                parsed.append(
                    (
                        schedule_href,
                        subject.upper(),
                        number.upper(),
                        float(credits),
                        title,
                    )
                )

        return parsed

    def get_subject_form_attributes(self) -> dict[str, Any]:
        root_html = self._get(self.course_url)

        subject_link = re.search(r'href="([^"]+)"[^>]*>\s*Subject\s*</a>', root_html, re.I)
        if not subject_link:
            raise RuntimeError("Could not find CDM subject search link on root page")

        subject_href = subject_link.group(1)
        subject_url = subject_href if subject_href.startswith("http") else self.base_url + subject_href
        subject_page_html = self._get(subject_url)

        form_action_url = None
        form_action_match = re.search(
            r'<form[^>]+action="([^"]+)"[^>]*name="subjectSearchForm"',
            subject_page_html,
            re.I,
        )
        if form_action_match:
            form_action_url = form_action_match.group(1)
        else:
            soup = BeautifulSoup(subject_page_html, "html.parser")
            form = soup.find("form", attrs={"name": "subjectSearchForm"})
            if not form:
                form = soup.find("form", attrs={"name": re.compile("subject", re.I)})
            if form and form.get("action"):
                form_action_url = form["action"]

        if not form_action_url:
            raise RuntimeError(
                "Could not find CDM subject search form. "
                "Use the crsq1 direct search path instead (schedule/cdm commands do this automatically)."
            )

        wosid = re.search(r'name="wosid"\s+value="([^"]+)"', subject_page_html, re.I)
        if not wosid:
            raise RuntimeError("Could not find CDM wosid session token")

        subjects = [
            (int(value), code.upper())
            for value, code in re.findall(
                r'<option\s+value="(\d+)">([A-Za-z]{2,6})\s+-',
                subject_page_html,
                re.I,
            )
        ]

        action = form_action_url
        form_url = action if action.startswith("http") else self.base_url + action

        return {
            "form_url": form_url,
            "wosid": wosid.group(1),
            "subjects": subjects,
            "subject_page_html": subject_page_html,
        }

    def fetch_subject_list_html(self, attrs: dict[str, Any], subject_id: int) -> str:
        return self._post(
            attrs["form_url"],
            {
                "sessionPopUp": 0,
                "subjectPopUp": subject_id,
                "wosid": attrs["wosid"],
                "3.10.7.5": "Search Courses",
            },
        )

    def parse_list_rows(self, list_html: str) -> list[tuple[str, str, str, float, str, str]]:
        rows = COURSE_LIST_ROW.findall(list_html)
        if rows:
            return [
                (href, subject, number, float(credits), title.strip(), f"{subject} {number}")
                for href, subject, number, credits, title in rows
            ]

        soup = BeautifulSoup(list_html, "html.parser")
        parsed: list[tuple[str, str, str, float, str, str]] = []
        for row in soup.select("tr"):
            cells = row.find_all("td")
            if len(cells) < 2:
                continue
            link = cells[0].find("a", href=True)
            if not link:
                continue
            code_text = link.get_text(" ", strip=True)
            match = re.match(
                r"(?:AP/|FA/|HH/|SC/|LE/|SB/|GL/|ES/)?"
                r"([A-Z]+)\s+(\d{4}[A-Z]?)\s+([\d.]+)",
                code_text,
                re.I,
            )
            if not match:
                continue
            subject, number, credits = match.groups()
            parsed.append(
                (
                    link["href"],
                    subject.upper(),
                    number.upper(),
                    float(credits),
                    cells[1].get_text(" ", strip=True),
                    f"{subject.upper()} {number.upper()}",
                )
            )
        return parsed

    def fetch_course_description(self, detail_href: str) -> str | None:
        url = detail_href if detail_href.startswith("http") else self.base_url + detail_href
        html = self._get(url)
        soup = BeautifulSoup(html, "html.parser")

        for paragraph in soup.find_all("p"):
            label = paragraph.get_text(" ", strip=True).lower()
            if label.startswith("course description"):
                sibling = paragraph.find_next_sibling("p")
                if sibling:
                    return sibling.get_text(" ", strip=True)
        return None

    def scrape_subject(self, subject_code: str, term: SessionTerm | None = None) -> list[CourseRecord]:
        subject_code = subject_code.upper()
        current_term = term or default_current_terms()[0]
        list_html = self.fetch_subject_list_crsq1(subject_code, current_term)
        rows = self.parse_crsq1_rows(list_html)

        seen: set[str] = set()
        courses: list[CourseRecord] = []

        for href, subject, number, credits, title in rows:
            if subject != subject_code:
                continue
            code = normalize_course_code(subject, number)
            if code in seen:
                continue
            seen.add(code)

            description = self.fetch_course_description(href)
            prereqs = extract_prerequisite_codes(description or "", number)

            courses.append(
                CourseRecord(
                    code=code,
                    title=title,
                    credits=credits,
                    department=subject,
                    description=description,
                    prerequisite_codes=prereqs,
                    source="cdm",
                )
            )

        self.http.persist_cookies()
        return courses
