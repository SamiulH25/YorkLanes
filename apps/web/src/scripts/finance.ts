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

const STORAGE_KEY = "yorklanes.finance.entries";
const currency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

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

function parseAmountCents(value: FormDataEntryValue | null): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

function render(root: HTMLElement, entries: FinanceEntry[]): void {
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

    meta.append(label, detail);
    row.append(meta, amount);
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
  const clear = root.querySelector<HTMLButtonElement>("[data-finance-clear]");
  let entries = readEntries();
  let apiAvailable = false;

  render(root, entries);
  setMode(root, apiAvailable);

  try {
    entries = await fetchApiEntries();
    apiAvailable = true;
    render(root, entries);
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
        render(root, entries);
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
    render(root, entries);
  });

  clear?.addEventListener("click", () => {
    if (apiAvailable) return;
    entries = [];
    writeEntries(entries);
    render(root, entries);
  });
}

const root = document.querySelector<HTMLElement>("[data-finance-root]");
if (root) void initFinance(root);

export {};
