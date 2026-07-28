import type { ScheduleDay } from "./schedule-days";
import { SCHEDULE_DAYS } from "./schedule-days";
import type { SectionComponentType } from "./schedule-sections";

export const SCHEDULE_START_HOUR = 8;
export const SCHEDULE_END_HOUR = 19;
export const ROW_HEIGHT = 80;
export const TIME_COLUMN_WIDTH = 100;

export interface ScheduleGridEntry {
  id: string;
  course_code: string;
  section_code: string;
  component_type: SectionComponentType;
  day: ScheduleDay;
  start_time: string;
  end_time: string;
  room?: string | null;
  campus?: string | null;
  bundle_id?: string;
  plan_year?: number;
  plan_season?: string;
  cdm_term?: string;
}

export interface ScheduleWeekState {
  planYear: number;
  planSeason: string;
  cdmTerm: string;
  entries: ScheduleGridEntry[];
  /** Course codes pinned during shuffle (local persistence). */
  pinnedCourses?: string[];
}

interface ScheduleStore {
  weeks: Record<string, ScheduleWeekState>;
}

export const SCHEDULE_STORAGE_KEY = "yorklanes-schedule-week-v2";

export function weekStorageKey(planYear: number, planSeason: string, cdmTerm: string): string {
  return `${planYear}|${planSeason}|${cdmTerm}`;
}

function readScheduleStore(): ScheduleStore {
  const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
  if (!raw) return { weeks: {} };
  try {
    const parsed = JSON.parse(raw) as ScheduleStore | ScheduleWeekState;
    if ("weeks" in parsed) return parsed;
    const legacy = parsed as ScheduleWeekState;
    const key = weekStorageKey(legacy.planYear, legacy.planSeason, legacy.cdmTerm);
    return { weeks: { [key]: legacy } };
  } catch {
    return { weeks: {} };
  }
}

export function readScheduleWeekState(
  planYear: number,
  planSeason: string,
  cdmTerm: string,
): ScheduleWeekState {
  const store = readScheduleStore();
  const key = weekStorageKey(planYear, planSeason, cdmTerm);
  return store.weeks[key] ?? { planYear, planSeason, cdmTerm, entries: [] };
}

export function writeScheduleWeekState(state: ScheduleWeekState): void {
  const store = readScheduleStore();
  const key = weekStorageKey(state.planYear, state.planSeason, state.cdmTerm);
  store.weeks[key] = state;
  localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(store));
}

export function listLocalSavedSchedules(): Array<ScheduleWeekState & { courseCount: number }> {
  const store = readScheduleStore();
  return Object.values(store.weeks)
    .filter((week) => week.entries.length > 0)
    .map((week) => ({
      ...week,
      courseCount: new Set(week.entries.map((entry) => entry.course_code)).size,
    }))
    .sort((a, b) => {
      if (a.planYear !== b.planYear) return a.planYear - b.planYear;
      if (a.planSeason !== b.planSeason) return a.planSeason.localeCompare(b.planSeason);
      return b.cdmTerm.localeCompare(a.cdmTerm);
    });
}

export function convertTimeToMinutes(time: string): number {
  const [hourText, minuteText] = time.split(":");
  return Number(hourText) * 60 + Number(minuteText);
}

export function formatTimeRange(startTime: string, endTime: string): string {
  return `${formatClock(startTime)} – ${formatClock(endTime)}`;
}

