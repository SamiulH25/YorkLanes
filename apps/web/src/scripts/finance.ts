type FinanceKind = "income" | "expense";

interface FinanceEntry {
  id: string;
  label: string;
  category: string;
  amountCents: number;
  kind: FinanceKind;
  occurredOn: string;
  createdAt: string;
}

interface FinanceEntriesResponse {
  entries: FinanceEntry[];
}

interface FinanceBudget {
  month: string;
  amountCents: number;
}

const STORAGE_KEY = "yorklanes.finance.entries";
const BUDGET_STORAGE_KEY = "yorklanes.finance.budgets";
const currency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function formatCents(cents: number): string {
  return currency.format(cents / 100);
}

function readEntries(): FinanceEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries: FinanceEntry[] = parsed
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => ({
        id: String(entry.id ?? crypto.randomUUID()),
        label: String(entry.label ?? "Untitled"),
        category: String(entry.category ?? "Other"),
        amountCents: Number(entry.amountCents ?? 0),
        kind: (entry.kind === "income" ? "income" : "expense") as FinanceKind,
        occurredOn: String(entry.occurredOn ?? entry.createdAt ?? new Date().toISOString().slice(0, 10)),
        createdAt: String(entry.createdAt ?? new Date().toISOString()),
      }))
      .filter((entry) => entry.amountCents > 0);
    return entries;
  } catch {
    return [];
  }
}

function writeEntries(entries: FinanceEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function readBudgets(): Record<string, number> {
  try {
    const raw = localStorage.getItem(BUDGET_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeBudget(month: string, amountCents: number): void {
  const budgets = readBudgets();
  budgets[month] = amountCents;
  localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(budgets));
}

async function fetchApiEntries(): Promise<FinanceEntry[]> {
  const response = await fetch("/api/finance/entries");
  if (!response.ok) throw new Error(`Finance API error: ${response.status}`);
  const data = (await response.json()) as FinanceEntriesResponse;
  return data.entries;
}

async function postApiEntry(entry: Omit<FinanceEntry, "id" | "createdAt">): Promise<FinanceEntry> {
  const response = await fetch("/api/finance/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: entry.label,
      amount: entry.amountCents / 100,
      category: entry.category,
      kind: entry.kind,
      occurredOn: entry.occurredOn,
    }),
  });
  if (!response.ok) throw new Error(`Finance API error: ${response.status}`);
  const data = (await response.json()) as { entry: FinanceEntry };
  return data.entry;
}

async function deleteApiEntry(entryId: string): Promise<void> {
  const response = await fetch(`/api/finance/entries/${entryId}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Finance delete API error: ${response.status}`);
}

async function fetchApiBudget(month: string): Promise<FinanceBudget> {
  const response = await fetch(`/api/finance/budget/${month}`);
  if (!response.ok) throw new Error(`Finance budget API error: ${response.status}`);
  const data = (await response.json()) as { budget: FinanceBudget };
  return data.budget;
}

