/** Student-specific finance categories — Taziz. */
import type { FinanceEntryKind } from "./finance.js";

export const EXPENSE_CATEGORIES = [
  "Tuition",
  "Textbooks",
  "Rent",
  "Food",
  "Transit",
  "Personal",
  "Fees",
  "Other",
] as const;

export const INCOME_CATEGORIES = [
  "OSAP",
  "Scholarship",
  "Job",
  "Family support",
  "Other income",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

const EXPENSE_SET = new Set<string>(EXPENSE_CATEGORIES);
const INCOME_SET = new Set<string>(INCOME_CATEGORIES);

/** Map older or loose labels onto the student category list. */
const CATEGORY_ALIASES: Record<string, string> = {
  books: "Textbooks",
  book: "Textbooks",
  textbook: "Textbooks",
  "text books": "Textbooks",
  tuition: "Tuition",
  "tuition payment": "Tuition",
  "tuition payments": "Tuition",
  rent: "Rent",
  housing: "Rent",
  personal: "Personal",
  food: "Food",
  groceries: "Food",
  transit: "Transit",
  transport: "Transit",
  transportation: "Transit",
  ttc: "Transit",
  fees: "Fees",
  "student fees": "Fees",
  other: "Other",
  osap: "OSAP",
  "osap loan": "OSAP",
  "osap grant": "OSAP",
  scholarship: "Scholarship",
  bursary: "Scholarship",
  job: "Job",
  work: "Job",
  paycheque: "Job",
  paycheck: "Job",
  wages: "Job",
  income: "Job",
  "family support": "Family support",
  family: "Family support",
  parents: "Family support",
  "other income": "Other income",
};

export function listFinanceCategories(): {
  expense: readonly string[];
  income: readonly string[];
} {
  return {
    expense: EXPENSE_CATEGORIES,
    income: INCOME_CATEGORIES,
  };
}

export function defaultCategoryForKind(kind: FinanceEntryKind): string {
  return kind === "income" ? "Other income" : "Other";
}

/**
 * Normalize a category for the given entry kind.
 * Known aliases become canonical student labels. Unknown values are kept
 * (trimmed) so older rows still round-trip, with a kind-aware default when empty.
 */
export function normalizeFinanceCategory(
  kind: FinanceEntryKind,
  value: unknown,
): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return defaultCategoryForKind(kind);

  const aliased = CATEGORY_ALIASES[raw.toLowerCase()] ?? raw;
  if (kind === "income") {
    if (INCOME_SET.has(aliased)) return aliased;
    // Old expense-style "Other" on an income row → income default label.
    if (aliased === "Other") return "Other income";
    return aliased;
  }

  if (EXPENSE_SET.has(aliased)) return aliased;
  if (aliased === "Other income") return "Other";
  return aliased;
}
