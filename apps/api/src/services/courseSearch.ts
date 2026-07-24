export type CourseSearchKind = "subject-number" | "subject-prefix" | "general";

export interface ClassifiedCourseSearchQuery {
  kind: CourseSearchKind;
  normalizedCode?: string;
  subjectPrefix?: string;
  generalTokens?: string[];
}

/** Normalize "econ 1000" style queries to catalogue code form ("ECON 1000"). */
export function normalizeCourseCodeSearchQuery(query: string): string | null {
  const trimmed = query.trim();
  const codeMatch = trimmed.match(/^([A-Za-z]{2,6})\s+(\d{4})$/);
  if (!codeMatch) {
    return null;
  }

  return `${codeMatch[1].toUpperCase()} ${codeMatch[2]}`;
}

export function normalizeCourseCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, " ");
}

/** Strip faculty prefixes like AP/ or LE/ and return the catalogue code tail. */
export function stripFacultyCourseCodePrefix(code: string): string {
  return normalizeCourseCode(code).replace(/^.*\//, "");
}

export function extractCourseSubject(code: string): string {
  const tail = stripFacultyCourseCodePrefix(code);
  const match = tail.match(/^([A-Z]{2,6})\b/);
  return match?.[1] ?? "";
}

export function classifyCourseSearchQuery(query: string): ClassifiedCourseSearchQuery {
  const trimmed = query.trim();
  const normalizedCode = normalizeCourseCodeSearchQuery(trimmed);
  if (normalizedCode) {
    return { kind: "subject-number", normalizedCode };
  }

  if (/^[A-Za-z]{2,6}$/.test(trimmed)) {
    return { kind: "subject-prefix", subjectPrefix: trimmed.toUpperCase() };
  }

  const generalTokens = trimmed
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length >= 2);

  return { kind: "general", generalTokens };
}

export function courseCodeMatchesNormalized(code: string, normalizedCode: string): boolean {
  return stripFacultyCourseCodePrefix(code) === normalizedCode;
}

export function courseCodeMatchesSubjectPrefix(code: string, subjectPrefix: string): boolean {
  const subject = extractCourseSubject(code);
  if (!subject) {
    return false;
  }

  return subject.toUpperCase().startsWith(subjectPrefix.toUpperCase());
}

export function matchesCatalogCourseSearch(
  course: { code: string; title: string; description?: string | null },
  query: string,
): boolean {
  const classified = classifyCourseSearchQuery(query);
  if (classified.kind === "subject-number" && classified.normalizedCode) {
    return courseCodeMatchesNormalized(course.code, classified.normalizedCode);
  }

  if (classified.kind === "subject-prefix" && classified.subjectPrefix) {
    return courseCodeMatchesSubjectPrefix(course.code, classified.subjectPrefix);
  }

  const tokens = classified.generalTokens ?? [];
  if (tokens.length === 0) {
    return false;
  }

  const haystack = `${course.code} ${course.title}`.toLowerCase();
  const descriptionHaystack = course.description?.toLowerCase() ?? "";
  const searchHaystack =
    tokens.length === 1 ? `${haystack} ${descriptionHaystack}` : haystack;

  return tokens.every((token) => searchHaystack.includes(token));
}

export function appendCatalogCourseSearchCondition(
  search: string,
  conditions: string[],
  params: unknown[],
): void {
  const trimmed = search.trim();
  if (!trimmed) {
    return;
  }

  const classified = classifyCourseSearchQuery(trimmed);

  if (classified.kind === "subject-number" && classified.normalizedCode) {
    params.push(classified.normalizedCode);
    const index = params.length;
    conditions.push(
      `upper(regexp_replace(regexp_replace(code, '^.*\\/', ''), '\\s+', ' ', 'g')) = $${index}`,
    );
    return;
  }

  if (classified.kind === "subject-prefix" && classified.subjectPrefix) {
    params.push(`${classified.subjectPrefix}%`);
    const index = params.length;
    conditions.push(
      `upper(substring(regexp_replace(code, '^.*\\/', '') from '^[A-Za-z]+')) LIKE $${index}`,
    );
    return;
  }

  const tokens = classified.generalTokens ?? [];
  if (tokens.length === 0) {
    return;
  }

  const fields =
    tokens.length === 1
      ? "(code ILIKE $IDX OR title ILIKE $IDX OR coalesce(description, '') ILIKE $IDX)"
      : "(code ILIKE $IDX OR title ILIKE $IDX)";

  for (const token of tokens) {
    params.push(`%${token}%`);
    const index = params.length;
    conditions.push(fields.replaceAll("$IDX", `$${index}`));
  }
}
