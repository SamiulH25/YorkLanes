/** Task guide: docs/tasks/finance.md */
import { apiRequestInit, apiUrl } from "./api-request";
import type { FinanceRecurrence } from "./finance-recurrence";

export type FinanceEntryKind = "income" | "expense";

export interface FinanceEntry {
  id: string;
  label: string;
  amountCents: number;
  category: string;
  kind: FinanceEntryKind;
  occurredOn: string;
  recurrence: FinanceRecurrence;
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
  recurrenceSupported?: boolean;
}

export async function fetchFinance(cookieHeader?: string | null): Promise<FinanceResponse> {
  const response = await fetch(apiUrl("/api/finance"), apiRequestInit(cookieHeader));
  if (!response.ok) throw new Error(`Finance API error: ${response.status}`);
  return response.json() as Promise<FinanceResponse>;
}

export async function fetchFinanceEntries(
  cookieHeader?: string | null,
): Promise<FinanceEntriesResponse> {
  const response = await fetch(apiUrl("/api/finance/entries"), apiRequestInit(cookieHeader));
  if (!response.ok) throw new Error(`Finance entries API error: ${response.status}`);
  return response.json() as Promise<FinanceEntriesResponse>;
}

export async function fetchFinanceMonthlySummary(
  cookieHeader?: string | null,
): Promise<{ months: FinanceMonthlyTotal[] }> {
  const response = await fetch(
    apiUrl("/api/finance/monthly-summary"),
    apiRequestInit(cookieHeader),
  );
  if (!response.ok) throw new Error(`Finance monthly summary API error: ${response.status}`);
  return response.json() as Promise<{ months: FinanceMonthlyTotal[] }>;
}

export async function fetchFinanceBudget(
  month: string,
  cookieHeader?: string | null,
): Promise<{ budget: FinanceBudget }> {
  const response = await fetch(
    apiUrl(`/api/finance/budget/${month}`),
    apiRequestInit(cookieHeader),
  );
  if (!response.ok) throw new Error(`Finance budget API error: ${response.status}`);
  return response.json() as Promise<{ budget: FinanceBudget }>;
}

export async function saveFinanceBudget(
  month: string,
  amount: number,
  cookieHeader?: string | null,
): Promise<{ budget: FinanceBudget }> {
  const response = await fetch(
    apiUrl(`/api/finance/budget/${month}`),
    apiRequestInit(cookieHeader, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    }),
  );
  if (!response.ok) throw new Error(`Finance budget API error: ${response.status}`);
  return response.json() as Promise<{ budget: FinanceBudget }>;
}

export async function deleteFinanceEntry(
  entryId: string,
  cookieHeader?: string | null,
): Promise<{ deleted: boolean; summary: FinanceSummary }> {
  const response = await fetch(
    apiUrl(`/api/finance/entries/${entryId}`),
    apiRequestInit(cookieHeader, { method: "DELETE" }),
  );
  if (!response.ok) throw new Error(`Finance delete API error: ${response.status}`);
  return response.json() as Promise<{ deleted: boolean; summary: FinanceSummary }>;
}

export async function updateFinanceEntry(
  input: {
    entryId: string;
    label: string;
    amount: number;
    category: string;
    kind: FinanceEntryKind;
    occurredOn?: string;
    recurrence?: FinanceRecurrence;
  },
  cookieHeader?: string | null,
): Promise<{ entry: FinanceEntry; summary: FinanceSummary }> {
  const response = await fetch(
    apiUrl(`/api/finance/entries/${input.entryId}`),
    apiRequestInit(cookieHeader, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: input.label,
        amount: input.amount,
        category: input.category,
        kind: input.kind,
        occurredOn: input.occurredOn,
        recurrence: input.recurrence,
      }),
    }),
  );
  if (!response.ok) throw new Error(`Finance update API error: ${response.status}`);
  return response.json() as Promise<{ entry: FinanceEntry; summary: FinanceSummary }>;
}

export async function createNextFinanceEntry(
  entryId: string,
  cookieHeader?: string | null,
): Promise<{ entry: FinanceEntry; summary: FinanceSummary; sourceId: string }> {
  const response = await fetch(
    apiUrl(`/api/finance/entries/${entryId}/next`),
    apiRequestInit(cookieHeader, { method: "POST" }),
  );
  if (!response.ok) throw new Error(`Finance next occurrence API error: ${response.status}`);
  return response.json() as Promise<{ entry: FinanceEntry; summary: FinanceSummary; sourceId: string }>;
}

export async function fetchFinanceCategories(
  cookieHeader?: string | null,
): Promise<{
  expense: string[];
  income: string[];
}> {
  const response = await fetch(
    apiUrl("/api/finance/categories"),
    apiRequestInit(cookieHeader),
  );
  if (!response.ok) throw new Error(`Finance categories API error: ${response.status}`);
  return response.json() as Promise<{ expense: string[]; income: string[] }>;
}
