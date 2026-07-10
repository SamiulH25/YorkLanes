/** Task guide: docs/tasks/finance.md */
import { getApiUrl } from "./api-url";

const API_URL = getApiUrl();

export type FinanceEntryKind = "income" | "expense";

export interface FinanceEntry {
  id: string;
  label: string;
  amountCents: number;
  category: string;
  kind: FinanceEntryKind;
  occurredOn: string;
  createdAt: string;
}

export interface FinanceSummary {
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  currency: "CAD";
  categoryTotals: Array<{ category: string; amountCents: number }>;
}

export interface FinanceBudget {
  id?: string;
  month: string;
  amountCents: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface FinanceMonthlyTotal {
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
}

export interface FinanceEntriesResponse {
  entries: FinanceEntry[];
  summary: FinanceSummary;
}

export interface FinanceResponse extends FinanceEntriesResponse {
  feature: string;
  status: string;
  message: string;
  balance: number;
}

export async function fetchFinance(): Promise<FinanceResponse> {
  const response = await fetch(`${API_URL}/api/finance`);
  if (!response.ok) throw new Error(`Finance API error: ${response.status}`);
  return response.json() as Promise<FinanceResponse>;
}

export async function fetchFinanceEntries(): Promise<FinanceEntriesResponse> {
  const response = await fetch(`${API_URL}/api/finance/entries`);
  if (!response.ok) throw new Error(`Finance entries API error: ${response.status}`);
  return response.json() as Promise<FinanceEntriesResponse>;
}

export async function fetchFinanceMonthlySummary(): Promise<{ months: FinanceMonthlyTotal[] }> {
  const response = await fetch(`${API_URL}/api/finance/monthly-summary`);
  if (!response.ok) throw new Error(`Finance monthly summary API error: ${response.status}`);
  return response.json() as Promise<{ months: FinanceMonthlyTotal[] }>;
}

export async function fetchFinanceBudget(month: string): Promise<{ budget: FinanceBudget }> {
  const response = await fetch(`${API_URL}/api/finance/budget/${month}`);
  if (!response.ok) throw new Error(`Finance budget API error: ${response.status}`);
  return response.json() as Promise<{ budget: FinanceBudget }>;
}

export async function saveFinanceBudget(month: string, amount: number): Promise<{ budget: FinanceBudget }> {
  const response = await fetch(`${API_URL}/api/finance/budget/${month}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
  if (!response.ok) throw new Error(`Finance budget API error: ${response.status}`);
  return response.json() as Promise<{ budget: FinanceBudget }>;
}

export async function deleteFinanceEntry(entryId: string): Promise<{ deleted: boolean; summary: FinanceSummary }> {
  const response = await fetch(`${API_URL}/api/finance/entries/${entryId}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Finance delete API error: ${response.status}`);
  return response.json() as Promise<{ deleted: boolean; summary: FinanceSummary }>;
}

export async function updateFinanceEntry(input: {
  entryId: string;
  label: string;
  amount: number;
  category: string;
  kind: FinanceEntryKind;
  occurredOn?: string;
}): Promise<{ entry: FinanceEntry; summary: FinanceSummary }> {
  const response = await fetch(`${API_URL}/api/finance/entries/${input.entryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: input.label,
      amount: input.amount,
      category: input.category,
      kind: input.kind,
      occurredOn: input.occurredOn,
    }),
  });
  if (!response.ok) throw new Error(`Finance update API error: ${response.status}`);
  return response.json() as Promise<{ entry: FinanceEntry; summary: FinanceSummary }>;
}
