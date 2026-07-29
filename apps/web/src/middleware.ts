import type { MiddlewareHandler } from "astro";
import { fetchAuthStatus, fetchSessionUser } from "./lib/auth";
import { fetchWithRetry } from "./lib/fetch-retry";
import { runWithSsrRequestCache } from "./lib/ssr-request-cache";

const API_ORIGIN = import.meta.env.API_INTERNAL_URL ?? "http://localhost:3001";

function shouldProxyApi(): boolean {
  if (import.meta.env.DEV) return true;
  return Boolean(import.meta.env.API_INTERNAL_URL?.trim());
}

const PROTECTED_PATHS = [
  "/dashboard",
  "/plan",
  "/courses",
  "/schedule",
  "/progress",
  "/finance",
  "/assignments",
  "/onboarding",
  "/messages",
  "/notifications",
  "/settings",
];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

async function proxyApiRequest(context: Parameters<MiddlewareHandler>[0]): Promise<Response> {
  const { pathname, search } = context.url;
  const target = `${API_ORIGIN}${pathname}${search}`;
  const request = context.request;
  const headers = new Headers(request.headers);
  headers.delete("host");

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  // Only attach a body for methods that may carry one. Forwarding DELETE/GET with
  // duplex/body has caused upstream proxies to drop or mishandle mutations.
  if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
    init.body = request.body;
    init.duplex = "half";
  }

  try {
    const response = await fetchWithRetry(target, init, { attempts: 4, baseDelayMs: 600 });
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch {
    return new Response(JSON.stringify({ error: "API unreachable." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function requiresAuthRedirect(context: Parameters<MiddlewareHandler>[0]): Promise<boolean> {
  const cookie = context.request.headers.get("cookie");
  try {
    const user = await fetchSessionUser(cookie);
    if (user) return false;

    const status = await fetchAuthStatus();
    return status.oauthEnabled;
  } catch {
    return false;
  }
}

export const onRequest: MiddlewareHandler = async (context, next) => {
  return runWithSsrRequestCache(async () => {
    const { pathname, search } = context.url;

    if (pathname.startsWith("/api") || pathname === "/health") {
      if (shouldProxyApi()) {
        return proxyApiRequest(context);
      }
      return next();
    }

    if (isProtectedPath(pathname) && (await requiresAuthRedirect(context))) {
      return context.redirect(`/login?returnTo=${encodeURIComponent(`${pathname}${search}`)}`);
    }

    return next();
  });
};
