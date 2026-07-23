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

from bs4 import BeautifulSoup

from catalog import CourseRecord, extract_prerequisite_codes, normalize_course_code
from cdm_http import CdmHttp, REQUEST_DELAY_SEC

USER_AGENT = CdmHttp().session.headers["User-Agent"]

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

    def get_subject_form_attributes(self) -> dict[str, Any]:
        root_html = self._get(self.course_url)

        subject_link = re.search(r'href="([^"]+)"[^>]*>\s*Subject\s*</a>', root_html, re.I)
        if not subject_link:
            raise RuntimeError("Could not find CDM subject search link on root page")

        subject_href = subject_link.group(1)
        subject_url = subject_href if subject_href.startswith("http") else self.base_url + subject_href
        subject_page_html = self._get(subject_url)

        form_action = re.search(
            r'<form[^>]+action="([^"]+)"[^>]*name="subjectSearchForm"',
            subject_page_html,
            re.I,
        )
        if not form_action:
            raise RuntimeError("Could not find CDM subject search form")

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

        action = form_action.group(1)
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

    def scrape_subject(self, subject_code: str) -> list[CourseRecord]:
        attrs = self.get_subject_form_attributes()
        subject_code = subject_code.upper()
        subject_id = next((sid for sid, code in attrs["subjects"] if code == subject_code), None)
        if subject_id is None:
            known = ", ".join(code for _, code in attrs["subjects"][:20])
            raise ValueError(f"Unknown subject '{subject_code}'. Examples: {known}")

        list_html = self.fetch_subject_list_html(attrs, subject_id)
        rows = self.parse_list_rows(list_html)

        seen: set[str] = set()
        courses: list[CourseRecord] = []

        for href, subject, number, credits, title, _ in rows:
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
