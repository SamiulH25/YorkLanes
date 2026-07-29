/** Browser-facing auth URLs — always relative so SSR HTML stays on the web origin. */

export function googleSignInUrl(returnTo?: string, rememberMe = true): string {
  const params = new URLSearchParams();
  if (returnTo?.startsWith("/")) {
    params.set("returnTo", returnTo);
  }
  if (!rememberMe) {
    params.set("remember", "0");
  }
  const query = params.toString();
  return query ? `/api/auth/google?${query}` : "/api/auth/google";
}

export function signOutUrl(): string {
  return "/api/auth/logout";
}
