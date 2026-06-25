const STORAGE_KEY = "sidebar-collapsed";

function applySidebar(collapsed: boolean): void {
  const sidebar = document.querySelector<HTMLElement>("[data-sidebar]");
  if (!sidebar) return;

  sidebar.dataset.collapsed = collapsed ? "true" : "false";
  document.documentElement.dataset.sidebarCollapsed = collapsed ? "true" : "false";
  localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");

  document.querySelectorAll<HTMLElement>("[data-sidebar-toggle]").forEach((button) => {
    button.setAttribute("aria-expanded", collapsed ? "false" : "true");
    button.setAttribute(
      "aria-label",
      collapsed ? "Expand sidebar" : "Collapse sidebar",
    );
    button.setAttribute("title", collapsed ? "Expand sidebar" : "Collapse sidebar");
  });
}

function initSidebar(): void {
  const sidebar = document.querySelector<HTMLElement>("[data-sidebar]");
  if (!sidebar) return;

  const collapsed =
    document.documentElement.dataset.sidebarCollapsed === "true" ||
    localStorage.getItem(STORAGE_KEY) === "1";
  applySidebar(collapsed);
}

initSidebar();

document.addEventListener("click", (event) => {
  const button = (event.target as Element | null)?.closest("[data-sidebar-toggle]");
  if (!button) return;

  const sidebar = document.querySelector<HTMLElement>("[data-sidebar]");
  const collapsed = sidebar?.dataset.collapsed === "true";
  applySidebar(!collapsed);
});
