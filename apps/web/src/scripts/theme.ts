/** Theme appearance — loaded once from BaseLayout. */
import {
  defaultThemeId,
  isThemeId,
  MODE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  type ThemeId,
} from "../lib/themes";

const SWITCH_MS = 320;

function flashThemeSwitch(): void {
  document.documentElement.classList.add("theme-switching");
  window.setTimeout(() => {
    document.documentElement.classList.remove("theme-switching");
  }, SWITCH_MS);
}

function applyMode(dark: boolean): void {
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem(MODE_STORAGE_KEY, dark ? "dark" : "light");
  syncModeUi();
  flashThemeSwitch();
}

function applyThemeId(themeId: ThemeId): void {
  document.documentElement.dataset.theme = themeId;
  localStorage.setItem(THEME_STORAGE_KEY, themeId);
  syncPickerUi();
  flashThemeSwitch();
}

function syncPickerUi(): void {
  const themeId = document.documentElement.dataset.theme ?? defaultThemeId();
  document.querySelectorAll<HTMLElement>("[data-theme-id]").forEach((button) => {
    const active = button.dataset.themeId === themeId;
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.classList.toggle("is-active", active);
  });
}

function syncModeUi(): void {
  const dark = document.documentElement.classList.contains("dark");
  document.querySelectorAll<HTMLElement>("[data-mode-pick]").forEach((button) => {
    const active = (button.dataset.modePick === "dark") === dark;
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.classList.toggle("is-active", active);
  });
}

document.addEventListener("click", (event) => {
  const themeButton = (event.target as Element | null)?.closest<HTMLElement>("[data-theme-id]");
  if (themeButton?.dataset.themeId && isThemeId(themeButton.dataset.themeId)) {
    applyThemeId(themeButton.dataset.themeId);
    return;
  }

  const modeButton = (event.target as Element | null)?.closest<HTMLElement>("[data-mode-pick]");
  if (modeButton?.dataset.modePick) {
    applyMode(modeButton.dataset.modePick === "dark");
    return;
  }

  const legacyToggle = (event.target as Element | null)?.closest("[data-theme-toggle]");
  if (legacyToggle) {
    applyMode(!document.documentElement.classList.contains("dark"));
    return;
  }

  const legacyPick = (event.target as Element | null)?.closest<HTMLElement>("[data-theme-pick]");
  if (legacyPick) {
    applyMode(legacyPick.dataset.themePick === "dark");
  }
});

syncPickerUi();
syncModeUi();

/** Read plan graph colors from the active theme tokens. */
export function readThemeColor(token: "--theme-prereq" | "--theme-coreq" | "--theme-warning"): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value || "#60a5fa";
}
