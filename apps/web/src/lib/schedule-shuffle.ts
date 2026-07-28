import { toScheduleDay } from "./schedule-days";
import {
  entryKey,
  findCrossBundleConflicts,
  SCHEDULE_END_HOUR,
  SCHEDULE_START_HOUR,
  type ScheduleGridEntry,
  type ScheduleWeekState,
} from "./schedule-grid";
import {
  filterSectionsForLecture,
  groupSectionsByComponent,
  parseSectionComponent,
  sectionBundleKey,
  type SectionComponentType,
} from "./schedule-sections";
import type { CourseSection, SectionGroup } from "../types/course-sections";

export const PINNED_PICK_KEY = "__pinned";

export interface CourseBundleOption {
  picks: Map<SectionComponentType, string>;
  entries: ScheduleGridEntry[];
}

export interface ScheduleAlternative {
  picksByCourse: Map<string, Map<SectionComponentType, string>>;
  entries: ScheduleGridEntry[];
}

function normalizeCourseCode(code: string): string {
  return code.trim().toUpperCase();
}

export function filterValidEntries(entries: ScheduleGridEntry[]): ScheduleGridEntry[] {
  return entries.filter((entry) => {
    const start = Number(entry.start_time.split(":")[0]);
    const end = Number(entry.end_time.split(":")[0]);
    return start >= SCHEDULE_START_HOUR && end <= SCHEDULE_END_HOUR;
  });
}

export function entriesFromSections(
  courseCode: string,
  sections: CourseSection[],
  bundleId: string,
  context: Pick<ScheduleWeekState, "planYear" | "planSeason" | "cdmTerm">,
): ScheduleGridEntry[] {
  const entries: ScheduleGridEntry[] = [];
  for (const section of sections) {
    const component = parseSectionComponent(section.section_code);
    for (const meeting of section.meetings) {
      const day = toScheduleDay(meeting.day);
      const startTime = meeting.start_time.slice(0, 5);
      entries.push({
        id: entryKey({
          course_code: courseCode,
          section_code: section.section_code,
          day,
          start_time: startTime,
        }),
        course_code: courseCode,
        section_code: section.section_code,
        component_type: component.type,
        day,
        start_time: startTime,
        end_time: meeting.end_time.slice(0, 5),
        room: meeting.room,
        campus: meeting.campus,
        bundle_id: bundleId,
        plan_year: context.planYear,
        plan_season: context.planSeason,
        cdm_term: context.cdmTerm,
      });
    }
  }
  return entries;
}

function sectionGroupLookup(sectionGroups: SectionGroup[]): Map<string, SectionGroup> {
  const lookup = new Map<string, SectionGroup>();
  for (const group of sectionGroups) {
    lookup.set(`${normalizeCourseCode(group.course_code)}|${group.term}`, group);
  }
  return lookup;
}

function lectureGroupForPick(sections: CourseSection[], lecturePick: string): string | null {
  const section = sections.find((item) => item.section_code === lecturePick);
  return section?.section_group ?? sectionBundleKey(lecturePick) ?? null;
}

function sectionsForPicks(
  allSections: CourseSection[],
  picks: Map<SectionComponentType, string>,
): CourseSection[] {
  return [...picks.values()]
    .map((sectionCode) => allSections.find((section) => section.section_code === sectionCode))
    .filter((section): section is CourseSection => Boolean(section));
}

export function generateCourseBundleOptions(
  courseCode: string,
  sections: CourseSection[],
  context: Pick<ScheduleWeekState, "planYear" | "planSeason" | "cdmTerm">,
): CourseBundleOption[] {
  const groups = groupSectionsByComponent(sections);
  const combinations: Array<Map<SectionComponentType, string>> = [];
  const lectureGroup = groups.find((group) => group.type === "lec");

  if (lectureGroup && lectureGroup.sections.length > 0) {
    for (const lecture of lectureGroup.sections) {
      const picks = new Map<SectionComponentType, string>();
      picks.set("lec", lecture.section_code);
      const tieGroup = lectureGroupForPick(sections, lecture.section_code);
      const otherGroups = groups.filter((group) => group.type !== "lec");

      const build = (groupIndex: number): void => {
        if (groupIndex >= otherGroups.length) {
          combinations.push(new Map(picks));
          return;
        }

        const group = otherGroups[groupIndex];
        const visible = filterSectionsForLecture(lecture.section_code, group.sections, tieGroup);
        if (visible.length === 0) {
          build(groupIndex + 1);
          return;
        }

        for (const section of visible) {
          picks.set(group.type, section.section_code);
          build(groupIndex + 1);
          picks.delete(group.type);
        }
      };

      build(0);
    }
  } else {
    const picks = new Map<SectionComponentType, string>();
    for (const group of groups) {
      if (group.sections.length === 1) {
        picks.set(group.type, group.sections[0].section_code);
      }
    }
    if (picks.size > 0) {
      combinations.push(picks);
    }
  }

  const options: CourseBundleOption[] = [];
  for (const picks of combinations) {
    const bundleId = crypto.randomUUID();
    const selectedSections = sectionsForPicks(sections, picks);
    if (selectedSections.length === 0) continue;

    const entries = filterValidEntries(entriesFromSections(courseCode, selectedSections, bundleId, context));
    if (entries.length === 0) continue;

    options.push({ picks, entries });
  }

  return options;
}

