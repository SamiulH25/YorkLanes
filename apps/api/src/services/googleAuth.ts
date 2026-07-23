import { randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { getAuthConfig } from "../config/auth.js";

export function createOAuthClient(): OAuth2Client {
  const { clientId, clientSecret, callbackUrl, configured } = getAuthConfig();
  if (!configured || !clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured");
  }
  return new OAuth2Client(clientId, clientSecret, callbackUrl);
}

export function buildGoogleAuthUrl(oauth: OAuth2Client, state: string): string {
  return oauth.generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
    state,
  });
}

export function createOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export async function verifyGoogleAuthCode(
  oauth: OAuth2Client,
  code: string,
): Promise<{ googleId: string; email: string; displayName: string }> {
  const { tokens } = await oauth.getToken(code);
  const idToken = tokens.id_token;
  if (!idToken) {
    throw new Error("Google did not return an ID token");
  }

  const { clientId } = getAuthConfig();
  const ticket = await oauth.verifyIdToken({
    idToken,
    audience: clientId,
  });

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error("Google profile is missing required fields");
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    displayName: payload.name?.trim() || payload.email.split("@")[0],
  };
}
