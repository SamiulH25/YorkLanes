export interface AuthConfig {
  clientId: string | undefined;
  clientSecret: string | undefined;
  callbackUrl: string;
  webOrigin: string;
  sessionSecret: string;
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

  return {
    clientId,
    clientSecret,
    callbackUrl,
    webOrigin,
    sessionSecret: sessionSecret || "dev-insecure-session-secret",
    configured: Boolean(clientId && clientSecret),
  };
}
