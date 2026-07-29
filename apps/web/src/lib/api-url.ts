/**
 * API base URL helpers.
 *
 * - SSR server fetches: API_INTERNAL_URL (direct to Express).
 * - Browser fetches: same-origin (middleware proxies /api/*).
 * - Browser-facing links in SSR HTML: relative /api/* paths (see auth-urls.ts).
 */
export function getSsrApiUrl(): string {
  return import.meta.env.API_INTERNAL_URL ?? "http://localhost:3001";
}

/** Origin for browser-side API calls (middleware proxy on the web host). */
export function getBrowserApiUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return import.meta.env.PUBLIC_API_URL ?? "http://localhost:4321";
}

export function getApiUrl(): string {
  if (import.meta.env.SSR) {
    return getSsrApiUrl();
  }
  return getBrowserApiUrl();
}
