"""Bootstrap a CDM session through a real browser (passes Cloudflare challenges)."""
from __future__ import annotations

from pathlib import Path

from cdm_http import CDM_ROOT_URL, DEFAULT_STATE_FILE, looks_like_cdm_page


def bootstrap_cdm_session(
    state_path: Path | None = None,
    *,
    headless: bool = False,
    timeout_ms: int = 120_000,
) -> Path:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError(
            "Playwright is not installed. Run:\n"
            "  pip install -r requirements-browser.txt\n"
            "  playwright install chromium"
        ) from exc

    target = state_path or DEFAULT_STATE_FILE
    target.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=headless)
        context = browser.new_context(
            locale="en-CA",
            timezone_id="America/Toronto",
        )
        page = context.new_page()
        page.goto(CDM_ROOT_URL, wait_until="domcontentloaded", timeout=timeout_ms)

        try:
            page.wait_for_function(
                """() => {
                    const title = document.title || '';
                    const body = document.body ? document.body.innerText : '';
                    if (title.includes('Just a moment')) return false;
                    return body.length > 400;
                }""",
                timeout=timeout_ms,
            )
        except Exception as exc:
            browser.close()
            raise RuntimeError(
                "Timed out waiting for York CDM to load. "
                "Re-run without --headless and complete any Cloudflare check in the browser window."
            ) from exc

        html = page.content()
        if not looks_like_cdm_page(html):
            browser.close()
            raise RuntimeError(
                "Browser reached York SIS but the page does not look like CDM. "
                "Try again with a visible browser window (omit --headless)."
            )

        context.storage_state(path=str(target))
        browser.close()

    return target
