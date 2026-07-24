export const COOKIE_CONSENT_STORAGE_KEY = "yorklanes-cookie-consent";
export const COOKIE_CONSENT_COOKIE_NAME = "cookie_consent";

export type CookieConsentChoice = "all" | "essential";

export function isCookieConsentChoice(value: string | null | undefined): value is CookieConsentChoice {
  return value === "all" || value === "essential";
}
