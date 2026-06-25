/** Task guide: docs/tasks/finance.md */
import { getApiUrl } from "./api-url";

const API_URL = getApiUrl();

export interface FinanceResponse {
  feature: string;
  status: string;
  message: string;
  nextSteps: string[];
  entries: unknown[];
  balance: number;
}

export async function fetchFinance(): Promise<FinanceResponse> {
  const response = await fetch(`${API_URL}/api/finance`);
  if (!response.ok) throw new Error(`Finance API error: ${response.status}`);
  return response.json() as Promise<FinanceResponse>;
}