async function putApiBudget(month: string, amountCents: number): Promise<FinanceBudget> {
  const response = await fetch(`/api/finance/budget/${month}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: amountCents / 100 }),
  });
  if (!response.ok) throw new Error(`Finance budget API error: ${response.status}`);
  const data = (await response.json()) as { budget: FinanceBudget };
  return data.budget;
}

function parseAmountCents(value: FormDataEntryValue | null): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

function render(root: HTMLElement, entries: FinanceEntry[], budgetCents: number, selectedMonth: string): void {
  const incomeCents = entries
    .filter((entry) => entry.kind === "income")
    .reduce((total, entry) => total + entry.amountCents, 0);
  const expenseCents = entries
    .filter((entry) => entry.kind === "expense")
    .reduce((total, entry) => total + entry.amountCents, 0);

  const balance = root.querySelector<HTMLElement>("[data-finance-balance]");
  const income = root.querySelector<HTMLElement>("[data-finance-income]");
  const expenses = root.querySelector<HTMLElement>("[data-finance-expenses]");
  if (balance) balance.textContent = formatCents(incomeCents - expenseCents);
  if (income) income.textContent = formatCents(incomeCents);
  if (expenses) expenses.textContent = formatCents(expenseCents);

  renderList(root, entries);
  renderChart(root, entries);
  renderBudget(root, entries, budgetCents, selectedMonth);
}

function renderList(root: HTMLElement, entries: FinanceEntry[]): void {
  const list = root.querySelector<HTMLUListElement>("[data-finance-list]");
  const empty = root.querySelector<HTMLElement>("[data-finance-empty]");
  if (!list || !empty) return;

  list.replaceChildren();
  empty.hidden = entries.length > 0;
  list.hidden = entries.length === 0;

  for (const entry of entries) {
    const row = document.createElement("li");
    row.className = "flex items-center justify-between gap-3 py-3";

    const meta = document.createElement("div");
    meta.className = "min-w-0";

    const label = document.createElement("p");
    label.className = "truncate text-sm font-semibold text-york-black dark:text-white";
    label.textContent = entry.label;

    const detail = document.createElement("p");
    detail.className = "mt-0.5 text-xs text-york-muted";
    detail.textContent = `${entry.category} · ${new Date(entry.occurredOn).toLocaleDateString("en-CA")}`;

    const amount = document.createElement("p");
    amount.className =
      entry.kind === "income"
        ? "shrink-0 text-sm font-semibold text-emerald-700 dark:text-emerald-300"
        : "shrink-0 text-sm font-semibold text-york-red";
    amount.textContent = `${entry.kind === "income" ? "+" : "-"}${formatCents(entry.amountCents)}`;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.financeDelete = entry.id;
    remove.className =
      "shrink-0 rounded-lg border border-york-stone/60 px-2 py-1 text-xs font-semibold text-york-muted transition hover:border-york-red/30 hover:text-york-red dark:border-white/10";
    remove.textContent = "Delete";

    meta.append(label, detail);
    row.append(meta, amount, remove);
    list.append(row);
  }
}

function renderChart(root: HTMLElement, entries: FinanceEntry[]): void {
  const chart = root.querySelector<HTMLElement>("[data-finance-chart]");
  const empty = root.querySelector<HTMLElement>("[data-finance-chart-empty]");
  if (!chart || !empty) return;

  const totals = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind !== "expense") continue;
    totals.set(entry.category, (totals.get(entry.category) ?? 0) + entry.amountCents);
  }

  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(...rows.map(([, total]) => total), 0);

  chart.replaceChildren();
  chart.hidden = rows.length === 0;
  empty.hidden = rows.length > 0;

  for (const [category, total] of rows) {
    const row = document.createElement("div");
    row.className = "space-y-1.5";

    const top = document.createElement("div");
    top.className = "flex items-center justify-between gap-3 text-xs";

    const name = document.createElement("span");
    name.className = "font-semibold text-york-black dark:text-white";
    name.textContent = category;

    const amount = document.createElement("span");
    amount.className = "text-york-muted";
    amount.textContent = formatCents(total);

    const track = document.createElement("div");
    track.className = "h-2 overflow-hidden rounded-full bg-york-cream dark:bg-york-graphite";

    const bar = document.createElement("div");
    bar.className = "h-full rounded-full bg-york-red";
    bar.style.width = `${Math.max(8, Math.round((total / max) * 100))}%`;

    top.append(name, amount);
    track.append(bar);
    row.append(top, track);
    chart.append(row);
  }
}

function renderBudget(root: HTMLElement, entries: FinanceEntry[], budgetCents: number, selectedMonth: string): void {
  const budgetValue = root.querySelector<HTMLElement>("[data-finance-budget-value]");
  const spentValue = root.querySelector<HTMLElement>("[data-finance-month-spent]");
  const remainingValue = root.querySelector<HTMLElement>("[data-finance-budget-remaining]");
  const bar = root.querySelector<HTMLElement>("[data-finance-budget-bar]");
  const status = root.querySelector<HTMLElement>("[data-finance-budget-status]");
  const budgetInput = root.querySelector<HTMLInputElement>("[data-finance-budget-input]");

  const spentCents = entries
    .filter((entry) => entry.kind === "expense" && entry.occurredOn.startsWith(selectedMonth))
    .reduce((total, entry) => total + entry.amountCents, 0);
  const remainingCents = budgetCents - spentCents;
  const percent = budgetCents > 0 ? Math.min(100, Math.round((spentCents / budgetCents) * 100)) : 0;

  if (budgetValue) budgetValue.textContent = formatCents(budgetCents);
  if (spentValue) spentValue.textContent = formatCents(spentCents);
  if (remainingValue) {
    remainingValue.textContent = formatCents(remainingCents);
    remainingValue.className =
      remainingCents >= 0
        ? "mt-2 font-display text-2xl font-semibold text-emerald-700 dark:text-emerald-300"
        : "mt-2 font-display text-2xl font-semibold text-york-red";
  }
  if (bar) {
    bar.style.width = `${percent}%`;
    bar.className =
      spentCents > budgetCents && budgetCents > 0
        ? "h-full rounded-full bg-york-red transition-[width] duration-200"
        : "h-full rounded-full bg-emerald-600 transition-[width] duration-200";
  }
  if (status) {
    status.textContent =
      budgetCents > 0
        ? `${percent}% of ${selectedMonth} budget spent.`
        : `Set a budget for ${selectedMonth} to track spending.`;
  }
  if (budgetInput && document.activeElement !== budgetInput) {
    budgetInput.value = budgetCents ? String((budgetCents / 100).toFixed(2)) : "";
  }
}

function setMode(root: HTMLElement, apiAvailable: boolean): void {
  const mode = root.ownerDocument.querySelector<HTMLElement>("[data-finance-mode]");
  if (!mode) return;
  mode.textContent = apiAvailable ? "Database" : "Local draft";
  mode.className = apiAvailable
    ? "rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
    : "rounded-full bg-york-gold/15 px-3 py-1 text-xs font-semibold text-york-gold";
}

async function initFinance(root: HTMLElement): Promise<void> {
  const form = root.querySelector<HTMLFormElement>("[data-finance-form]");
  const budgetForm = root.querySelector<HTMLFormElement>("[data-finance-budget-form]");
  const monthInput = root.querySelector<HTMLInputElement>("[data-finance-month]");
  const clear = root.querySelector<HTMLButtonElement>("[data-finance-clear]");
  let entries = readEntries();
  let selectedMonth = currentMonth();
  let budgetCents = readBudgets()[selectedMonth] ?? 0;
  let apiAvailable = false;

  if (monthInput) monthInput.value = selectedMonth;
  render(root, entries, budgetCents, selectedMonth);
  setMode(root, apiAvailable);

  try {
    const [apiEntries, apiBudget] = await Promise.all([
      fetchApiEntries(),
      fetchApiBudget(selectedMonth),
    ]);
    entries = apiEntries;
    budgetCents = apiBudget.amountCents;
    apiAvailable = true;
    render(root, entries, budgetCents, selectedMonth);
    setMode(root, apiAvailable);
  } catch {
    apiAvailable = false;
    setMode(root, apiAvailable);
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const label = String(formData.get("label") ?? "").trim();
    const category = String(formData.get("category") ?? "Other").trim() || "Other";
    const amountCents = parseAmountCents(formData.get("amount"));
    const kind: FinanceKind = formData.get("kind") === "income" ? "income" : "expense";
    const occurredOn = String(formData.get("occurredOn") || new Date().toISOString().slice(0, 10));

    if (!label || amountCents <= 0) return;

    const nextEntry = {
      label,
      category,
      amountCents,
      kind,
      occurredOn,
    };

    if (apiAvailable) {
      try {
        const saved = await postApiEntry(nextEntry);
        entries = [saved, ...entries];
        form.reset();
        render(root, entries, budgetCents, selectedMonth);
        return;
      } catch {
        apiAvailable = false;
        setMode(root, apiAvailable);
      }
    }

    entries = [
      {
        id: crypto.randomUUID(),
        ...nextEntry,
        createdAt: new Date().toISOString(),
      },
      ...entries,
    ];
    writeEntries(entries);
    form.reset();
    render(root, entries, budgetCents, selectedMonth);
  });

  budgetForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(budgetForm);
    const month = String(formData.get("month") || selectedMonth);
    const amountCents = parseAmountCents(formData.get("budget"));

    if (!/^\d{4}-\d{2}$/.test(month)) return;
    selectedMonth = month;

    if (apiAvailable) {
      try {
        const saved = await putApiBudget(month, amountCents);
        budgetCents = saved.amountCents;
        render(root, entries, budgetCents, selectedMonth);
        return;
      } catch {
        apiAvailable = false;
        setMode(root, apiAvailable);
      }
    }

    budgetCents = amountCents;
    writeBudget(month, budgetCents);
    render(root, entries, budgetCents, selectedMonth);
  });

  monthInput?.addEventListener("change", async () => {
    const month = monthInput.value || currentMonth();
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    selectedMonth = month;

    if (apiAvailable) {
      try {
        const saved = await fetchApiBudget(month);
        budgetCents = saved.amountCents;
        render(root, entries, budgetCents, selectedMonth);
        return;
      } catch {
        apiAvailable = false;
        setMode(root, apiAvailable);
      }
    }

    budgetCents = readBudgets()[selectedMonth] ?? 0;
    render(root, entries, budgetCents, selectedMonth);
  });

  clear?.addEventListener("click", () => {
    if (apiAvailable) return;
    entries = [];
    writeEntries(entries);
    render(root, entries, budgetCents, selectedMonth);
  });

  root.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-finance-delete]") : null;
    if (!target) return;
    const entryId = target.dataset.financeDelete;
    if (!entryId) return;

    if (apiAvailable) {
      try {
        await deleteApiEntry(entryId);
        entries = entries.filter((entry) => entry.id !== entryId);
        render(root, entries, budgetCents, selectedMonth);
        return;
      } catch {
        apiAvailable = false;
        setMode(root, apiAvailable);
      }
    }

    entries = entries.filter((entry) => entry.id !== entryId);
    writeEntries(entries);
    render(root, entries, budgetCents, selectedMonth);
  });
}

const root = document.querySelector<HTMLElement>("[data-finance-root]");
if (root) void initFinance(root);

export {};
