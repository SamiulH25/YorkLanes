// progress helpers - see docs/tasks/progress.md
import type { DegreePlan, PlanCourse } from "../types/plan";
import { getApiUrl } from "./api-url";

const API_URL = getApiUrl();

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

export interface ProgressResponse {
  feature: string;
  status: string;
  planId: string;
  programmeName: string | null;
  startingYear: number;
  percentComplete: number;
  completed: number;
  total: number;
  remaining: number;
  message: string;
  categories?: RequirementCategoryStats[];
  // like course code -> real name from the courses table
  courseTitles?: Record<string, string>;
  segments?: Array<{
    id: RequirementCategory;
    label: string;
    completed: number;
    percentOfTotal: number;
  }>;
}

// labels for the 3 buckets we show
const CATEGORY_META: Array<{ id: RequirementCategory; label: string }> = [
  { id: "major", label: "Major requirements" },
  { id: "generalEducation", label: "General education" },
  { id: "electives", label: "Electives" },
];

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

// figure out if a course is major / gen ed / elective from the checklist label stuff
export function classifyRequirementCategory(
  course: Pick<PlanCourse, "course_code" | "section_label" | "title">,
): RequirementCategory {
  // smash the text together so i can just regex it
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

  // like major electives should stay with major not free electives
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

  // default to major if we dont know
  return "major";
}

// only real courses, ignore stubs
export function computePlanProgress(plan: DegreePlan): PlanProgressStats {
  const courses: PlanCourse[] = [];
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

// split into the 3 buckets (includes stubs for gen ed / electives)
export function computeRequirementCategories(plan: DegreePlan): RequirementCategoryStats[] {
  const major: PlanCourse[] = [];
  const generalEducation: PlanCourse[] = [];
  const electives: PlanCourse[] = [];

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

export function progressLabel(stats: PlanProgressStats): string {
  if (stats.total === 0) {
    return "No concrete courses on this plan yet.";
  }
  if (stats.remaining === 0) {
    return "Every course on your plan is marked complete.";
  }
  return stats.completed + " of " + stats.total + " courses marked complete.";
}

export function categoryProgressLabel(stats: RequirementCategoryStats): string {
  if (stats.total === 0) {
    return "None on this plan";
  }
  if (stats.remaining === 0) {
    return "All complete";
  }
  return stats.completed + " of " + stats.total + " complete";
}

export interface ProgressRingSegment {
  id: RequirementCategory;
  label: string;
  completed: number;
  strokeClass: string;
  barClass: string;
  dasharray: string;
  dashoffset: number;
  percentOfTotal: number;
}

const RING_STROKE: Record<RequirementCategory, string> = {
  major: "stroke-york-red",
  generalEducation: "stroke-york-gold",
  electives: "stroke-stone-400 dark:stroke-stone-500",
};

const RING_BAR: Record<RequirementCategory, string> = {
  major: "bg-york-red",
  generalEducation: "bg-york-gold",
  electives: "bg-stone-400 dark:bg-stone-500",
};

// color the circle based on what type of courses are done
export function computeProgressRingSegments(
  plan: DegreePlan,
  radius: number,
): ProgressRingSegment[] {
  const courses = listPlanCourses(plan);
  const total = courses.length;
  const circumference = 2 * Math.PI * radius;
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

  // keep track of where we are around the circle
  let cursor = 0;
  const segments: ProgressRingSegment[] = [];

  for (let i = 0; i < CATEGORY_META.length; i++) {
    const meta = CATEGORY_META[i];
    const completed = counts[meta.id];
    if (completed === 0) {
      continue;
    }

    const fraction = completed / total;
    const length = fraction * circumference;

    segments.push({
      id: meta.id,
      label: meta.label,
      completed: completed,
      strokeClass: RING_STROKE[meta.id],
      barClass: RING_BAR[meta.id],
      dasharray: length + " " + circumference,
      dashoffset: -cursor * circumference,
      percentOfTotal: Math.round(fraction * 100),
    });

    cursor = cursor + fraction;
  }

  return segments;
}

export function listPlanCourses(plan: DegreePlan): Array<PlanCourse & { termLabel: string }> {
  const out: Array<PlanCourse & { termLabel: string }> = [];
  for (let t = 0; t < plan.terms.length; t++) {
    const term = plan.terms[t];
    for (let c = 0; c < term.courses.length; c++) {
      const course = term.courses[c];
      if (course.entry_kind === "course") {
        out.push({ ...course, termLabel: term.label });
      }
    }
  }
  return out;
}

// show "EECS 1028: Some Name" if we found a name, otherwise just the code
export function resolveCourseHeading(
  course: Pick<PlanCourse, "course_code">,
  courseTitles: Record<string, string> = {},
): string {
  const code = course.course_code.trim();
  const name = courseTitles[code.toUpperCase()];
  if (name && name.trim()) {
    return code + ": " + name.trim();
  }
  return code;
}

// subtitle under the course - like Major requirements etc
export function resolveCourseCategoryLabel(
  course: Pick<PlanCourse, "course_code" | "section_label" | "title">,
): string {
  const category = classifyRequirementCategory(course);
  for (let i = 0; i < CATEGORY_META.length; i++) {
    if (CATEGORY_META[i].id === category) {
      return CATEGORY_META[i].label;
    }
  }
  return "Major requirements";
}

export async function fetchProgress(
  planId: string,
  cookieHeader?: string | null,
): Promise<ProgressResponse> {
  const headers: Record<string, string> = {};
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  const response = await fetch(
    API_URL + "/api/progress?planId=" + encodeURIComponent(planId),
    {
      headers: headers,
      credentials: "include",
    },
  );

  if (!response.ok) {
    let message = "Progress API error: " + response.status;
    try {
      const payload = (await response.json()) as { error?: string; hint?: string };
      if (payload.error) {
        if (payload.hint) {
          message = payload.error + " " + payload.hint;
        } else {
          message = payload.error;
        }
      }
    } catch (e) {
      // whatever, not json
    }
    throw new Error(message);
  }

  return response.json() as Promise<ProgressResponse>;
}
