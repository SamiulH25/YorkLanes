export const SCHEDULE_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
] as const;

export const WEEKEND_DAYS = ["Saturday", "Sunday"] as const;

export type ScheduleDay = (typeof SCHEDULE_DAYS)[number] | (typeof WEEKEND_DAYS)[number];

export const DAY_TO_FULL: Record<string, ScheduleDay> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

export const FULL_TO_DAY: Record<string, string> = Object.fromEntries(
  Object.entries(DAY_TO_FULL).map(([abbr, full]) => [full, abbr]),
);

export function toScheduleDay(sectionDay: string): ScheduleDay {
  const upper = sectionDay.trim().toUpperCase();
  if (DAY_TO_FULL[upper]) return DAY_TO_FULL[upper];
  const title = sectionDay.trim();
  const match = Object.values(DAY_TO_FULL).find(
    (day) => day.toLowerCase() === title.toLowerCase(),
  );
  return match ?? (title as ScheduleDay);
}

export function toSectionDay(scheduleDay: string): string {
  return FULL_TO_DAY[scheduleDay] ?? scheduleDay.slice(0, 3).toUpperCase();
}

export function dayShort(day: string): string {
  const map: Record<string, string> = {
    Monday: "Mon",
    Tuesday: "Tue",
    Wednesday: "Wed",
    Thursday: "Thu",
    Friday: "Fri",
    Saturday: "Sat",
    Sunday: "Sun",
    MON: "Mon",
    TUE: "Tue",
    WED: "Wed",
    THU: "Thu",
    FRI: "Fri",
    SAT: "Sat",
    SUN: "Sun",
  };
  return map[day] ?? day.slice(0, 3);
}

export function formatClock(time: string | null): string {
  if (!time) return "";
  const [hoursRaw, minutes = "00"] = time.split(":");
  const hours = Number(hoursRaw);
  if (!Number.isFinite(hours)) return time;
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = ((hours + 11) % 12) + 1;
  return `${hour12}:${minutes} ${suffix}`;
}

export function daysForEntries(daysUsed: Iterable<string>): ScheduleDay[] {
  const used = new Set(daysUsed);
  const weekdays = SCHEDULE_DAYS.filter((day) => used.has(day));
  const weekends = WEEKEND_DAYS.filter((day) => used.has(day));
  if (weekdays.length === 0 && weekends.length === 0) {
    return [...SCHEDULE_DAYS];
  }
  return [...weekdays, ...weekends];
}
