export interface CourseSummary {
  code: string;
  title: string;
  credits: number | null;
  department: string | null;
}

export interface CourseDetail extends CourseSummary {
  description: string | null;
  prerequisites: string[];
}

export interface CoursesListResponse {
  feature: string;
  status: string;
  message: string;
  total: number;
  courses: CourseSummary[];
}

export interface CourseDetailResponse {
  feature: string;
  status: string;
  course: CourseDetail;
}

export interface DepartmentsResponse {
  feature: string;
  status: string;
  departments: string[];
}

export interface FetchCoursesOptions {
  department?: string;
  search?: string;
  limit?: number;
  offset?: number;
}
