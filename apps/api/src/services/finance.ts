import type pg from "pg";

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

export interface FinanceCategoryTotal {
  category: string;
  amountCents: number;
}

export interface FinanceSummary {
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  currency: "CAD";
  categoryTotals: FinanceCategoryTotal[];
}

interface FinanceEntryRow {
  id: string;
  label: string;
  amount_cents: number;
  category: string;
  kind: FinanceEntryKind;
  occurred_on: string;
  created_at: string;
}

interface FinanceCategoryRow {
  category: string;
  amount_cents: string;
}

export interface CreateFinanceEntryInput {
  label: string;
  amountCents: number;
  category: string;
  kind: FinanceEntryKind;
  occurredOn?: string;
  userId?: string | null;
}

function getSupabaseRestConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function financeRestHeaders(extra?: HeadersInit): HeadersInit {
  const config = getSupabaseRestConfig();
  if (!config) return extra ?? {};

  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    ...extra,
  };
}

function requireSupabaseRestConfig(): { url: string; key: string } {
  const config = getSupabaseRestConfig();
  if (!config) {
    throw new Error("No finance database configured. Set SUPABASE_DB_URL or SUPABASE_URL plus SUPABASE_PUBLISHABLE_KEY.");
  }
  return config;
}

function mapEntry(row: FinanceEntryRow): FinanceEntry {
  return {
    id: row.id,
    label: row.label,
    amountCents: row.amount_cents,
    category: row.category,
    kind: row.kind,
    occurredOn: row.occurred_on,
    createdAt: row.created_at,
  };
}

function scopeClause(userId?: string | null): { sql: string; values: string[] } {
  if (userId) {
    return { sql: "where user_id = $1", values: [userId] };
  }
  return { sql: "where user_id is null", values: [] };
}

export async function listFinanceEntries(
  pool: pg.Pool,
  userId?: string | null,
): Promise<FinanceEntry[]> {
  const scope = scopeClause(userId);
  const result = await pool.query<FinanceEntryRow>(
    `select
       id,
       label,
       amount_cents,
       category,
       kind,
       occurred_on::text as occurred_on,
       created_at::text as created_at
       from public.finance_entries
       ${scope.sql}
       order by occurred_on desc, created_at desc`,
    scope.values,
  );
  return result.rows.map(mapEntry);
}

export async function getFinanceSummary(
  pool: pg.Pool,
  userId?: string | null,
): Promise<FinanceSummary> {
  const scope = scopeClause(userId);
  const values = scope.values;

  const totals = await pool.query<{ income_cents: string; expense_cents: string }>(
    `select
       coalesce(sum(amount_cents) filter (where kind = 'income'), 0)::text as income_cents,
       coalesce(sum(amount_cents) filter (where kind = 'expense'), 0)::text as expense_cents
     from public.finance_entries
     ${scope.sql}`,
    values,
  );

  const categories = await pool.query<FinanceCategoryRow>(
    `select category, coalesce(sum(amount_cents), 0)::text as amount_cents
       from public.finance_entries
       ${scope.sql}${scope.sql ? " and" : " where"} kind = 'expense'
       group by category
       order by sum(amount_cents) desc, category asc`,
    values,
  );

  const incomeCents = Number(totals.rows[0]?.income_cents ?? 0);
  const expenseCents = Number(totals.rows[0]?.expense_cents ?? 0);

  return {
    incomeCents,
    expenseCents,
    balanceCents: incomeCents - expenseCents,
    currency: "CAD",
    categoryTotals: categories.rows.map((row) => ({
      category: row.category,
      amountCents: Number(row.amount_cents),
    })),
  };
}

export async function createFinanceEntry(
  pool: pg.Pool,
  input: CreateFinanceEntryInput,
): Promise<FinanceEntry> {
  const result = await pool.query<FinanceEntryRow>(
    `insert into public.finance_entries
       (user_id, label, amount_cents, category, kind, occurred_on)
     values ($1, $2, $3, $4, $5, coalesce($6::date, current_date))
     returning
       id,
       label,
       amount_cents,
       category,
       kind,
       occurred_on::text as occurred_on,
       created_at::text as created_at`,
    [
      input.userId ?? null,
      input.label,
      input.amountCents,
      input.category,
      input.kind,
      input.occurredOn ?? null,
    ],
  );
  return mapEntry(result.rows[0]);
}

export function canUseFinanceRest(): boolean {
  return Boolean(getSupabaseRestConfig());
}

export async function listFinanceEntriesViaRest(userId?: string | null): Promise<FinanceEntry[]> {
  const config = requireSupabaseRestConfig();
  const userFilter = userId ? `eq.${encodeURIComponent(userId)}` : "is.null";
  const url = new URL(`${config.url}/rest/v1/finance_entries`);
  url.searchParams.set("select", "id,label,amount_cents,category,kind,occurred_on,created_at");
  url.searchParams.set("user_id", userFilter);
  url.searchParams.set("order", "occurred_on.desc,created_at.desc");

  const response = await fetch(url, { headers: financeRestHeaders() });
  if (!response.ok) {
    throw new Error(`Finance REST query failed: ${response.status} ${await response.text()}`);
  }

  const rows = (await response.json()) as FinanceEntryRow[];
  return rows.map(mapEntry);
}

export async function getFinanceSummaryViaRest(userId?: string | null): Promise<FinanceSummary> {
  const entries = await listFinanceEntriesViaRest(userId);
  const incomeCents = entries
    .filter((entry) => entry.kind === "income")
    .reduce((total, entry) => total + entry.amountCents, 0);
  const expenseCents = entries
    .filter((entry) => entry.kind === "expense")
    .reduce((total, entry) => total + entry.amountCents, 0);

  const categoryTotals = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind !== "expense") continue;
    categoryTotals.set(entry.category, (categoryTotals.get(entry.category) ?? 0) + entry.amountCents);
  }

  return {
    incomeCents,
    expenseCents,
    balanceCents: incomeCents - expenseCents,
    currency: "CAD",
    categoryTotals: [...categoryTotals.entries()]
      .map(([category, amountCents]) => ({ category, amountCents }))
      .sort((a, b) => b.amountCents - a.amountCents || a.category.localeCompare(b.category)),
  };
}

export async function createFinanceEntryViaRest(input: CreateFinanceEntryInput): Promise<FinanceEntry> {
  const config = requireSupabaseRestConfig();
  const response = await fetch(`${config.url}/rest/v1/finance_entries`, {
    method: "POST",
    headers: financeRestHeaders({
      "Content-Type": "application/json",
      Prefer: "return=representation",
    }),
    body: JSON.stringify({
      user_id: input.userId ?? null,
      label: input.label,
      amount_cents: input.amountCents,
      category: input.category,
      kind: input.kind,
      occurred_on: input.occurredOn ?? new Date().toISOString().slice(0, 10),
    }),
  });

  if (!response.ok) {
    throw new Error(`Finance REST insert failed: ${response.status} ${await response.text()}`);
  }

  const rows = (await response.json()) as FinanceEntryRow[];
  return mapEntry(rows[0]);
}
