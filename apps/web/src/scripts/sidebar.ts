const STORAGE_KEY = "sidebar-collapsed";

function applySidebar(collapsed: boolean): void {
  const sidebar = document.querySelector<HTMLElement>("[data-sidebar]");
  if (!sidebar) return;

  sidebar.dataset.collapsed = collapsed ? "true" : "false";
  document.documentElement.dataset.sidebarCollapsed = collapsed ? "true" : "false";
  localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");

  document.querySelectorAll<HTMLElement>("[data-sidebar-toggle]").forEach((button) => {
    button.setAttribute("aria-expanded", collapsed ? "false" : "true");
    button.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
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

function navHrefMatches(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Sync sidebar/dock nav highlight after ClientRouter navigations. */
function syncNavActiveState(): void {
  const pathname = window.location.pathname;

  document.querySelectorAll<HTMLAnchorElement>(".sidebar-nav-link").forEach((link) => {
    const href = link.getAttribute("href") ?? "";
    const active = navHrefMatches(pathname, href);
    link.classList.toggle("link-nav-active", active);

    const icon = link.querySelector<HTMLElement>(".sidebar-nav-icon");
    if (icon) {
      icon.classList.toggle("nav-icon-bg-active", active);
      icon.classList.toggle("nav-icon-bg", !active);
    }
  });

  document.querySelectorAll<HTMLAnchorElement>('[aria-label="Mobile navigation"] a').forEach((link) => {
    const href = link.getAttribute("href") ?? "";
    const active = navHrefMatches(pathname, href);
    link.classList.toggle("text-brand", active);
    link.classList.toggle("text-muted", !active);
  });
}

function init(): void {
  initSidebar();
  syncNavActiveState();
}

init();
document.addEventListener("astro:page-load", init);

document.addEventListener("click", (event) => {
  const button = (event.target as Element | null)?.closest("[data-sidebar-toggle]");
  if (!button) return;

  const sidebar = document.querySelector<HTMLElement>("[data-sidebar]");
  const collapsed = sidebar?.dataset.collapsed === "true";
  applySidebar(!collapsed);
});
