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

export interface CourseSectionsResponse {
  feature: string;
  status: string;
  message: string;
  filters: { course_code?: string; term?: string; department?: string };
  total_sections: number;
  groups: SectionGroup[];
}

export interface SeasonFlags {
  fall: boolean;
  winter: boolean;
  summer: boolean;
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
  seasons_offered: Array<"fall" | "winter" | "summer">;
  section_count: number;
  typical: TypicalMeetingSummary | null;
  last_scraped_at: string | null;
}

export interface CourseOfferingSummaryResponse {
  feature: string;
  status: string;
  summary: CourseOfferingSummary;
}

export interface FetchSectionsOptions {
  courseCode?: string;
  term?: string;
  department?: string;
}
