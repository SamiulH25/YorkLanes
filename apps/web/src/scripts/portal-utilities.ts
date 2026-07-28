interface CalendarEvent {
  title: string;
  time?: string;
  href?: string;
}

function closeUtilityPanel(utility: HTMLElement): void {
  const panel = utility.querySelector<HTMLElement>("[data-portal-utility-panel]");
  const toggle = utility.querySelector<HTMLElement>("[data-portal-utility-toggle]");
  if (!panel || !toggle) return;

  panel.classList.add("hidden");
  toggle.setAttribute("aria-expanded", "false");
}

function openUtilityPanel(utility: HTMLElement): void {
  document.querySelectorAll<HTMLElement>("[data-portal-utility]").forEach((other) => {
    if (other !== utility) closeUtilityPanel(other);
  });
  closeProfilePanel();

  const panel = utility.querySelector<HTMLElement>("[data-portal-utility-panel]");
  const toggle = utility.querySelector<HTMLElement>("[data-portal-utility-toggle]");
  if (!panel || !toggle) return;

  panel.classList.remove("hidden");
  toggle.setAttribute("aria-expanded", "true");
}

function isUtilityOpen(utility: HTMLElement): boolean {
  const panel = utility.querySelector<HTMLElement>("[data-portal-utility-panel]");
  return panel ? !panel.classList.contains("hidden") : false;
}

function closeProfilePanel(): void {
  const profile = document.querySelector<HTMLElement>("[data-portal-profile]");
  if (!profile) return;

  const panel = profile.querySelector<HTMLElement>("[data-portal-profile-panel]");
  const toggle = profile.querySelector<HTMLElement>("[data-portal-profile-toggle]");
  if (!panel || !toggle) return;

  panel.classList.add("hidden");
  toggle.setAttribute("aria-expanded", "false");
}

function openProfilePanel(): void {
  document.querySelectorAll<HTMLElement>("[data-portal-utility]").forEach(closeUtilityPanel);

  const profile = document.querySelector<HTMLElement>("[data-portal-profile]");
  if (!profile) return;

  const panel = profile.querySelector<HTMLElement>("[data-portal-profile-panel]");
  const toggle = profile.querySelector<HTMLElement>("[data-portal-profile-toggle]");
  if (!panel || !toggle) return;

  panel.classList.remove("hidden");
  toggle.setAttribute("aria-expanded", "true");
}

function isProfileOpen(): boolean {
  const profile = document.querySelector<HTMLElement>("[data-portal-profile]");
  if (!profile) return false;
  const panel = profile.querySelector<HTMLElement>("[data-portal-profile-panel]");
  return panel ? !panel.classList.contains("hidden") : false;
}

function closeAllPanels(): void {
  document.querySelectorAll<HTMLElement>("[data-portal-utility]").forEach(closeUtilityPanel);
  closeProfilePanel();
}

function formatEventsLabel(iso: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (iso === today) return "Today";

  const date = new Date(`${iso}T12:00:00`);
  return date.toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function renderCalendarEvents(container: HTMLElement, iso: string, events: CalendarEvent[]): void {
  const label = container.querySelector<HTMLElement>(".portal-mini-cal__events-label");
  if (label) {
    label.textContent = formatEventsLabel(iso);
  }

  const existingList = container.querySelector(".portal-mini-cal__event-list");
  const existingEmpty = container.querySelector(".portal-mini-cal__events-empty");

  if (events.length === 0) {
    existingList?.remove();
    if (!existingEmpty) {
      const empty = document.createElement("p");
      empty.className = "portal-mini-cal__events-empty";
      empty.textContent = "No events on this day.";
      container.appendChild(empty);
    }
    return;
  }

  existingEmpty?.remove();

  const list = existingList ?? document.createElement("ul");
  list.className = "portal-mini-cal__event-list";
  list.innerHTML = "";

  for (const event of events) {
    const item = document.createElement("li");

    if (event.href) {
      const link = document.createElement("a");
      link.href = event.href;
      link.className = "portal-mini-cal__event";
      if (event.time) {
        const time = document.createElement("span");
        time.className = "portal-mini-cal__event-time";
        time.textContent = event.time;
        link.appendChild(time);
      }
      const title = document.createElement("span");
      title.className = "portal-mini-cal__event-title";
      title.textContent = event.title;
      link.appendChild(title);
      item.appendChild(link);
    } else {
      const row = document.createElement("div");
      row.className = "portal-mini-cal__event";
      if (event.time) {
        const time = document.createElement("span");
        time.className = "portal-mini-cal__event-time";
        time.textContent = event.time;
        row.appendChild(time);
      }
      const title = document.createElement("span");
      title.className = "portal-mini-cal__event-title";
      title.textContent = event.title;
      row.appendChild(title);
      item.appendChild(row);
    }

    list.appendChild(item);
  }

  if (!existingList) {
    container.appendChild(list);
  }
}

function selectCalendarDay(button: HTMLButtonElement): void {
  const iso = button.dataset.calendarDay;
  if (!iso) return;

  const calendar = button.closest<HTMLElement>("[data-portal-mini-cal]");
  if (!calendar) return;

  calendar.querySelectorAll<HTMLButtonElement>("[data-calendar-day]").forEach((day) => {
    day.classList.toggle("portal-mini-cal__day--selected", day === button);
    day.setAttribute("aria-pressed", day === button ? "true" : "false");
  });

  let events: CalendarEvent[] = [];
  try {
    events = JSON.parse(button.dataset.calendarEvents ?? "[]") as CalendarEvent[];
  } catch {
    events = [];
  }

  const eventsContainer = calendar.querySelector<HTMLElement>("[data-calendar-events]");
  if (eventsContainer) {
    renderCalendarEvents(eventsContainer, iso, events);
  }
}

export function initPortalUtilities(): void {
  if (typeof window !== "undefined") {
    const win = window as Window & { __yorklanesPortalUtilities?: boolean };
    if (win.__yorklanesPortalUtilities) return;
    win.__yorklanesPortalUtilities = true;
  }

  document.addEventListener("astro:before-swap", () => {
    closeAllPanels();
  });

  document.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    if (!target) return;

    const calendarDay = target.closest<HTMLButtonElement>("[data-calendar-day]");
    if (calendarDay) {
      event.stopPropagation();
      selectCalendarDay(calendarDay);
      return;
    }

    const utilityToggle = target.closest<HTMLElement>("[data-portal-utility-toggle]");
    if (utilityToggle) {
      const utility = utilityToggle.closest<HTMLElement>("[data-portal-utility]");
      if (!utility) return;
      event.stopPropagation();
      if (isUtilityOpen(utility)) {
        closeUtilityPanel(utility);
      } else {
        openUtilityPanel(utility);
      }
      return;
    }

    const profileToggle = target.closest<HTMLElement>("[data-portal-profile-toggle]");
    if (profileToggle) {
      event.stopPropagation();
      if (isProfileOpen()) {
        closeProfilePanel();
      } else {
        openProfilePanel();
      }
      return;
    }

    const insideUtilityPanel = target.closest("[data-portal-utility-panel]");
    const insideUtilityToggle = target.closest("[data-portal-utility-toggle]");
    const insideProfilePanel = target.closest("[data-portal-profile-panel]");
    const insideProfileToggle = target.closest("[data-portal-profile-toggle]");

    if (!insideUtilityPanel && !insideUtilityToggle && !insideProfilePanel && !insideProfileToggle) {
      closeAllPanels();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeAllPanels();
  });
}
