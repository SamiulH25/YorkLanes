/**
 * API client for the Express backend.
 *
 * EXPAND HERE: add fetch helpers as new API routes are created.
 * Each feature owner can add a function here or in a dedicated file
 * (e.g. src/lib/courses.ts, src/lib/plans.ts).
 */
import type { DashboardSummary } from "../types/dashboard";

const API_URL = import.meta.env.PUBLIC_API_URL ?? "http://localhost:3001";

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const response = await fetch(`${API_URL}/api/dashboard/summary`);

  if (!response.ok) {
    throw new Error(`Dashboard API error: ${response.status}`);
  }

  return response.json() as Promise<DashboardSummary>;
}
