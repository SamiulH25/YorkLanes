import type { DegreePlan } from "../types/plan";
import type {
  ComplementaryWarning,
  PlanSeason,
  SchedulePlacementWarning,
  SeasonFlags,
} from "./plan-store";

export const SEASON_LABELS: Record<PlanSeason, string> = {
  fall: "Fall",
  winter: "Winter",
  summer: "Summer",
};

export function formatSeasonsSeen(flags: SeasonFlags): string {
  const seen = (["fall", "winter", "summer"] as PlanSeason[])
    .filter((season) => flags[season])
    .map((season) => SEASON_LABELS[season]);

  if (seen.length === 0) return "";
  if (seen.length === 1) return `Usually offered in ${seen[0]} only`;
  return `Usually offered in ${seen.join(" / ")}`;
}

export function formatScheduleAlertsHint(warnings: SchedulePlacementWarning[]): string {
  const base =
    "Based on scraped York timetables (not year-specific). Each course below is placed in a season where we have no recorded sections.";

  if (warnings.length === 0) return base;

  const seasons = [...new Set(warnings.map((warning) => warning.planned_season))];
  const labels = seasons.map((season) => SEASON_LABELS[season] ?? season);

  if (labels.length === 1) {
    return `${base} Flagged for ${labels[0]}.`;
  }

  return `${base} Flagged seasons: ${labels.join(", ")}.`;
}

export function formatScheduleWarningDetail(warning: SchedulePlacementWarning): string {
  const season = SEASON_LABELS[warning.planned_season] ?? warning.planned_season;
  const seen = formatSeasonsSeen(warning.seasons_seen);
  return seen
    ? `No recorded ${season} sections · ${seen}`
    : `No recorded ${season} sections in our data`;
}

export interface ComplementaryAlertSummary {
  infoMessage: string | null;
  creditProgress: { planned: number; required: number } | null;
  subjectProgress: { planned: number; required: number } | null;
  openStubs: Array<{ courseId: string; credits: number; termLabel: string }>;
  invalidCourses: Array<{ courseId: string; courseCode: string }>;
  noCoursesYet: boolean;
}

export function findCourseTermLabel(plan: DegreePlan, courseId: string): string | null {
  for (const term of plan.terms) {
    if (term.courses.some((course) => course.id === courseId)) {
      return term.label;
    }
  }
  return null;
}

function parseCreditProgress(message: string): { planned: number; required: number } | null {
  const match = message.match(/([\d.]+) of ([\d.]+) required credits planned/);
  if (!match) return null;
  return { planned: Number(match[1]), required: Number(match[2]) };
}

function parseSubjectProgress(message: string): { planned: number; required: number } | null {
  const match = message.match(/At least ([\d.]+) credits must come from .+ \(([\d.]+) cr planned/);
  if (!match) return null;
  return { planned: Number(match[2]), required: Number(match[1]) };
}

function parseStubCredits(message: string): number {
  const match = message.match(/\(([\d.?]+) cr\) is still open/);
  if (!match || match[1] === "?") return 0;
  return Number(match[1]);
}

export function summarizeComplementaryWarnings(
  warnings: ComplementaryWarning[],
  plan: DegreePlan,
): ComplementaryAlertSummary {
  const info = warnings.find((warning) => warning.severity === "info");
  if (info) {
    return {
      infoMessage: info.message,
      creditProgress: null,
      subjectProgress: null,
      openStubs: [],
      invalidCourses: [],
      noCoursesYet: false,
    };
  }

  const creditWarning = warnings.find((warning) => warning.code === "credit_shortfall");
  const subjectWarning = warnings.find((warning) => warning.code === "subject_area_shortfall");

  const openStubs = warnings
    .filter((warning) => warning.code === "open_stub" && warning.course_id)
    .map((warning) => ({
      courseId: warning.course_id!,
      credits: parseStubCredits(warning.message),
      termLabel: findCourseTermLabel(plan, warning.course_id!) ?? "Plan",
    }));

  const invalidCourses = warnings
    .filter((warning) => warning.code === "not_approved" && warning.course_id && warning.course_code)
    .map((warning) => ({
      courseId: warning.course_id!,
      courseCode: warning.course_code!,
    }));

  return {
    infoMessage: null,
    creditProgress: creditWarning ? parseCreditProgress(creditWarning.message) : null,
    subjectProgress: subjectWarning ? parseSubjectProgress(subjectWarning.message) : null,
    openStubs,
    invalidCourses,
    noCoursesYet: warnings.some((warning) => warning.code === "no_courses"),
  };
}

export function progressPercent(planned: number, required: number): number {
  if (required <= 0) return 0;
  return Math.min(100, Math.round((planned / required) * 100));
}
