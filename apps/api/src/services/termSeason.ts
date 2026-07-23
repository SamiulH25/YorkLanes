/**
 * Bridge plan sessions (Fall/Winter/Summer) and scraped CDM term codes
 * (e.g. "2026-2027 FW", "2026 S").
 */
export type Season = "fall" | "winter" | "summer";

export const SEASON_LABEL: Record<Season, string> = {
  fall: "Fall",
  winter: "Winter",
  summer: "Summer",
};

/** Map a plan_terms.session string to a season. */
export function seasonFromPlanSession(session: string): Season | null {
  const value = session.trim().toLowerCase();
  if (!value) return null;
  if (value.includes("summer") || value === "s" || value.startsWith("su")) return "summer";
  if (value.includes("winter") || value === "w") return "winter";
  if (value.includes("fall") || value.includes("autumn") || value === "f") return "fall";
  return null;
}

/**
 * Map a scraped CDM term code/label to the seasons it covers.
 * Fall/Winter (FW) counts as evidence for both Fall and Winter plan slots.
 */
export function seasonsFromScrapedTerm(term: string): Season[] {
  const value = term.trim().toUpperCase();
  if (!value) return [];

  if (/\bFW\b/.test(value) || /FALL\s*\/\s*WINTER/.test(value)) {
    return ["fall", "winter"];
  }
  if (/\bSUMMER\b/.test(value) || /(?:^|\s)\d{4}(?:-\d{4})?\s+S$/.test(value)) {
    return ["summer"];
  }
  if (/\bFALL\b/.test(value) || /(?:^|\s)\d{4}(?:-\d{4})?\s+F$/.test(value)) {
    return ["fall"];
  }
  if (/\bWINTER\b/.test(value) || /(?:^|\s)\d{4}(?:-\d{4})?\s+W$/.test(value)) {
    return ["winter"];
  }
  return [];
}

export interface SeasonFlags {
  fall: boolean;
  winter: boolean;
  summer: boolean;
}

export function emptySeasonFlags(): SeasonFlags {
  return { fall: false, winter: false, summer: false };
}

export function mergeSeasonFlags(target: SeasonFlags, seasons: Season[]): void {
  for (const season of seasons) {
    target[season] = true;
  }
}

export function seasonOffered(flags: SeasonFlags, season: Season): boolean {
  return flags[season];
}
