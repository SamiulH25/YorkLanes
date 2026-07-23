function closeSettingsMenu(menu: HTMLElement): void {
  const panel = menu.querySelector<HTMLElement>("[data-settings-panel]");
  const toggle = menu.querySelector<HTMLElement>("[data-settings-toggle]");
  if (!panel || !toggle) return;

  panel.classList.add("hidden");
  toggle.setAttribute("aria-expanded", "false");
}

function openSettingsMenu(menu: HTMLElement): void {
  document.querySelectorAll<HTMLElement>("[data-settings-menu]").forEach((other) => {
    if (other !== menu) closeSettingsMenu(other);
  });

  const panel = menu.querySelector<HTMLElement>("[data-settings-panel]");
  const toggle = menu.querySelector<HTMLElement>("[data-settings-toggle]");
  if (!panel || !toggle) return;

  panel.classList.remove("hidden");
  toggle.setAttribute("aria-expanded", "true");
}

function isSettingsOpen(menu: HTMLElement): boolean {
  const panel = menu.querySelector<HTMLElement>("[data-settings-panel]");
  return panel ? !panel.classList.contains("hidden") : false;
}

export function initSettingsMenu(): void {
  document.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    if (!target) return;

    const closeButton = target.closest("[data-settings-close]");
    if (closeButton) {
      const menu = closeButton.closest<HTMLElement>("[data-settings-menu]");
      if (menu) closeSettingsMenu(menu);
      return;
    }

    const toggle = target.closest<HTMLElement>("[data-settings-toggle]");
    if (toggle) {
      const menu = toggle.closest<HTMLElement>("[data-settings-menu]");
      if (!menu) return;
      event.stopPropagation();
      if (isSettingsOpen(menu)) {
        closeSettingsMenu(menu);
      } else {
        openSettingsMenu(menu);
      }
      return;
    }

    const insidePanel = target.closest("[data-settings-panel]");
    const insideToggle = target.closest("[data-settings-toggle]");
    if (!insidePanel && !insideToggle) {
      document.querySelectorAll<HTMLElement>("[data-settings-menu]").forEach(closeSettingsMenu);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll<HTMLElement>("[data-settings-menu]").forEach(closeSettingsMenu);
  });
}
