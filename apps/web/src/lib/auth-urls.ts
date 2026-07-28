import { getApiUrl } from "./api-url";

export function googleSignInUrl(returnTo?: string, rememberMe = true): string {
  const params = new URLSearchParams();
  if (returnTo?.startsWith("/")) {
    params.set("returnTo", returnTo);
  }
  if (!rememberMe) {
    params.set("remember", "0");
  }
  const query = params.toString();
  const base = `${getApiUrl()}/api/auth/google`;
  return query ? `${base}?${query}` : base;
}

export function signOutUrl(): string {
  return `${getApiUrl()}/api/auth/logout`;
}
