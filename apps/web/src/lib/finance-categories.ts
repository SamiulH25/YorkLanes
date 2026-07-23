/** Student-specific finance categories — Taziz. Keep in sync with API financeCategories. */

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

export type FinanceKind = "income" | "expense";

export function categoriesForKind(kind: FinanceKind): readonly string[] {
  return kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export function defaultCategoryForKind(kind: FinanceKind): string {
  return kind === "income" ? "Other income" : "Other";
}
