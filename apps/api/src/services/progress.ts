// progress math from a degree plan
// used by /api/progress and the dashboard
import type { Pool } from "pg";
import type { DegreePlanRow } from "./planGenerator.js";

export interface PlanProgressStats {
  percentComplete: number;
  completed: number;
  total: number;
  remaining: number;
}

export type RequirementCategory = "major" | "generalEducation" | "electives";

export interface RequirementCategoryStats extends PlanProgressStats {
  id: RequirementCategory;
  label: string;
}

export interface ProgressSegmentShare {
  id: RequirementCategory;
  label: string;
  completed: number;
  // how much of the circle this color should take (0-100)
  percentOfTotal: number;
}

export interface PlanProgressResult extends PlanProgressStats {
  planId: string;
  programmeName: string | null;
  startingYear: number;
  message: string;
  categories: RequirementCategoryStats[];
  // like EECS 1028 -> Discrete Math
  courseTitles: Record<string, string>;
  segments: ProgressSegmentShare[];
}

type PlanEntry = DegreePlanRow["terms"][number]["courses"][number];

const CATEGORY_META: Array<{ id: RequirementCategory; label: string }> = [
  { id: "major", label: "Major requirements" },
  { id: "generalEducation", label: "General education" },
  { id: "electives", label: "Electives" },
];

// rough check for real course codes like "EECS 1028"
const CONCRETE_COURSE_CODE = /^[A-Z]{2,6}\s+\d{4}$/;

function statsFromEntries(entries: Array<{ completed?: boolean }>): PlanProgressStats {
  const total = entries.length;
  let completed = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].completed) {
      completed++;
    }
  }

  let percentComplete = 0;
  if (total > 0) {
    percentComplete = Math.round((completed / total) * 100);
  }

  return {
    percentComplete: percentComplete,
    completed: completed,
    total: total,
    remaining: total - completed,
  };
}

// guess major / gen ed / elective from the checklist text
export function classifyRequirementCategory(
  course: Pick<PlanEntry, "course_code" | "section_label" | "title">,
): RequirementCategory {
  let haystack = "";
  if (course.section_label) haystack += course.section_label + " ";
  if (course.course_code) haystack += course.course_code + " ";
  if (course.title) haystack += course.title;

  if (
    /general\s*education|\bgen(?:eral)?\s*ed\b|\bGENERAL_ED\b|\bBREADTH\b|breadth\s*requirement|natural\s*science\s*requirement|humanities\s*requirement|social\s*science\s*requirement/i.test(
      haystack,
    )
  ) {
    return "generalEducation";
  }

  // major electives are still like... major stuff
  if (
    /major\s+electives?|\bADDITIONAL_MAJOR\b|required\s+core|stream\s*\/\s*specialization|programme\s+requirements?/i.test(
      haystack,
    )
  ) {
    return "major";
  }

  if (
    /\belectives?\b|free\s*choice|outside\s*(?:the\s*)?major|credits\s*outside|complementar|\bFREE_CHOICE\b|\bOUTSIDE_MAJOR\b|\bELECTIVE\b|\bCOMPLEMENTARY\b/i.test(
      haystack,
    )
  ) {
    return "electives";
  }

  return "major";
}

// only count real courses not stubs
export function computePlanProgress(plan: DegreePlanRow): PlanProgressStats {
  const courses: PlanEntry[] = [];
  for (let t = 0; t < plan.terms.length; t++) {
    const term = plan.terms[t];
    for (let c = 0; c < term.courses.length; c++) {
      if (term.courses[c].entry_kind === "course") {
        courses.push(term.courses[c]);
      }
    }
  }
  return statsFromEntries(courses);
}

export function computeRequirementCategories(plan: DegreePlanRow): RequirementCategoryStats[] {
  const major: PlanEntry[] = [];
  const generalEducation: PlanEntry[] = [];
  const electives: PlanEntry[] = [];

  for (let t = 0; t < plan.terms.length; t++) {
    const term = plan.terms[t];
    for (let c = 0; c < term.courses.length; c++) {
      const entry = term.courses[c];
      const cat = classifyRequirementCategory(entry);
      if (cat === "generalEducation") {
        generalEducation.push(entry);
      } else if (cat === "electives") {
        electives.push(entry);
      } else {
        major.push(entry);
      }
    }
  }

  const out: RequirementCategoryStats[] = [];
  for (let i = 0; i < CATEGORY_META.length; i++) {
    const meta = CATEGORY_META[i];
    let bucket = major;
    if (meta.id === "generalEducation") bucket = generalEducation;
    if (meta.id === "electives") bucket = electives;
    out.push({
      id: meta.id,
      label: meta.label,
      ...statsFromEntries(bucket),
    });
  }
  return out;
}

