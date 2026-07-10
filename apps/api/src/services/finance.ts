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

export interface FinanceBudget {
  id: string;
  month: string;
  amountCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceMonthlyTotal {
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
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

interface FinanceBudgetRow {
  id: string;
  month: string;
  amount_cents: number;
  created_at: string;
  updated_at: string;
}

interface FinanceMonthlyTotalRow {
  month: string;
  income_cents: string;
  expense_cents: string;
  balance_cents: string;
}

export interface CreateFinanceEntryInput {
  label: string;
  amountCents: number;
  category: string;
  kind: FinanceEntryKind;
  occurredOn?: string;
  userId?: string | null;
}

export interface UpdateFinanceEntryInput {
  label: string;
  amountCents: number;
  category: string;
  kind: FinanceEntryKind;
  occurredOn?: string;
  userId?: string | null;
}

export interface UpsertFinanceBudgetInput {
  month: string;
  amountCents: number;
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

function mapBudget(row: FinanceBudgetRow): FinanceBudget {
  return {
    id: row.id,
    month: row.month,
    amountCents: row.amount_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMonthlyTotal(row: FinanceMonthlyTotalRow): FinanceMonthlyTotal {
  return {
    month: row.month,
    incomeCents: Number(row.income_cents),
    expenseCents: Number(row.expense_cents),
    balanceCents: Number(row.balance_cents),
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

export async function listFinanceMonthlyTotals(
  pool: pg.Pool,
  userId?: string | null,
): Promise<FinanceMonthlyTotal[]> {
  const scope = scopeClause(userId);
  const result = await pool.query<FinanceMonthlyTotalRow>(
    `select
       to_char(occurred_on, 'YYYY-MM') as month,
       coalesce(sum(amount_cents) filter (where kind = 'income'), 0)::text as income_cents,
       coalesce(sum(amount_cents) filter (where kind = 'expense'), 0)::text as expense_cents,
       (
         coalesce(sum(amount_cents) filter (where kind = 'income'), 0) -
         coalesce(sum(amount_cents) filter (where kind = 'expense'), 0)
       )::text as balance_cents
     from public.finance_entries
     ${scope.sql}
     group by to_char(occurred_on, 'YYYY-MM')
     order by month desc`,
    scope.values,
  );
  return result.rows.map(mapMonthlyTotal);
}

export async function updateFinanceEntry(
  pool: pg.Pool,
  entryId: string,
  input: UpdateFinanceEntryInput,
): Promise<FinanceEntry | null> {
  const scope = input.userId ? "user_id = $7" : "user_id is null";
  const values = input.userId
    ? [
        input.label,
        input.amountCents,
        input.category,
        input.kind,
        input.occurredOn ?? null,
        entryId,
        input.userId,
      ]
    : [
        input.label,
        input.amountCents,
        input.category,
        input.kind,
        input.occurredOn ?? null,
        entryId,
      ];

  const result = await pool.query<FinanceEntryRow>(
    `update public.finance_entries
       set
         label = $1,
         amount_cents = $2,
         category = $3,
         kind = $4,
         occurred_on = coalesce($5::date, occurred_on)
       where id = $6 and ${scope}
       returning
         id,
         label,
         amount_cents,
         category,
         kind,
         occurred_on::text as occurred_on,
         created_at::text as created_at`,
    values,
  );
  return result.rows[0] ? mapEntry(result.rows[0]) : null;
}

export async function deleteFinanceEntry(
  pool: pg.Pool,
  entryId: string,
  userId?: string | null,
): Promise<boolean> {
  const scope = userId ? "user_id = $2" : "user_id is null";
  const values = userId ? [entryId, userId] : [entryId];
  const result = await pool.query(
    `delete from public.finance_entries
       where id = $1 and ${scope}`,
    values,
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getFinanceBudget(
  pool: pg.Pool,
  month: string,
  userId?: string | null,
): Promise<FinanceBudget | null> {
  const scope = userId ? "user_id = $2" : "user_id is null";
  const values = userId ? [month, userId] : [month];
  const result = await pool.query<FinanceBudgetRow>(
    `select
       id,
       month,
       amount_cents,
       created_at::text as created_at,
       updated_at::text as updated_at
       from public.finance_monthly_budgets
       where month = $1 and ${scope}
       limit 1`,
    values,
  );
  return result.rows[0] ? mapBudget(result.rows[0]) : null;
}

export async function upsertFinanceBudget(
  pool: pg.Pool,
  input: UpsertFinanceBudgetInput,
): Promise<FinanceBudget> {
  const existing = await getFinanceBudget(pool, input.month, input.userId);
  const result = existing
    ? await pool.query<FinanceBudgetRow>(
        `update public.finance_monthly_budgets
           set amount_cents = $1, updated_at = now()
           where id = $2
           returning id, month, amount_cents, created_at::text as created_at, updated_at::text as updated_at`,
        [input.amountCents, existing.id],
      )
    : await pool.query<FinanceBudgetRow>(
        `insert into public.finance_monthly_budgets (user_id, month, amount_cents)
         values ($1, $2, $3)
         returning id, month, amount_cents, created_at::text as created_at, updated_at::text as updated_at`,
        [input.userId ?? null, input.month, input.amountCents],
      );
  return mapBudget(result.rows[0]);
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

export async function listFinanceMonthlyTotalsViaRest(userId?: string | null): Promise<FinanceMonthlyTotal[]> {
  const entries = await listFinanceEntriesViaRest(userId);
  const totals = new Map<string, FinanceMonthlyTotal>();
  for (const entry of entries) {
    const month = entry.occurredOn.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const current = totals.get(month) ?? { month, incomeCents: 0, expenseCents: 0, balanceCents: 0 };
    if (entry.kind === "income") {
      current.incomeCents += entry.amountCents;
    } else {
      current.expenseCents += entry.amountCents;
    }
    current.balanceCents = current.incomeCents - current.expenseCents;
    totals.set(month, current);
  }

  return [...totals.values()].sort((a, b) => b.month.localeCompare(a.month));
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

export async function updateFinanceEntryViaRest(
  entryId: string,
  input: UpdateFinanceEntryInput,
): Promise<FinanceEntry | null> {
  const config = requireSupabaseRestConfig();
  const url = new URL(`${config.url}/rest/v1/finance_entries`);
  url.searchParams.set("id", `eq.${entryId}`);
  url.searchParams.set("user_id", input.userId ? `eq.${encodeURIComponent(input.userId)}` : "is.null");

  const response = await fetch(url, {
    method: "PATCH",
    headers: financeRestHeaders({
      "Content-Type": "application/json",
      Prefer: "return=representation",
    }),
    body: JSON.stringify({
      label: input.label,
      amount_cents: input.amountCents,
      category: input.category,
      kind: input.kind,
      ...(input.occurredOn ? { occurred_on: input.occurredOn } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Finance REST update failed: ${response.status} ${await response.text()}`);
  }

  const rows = (await response.json()) as FinanceEntryRow[];
  return rows[0] ? mapEntry(rows[0]) : null;
}

export async function deleteFinanceEntryViaRest(
  entryId: string,
  userId?: string | null,
): Promise<boolean> {
  const config = requireSupabaseRestConfig();
  const url = new URL(`${config.url}/rest/v1/finance_entries`);
  url.searchParams.set("id", `eq.${entryId}`);
  url.searchParams.set("user_id", userId ? `eq.${encodeURIComponent(userId)}` : "is.null");

  const response = await fetch(url, {
    method: "DELETE",
    headers: financeRestHeaders({ Prefer: "return=representation" }),
  });
  if (!response.ok) {
    throw new Error(`Finance REST delete failed: ${response.status} ${await response.text()}`);
  }

  const rows = (await response.json()) as FinanceEntryRow[];
  return rows.length > 0;
}

export async function getFinanceBudgetViaRest(
  month: string,
  userId?: string | null,
): Promise<FinanceBudget | null> {
  const config = requireSupabaseRestConfig();
  const url = new URL(`${config.url}/rest/v1/finance_monthly_budgets`);
  url.searchParams.set("select", "id,month,amount_cents,created_at,updated_at");
  url.searchParams.set("month", `eq.${month}`);
  url.searchParams.set("user_id", userId ? `eq.${encodeURIComponent(userId)}` : "is.null");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, { headers: financeRestHeaders() });
  if (!response.ok) {
    throw new Error(`Finance budget REST query failed: ${response.status} ${await response.text()}`);
  }

  const rows = (await response.json()) as FinanceBudgetRow[];
  return rows[0] ? mapBudget(rows[0]) : null;
}

export async function upsertFinanceBudgetViaRest(
  input: UpsertFinanceBudgetInput,
): Promise<FinanceBudget> {
  const config = requireSupabaseRestConfig();
  const existing = await getFinanceBudgetViaRest(input.month, input.userId);

  if (existing) {
    const updateUrl = new URL(`${config.url}/rest/v1/finance_monthly_budgets`);
    updateUrl.searchParams.set("id", `eq.${existing.id}`);
    const response = await fetch(updateUrl, {
      method: "PATCH",
      headers: financeRestHeaders({
        "Content-Type": "application/json",
        Prefer: "return=representation",
      }),
      body: JSON.stringify({
        amount_cents: input.amountCents,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!response.ok) {
      throw new Error(`Finance budget REST update failed: ${response.status} ${await response.text()}`);
    }
    const rows = (await response.json()) as FinanceBudgetRow[];
    return mapBudget(rows[0]);
  }

  const response = await fetch(`${config.url}/rest/v1/finance_monthly_budgets`, {
    method: "POST",
    headers: financeRestHeaders({
      "Content-Type": "application/json",
      Prefer: "return=representation",
    }),
    body: JSON.stringify({
      user_id: input.userId ?? null,
      month: input.month,
      amount_cents: input.amountCents,
    }),
  });
  if (!response.ok) {
    throw new Error(`Finance budget REST insert failed: ${response.status} ${await response.text()}`);
  }
  const rows = (await response.json()) as FinanceBudgetRow[];
  return mapBudget(rows[0]);
}
