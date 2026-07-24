/** Signals available on a degree plan for complementary-studies eligibility. */
export interface PlanComplementarySignals {
  faculty_key?: string | null;
  programme_name?: string | null;
  source_filename?: string | null;
}

function combinedPlanText(plan: PlanComplementarySignals): string {
  return [plan.programme_name, plan.source_filename]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ")
    .toLowerCase();
}

function mentionsBEng(text: string): boolean {
  return /\bbeng\b/.test(text) || /\bb\.?\s*eng\b/.test(text) || text.includes("bachelor of engineering");
}

/** True when the plan is for a Lassonde BEng (or equivalent engineering) programme. */
export function planExpectsComplementaryStudies(plan: PlanComplementarySignals): boolean {
  const combined = combinedPlanText(plan);
  if (mentionsBEng(combined)) {
    return true;
  }

  if (plan.faculty_key !== "lassonde") {
    return false;
  }

  const programme = (plan.programme_name ?? "").toLowerCase();
  if (!programme.includes("engineering")) {
    return false;
  }

  return !programme.includes("bsc") && !programme.includes("bachelor of science");
}
