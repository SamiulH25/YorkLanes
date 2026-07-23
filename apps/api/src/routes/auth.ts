/**
 * Google OAuth routes + session endpoints.
 * Setup: docs/tasks/auth.md
 */
import { Router, type Response } from "express";
import { getAuthConfig } from "../config/auth.js";
import { getPool } from "../db/index.js";
import {
  buildGoogleAuthUrl,
  createOAuthClient,
  createOAuthState,
  verifyGoogleAuthCode,
} from "../services/googleAuth.js";
import { findOrCreateGoogleUser, findUserById, toPublicUser } from "../services/users.js";

export const authRouter = Router();

function redirectToLogin(res: Response, code: string): void {
  const { webOrigin } = getAuthConfig();
  res.redirect(`${webOrigin}/login?error=${code}`);
}

authRouter.get("/status", (_req, res) => {
  const { configured, callbackUrl } = getAuthConfig();

  res.json({
    feature: "auth",
    status: configured ? "ready" : "not-configured",
    message: configured
      ? "Google sign-in is configured."
      : "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in apps/api/.env.",
    oauthEnabled: configured,
    callbackUrl: configured ? callbackUrl : undefined,
  });
});

function safeReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }
  return value;
}

authRouter.get("/google", (req, res) => {
  const { configured } = getAuthConfig();
  if (!configured) {
    redirectToLogin(res, "oauth-not-configured");
    return;
  }

  try {
    const returnTo = safeReturnTo(req.query.returnTo);
    if (returnTo) {
      req.session.returnTo = returnTo;
    } else {
      delete req.session.returnTo;
    }

    const oauth = createOAuthClient();
    const state = createOAuthState();
    req.session.oauthState = state;
    req.session.save((saveError) => {
      if (saveError) {
        console.error("[auth/google] session save", saveError);
        redirectToLogin(res, "oauth-start-failed");
        return;
      }
      res.redirect(buildGoogleAuthUrl(oauth, state));
    });
  } catch (error) {
    console.error("[auth/google]", error);
    redirectToLogin(res, "oauth-start-failed");
  }
});

authRouter.get("/google/callback", async (req, res) => {
  const { configured, webOrigin } = getAuthConfig();
  if (!configured) {
    redirectToLogin(res, "oauth-not-configured");
    return;
  }

  const googleError = typeof req.query.error === "string" ? req.query.error : null;
  if (googleError) {
    console.warn("[auth/google/callback] Google returned error:", googleError);
    redirectToLogin(res, "oauth-denied");
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;

  if (!code || !state || state !== req.session.oauthState) {
    redirectToLogin(res, "oauth-state-mismatch");
    return;
  }

  delete req.session.oauthState;

  try {
    const oauth = createOAuthClient();
    const profile = await verifyGoogleAuthCode(oauth, code);
    const user = await findOrCreateGoogleUser(getPool(), {
      googleId: profile.googleId,
      email: profile.email,
      displayName: profile.displayName,
    });

    req.session.regenerate((regenerateError) => {
      if (regenerateError) {
        console.error("[auth/google/callback] session regenerate", regenerateError);
        redirectToLogin(res, "oauth-callback-failed");
        return;
      }

      req.session.userId = user.id;
      const returnTo = safeReturnTo(req.session.returnTo);
      delete req.session.returnTo;
      res.redirect(returnTo ? `${webOrigin}${returnTo}` : `${webOrigin}/dashboard`);
    });
  } catch (error) {
    console.error("[auth/google/callback]", error);
    redirectToLogin(res, "oauth-callback-failed");
  }
});

authRouter.get("/me", async (req, res) => {
  if (!req.session.userId) {
    res.json({ user: null });
    return;
  }

  const user = await findUserById(getPool(), req.session.userId);
  if (!user) {
    req.session.destroy(() => undefined);
    res.json({ user: null });
    return;
  }

  res.json({ user: toPublicUser(user) });
});

authRouter.get("/logout", (req, res) => {
  const { webOrigin } = getAuthConfig();
  req.session.destroy((error) => {
    if (error) {
      console.error("[auth/logout]", error);
    }
    res.redirect(`${webOrigin}/login`);
  });
});
