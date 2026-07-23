import type { ParsedChecklist } from "./checklistParser.js";

export interface InferredChecklistMetadata {
  facultyKey: string;
  programmeName: string | null;
  startingYear: number;
}

function inferFacultyKey(parsed: ParsedChecklist, filename: string): string {
  const hint = (parsed.programme_hint ?? "").toLowerCase();
  const name = filename.toLowerCase();
  const rawCourses = parsed.years.flatMap((year) => year.courses.map((course) => course.raw.toLowerCase()));

  if (
    hint.includes("engineering") ||
    hint.includes("beng") ||
    name.includes("beng") ||
    name.includes("lassonde") ||
    rawCourses.some((raw) => raw.includes("le/") || raw.includes("eecs"))
  ) {
    return "lassonde";
  }

  if (
    hint.includes("commerce") ||
    hint.includes("bcom") ||
    hint.includes("adms") ||
    name.includes("bcom") ||
    rawCourses.some((raw) => raw.includes("ap/"))
  ) {
    return "laps";
  }

  if (hint.includes("science") && !hint.includes("professional")) {
    return "science";
  }

  if (hint.includes("glendon")) {
    return "glendon";
  }

  return "other";
}

function inferStartingYear(filename: string, hint: string | null): number {
  const combined = `${filename} ${hint ?? ""}`;
  const rangeMatch = combined.match(/20(2\d)[-–/]20(2\d)/);
  if (rangeMatch) {
    return Number(`20${rangeMatch[1]}`);
  }

  const yearMatch = combined.match(/\b(20(2\d))\b/);
  if (yearMatch) {
    return Number(yearMatch[1]);
  }

  return new Date().getFullYear();
}

export function inferChecklistMetadata(
  parsed: ParsedChecklist,
  filename: string,
  overrides?: { facultyKey?: string; programmeName?: string; startingYear?: number },
): InferredChecklistMetadata {
  const programmeName =
    overrides?.programmeName?.trim() || parsed.programme_hint?.trim() || null;

  return {
    facultyKey: overrides?.facultyKey?.trim() || inferFacultyKey(parsed, filename),
    programmeName,
    startingYear:
      overrides?.startingYear && Number.isInteger(overrides.startingYear)
        ? overrides.startingYear
        : inferStartingYear(filename, parsed.programme_hint),
  };
}
