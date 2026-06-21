export interface FacultyChecklistInfo {
  key: string;
  name: string;
  url: string;
  instructions: string;
  fileHint: string;
}

export interface PlanCourse {
  id: string;
  course_code: string;
  credits: number | null;
  title: string | null;
  checklist_year: number | null;
  sort_order: number;
  entry_kind: "course" | "stub";
  section_label: string | null;
  completed?: boolean;
}

export interface PlanTerm {
  id: string;
  label: string;
  session: string;
  academic_year: number;
  checklist_year: number;
  sort_order: number;
  courses: PlanCourse[];
}

export interface DegreePlan {
  id: string;
  faculty_key: string;
  programme_name: string | null;
  starting_year: number;
  source_filename: string | null;
  parse_warnings: string[];
  terms: PlanTerm[];
}
