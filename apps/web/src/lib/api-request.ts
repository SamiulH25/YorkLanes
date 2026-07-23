/**
 * Shared fetch helpers for API calls.
 * SSR must forward the browser Cookie header — Node fetch to :3001 does not
 * send yorklanes.sid automatically after requireAuth was enabled.
 */
import { getApiUrl } from "./api-url";

export function apiUrl(path: string): string {
  const base = getApiUrl().replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function apiRequestInit(
  cookieHeader?: string | null,
  init?: RequestInit,
): RequestInit {
  const headers = new Headers(init?.headers);
  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  return {
    ...init,
    headers,
    // Browser same-origin / credentialed calls keep the session cookie.
    credentials: init?.credentials ?? "include",
  };
}
