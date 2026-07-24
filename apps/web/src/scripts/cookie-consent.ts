/** Cookie consent banner — stores choice in localStorage and a minimal cookie. */
import {
  COOKIE_CONSENT_COOKIE_NAME,
  COOKIE_CONSENT_STORAGE_KEY,
  isCookieConsentChoice,
  type CookieConsentChoice,
} from "../lib/cookie-consent";

const CONSENT_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

function readStoredConsent(): CookieConsentChoice | null {
  const stored = localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
  if (isCookieConsentChoice(stored)) {
    return stored;
  }
  return null;
}

function persistConsent(choice: CookieConsentChoice): void {
  localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, choice);
  const secure = window.location.protocol === "https:";
  document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=${choice}; path=/; max-age=${CONSENT_MAX_AGE_SECONDS}; samesite=lax${secure ? "; secure" : ""}`;
}

function hideBanner(banner: HTMLElement): void {
  banner.classList.add("hidden");
  banner.setAttribute("aria-hidden", "true");
  document.documentElement.classList.remove("cookie-consent-visible");
}

function showBanner(banner: HTMLElement): void {
  banner.classList.remove("hidden");
  banner.setAttribute("aria-hidden", "false");
  document.documentElement.classList.add("cookie-consent-visible");
}

let consentClickBound = false;

function initCookieConsent(): void {
  const banner = document.getElementById("cookie-consent");
  if (!banner) {
    return;
  }

  if (readStoredConsent()) {
    hideBanner(banner);
    return;
  }

  showBanner(banner);

  if (consentClickBound) {
    return;
  }
  consentClickBound = true;

  banner.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest<HTMLButtonElement>("[data-cookie-consent]");
    if (!button) {
      return;
    }

    const choice = button.dataset.cookieConsent;
    if (!isCookieConsentChoice(choice)) {
      return;
    }

    persistConsent(choice);
    hideBanner(banner);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCookieConsent, { once: true });
} else {
  initCookieConsent();
}

document.addEventListener("astro:page-load", initCookieConsent);
