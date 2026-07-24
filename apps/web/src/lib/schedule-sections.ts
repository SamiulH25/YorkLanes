import type { CourseSection } from "../types/course-sections";

export type SectionComponentType = "lec" | "tut" | "lab" | "sem" | "other";

export interface ParsedSectionComponent {
  type: SectionComponentType;
  code: string;
  suffix: string;
}

const COMPONENT_LABELS: Record<SectionComponentType, string> = {
  lec: "Lecture",
  tut: "Tutorial",
  lab: "Laboratory",
  sem: "Seminar",
  other: "Section",
};

const COMPONENT_ORDER: SectionComponentType[] = ["lec", "sem", "tut", "lab", "other"];

/** Strip York bundle suffix e.g. "LECT 01 (A)" → "LECT 01". */
export function baseSectionCode(sectionCode: string): string {
  return sectionCode.replace(/\s*\([^)]+\)\s*$/u, "").trim();
}

/** Bundle / tie group from "(A)" suffix or explicit section_group field. */
export function sectionBundleKey(sectionCode: string, sectionGroup?: string | null): string | null {
  const group = sectionGroup?.trim().toUpperCase();
  if (group) return group;
  const match = sectionCode.match(/\(([A-Z0-9]+)\)\s*$/iu);
  return match?.[1]?.toUpperCase() ?? null;
}

export function parseSectionComponent(sectionCode: string): ParsedSectionComponent {
  const trimmed = baseSectionCode(sectionCode);
  const match = trimmed.match(/^(LEC|LECT|Lecture|TUT|TUTR|Tutorial|LAB|Laboratory|SEM|Seminar|PRA|TST|ENG)\s*(.*)$/iu);
  if (!match) {
    return { type: "other", code: trimmed, suffix: trimmed };
  }

  const token = match[1].toUpperCase();
  const suffix = (match[2] || "").trim();
  let type: SectionComponentType = "other";
  if (token.startsWith("LEC")) type = "lec";
  else if (token.startsWith("TUT")) type = "tut";
  else if (token.startsWith("LAB") || token === "PRA") type = "lab";
  else if (token.startsWith("SEM")) type = "sem";

  return { type, code: trimmed, suffix: suffix || trimmed };
}

export function componentLabel(type: SectionComponentType): string {
  return COMPONENT_LABELS[type];
}

export interface SectionComponentGroup {
  type: SectionComponentType;
  label: string;
  sections: CourseSection[];
}

export function groupSectionsByComponent(sections: CourseSection[]): SectionComponentGroup[] {
  const buckets = new Map<SectionComponentType, CourseSection[]>();

  for (const section of sections) {
    const { type } = parseSectionComponent(section.section_code);
    const list = buckets.get(type) ?? [];
    list.push(section);
    buckets.set(type, list);
  }

  return COMPONENT_ORDER.filter((type) => buckets.has(type)).map((type) => ({
    type,
    label: COMPONENT_LABELS[type],
    sections: [...(buckets.get(type) ?? [])].sort((a, b) => a.section_code.localeCompare(b.section_code)),
  }));
}

export function summarizeWeeklyPattern(section: CourseSection): string {
  const parts = section.meetings.map((meeting) => {
    const day = meeting.day.slice(0, 3).toUpperCase();
    const start = meeting.start_time.slice(0, 5);
    const end = meeting.end_time.slice(0, 5);
    return `${day} ${start}–${end}`;
  });
  return parts.join(" · ");
}

function extractTrailingNumber(value: string): string | null {
  const match = value.match(/(\d+)\s*$/u);
  return match?.[1] ?? null;
}

function lectureSuffixKey(lectureCode: string, sectionGroup?: string | null): string {
  const bundle = sectionBundleKey(lectureCode, sectionGroup);
  if (bundle) return bundle;

  const { suffix } = parseSectionComponent(lectureCode);
  const normalized = suffix.trim().toUpperCase();
  if (!normalized) return "";

  const letterMatch = normalized.match(/^([A-Z])/u);
  if (letterMatch) return letterMatch[1];

  const number = extractTrailingNumber(normalized);
  return number ?? normalized;
}

/** True when a tutorial/lab belongs to the selected lecture section. */
export function linksToLectureSection(
  lectureCode: string,
  candidateCode: string,
  lectureGroup?: string | null,
  candidateGroup?: string | null,
): boolean {
  const lectBundle = sectionBundleKey(lectureCode, lectureGroup);
  const candBundle = sectionBundleKey(candidateCode, candidateGroup);

  if (lectBundle && candBundle) {
    return lectBundle === candBundle;
  }

  const lect = parseSectionComponent(lectureCode);
  const cand = parseSectionComponent(candidateCode);
  const lectKey = lectureSuffixKey(lectureCode, lectureGroup);
  const candSuffix = cand.suffix.trim().toUpperCase();

  if (!lectKey) return false;

  if (!lectBundle && candBundle && lectKey === candBundle) return true;
  if (lectBundle && !candBundle && candSuffix.startsWith(lectBundle)) return true;

  if (candSuffix === lectKey) return true;
  if (candSuffix.startsWith(lectKey)) return true;

  const lectNum = extractTrailingNumber(lect.suffix);
  const candNum = extractTrailingNumber(cand.suffix);
  if (lectNum && candNum && lectNum === candNum) return true;

  return false;
}

export function filterSectionsForLecture(
  lectureCode: string,
  sections: CourseSection[],
  lectureGroup?: string | null,
): CourseSection[] {
  if (!lectureCode.trim()) return [...sections];
  return sections
    .filter((section) =>
      linksToLectureSection(
        lectureCode,
        section.section_code,
        lectureGroup,
        section.section_group,
      ),
    )
    .sort((a, b) => a.section_code.localeCompare(b.section_code));
}
