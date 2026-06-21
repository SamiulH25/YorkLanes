/**
 * Faculty checklist download links shown on /plan/setup.
 * Keep in sync with GET /api/plans/faculties (this file is the source of truth).
 */
export interface FacultyChecklistInfo {
  key: string;
  name: string;
  url: string;
  instructions: string;
  fileHint: string;
}

export const FACULTY_CHECKLISTS: FacultyChecklistInfo[] = [
  {
    key: "lassonde",
    name: "Lassonde School of Engineering",
    url: "https://lassonde.yorku.ca/student-life",
    instructions:
      "Open Program Checklists, choose the year you started, then download the PDF for your programme (e.g. BSc Honours Computer Science).",
    fileHint: "PDF checklist from Lassonde",
  },
  {
    key: "laps",
    name: "LA&PS (Liberal Arts & Professional Studies)",
    url: "https://www.yorku.ca/laps/degree-checklist/2025-2026/",
    instructions:
      "Find your programme under the correct starting year. Download the DOCX or PDF checklist for your degree.",
    fileHint: "DOCX or PDF checklist from LA&PS",
  },
  {
    key: "science",
    name: "Faculty of Science",
    url: "https://www.yorku.ca/science/students/current/degree-progress/",
    instructions:
      "Use the Science degree progress resources or pick up a checklist from Science Academic Services (352 Lumbers). Export or save as PDF if available.",
    fileHint: "PDF checklist from Science",
  },
  {
    key: "glendon",
    name: "Glendon Campus",
    url: "https://glendon.yorku.ca/current-students/academic-services/",
    instructions:
      "Contact Glendon Academic Services or use Glendon programme resources for your bilingual programme checklist.",
    fileHint: "PDF checklist from Glendon",
  },
  {
    key: "other",
    name: "Other faculty / unsure",
    url: "https://futurestudents.yorku.ca/program-search",
    instructions:
      "Search for your programme, then check your faculty website for a degree checklist matching your start year.",
    fileHint: "PDF or DOCX degree checklist",
  },
];

export function getFacultyChecklist(key: string): FacultyChecklistInfo | undefined {
  return FACULTY_CHECKLISTS.find((f) => f.key === key);
}
