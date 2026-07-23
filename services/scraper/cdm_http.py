"""HTTP client for York CDM with browser-like headers and saved session cookies."""
from __future__ import annotations

import json
import time
from pathlib import Path

import requests

CDM_BASE_URL = "https://w2prod.sis.yorku.ca"
CDM_ROOT_URL = f"{CDM_BASE_URL}/Apps/WebObjects/cdm"
DEFAULT_STATE_FILE = Path(__file__).parent / "cdm_session.json"
REQUEST_DELAY_SEC = 1.5

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-CA,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}


class CdmChallengeError(RuntimeError):
    """Raised when Cloudflare serves a bot challenge instead of CDM HTML."""

    def __init__(self, url: str) -> None:
        self.url = url
        super().__init__(f"Cloudflare challenge at {url}")


def is_cloudflare_challenge(html: str, status_code: int | None = None) -> bool:
    if status_code == 403:
        return True
    lowered = html.lower()
    return (
        "just a moment" in lowered
        or "cf_chl_opt" in lowered
        or "challenge-platform" in lowered
        or "enable javascript and cookies" in lowered
    )


def looks_like_cdm_page(html: str) -> bool:
    lowered = html.lower()
    return any(
        marker in lowered
        for marker in (
            "webobjects",
            "subjectsearchform",
            "york courses",
            "search courses",
            "course description",
        )
    )


def load_storage_state(session: requests.Session, state_path: Path) -> bool:
    if not state_path.is_file():
        return False

    try:
        payload = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False

    cookies = payload.get("cookies", [])
    if not isinstance(cookies, list):
        return False

    for cookie in cookies:
        if not isinstance(cookie, dict) or "name" not in cookie or "value" not in cookie:
            continue
        session.cookies.set(
            cookie["name"],
            cookie["value"],
            domain=cookie.get("domain"),
            path=cookie.get("path", "/"),
        )
    return bool(cookies)


def save_storage_state(session: requests.Session, state_path: Path) -> None:
    cookies = []
    for cookie in session.cookies:
        cookies.append(
            {
                "name": cookie.name,
                "value": cookie.value,
                "domain": cookie.domain,
                "path": cookie.path,
            }
        )
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps({"cookies": cookies}, indent=2), encoding="utf-8")


class CdmHttp:
    def __init__(
        self,
        session: requests.Session | None = None,
        state_path: Path | None = None,
    ) -> None:
        self.base_url = CDM_BASE_URL
        self.course_url = CDM_ROOT_URL
        self.state_path = state_path or DEFAULT_STATE_FILE
        self.session = session or requests.Session()
        self.session.headers.update(BROWSER_HEADERS)
        load_storage_state(self.session, self.state_path)
        self._last_referer = self.course_url

    def has_saved_session(self) -> bool:
        return self.state_path.is_file()

    def _validate(self, response: requests.Response) -> None:
        if is_cloudflare_challenge(response.text, response.status_code):
            raise CdmChallengeError(response.url)
        if response.status_code >= 400:
            response.raise_for_status()
        if not looks_like_cdm_page(response.text):
            raise CdmChallengeError(response.url)

    def get(self, url: str) -> str:
        response = self.session.get(
            url,
            timeout=60,
            headers={"Referer": self._last_referer},
        )
        self._validate(response)
        self._last_referer = url
        time.sleep(REQUEST_DELAY_SEC)
        return response.text

    def post(self, url: str, data: dict) -> str:
        response = self.session.post(
            url,
            data=data,
            timeout=60,
            headers={
                "Referer": self._last_referer,
                "Origin": self.base_url,
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        self._validate(response)
        self._last_referer = url
        time.sleep(REQUEST_DELAY_SEC)
        return response.text

    def persist_cookies(self) -> None:
        save_storage_state(self.session, self.state_path)
