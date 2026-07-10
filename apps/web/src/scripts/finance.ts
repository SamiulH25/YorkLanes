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

interface MonthlyTotal {
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
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

function formatMonth(month: string): string {
  const date = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return month;
  return date.toLocaleDateString("en-CA", { month: "short", year: "numeric" });
}

const DEFAULT_EXPENSE_CATEGORIES = [
  "Tuition",
  "Textbooks",
  "Rent",
  "Food",
  "Transit",
  "Personal",
  "Fees",
  "Other",
];
const DEFAULT_INCOME_CATEGORIES = [
  "OSAP",
  "Scholarship",
  "Job",
  "Family support",
  "Other income",
];

function parseCategoryList(value: string | undefined, fallback: string[]): string[] {
  if (!value?.trim()) return fallback;
  const parsed = value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

function getCategoryLists(root: HTMLElement): { expense: string[]; income: string[] } {
  return {
    expense: parseCategoryList(root.dataset.expenseCategories, DEFAULT_EXPENSE_CATEGORIES),
    income: parseCategoryList(root.dataset.incomeCategories, DEFAULT_INCOME_CATEGORIES),
  };
}

function categoriesForKind(root: HTMLElement, kind: FinanceKind): string[] {
  const lists = getCategoryLists(root);
  return kind === "income" ? lists.income : lists.expense;
}

function defaultCategoryForKind(kind: FinanceKind): string {
  return kind === "income" ? "Other income" : "Other";
}

function setCategoryOptions(
  root: HTMLElement,
  kind: FinanceKind,
  selected?: string,
): void {
  const select = root.querySelector<HTMLSelectElement>("[data-finance-category]");
  if (!select) return;

  const categories = categoriesForKind(root, kind);
  select.replaceChildren();
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.append(option);
  }

  if (selected && ![...select.options].some((option) => option.value === selected)) {
    const option = document.createElement("option");
    option.value = selected;
    option.textContent = selected;
    select.append(option);
    select.value = selected;
  } else if (selected && [...select.options].some((option) => option.value === selected)) {
    select.value = selected;
  } else {
    select.value = categories.includes(defaultCategoryForKind(kind))
      ? defaultCategoryForKind(kind)
      : (categories[0] ?? "");
  }
}

function syncKindUi(root: HTMLElement, kind: FinanceKind, selectedCategory?: string): void {
  setCategoryOptions(root, kind, selectedCategory);
  const labelInput = root.querySelector<HTMLInputElement>("[data-finance-label]");
  if (labelInput && !labelInput.value) {
    labelInput.placeholder = kind === "income" ? "OSAP deposit" : "Tuition payment";
  } else if (labelInput) {
    labelInput.placeholder = kind === "income" ? "OSAP deposit" : "Tuition payment";
  }
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

async function patchApiEntry(
  entryId: string,
  entry: Omit<FinanceEntry, "id" | "createdAt">,
): Promise<FinanceEntry> {
  const response = await fetch(`/api/finance/entries/${entryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: entry.label,
      amount: entry.amountCents / 100,
      category: entry.category,
      kind: entry.kind,
      occurredOn: entry.occurredOn,
    }),
  });
  if (!response.ok) throw new Error(`Finance update API error: ${response.status}`);
  const data = (await response.json()) as { entry: FinanceEntry };
  return data.entry;
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

function getVisibleEntries(entries: FinanceEntry[], selectedMonth: string, monthOnly: boolean): FinanceEntry[] {
  return monthOnly ? entries.filter((entry) => entry.occurredOn.startsWith(selectedMonth)) : entries;
}

function getMonthlyTotals(entries: FinanceEntry[]): MonthlyTotal[] {
  const totals = new Map<string, MonthlyTotal>();
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

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function downloadCsv(entries: FinanceEntry[], selectedMonth: string, monthOnly: boolean): void {
  const rows = getVisibleEntries(entries, selectedMonth, monthOnly);
  const csv = [
    ["Date", "Kind", "Category", "Label", "Amount"].map(csvCell).join(","),
    ...rows.map((entry) =>
      [
        entry.occurredOn,
        entry.kind,
        entry.category,
        entry.label,
        (entry.amountCents / 100).toFixed(2),
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = monthOnly ? `yorklanes-finance-${selectedMonth}.csv` : "yorklanes-finance-all.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function render(
  root: HTMLElement,
  entries: FinanceEntry[],
  budgetCents: number,
  selectedMonth: string,
  monthOnly: boolean,
  editingId: string | null = null,
): void {
  const visibleEntries = getVisibleEntries(entries, selectedMonth, monthOnly);
  const incomeCents = visibleEntries
    .filter((entry) => entry.kind === "income")
    .reduce((total, entry) => total + entry.amountCents, 0);
  const expenseCents = visibleEntries
    .filter((entry) => entry.kind === "expense")
    .reduce((total, entry) => total + entry.amountCents, 0);

  const balance = root.querySelector<HTMLElement>("[data-finance-balance]");
  const income = root.querySelector<HTMLElement>("[data-finance-income]");
  const expenses = root.querySelector<HTMLElement>("[data-finance-expenses]");
  if (balance) balance.textContent = formatCents(incomeCents - expenseCents);
  if (income) income.textContent = formatCents(incomeCents);
  if (expenses) expenses.textContent = formatCents(expenseCents);

  renderList(root, visibleEntries, editingId);
  renderChart(root, visibleEntries);
  renderBudget(root, entries, budgetCents, selectedMonth);
  renderTrend(root, entries);
}

function setEditMode(root: HTMLElement, entry: FinanceEntry | null): void {
  const form = root.querySelector<HTMLFormElement>("[data-finance-form]");
  const editIdInput = root.querySelector<HTMLInputElement>("[data-finance-edit-id]");
  const title = root.querySelector<HTMLElement>("[data-finance-form-title]");
  const submit = root.querySelector<HTMLButtonElement>("[data-finance-submit]");
  const cancel = root.querySelector<HTMLButtonElement>("[data-finance-cancel-edit]");
  if (!form || !editIdInput || !title || !submit || !cancel) return;

  if (!entry) {
    editIdInput.value = "";
    title.textContent = "Log money";
    submit.textContent = "Add entry";
    cancel.classList.add("hidden");
    form.reset();
    const expenseRadio = form.querySelector<HTMLInputElement>('input[name="kind"][value="expense"]');
    if (expenseRadio) expenseRadio.checked = true;
    syncKindUi(root, "expense");
    return;
  }

  editIdInput.value = entry.id;
  title.textContent = "Edit entry";
  submit.textContent = "Save changes";
  cancel.classList.remove("hidden");

  const labelInput = form.querySelector<HTMLInputElement>('input[name="label"]');
  const amountInput = form.querySelector<HTMLInputElement>('input[name="amount"]');
  const dateInput = form.querySelector<HTMLInputElement>('input[name="occurredOn"]');
  const kindRadio = form.querySelector<HTMLInputElement>(`input[name="kind"][value="${entry.kind}"]`);

  if (kindRadio) kindRadio.checked = true;
  syncKindUi(root, entry.kind, entry.category);
  if (labelInput) labelInput.value = entry.label;
  if (amountInput) amountInput.value = (entry.amountCents / 100).toFixed(2);
  if (dateInput) dateInput.value = entry.occurredOn;

  labelInput?.focus();
}

function renderList(root: HTMLElement, entries: FinanceEntry[], editingId: string | null): void {
  const list = root.querySelector<HTMLUListElement>("[data-finance-list]");
  const empty = root.querySelector<HTMLElement>("[data-finance-empty]");
  if (!list || !empty) return;

  list.replaceChildren();
  empty.hidden = entries.length > 0;
  list.hidden = entries.length === 0;

  for (const entry of entries) {
    const row = document.createElement("li");
    row.className =
      editingId === entry.id
        ? "flex items-center justify-between gap-3 py-3 rounded-lg bg-york-cream/60 px-2 dark:bg-york-graphite/80"
        : "flex items-center justify-between gap-3 py-3";

    const meta = document.createElement("div");
    meta.className = "min-w-0";

    const label = document.createElement("p");
    label.className = "truncate text-sm font-semibold text-york-black dark:text-white";
    label.textContent = entry.label;

    const detail = document.createElement("p");
    detail.className = "mt-0.5 text-xs text-york-muted";
    detail.textContent = `${entry.category} · ${entry.occurredOn}`;

    const amount = document.createElement("p");
    amount.className =
      entry.kind === "income"
        ? "shrink-0 text-sm font-semibold text-emerald-700 dark:text-emerald-300"
        : "shrink-0 text-sm font-semibold text-york-red";
    amount.textContent = `${entry.kind === "income" ? "+" : "-"}${formatCents(entry.amountCents)}`;

    const actions = document.createElement("div");
    actions.className = "flex shrink-0 items-center gap-2";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.dataset.financeEdit = entry.id;
    edit.className =
      "rounded-lg border border-york-stone/60 px-2 py-1 text-xs font-semibold text-york-muted transition hover:border-york-red/30 hover:text-york-red dark:border-white/10";
    edit.textContent = editingId === entry.id ? "Editing" : "Edit";
    edit.disabled = editingId === entry.id;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.financeDelete = entry.id;
    remove.className =
      "rounded-lg border border-york-stone/60 px-2 py-1 text-xs font-semibold text-york-muted transition hover:border-york-red/30 hover:text-york-red dark:border-white/10";
    remove.textContent = "Delete";

    meta.append(label, detail);
    actions.append(edit, remove);
    row.append(meta, amount, actions);
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

function renderTrend(root: HTMLElement, entries: FinanceEntry[]): void {
  const trend = root.querySelector<HTMLElement>("[data-finance-trend]");
  const empty = root.querySelector<HTMLElement>("[data-finance-trend-empty]");
  if (!trend || !empty) return;

  const rows = getMonthlyTotals(entries).slice(0, 6);
  const max = Math.max(...rows.map((row) => Math.max(row.incomeCents, row.expenseCents)), 0);

  trend.replaceChildren();
  trend.hidden = rows.length === 0;
  empty.hidden = rows.length > 0;

  for (const row of rows) {
    const wrapper = document.createElement("div");
    wrapper.className = "space-y-2";

    const top = document.createElement("div");
    top.className = "flex items-center justify-between gap-3 text-xs";

    const label = document.createElement("span");
    label.className = "font-semibold text-york-black dark:text-white";
    label.textContent = formatMonth(row.month);

    const balance = document.createElement("span");
    balance.className = row.balanceCents >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-york-red";
    balance.textContent = formatCents(row.balanceCents);

    const tracks = document.createElement("div");
    tracks.className = "grid gap-1.5";

    const incomeTrack = document.createElement("div");
    incomeTrack.className = "h-2 overflow-hidden rounded-full bg-york-cream dark:bg-york-graphite";
    const incomeBar = document.createElement("div");
    incomeBar.className = "h-full rounded-full bg-emerald-600";
    incomeBar.style.width = max > 0 ? `${Math.max(6, Math.round((row.incomeCents / max) * 100))}%` : "0%";

    const expenseTrack = document.createElement("div");
    expenseTrack.className = "h-2 overflow-hidden rounded-full bg-york-cream dark:bg-york-graphite";
    const expenseBar = document.createElement("div");
    expenseBar.className = "h-full rounded-full bg-york-red";
    expenseBar.style.width = max > 0 ? `${Math.max(6, Math.round((row.expenseCents / max) * 100))}%` : "0%";

    const detail = document.createElement("p");
    detail.className = "text-xs text-york-muted";
    detail.textContent = `Income ${formatCents(row.incomeCents)} · Expenses ${formatCents(row.expenseCents)}`;

    top.append(label, balance);
    incomeTrack.append(incomeBar);
    expenseTrack.append(expenseBar);
    tracks.append(incomeTrack, expenseTrack);
    wrapper.append(top, tracks, detail);
    trend.append(wrapper);
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
  const monthFilter = root.querySelector<HTMLInputElement>("[data-finance-month-filter]");
  const exportButton = root.querySelector<HTMLButtonElement>("[data-finance-export]");
  const clear = root.querySelector<HTMLButtonElement>("[data-finance-clear]");
  const cancelEdit = root.querySelector<HTMLButtonElement>("[data-finance-cancel-edit]");
  let entries = readEntries();
  let selectedMonth = currentMonth();
  let budgetCents = readBudgets()[selectedMonth] ?? 0;
  let monthOnly = false;
  let apiAvailable = false;
  let editingId: string | null = null;

  if (monthInput) monthInput.value = selectedMonth;
  syncKindUi(root, "expense");
  render(root, entries, budgetCents, selectedMonth, monthOnly, editingId);
  setMode(root, apiAvailable);

  try {
    const [apiEntries, apiBudget] = await Promise.all([
      fetchApiEntries(),
      fetchApiBudget(selectedMonth),
    ]);
    entries = apiEntries;
    budgetCents = apiBudget.amountCents;
    apiAvailable = true;
    render(root, entries, budgetCents, selectedMonth, monthOnly, editingId);
    setMode(root, apiAvailable);
  } catch {
    apiAvailable = false;
    setMode(root, apiAvailable);
  }

  const clearEditMode = (): void => {
    editingId = null;
    setEditMode(root, null);
    render(root, entries, budgetCents, selectedMonth, monthOnly, editingId);
  };

  cancelEdit?.addEventListener("click", () => {
    clearEditMode();
  });

  form?.querySelectorAll<HTMLInputElement>('input[name="kind"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const kind: FinanceKind = radio.value === "income" ? "income" : "expense";
      const current = root.querySelector<HTMLSelectElement>("[data-finance-category]")?.value;
      const keep =
        current && categoriesForKind(root, kind).includes(current) ? current : undefined;
      syncKindUi(root, kind, keep);
    });
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const label = String(formData.get("label") ?? "").trim();
    const category = String(formData.get("category") ?? "Other").trim() || "Other";
    const amountCents = parseAmountCents(formData.get("amount"));
    const kind: FinanceKind = formData.get("kind") === "income" ? "income" : "expense";
    const occurredOn = String(formData.get("occurredOn") || new Date().toISOString().slice(0, 10));
    const entryId = String(formData.get("entryId") ?? "").trim() || editingId;

    if (!label || amountCents <= 0) return;

    const nextEntry = {
      label,
      category,
      amountCents,
      kind,
      occurredOn,
    };

    if (entryId) {
      if (apiAvailable) {
        try {
          const saved = await patchApiEntry(entryId, nextEntry);
          entries = entries.map((entry) => (entry.id === entryId ? saved : entry));
          clearEditMode();
          return;
        } catch {
          apiAvailable = false;
          setMode(root, apiAvailable);
        }
      }

      entries = entries.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              ...nextEntry,
            }
          : entry,
      );
      writeEntries(entries);
      clearEditMode();
      return;
    }

    if (apiAvailable) {
      try {
        const saved = await postApiEntry(nextEntry);
        entries = [saved, ...entries];
        form.reset();
        const expenseRadio = form.querySelector<HTMLInputElement>('input[name="kind"][value="expense"]');
        if (expenseRadio) expenseRadio.checked = true;
        syncKindUi(root, "expense");
        render(root, entries, budgetCents, selectedMonth, monthOnly, editingId);
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
    const expenseRadio = form.querySelector<HTMLInputElement>('input[name="kind"][value="expense"]');
    if (expenseRadio) expenseRadio.checked = true;
    syncKindUi(root, "expense");
    render(root, entries, budgetCents, selectedMonth, monthOnly, editingId);
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
        render(root, entries, budgetCents, selectedMonth, monthOnly, editingId);
        return;
      } catch {
        apiAvailable = false;
        setMode(root, apiAvailable);
      }
    }

    budgetCents = amountCents;
    writeBudget(month, budgetCents);
    render(root, entries, budgetCents, selectedMonth, monthOnly, editingId);
  });

  monthInput?.addEventListener("change", async () => {
    const month = monthInput.value || currentMonth();
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    selectedMonth = month;

    if (apiAvailable) {
      try {
        const saved = await fetchApiBudget(month);
        budgetCents = saved.amountCents;
        render(root, entries, budgetCents, selectedMonth, monthOnly, editingId);
        return;
      } catch {
        apiAvailable = false;
        setMode(root, apiAvailable);
      }
    }

    budgetCents = readBudgets()[selectedMonth] ?? 0;
    render(root, entries, budgetCents, selectedMonth, monthOnly, editingId);
  });

  monthFilter?.addEventListener("change", () => {
    monthOnly = monthFilter.checked;
    render(root, entries, budgetCents, selectedMonth, monthOnly, editingId);
  });

  exportButton?.addEventListener("click", () => {
    downloadCsv(entries, selectedMonth, monthOnly);
  });

  clear?.addEventListener("click", () => {
    if (apiAvailable) return;
    entries = [];
    writeEntries(entries);
    clearEditMode();
  });

  root.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const editButton = target.closest<HTMLButtonElement>("[data-finance-edit]");
    if (editButton) {
      const entryId = editButton.dataset.financeEdit;
      if (!entryId) return;
      const entry = entries.find((item) => item.id === entryId);
      if (!entry) return;
      editingId = entry.id;
      setEditMode(root, entry);
      render(root, entries, budgetCents, selectedMonth, monthOnly, editingId);
      return;
    }

    const deleteButton = target.closest<HTMLButtonElement>("[data-finance-delete]");
    if (!deleteButton) return;
    const entryId = deleteButton.dataset.financeDelete;
    if (!entryId) return;

    if (apiAvailable) {
      try {
        await deleteApiEntry(entryId);
        entries = entries.filter((entry) => entry.id !== entryId);
        if (editingId === entryId) {
          clearEditMode();
          return;
        }
        render(root, entries, budgetCents, selectedMonth, monthOnly, editingId);
        return;
      } catch {
        apiAvailable = false;
        setMode(root, apiAvailable);
      }
    }

    entries = entries.filter((entry) => entry.id !== entryId);
    writeEntries(entries);
    if (editingId === entryId) {
      clearEditMode();
      return;
    }
    render(root, entries, budgetCents, selectedMonth, monthOnly, editingId);
  });
}

const root = document.querySelector<HTMLElement>("[data-finance-root]");
if (root) void initFinance(root);

export {};