export function generateCourseBundleOptionsForLecture(
  courseCode: string,
  sections: CourseSection[],
  lecturePick: string,
  context: Pick<ScheduleWeekState, "planYear" | "planSeason" | "cdmTerm">,
): CourseBundleOption[] {
  return generateCourseBundleOptions(courseCode, sections, context).filter(
    (option) => option.picks.get("lec") === lecturePick,
  );
}

export function picksMatch(
  a: Map<string, Map<SectionComponentType, string>>,
  b: Map<string, Map<SectionComponentType, string>>,
): boolean {
  return picksSignature(a) === picksSignature(b);
}

export function findAlternativeIndex(
  alternatives: ScheduleAlternative[],
  currentPicksByCourse: Map<string, Map<SectionComponentType, string>>,
): number {
  const currentSignature = picksSignature(currentPicksByCourse);
  const index = alternatives.findIndex(
    (alternative) => picksSignature(alternative.picksByCourse) === currentSignature,
  );
  return index >= 0 ? index : 0;
}

function picksSignature(picksByCourse: Map<string, Map<SectionComponentType, string>>): string {
  return [...picksByCourse.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([courseCode, picks]) => {
      const parts = [...picks.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([type, code]) => `${type}:${code}`);
      return `${courseCode}|${parts.join(",")}`;
    })
    .join(";");
}

export function enumerateValidSchedules(
  courseCodes: string[],
  pinnedCourses: ReadonlySet<string>,
  sectionGroups: SectionGroup[],
  term: string,
  context: Pick<ScheduleWeekState, "planYear" | "planSeason" | "cdmTerm">,
  pinnedEntries: ScheduleGridEntry[],
  currentPicksByCourse: Map<string, Map<SectionComponentType, string>>,
  maxResults = 256,
): ScheduleAlternative[] {
  const normalizedCourses = [...new Set(courseCodes.map(normalizeCourseCode))].filter(Boolean);
  const unpinned = normalizedCourses.filter((courseCode) => !pinnedCourses.has(courseCode));
  const optionsByCourse = new Map<string, CourseBundleOption[]>();
  const groupLookup = sectionGroupLookup(sectionGroups);

  for (const courseCode of unpinned) {
    const group = groupLookup.get(`${courseCode}|${term}`);
    if (!group || group.sections.length === 0) continue;

    const currentLecture = currentPicksByCourse.get(courseCode)?.get("lec");
    const options =
      currentLecture && group.sections.some((section) => section.section_code === currentLecture)
        ? generateCourseBundleOptionsForLecture(courseCode, group.sections, currentLecture, context)
        : generateCourseBundleOptions(courseCode, group.sections, context);

    if (options.length > 0) {
      optionsByCourse.set(courseCode, options);
    }
  }

  const results: ScheduleAlternative[] = [];
  const seen = new Set<string>();

  const backtrack = (
    index: number,
    assignedEntries: ScheduleGridEntry[],
    assignedPicks: Map<string, Map<SectionComponentType, string>>,
  ): void => {
    if (results.length >= maxResults) return;

    if (index >= unpinned.length) {
      const picksByCourse = new Map<string, Map<SectionComponentType, string>>();
      for (const courseCode of normalizedCourses) {
        if (pinnedCourses.has(courseCode)) {
          const pinned = currentPicksByCourse.get(courseCode);
          if (pinned) picksByCourse.set(courseCode, new Map(pinned));
          continue;
        }
        const picks = assignedPicks.get(courseCode);
        if (picks) picksByCourse.set(courseCode, new Map(picks));
      }

      const signature = picksSignature(picksByCourse);
      if (seen.has(signature)) return;
      seen.add(signature);

      results.push({
        picksByCourse,
        entries: [...pinnedEntries, ...assignedEntries],
      });
      return;
    }

    const courseCode = unpinned[index];
    const options = optionsByCourse.get(courseCode) ?? [];
    for (const option of options) {
      const conflicts = findCrossBundleConflicts(option.entries, [...pinnedEntries, ...assignedEntries]);
      if (conflicts.length > 0) continue;
      assignedPicks.set(courseCode, option.picks);
      backtrack(index + 1, [...assignedEntries, ...option.entries], assignedPicks);
      assignedPicks.delete(courseCode);
      if (results.length >= maxResults) return;
    }
  };

  backtrack(0, [], new Map());
  return results;
}

export function countScheduleAlternatives(
  courseCodes: string[],
  pinnedCourses: ReadonlySet<string>,
  sectionGroups: SectionGroup[],
  term: string,
  context: Pick<ScheduleWeekState, "planYear" | "planSeason" | "cdmTerm">,
  pinnedEntries: ScheduleGridEntry[],
  currentPicksByCourse: Map<string, Map<SectionComponentType, string>>,
): number {
  return enumerateValidSchedules(
    courseCodes,
    pinnedCourses,
    sectionGroups,
    term,
    context,
    pinnedEntries,
    currentPicksByCourse,
  ).length;
}
