import type { MiddlewareHandler } from "astro";

const API_ORIGIN = "http://localhost:3001";

export const onRequest: MiddlewareHandler = async (context, next) => {
  if (!import.meta.env.DEV) {
    return next();
  }

  const { pathname, search } = context.url;
  if (!pathname.startsWith("/api") && pathname !== "/health") {
    return next();
  }

  const target = `${API_ORIGIN}${pathname}${search}`;
  const request = context.request;
  const headers = new Headers(request.headers);
  headers.delete("host");

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  try {
    const response = await fetch(target, init);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch {
    return new Response(JSON.stringify({ error: "API unreachable. Is npm run start:dev running?" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
};
