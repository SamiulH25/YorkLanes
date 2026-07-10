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

export interface FetchSectionsOptions {
  courseCode?: string;
  term?: string;
  department?: string;
}
