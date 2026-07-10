import { getPool } from "../db/index.js";

export interface SectionMeeting {
  day: string;
  start_time: string;
  end_time: string;
  duration: string | null;
  campus: string | null;
  room: string | null;
  instructor: string | null;
  delivery_mode: string | null;
}

export interface CourseSection {
  section_code: string;
  meetings: SectionMeeting[];
}

export interface SectionGroup {
  course_code: string;
  term: string;
  title: string | null;
  sections: CourseSection[];
}

export interface ListSectionFilters {
  courseCode?: string;
  term?: string;
  department?: string;
}

export interface SectionRow {
  course_code: string;
  term: string;
  title: string | null;
  section_code: string;
  day: string;
  start_time: string;
  end_time: string;
  duration: string | null;
  campus: string | null;
  room: string | null;
  instructor: string | null;
  delivery_mode: string | null;
}

const DAY_ORDER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function toTime(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 5);
  if (value instanceof Date) return value.toTimeString().slice(0, 5);
  return String(value ?? "").slice(0, 5);
}

export async function listCourseSections(filters: ListSectionFilters = {}): Promise<SectionGroup[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.courseCode?.trim()) {
    params.push(filters.courseCode.trim().toUpperCase());
    conditions.push(`upper(cs.course_code) = $${params.length}`);
  }

  if (filters.term?.trim()) {
    params.push(filters.term.trim());
    conditions.push(`cs.term = $${params.length}`);
  }

  if (filters.department?.trim()) {
    params.push(filters.department.trim().toUpperCase());
    conditions.push(`upper(c.department) = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const join = filters.department?.trim()
    ? "JOIN courses c ON upper(c.code) = upper(cs.course_code)"
    : "LEFT JOIN courses c ON upper(c.code) = upper(cs.course_code)";

  const result = await getPool().query<SectionRow>(
    `SELECT
       cs.course_code,
       cs.term,
       c.title,
       cs.section_code,
       cs.day,
       cs.start_time,
       cs.end_time,
       cs.duration::text AS duration,
       cs.campus,
       cs.room,
       cs.instructor,
       cs.delivery_mode
     FROM course_sections cs
     ${join}
     ${where}
     ORDER BY cs.course_code, cs.term, cs.section_code, cs.day, cs.start_time`,
    params,
  );

  const groupMap = new Map<string, SectionGroup>();
  const sectionMap = new Map<string, CourseSection>();

  for (const row of result.rows) {
    const groupKey = `${row.course_code}|${row.term}`;
    let group = groupMap.get(groupKey);
    if (!group) {
      group = { course_code: row.course_code, term: row.term, title: row.title, sections: [] };
      groupMap.set(groupKey, group);
    }

    const sectionKey = `${groupKey}|${row.section_code}`;
    let section = sectionMap.get(sectionKey);
    if (!section) {
      section = { section_code: row.section_code, meetings: [] };
      sectionMap.set(sectionKey, section);
      group.sections.push(section);
    }

    section.meetings.push({
      day: row.day,
      start_time: toTime(row.start_time),
      end_time: toTime(row.end_time),
      duration: row.duration,
      campus: row.campus,
      room: row.room,
      instructor: row.instructor,
      delivery_mode: row.delivery_mode,
    });
  }

  return [...groupMap.values()].sort((a, b) => {
    if (a.course_code !== b.course_code) return a.course_code.localeCompare(b.course_code);
    return b.term.localeCompare(a.term);
  });
}

export const SECTION_DAY_ORDER = DAY_ORDER;
