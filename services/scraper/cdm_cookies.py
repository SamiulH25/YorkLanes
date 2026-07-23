"""Import browser cookies for CDM without installing Playwright."""
from __future__ import annotations

import json
from http.cookiejar import MozillaCookieJar
from pathlib import Path

from cdm_http import CDM_ROOT_URL, DEFAULT_STATE_FILE, CdmHttp, CdmChallengeError


def cookies_from_netscape(path: Path) -> list[dict]:
    jar = MozillaCookieJar(str(path))
    jar.load(ignore_discard=True, ignore_expires=True)

    cookies: list[dict] = []
    for cookie in jar:
        cookies.append(
            {
                "name": cookie.name,
                "value": cookie.value,
                "domain": cookie.domain,
                "path": cookie.path or "/",
            }
        )
    return cookies


def cookies_from_playwright_json(path: Path) -> list[dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    raw = payload.get("cookies", payload)
    if not isinstance(raw, list):
        raise ValueError("Expected a JSON object with a cookies array")
    return [item for item in raw if isinstance(item, dict) and item.get("name")]


def write_storage_state(cookies: list[dict], out_path: Path) -> None:
    if not cookies:
        raise ValueError("No cookies found in input file")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({"cookies": cookies}, indent=2), encoding="utf-8")


def verify_cdm_session(state_path: Path) -> None:
    client = CdmHttp(state_path=state_path)
    client.get(CDM_ROOT_URL)


def import_cookie_file(source: Path, out_path: Path | None = None) -> Path:
    target = out_path or DEFAULT_STATE_FILE
    suffix = source.suffix.lower()

    if suffix in {".txt", ".cookies"}:
        cookies = cookies_from_netscape(source)
    elif suffix == ".json":
        cookies = cookies_from_playwright_json(source)
    else:
        raise ValueError("Unsupported cookie file type. Use .txt (Netscape) or .json (Playwright export).")

    write_storage_state(cookies, target)
    verify_cdm_session(target)
    return target