// for the colored ring - how much of each type is done
export function computeProgressSegmentShares(plan: DegreePlanRow): ProgressSegmentShare[] {
  const courses: PlanEntry[] = [];
  for (let t = 0; t < plan.terms.length; t++) {
    const term = plan.terms[t];
    for (let c = 0; c < term.courses.length; c++) {
      if (term.courses[c].entry_kind === "course") {
        courses.push(term.courses[c]);
      }
    }
  }

  const total = courses.length;
  if (total === 0) {
    return [];
  }

  let majorDone = 0;
  let genEdDone = 0;
  let electivesDone = 0;

  for (let i = 0; i < courses.length; i++) {
    if (!courses[i].completed) continue;
    const cat = classifyRequirementCategory(courses[i]);
    if (cat === "generalEducation") {
      genEdDone++;
    } else if (cat === "electives") {
      electivesDone++;
    } else {
      majorDone++;
    }
  }

  const counts: Record<RequirementCategory, number> = {
    major: majorDone,
    generalEducation: genEdDone,
    electives: electivesDone,
  };

  const out: ProgressSegmentShare[] = [];
  for (let i = 0; i < CATEGORY_META.length; i++) {
    const meta = CATEGORY_META[i];
    const completed = counts[meta.id];
    if (completed === 0) {
      continue;
    }
    out.push({
      id: meta.id,
      label: meta.label,
      completed: completed,
      percentOfTotal: Math.round((completed / total) * 100),
    });
  }
  return out;
}

// grab titles from the courses table in one go
// (doing it here so i dont have to touch the courses feature)
export async function lookupCatalogueTitles(
  pool: Pool,
  codes: string[],
): Promise<Record<string, string>> {
  const seen: Record<string, boolean> = {};
  const normalized: string[] = [];
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i].trim().toUpperCase();
    if (!code) continue;
    if (!CONCRETE_COURSE_CODE.test(code)) continue;
    if (seen[code]) continue;
    seen[code] = true;
    normalized.push(code);
  }

  if (normalized.length === 0) {
    return {};
  }

  try {
    const result = await pool.query<{ code: string; title: string }>(
      `SELECT code, title
       FROM courses
       WHERE upper(code) = ANY($1::text[])`,
      [normalized],
    );

    const titles: Record<string, string> = {};
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i];
      titles[row.code.trim().toUpperCase()] = row.title;
    }
    return titles;
  } catch (e) {
    // courses table might not be there, whatever
    return {};
  }
}

export async function buildPlanProgressResult(
  pool: Pool,
  plan: DegreePlanRow,
): Promise<PlanProgressResult> {
  const stats = computePlanProgress(plan);
  const categories = computeRequirementCategories(plan);
  const segments = computeProgressSegmentShares(plan);

  const codes: string[] = [];
  for (let t = 0; t < plan.terms.length; t++) {
    const term = plan.terms[t];
    for (let c = 0; c < term.courses.length; c++) {
      if (term.courses[c].entry_kind === "course") {
        codes.push(term.courses[c].course_code);
      }
    }
  }
  const courseTitles = await lookupCatalogueTitles(pool, codes);

  let message = "";
  if (stats.total === 0) {
    message = "No concrete courses on this plan yet.";
  } else if (stats.remaining === 0) {
    message = "Every course on your plan is marked complete.";
  } else {
    message = stats.completed + " of " + stats.total + " courses marked complete.";
  }

  return {
    planId: plan.id,
    programmeName: plan.programme_name,
    startingYear: plan.starting_year,
    message: message,
    categories: categories,
    segments: segments,
    courseTitles: courseTitles,
    percentComplete: stats.percentComplete,
    completed: stats.completed,
    total: stats.total,
    remaining: stats.remaining,
  };
}
