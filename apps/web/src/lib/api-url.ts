/**
 * API base URL for fetch calls.
 *
 * - Browser: use the web origin (4321) so OAuth and cookies stay on one host (middleware proxies /api).
 * - SSR (Astro server): call the API directly on 3001 — middleware only runs for incoming browser requests.
 */
export function getApiUrl(): string {
  const publicUrl = import.meta.env.PUBLIC_API_URL ?? "http://localhost:4321";

  if (import.meta.env.SSR) {
    return import.meta.env.API_INTERNAL_URL ?? "http://localhost:3001";
  }

  return publicUrl;
}
