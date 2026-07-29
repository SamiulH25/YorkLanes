/**
 * API client for the Express backend.
 *
 * EXPAND HERE: add fetch helpers as new API routes are created.
 * Each feature owner can add a function here or in a dedicated file
 * (e.g. src/lib/courses.ts, src/lib/plans.ts).
 */
import type { DashboardSummary } from "../types/dashboard";
import { getApiUrl } from "./api-url";
import { dedupeSsrFetch } from "./ssr-request-cache";

async function fetchDashboardSummaryUncached(
  cookieHeader?: string | null,
): Promise<DashboardSummary> {
  const headers: HeadersInit = {};
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  const response = await fetch(`${getApiUrl()}/api/dashboard/summary`, {
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Dashboard API error: ${response.status}`);
  }

  return response.json() as Promise<DashboardSummary>;
}

export async function fetchDashboardSummary(cookieHeader?: string | null): Promise<DashboardSummary> {
  return dedupeSsrFetch("dashboard-summary", cookieHeader, () =>
    fetchDashboardSummaryUncached(cookieHeader),
  );
}

export interface DashboardHubResponse {
  hub: NonNullable<DashboardSummary["hub"]>;
}

async function fetchDashboardHubUncached(cookieHeader?: string | null): Promise<DashboardHubResponse> {
  const headers: HeadersInit = {};
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  const response = await fetch(`${getApiUrl()}/api/dashboard/hub`, {
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Dashboard hub API error: ${response.status}`);
  }

  return response.json() as Promise<DashboardHubResponse>;
}

export async function fetchDashboardHub(cookieHeader?: string | null): Promise<DashboardHubResponse> {
  return dedupeSsrFetch("dashboard-hub", cookieHeader, () => fetchDashboardHubUncached(cookieHeader));
}
