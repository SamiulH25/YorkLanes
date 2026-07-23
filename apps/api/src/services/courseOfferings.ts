/**
 * Aggregate scraped course_sections into seasonal offering history
 * and a human-readable "typical schedule" summary.
 */
import { getPool } from "../db/index.js";
import {
  emptySeasonFlags,
  mergeSeasonFlags,
  seasonsFromScrapedTerm,
  type Season,
  type SeasonFlags,
} from "./termSeason.js";

export interface CourseSeasonHistory {
  course_code: string;
  has_history: boolean;
  seasons: SeasonFlags;
  terms_seen: string[];
}

export interface TypicalMeetingSummary {
  days: string[];
  start_time: string | null;
  end_time: string | null;
  campuses: string[];
  delivery_modes: string[];
  sample_section: string | null;
}

export interface CourseOfferingSummary {
  course_code: string;
  has_history: boolean;
  terms_seen: string[];
  seasons: SeasonFlags;
  seasons_offered: Season[];
  section_count: number;
  typical: TypicalMeetingSummary | null;
  last_scraped_at: string | null;
}

interface TermRow {
  course_code: string;
  term: string;
}

interface MeetingRow {
  course_code: string;
  term: string;
  section_code: string;
  day: string;
  start_time: string;
  end_time: string;
  campus: string | null;
  delivery_mode: string | null;
  scraped_at: Date | string | null;
}

const DAY_ORDER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function toTime(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 5);
  if (value instanceof Date) return value.toTimeString().slice(0, 5);
  return String(value ?? "").slice(0, 5);
}

function isLectureSection(sectionCode: string): boolean {
  return /^LEC\b/i.test(sectionCode.trim());
}

function medianTime(times: string[]): string | null {
  if (times.length === 0) return null;
  const sorted = [...times].sort();
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

function topCounts(values: string[], limit = 4): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value]) => value);
}

function buildSeasonHistory(courseCode: string, terms: string[]): CourseSeasonHistory {
  const seasons = emptySeasonFlags();
  const termsSeen = [...new Set(terms)].sort((a, b) => b.localeCompare(a));
  for (const term of termsSeen) {
    mergeSeasonFlags(seasons, seasonsFromScrapedTerm(term));
  }
  return {
    course_code: courseCode,
    has_history: termsSeen.length > 0,
    seasons,
    terms_seen: termsSeen,
  };
}

/** Batch lookup: which seasons each course has ever appeared in. */
export async function getSeasonHistoryForCourses(
  courseCodes: string[],
): Promise<Map<string, CourseSeasonHistory>> {
  const map = new Map<string, CourseSeasonHistory>();
  const unique = [...new Set(courseCodes.map((code) => code.trim().toUpperCase()).filter(Boolean))];

  for (const code of unique) {
    map.set(code, buildSeasonHistory(code, []));
  }

  if (unique.length === 0) return map;

  try {
    const result = await getPool().query<TermRow>(
      `SELECT DISTINCT upper(course_code) AS course_code, term
       FROM course_sections
       WHERE upper(course_code) = ANY($1::text[])
       ORDER BY course_code, term DESC`,
      [unique],
    );

    const termsByCode = new Map<string, string[]>();
    for (const row of result.rows) {
      const list = termsByCode.get(row.course_code) ?? [];
      list.push(row.term);
      termsByCode.set(row.course_code, list);
    }

    for (const code of unique) {
      map.set(code, buildSeasonHistory(code, termsByCode.get(code) ?? []));
    }
  } catch (error) {
    // Missing table / empty DB should not break the plan graph.
    const message = error instanceof Error ? error.message : String(error);
    if (!/course_sections|relation .* does not exist/i.test(message)) {
      throw error;
    }
  }

  return map;
}

function buildTypical(meetings: MeetingRow[]): TypicalMeetingSummary | null {
  if (meetings.length === 0) return null;

  const lecture = meetings.filter((row) => isLectureSection(row.section_code));
  const pool = lecture.length > 0 ? lecture : meetings;

  const days = topCounts(pool.map((row) => row.day.toUpperCase()))
    .sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b) || a.localeCompare(b));

  return {
    days,
    start_time: medianTime(pool.map((row) => toTime(row.start_time))),
    end_time: medianTime(pool.map((row) => toTime(row.end_time))),
    campuses: topCounts(pool.map((row) => row.campus?.trim() ?? "").filter(Boolean), 3),
    delivery_modes: topCounts(pool.map((row) => row.delivery_mode?.trim() ?? "").filter(Boolean), 3),
    sample_section: pool[0]?.section_code ?? null,
  };
}

/** Full offering summary for one course (courses detail page + schedule docs). */
export async function getCourseOfferingSummary(courseCode: string): Promise<CourseOfferingSummary> {
  const code = courseCode.trim().toUpperCase();
  const empty: CourseOfferingSummary = {
    course_code: code,
    has_history: false,
    terms_seen: [],
    seasons: emptySeasonFlags(),
    seasons_offered: [],
    section_count: 0,
    typical: null,
    last_scraped_at: null,
  };

  if (!code) return empty;

  try {
    const result = await getPool().query<MeetingRow>(
      `SELECT
         upper(course_code) AS course_code,
         term,
         section_code,
         day,
         start_time::text AS start_time,
         end_time::text AS end_time,
         campus,
         delivery_mode,
         scraped_at
       FROM course_sections
       WHERE upper(course_code) = $1
       ORDER BY term DESC, section_code, day, start_time`,
      [code],
    );

    if (result.rows.length === 0) return empty;

    const history = buildSeasonHistory(
      code,
      result.rows.map((row) => row.term),
    );

    const sectionKeys = new Set(result.rows.map((row) => `${row.term}|${row.section_code}`));
    let lastScraped: string | null = null;
    for (const row of result.rows) {
      if (!row.scraped_at) continue;
      const iso = row.scraped_at instanceof Date ? row.scraped_at.toISOString() : String(row.scraped_at);
      if (!lastScraped || iso > lastScraped) lastScraped = iso;
    }

    const seasonsOffered = (["fall", "winter", "summer"] as Season[]).filter(
      (season) => history.seasons[season],
    );

    return {
      course_code: code,
      has_history: true,
      terms_seen: history.terms_seen,
      seasons: history.seasons,
      seasons_offered: seasonsOffered,
      section_count: sectionKeys.size,
      typical: buildTypical(result.rows),
      last_scraped_at: lastScraped,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/course_sections|relation .* does not exist/i.test(message)) {
      return empty;
    }
    throw error;
  }
}
