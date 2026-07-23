const STORAGE_KEY = "sidebar-collapsed";
const FORCE_META = 'meta[name="yorklanes-collapse-sidebar"]';

function pageWantsForceCollapse(doc: Document = document): boolean {
  return doc.querySelector(FORCE_META)?.getAttribute("content") === "1";
}

function preferredCollapsed(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "1";
}

function applySidebar(collapsed: boolean, options: { persist?: boolean } = {}): void {
  const sidebar = document.querySelector<HTMLElement>("[data-sidebar]");
  if (!sidebar) return;

  const persist = options.persist !== false;
  sidebar.dataset.collapsed = collapsed ? "true" : "false";
  document.documentElement.dataset.sidebarCollapsed = collapsed ? "true" : "false";

  if (persist) {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    // Manual expand while on a force-collapse page takes over from the page default.
    if (!collapsed) {
      delete document.documentElement.dataset.forceSidebarCollapse;
    }
  }

  document.querySelectorAll<HTMLElement>("[data-sidebar-toggle]").forEach((button) => {
    button.setAttribute("aria-expanded", collapsed ? "false" : "true");
    button.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
    button.setAttribute("title", collapsed ? "Expand sidebar" : "Collapse sidebar");
  });
}

function syncSidebarDatasets(doc: Document, forceCollapse: boolean): void {
  const root = doc.documentElement;
  if (forceCollapse) {
    root.dataset.forceSidebarCollapse = "true";
    root.dataset.sidebarCollapsed = "true";
    return;
  }

  delete root.dataset.forceSidebarCollapse;
  if (preferredCollapsed()) {
    root.dataset.sidebarCollapsed = "true";
  } else {
    delete root.dataset.sidebarCollapsed;
  }
}

function initSidebar(): void {
  const sidebar = document.querySelector<HTMLElement>("[data-sidebar]");
  if (!sidebar) return;

  // Only the html dataset drives force-collapse after load, so a manual expand
  // (which clears the flag) is not undone by astro:page-load.
  if (document.documentElement.dataset.forceSidebarCollapse === "true") {
    applySidebar(true, { persist: false });
    return;
  }

  applySidebar(preferredCollapsed(), { persist: false });
}

interface BeforeSwapEvent extends Event {
  newDocument: Document;
}

document.addEventListener("astro:before-swap", (event) => {
  const newDoc = (event as BeforeSwapEvent).newDocument;
  if (!newDoc) return;
  syncSidebarDatasets(newDoc, pageWantsForceCollapse(newDoc));
});

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
