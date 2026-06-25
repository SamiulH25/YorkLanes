import { getApiUrl } from "./api-url";

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
}

export async function fetchSessionUser(cookieHeader?: string | null): Promise<SessionUser | null> {
  const headers: HeadersInit = {};
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  try {
    const response = await fetch(`${getApiUrl()}/api/auth/me`, { headers });
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { user: SessionUser | null };
    return data.user;
  } catch {
    return null;
  }
}

export async function fetchAuthStatus(): Promise<{
  oauthEnabled: boolean;
  message: string;
}> {
  try {
    const response = await fetch(`${getApiUrl()}/api/auth/status`);
    if (!response.ok) {
      return {
        oauthEnabled: false,
        message:
          response.status === 404
            ? "API route not found. Restart with npm run start:dev (api and web)."
            : `Auth API returned ${response.status}. Is the API running on port 3001?`,
      };
    }
    const data = (await response.json()) as { oauthEnabled?: boolean; message?: string };
    return {
      oauthEnabled: Boolean(data.oauthEnabled),
      message: data.message ?? "Auth status unavailable.",
    };
  } catch {
    return {
      oauthEnabled: false,
      message: "Cannot reach the API. Run npm run start:dev from the repo root.",
    };
  }
}

export function googleSignInUrl(): string {
  return `${getApiUrl()}/api/auth/google`;
}

export function signOutUrl(): string {
  return `${getApiUrl()}/api/auth/logout`;
}
