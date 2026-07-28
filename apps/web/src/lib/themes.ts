export type ThemeId = "york" | "blue" | "green" | "purple" | "teal";

export interface ThemeOption {
  id: ThemeId;
  label: string;
  swatch: string;
}

/** Default theme for new visitors and invalid stored values. */
export const DEFAULT_THEME_ID: ThemeId = "york";

export const THEME_STORAGE_KEY = "yorklanes-theme-id";
export const MODE_STORAGE_KEY = "theme";

const LEGACY_THEME_IDS = new Set(["midnight", "retro", "paper"]);

export const themes: ThemeOption[] = [
  { id: "york", label: "Red", swatch: "#e31837" },
  { id: "blue", label: "Blue", swatch: "#2563eb" },
  { id: "green", label: "Green", swatch: "#16a34a" },
  { id: "purple", label: "Purple", swatch: "#7c3aed" },
  { id: "teal", label: "Teal", swatch: "#0d9488" },
];

export const themeIds = themes.map((theme) => theme.id) as ThemeId[];

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return themeIds.includes(value as ThemeId);
}

export function normalizeThemeId(value: string | null | undefined): ThemeId {
  if (value && isThemeId(value)) {
    return value;
  }
  if (value && LEGACY_THEME_IDS.has(value)) {
    return DEFAULT_THEME_ID;
  }
  return DEFAULT_THEME_ID;
}

export function defaultThemeId(): ThemeId {
  return DEFAULT_THEME_ID;
}
