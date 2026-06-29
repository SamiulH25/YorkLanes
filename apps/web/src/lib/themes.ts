export type ThemeId = "york" | "midnight" | "retro" | "paper";

export interface ThemeOption {
  id: ThemeId;
  label: string;
  description: string;
  swatch: string;
}

/** Default theme for new visitors and invalid stored values. */
export const DEFAULT_THEME_ID: ThemeId = "york";

export const THEME_STORAGE_KEY = "yorklanes-theme-id";
export const MODE_STORAGE_KEY = "theme";

/** York is always first — the default campus theme. */
export const themes: ThemeOption[] = [
  {
    id: "york",
    label: "York",
    description: "Campus red, soft cards, classic dashboard",
    swatch: "#E31837",
  },
  {
    id: "midnight",
    label: "Phosphor",
    description: "CRT scanlines, terminal glow, mono type",
    swatch: "linear-gradient(180deg, #33ff66, #020504)",
  },
  {
    id: "retro",
    label: "Sticker",
    description: "Neubrutalist halftone, hard shadows, hot pink",
    swatch: "linear-gradient(135deg, #fff500 40%, #ff2d6a 40%, #ff2d6a 60%, #00d4ff 60%)",
  },
  {
    id: "paper",
    label: "Broadsheet",
    description: "Letterpress rules, editorial margin, ink serif",
    swatch: "linear-gradient(90deg, #8b1a1a 3px, #f4f0e6 3px)",
  },
];

export const themeIds = themes.map((theme) => theme.id) as ThemeId[];

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return themeIds.includes(value as ThemeId);
}

export function defaultThemeId(): ThemeId {
  return DEFAULT_THEME_ID;
}
