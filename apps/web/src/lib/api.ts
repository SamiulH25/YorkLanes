/**
 * API client for the Express backend.
 *
 * EXPAND HERE: add fetch helpers as new API routes are created.
 * Each feature owner can add a function here or in a dedicated file
 * (e.g. src/lib/courses.ts, src/lib/plans.ts).
 */
import type { DashboardSummary } from "../types/dashboard";
import { getApiUrl } from "./api-url";

const API_URL = getApiUrl();

export async function fetchDashboardSummary(cookieHeader?: string | null): Promise<DashboardSummary> {
  const headers: HeadersInit = {};
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  const response = await fetch(`${API_URL}/api/dashboard/summary`, {
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Dashboard API error: ${response.status}`);
  }

  return response.json() as Promise<DashboardSummary>;
}