function formatClock(time: string): string {
  const [hoursRaw, minutes = "00"] = time.split(":");
  const hours = Number(hoursRaw);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes} ${period}`;
}

export function computeEventLayout(
  day: ScheduleDay,
  startTime: string,
  endTime: string,
  days: readonly ScheduleDay[],
): { top: number; height: number; dayIndex: number } | null {
  const dayIndex = days.indexOf(day);
  if (dayIndex === -1) return null;

  const startMinutes = convertTimeToMinutes(startTime);
  const endMinutes = convertTimeToMinutes(endTime);
  const scheduleStartMinutes = SCHEDULE_START_HOUR * 60;
  const scheduleEndMinutes = SCHEDULE_END_HOUR * 60;

  if (startMinutes < scheduleStartMinutes || endMinutes > scheduleEndMinutes) {
    return null;
  }

  const top = ((startMinutes - scheduleStartMinutes) / 60) * ROW_HEIGHT;
  const height = ((endMinutes - startMinutes) / 60) * ROW_HEIGHT;

  return { top, height: Math.max(height, 44), dayIndex };
}

export function gridHours(): string[] {
  return Array.from({ length: SCHEDULE_END_HOUR - SCHEDULE_START_HOUR + 1 }, (_, index) => {
    const hour = SCHEDULE_START_HOUR + index;
    const period = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:00 ${period}`;
  });
}

export function defaultGridDays(): ScheduleDay[] {
  return [...SCHEDULE_DAYS];
}

export function weeklyGridDays(): ScheduleDay[] {
  return defaultGridDays();
}

export function courseBundleKey(courseCode: string): string {
  return courseCode.trim().toUpperCase();
}

export function entryKey(entry: Pick<ScheduleGridEntry, "course_code" | "section_code" | "day" | "start_time">): string {
  return `${entry.course_code}|${entry.section_code}|${entry.day}|${entry.start_time}`;
}

export function sectionSelectionKey(courseCode: string, sectionCode: string): string {
  return `${courseCode}|${sectionCode}`;
}

export function meetingsOverlap(
  a: Pick<ScheduleGridEntry, "day" | "start_time" | "end_time">,
  b: Pick<ScheduleGridEntry, "day" | "start_time" | "end_time">,
): boolean {
  if (a.day !== b.day) return false;
  const aStart = convertTimeToMinutes(a.start_time);
  const aEnd = convertTimeToMinutes(a.end_time);
  const bStart = convertTimeToMinutes(b.start_time);
  const bEnd = convertTimeToMinutes(b.end_time);
  return aStart < bEnd && bStart < aEnd;
}

export interface ScheduleConflict {
  entryA: ScheduleGridEntry;
  entryB: ScheduleGridEntry;
}

export function findScheduleConflicts(entries: ScheduleGridEntry[]): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (meetingsOverlap(entries[i], entries[j])) {
        conflicts.push({ entryA: entries[i], entryB: entries[j] });
      }
    }
  }
  return conflicts;
}

export function findCrossBundleConflicts(
  incoming: ScheduleGridEntry[],
  schedule: ScheduleGridEntry[],
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  for (const entryA of incoming) {
    for (const entryB of schedule) {
      if (meetingsOverlap(entryA, entryB)) {
        conflicts.push({ entryA, entryB });
      }
    }
  }
  return conflicts;
}

export function entryHasConflict(
  entry: ScheduleGridEntry,
  entries: ScheduleGridEntry[],
): boolean {
  return entries.some((other) => other.id !== entry.id && meetingsOverlap(entry, other));
}

export function courseHasConflicts(courseCode: string, entries: ScheduleGridEntry[]): boolean {
  const normalized = courseCode.trim().toUpperCase();
  return entries
    .filter((entry) => entry.course_code.trim().toUpperCase() === normalized)
    .some((entry) => entryHasConflict(entry, entries));
}

export function summarizeScheduleConflicts(conflicts: ScheduleConflict[]): string {
  if (conflicts.length === 0) return "";

  const lines = new Set<string>();
  for (const { entryA, entryB } of conflicts) {
    lines.add(
      `${entryA.course_code} (${entryA.day} ${formatTimeRange(entryA.start_time, entryA.end_time)}) overlaps ${entryB.course_code} (${entryB.day} ${formatTimeRange(entryB.start_time, entryB.end_time)})`,
    );
  }

  return [...lines].slice(0, 3).join("; ");
}
