import type { PlanCourse, PlanTerm } from "../types/plan";

export interface CreditBreakdown {
  concreteCredits: number;
  stubSlots: number;
  courseCount: number;
  completedCredits: number;
}

function toCredits(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function courseCredits(course: PlanCourse): number {
  return toCredits(course.credits) ?? 0;
}

function isStub(course: PlanCourse): boolean {
  return course.entry_kind === "stub";
}

export function summarizeTerm(term: PlanTerm): CreditBreakdown {
  let concreteCredits = 0;
  let stubSlots = 0;
  let courseCount = 0;
  let completedCredits = 0;

  for (const course of term.courses) {
    if (isStub(course)) {
      stubSlots += 1;
      continue;
    }
    courseCount += 1;
    const credits = courseCredits(course);
    concreteCredits += credits;
    if (course.completed) {
      completedCredits += credits;
    }
  }

  return { concreteCredits, stubSlots, courseCount, completedCredits };
}

export function summarizeChecklistYear(terms: PlanTerm[], checklistYear: number): CreditBreakdown {
  const summary: CreditBreakdown = {
    concreteCredits: 0,
    stubSlots: 0,
    courseCount: 0,
    completedCredits: 0,
  };

  for (const term of terms) {
    if (term.checklist_year !== checklistYear) continue;
    const part = summarizeTerm(term);
    summary.concreteCredits += part.concreteCredits;
    summary.stubSlots += part.stubSlots;
    summary.courseCount += part.courseCount;
    summary.completedCredits += part.completedCredits;
  }

  return summary;
}

export function formatCredits(value: unknown): string {
  const credits = toCredits(value) ?? 0;
  return Number.isInteger(credits) ? String(credits) : credits.toFixed(1);
}

export function formatYearCredits(summary: CreditBreakdown): string {
  const parts = [
    `${formatCredits(summary.concreteCredits)} cr`,
    `${summary.courseCount} course${summary.courseCount === 1 ? "" : "s"}`,
  ];
  if (summary.stubSlots > 0) {
    parts.push(`${summary.stubSlots} open slot${summary.stubSlots === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

export function formatTermCredits(summary: CreditBreakdown): string {
  let text = `${formatCredits(summary.concreteCredits)} cr`;
  if (summary.stubSlots > 0) {
    text += ` (+${summary.stubSlots} slot${summary.stubSlots === 1 ? "" : "s"})`;
  }
  return text;
}
