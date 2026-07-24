const DAY_MS = 24 * 60 * 60 * 1000;

export interface AuthConfig {
  clientId: string | undefined;
  clientSecret: string | undefined;
  callbackUrl: string;
  webOrigin: string;
  sessionSecret: string;
  /** Persistent sign-in cookie lifetime (default 30 days). */
  sessionPersistentMaxAgeMs: number;
  configured: boolean;
}

export function getAuthConfig(): AuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const callbackUrl =
    process.env.GOOGLE_CALLBACK_URL?.trim() ??
    "http://localhost:4321/api/auth/google/callback";
  const webOrigin = process.env.WEB_ORIGIN?.trim() ?? "http://localhost:4321";
  const sessionSecret = process.env.SESSION_SECRET?.trim();
  const sessionMaxAgeDays = Number(process.env.SESSION_MAX_AGE_DAYS ?? "30");
  const sessionPersistentMaxAgeMs =
    Number.isFinite(sessionMaxAgeDays) && sessionMaxAgeDays > 0
      ? sessionMaxAgeDays * DAY_MS
      : 30 * DAY_MS;

  return {
    clientId,
    clientSecret,
    callbackUrl,
    webOrigin,
    sessionSecret: sessionSecret || "dev-insecure-session-secret",
    sessionPersistentMaxAgeMs,
    configured: Boolean(clientId && clientSecret),
  };
}
