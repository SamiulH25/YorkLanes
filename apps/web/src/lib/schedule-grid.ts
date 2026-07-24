import type { ScheduleDay } from "./schedule-days";
import { SCHEDULE_DAYS } from "./schedule-days";

export const SCHEDULE_START_HOUR = 8;
export const SCHEDULE_END_HOUR = 19;
export const ROW_HEIGHT = 80;
export const TIME_COLUMN_WIDTH = 100;

export interface ScheduleGridEntry {
  id: string;
  course_code: string;
  section_code: string;
  day: ScheduleDay;
  start_time: string;
  end_time: string;
  room?: string | null;
  campus?: string | null;
}

export const SCHEDULE_STORAGE_KEY = "yorklanes-schedule-entries";

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
