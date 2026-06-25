import session from "express-session";
import { getAuthConfig } from "../config/auth.js";

export function createSessionMiddleware() {
  const { sessionSecret } = getAuthConfig();

  return session({
    name: "yorklanes.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });
}
