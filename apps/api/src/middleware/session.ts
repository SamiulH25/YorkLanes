import session from "express-session";
import { getAuthConfig } from "../config/auth.js";

export function createSessionMiddleware() {
  const { sessionSecret, sessionPersistentMaxAgeMs } = getAuthConfig();

  return session({
    name: "yorklanes.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionPersistentMaxAgeMs,
    },
  });
}
