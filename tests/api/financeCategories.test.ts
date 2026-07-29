import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultCategoryForKind,
  listFinanceCategories,
  normalizeFinanceCategory,
} from "../../apps/api/src/services/financeCategories.js";

describe("listFinanceCategories (FR-FIN-03)", () => {
  it("exposes York student expense and income lists", () => {
    const categories = listFinanceCategories();
    assert.ok(categories.expense.includes("Tuition"));
    assert.ok(categories.expense.includes("Textbooks"));
    assert.ok(categories.expense.includes("Rent"));
    assert.ok(categories.income.includes("OSAP"));
    assert.ok(categories.income.includes("Scholarship"));
    assert.ok(categories.income.includes("Job"));
  });
});

describe("normalizeFinanceCategory (FR-FIN-03)", () => {
  it("maps aliases onto canonical labels", () => {
    assert.equal(normalizeFinanceCategory("expense", "books"), "Textbooks");
    assert.equal(normalizeFinanceCategory("expense", "TTC"), "Transit");
    assert.equal(normalizeFinanceCategory("expense", "housing"), "Rent");
    assert.equal(normalizeFinanceCategory("income", "OSAP loan"), "OSAP");
    assert.equal(normalizeFinanceCategory("income", "bursary"), "Scholarship");
    assert.equal(normalizeFinanceCategory("income", "paycheck"), "Job");
  });

  it("uses kind-aware defaults for empty values", () => {
    assert.equal(normalizeFinanceCategory("expense", ""), defaultCategoryForKind("expense"));
    assert.equal(normalizeFinanceCategory("income", "   "), defaultCategoryForKind("income"));
  });

  it("swaps Other / Other income across kinds", () => {
    assert.equal(normalizeFinanceCategory("income", "Other"), "Other income");
    assert.equal(normalizeFinanceCategory("expense", "Other income"), "Other");
  });
});
