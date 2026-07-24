import { fetchCourseSections } from "../lib/course-sections";
import { daysForEntries, dayShort, formatClock, toScheduleDay } from "../lib/schedule-days";
import {
  computeEventLayout,
  defaultGridDays,
  entryKey,
  gridHours,
  meetingsOverlap,
  SCHEDULE_END_HOUR,
  SCHEDULE_START_HOUR,
  SCHEDULE_STORAGE_KEY,
  sectionSelectionKey,
  TIME_COLUMN_WIDTH,
  type ScheduleGridEntry,
} from "../lib/schedule-grid";
import {
  listPlannedCourseCodes,
  readActivePlanGraphSnapshot,
  scheduleWarningForCourse,
} from "../lib/plan-store";
import type { CourseSection, SectionGroup } from "../types/course-sections";

interface SchedulePageOptions {
  focusCourse?: string;
  focusTerm?: string;
}

function readStoredEntries(): ScheduleGridEntry[] {
  const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ScheduleGridEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredEntries(entries: ScheduleGridEntry[]): void {
  localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(entries));
}

function uniqueTerms(groups: SectionGroup[]): string[] {
  return [...new Set(groups.map((group) => group?.term).filter((term): term is string => Boolean(term)))]
    .sort((a, b) => b.localeCompare(a));
}

function mergeTerms(existing: string[], incoming: string[]): string[] {
  return [...new Set([...existing, ...incoming].filter(Boolean))].sort((a, b) => b.localeCompare(a));
}

function resolveSelectedTerm(
  select: HTMLSelectElement | null,
  terms: string[],
  preferred?: string,
): string {
  if (!terms.length) return "";
  const current = select?.value ?? "";
  if (current && terms.includes(current)) return current;
  if (preferred && terms.includes(preferred)) return preferred;
  return terms[0];
}

function normalizeCourseCode(code: string): string {
  return code.trim().toUpperCase();
}

function meetingInstructors(section: CourseSection): string {
  return [...new Set(section.meetings.map((meeting) => meeting.instructor).filter(Boolean))].join(", ");
}

function renderSectionBlock(
  courseCode: string,
  section: CourseSection,
  selectedKeys: Set<string>,
): string {
  const selected = selectedKeys.has(sectionSelectionKey(courseCode, section.section_code));
  const meetings = section.meetings
    .map((meeting) => {
      const place = [meeting.campus, meeting.room].filter(Boolean).join(" · ") || "Location TBA";
      return `
        <li class="section-meeting">
          <span class="section-day" title="${meeting.day}">${dayShort(meeting.day)}</span>
          <span class="section-meeting__time">
            ${formatClock(meeting.start_time)}
            <span class="section-meeting__dash">–</span>
            ${formatClock(meeting.end_time)}
          </span>
          <span class="section-meeting__place">${place}</span>
        </li>
      `;
    })
    .join("");

  const instructor = meetingInstructors(section);
  const deliveryMode = section.meetings[0]?.delivery_mode;

  return `
    <li class="section-block${selected ? " is-selected" : ""}" data-section-card data-course-code="${courseCode}" data-section-code="${section.section_code}">
      <div class="section-block__head">
        <span class="section-block__code">${section.section_code}</span>
        ${deliveryMode ? `<span class="section-mode">${deliveryMode}</span>` : ""}
      </div>
      <ul class="section-meetings">${meetings}</ul>
      ${
        instructor
          ? `<p class="section-block__instructor"><span class="section-block__instructor-label">Instructor</span>${instructor}</p>`
          : ""
      }
      <div class="schedule-section-actions">
        ${
          selected
            ? `<button type="button" class="btn-york px-3 py-1.5 text-xs opacity-80" disabled>On schedule</button>
               <button type="button" class="btn-ghost px-3 py-1.5 text-xs" data-remove-section>Remove section</button>`
            : `<button type="button" class="btn-york px-3 py-1.5 text-xs" data-add-section>Add to schedule</button>`
        }
      </div>
    </li>
  `;
}

export function initSchedulePage(options: SchedulePageOptions = {}): void {
  const root = document.querySelector<HTMLElement>("[data-schedule-root]");
  if (!root) return;

  const termSelect = root.querySelector<HTMLSelectElement>("[data-schedule-term]");
  const courseList = root.querySelector<HTMLElement>("[data-schedule-courses]");
  const sectionBrowser = root.querySelector<HTMLElement>("[data-schedule-sections]");
  const sectionHeading = root.querySelector<HTMLElement>("[data-schedule-section-heading]");
  const status = root.querySelector<HTMLElement>("[data-schedule-status]");
  const eventsContainer = root.querySelector<HTMLElement>("[data-schedule-events]");
  const grid = root.querySelector<HTMLElement>("[data-schedule-grid]");
  const gridHeader = root.querySelector<HTMLElement>("[data-schedule-grid-header]");
  const gridBody = root.querySelector<HTMLElement>("[data-schedule-grid-body]");

  const planSnapshot = readActivePlanGraphSnapshot();
  const plannedCourses = [...(planSnapshot ? listPlannedCourseCodes(planSnapshot) : [])];
  const focusCourse = options.focusCourse?.trim() || plannedCourses[0] || "";
  let activeCourse = focusCourse;
  let entries = readStoredEntries();
  let sectionGroups: SectionGroup[] = [];
  let availableTerms: string[] = options.focusTerm ? [options.focusTerm] : [];

  function setStatus(message: string, type: "info" | "success" | "error" = "info"): void {
    if (!status) return;
    status.hidden = !message;
    status.textContent = message;
    status.classList.remove("schedule-status--error", "schedule-status--success");
    if (type === "error") status.classList.add("schedule-status--error");
    if (type === "success") status.classList.add("schedule-status--success");
  }

  function selectedSectionKeys(): Set<string> {
    const keys = new Set<string>();
    for (const entry of entries) {
      keys.add(sectionSelectionKey(entry.course_code, entry.section_code));
    }
    return keys;
  }

  function renderCourseChips(): void {
    if (!courseList) return;
    if (plannedCourses.length === 0) {
      courseList.innerHTML = `
        <p class="schedule-status">
          Open your <a href="/plan" class="text-brand font-semibold hover:underline">degree plan</a> first,
          or search a course below.
        </p>
      `;
      return;
    }

    courseList.innerHTML = plannedCourses
      .map((courseCode) => {
        const warning = planSnapshot
          ? scheduleWarningForCourse(
              planSnapshot,
              planSnapshot.placements.find((placement) => placement.course_code === courseCode)?.course_id ?? "",
            )
          : undefined;
        return `
          <button
            type="button"
            class="schedule-course-chip${courseCode === activeCourse ? " is-active" : ""}"
            data-course-chip="${courseCode}"
          >
            ${courseCode}
            ${warning ? `<span class="schedule-course-chip__warn" title="${warning.message}">S</span>` : ""}
          </button>
        `;
      })
      .join("");
  }

  function renderTermOptions(): void {
    if (!termSelect) return;
    const terms = availableTerms.filter(Boolean);
    if (terms.length === 0) {
      termSelect.innerHTML = `<option value="">No scraped terms yet</option>`;
      termSelect.disabled = true;
      termSelect.value = "";
      return;
    }
    termSelect.disabled = false;
    const selected = resolveSelectedTerm(termSelect, terms, options.focusTerm);
    termSelect.innerHTML = terms
      .map((term) => `<option value="${term}"${term === selected ? " selected" : ""}>${term}</option>`)
      .join("");
    termSelect.value = selected;
  }

  function renderSectionBrowser(): void {
    if (!sectionBrowser || !sectionHeading) return;

    if (!activeCourse) {
      sectionHeading.textContent = "Sections";
      sectionBrowser.innerHTML = `<p class="schedule-status">Select a course to browse scraped York section times.</p>`;
      return;
    }

    const term = resolveSelectedTerm(termSelect, availableTerms, options.focusTerm);
    const group = sectionGroups.find(
      (item) =>
        normalizeCourseCode(item.course_code) === normalizeCourseCode(activeCourse) &&
        item.term === term,
    );

    sectionHeading.textContent = `${activeCourse} · ${term || "No term"}`;

    if (!group || group.sections.length === 0) {
      sectionBrowser.innerHTML = `
        <p class="schedule-status">
          No scraped sections for ${activeCourse}${term ? ` in ${term}` : ""}.
          <a href="/courses/${encodeURIComponent(activeCourse)}" class="text-brand font-semibold hover:underline">View course</a>
        </p>
      `;
      return;
    }

    const selectedKeys = selectedSectionKeys();
    sectionBrowser.innerHTML = `
      <ul class="section-list">
        ${group.sections.map((section) => renderSectionBlock(activeCourse, section, selectedKeys)).join("")}
      </ul>
    `;
  }

  function renderGridStructure(): void {
    const days = daysForEntries(entries.map((entry) => entry.day));
    root?.style.setProperty("--schedule-day-count", String(days.length));

    if (gridHeader) {
      gridHeader.innerHTML = `
        <div class="schedule-grid__corner"></div>
        ${days.map((day) => `<div class="schedule-grid__day">${day}</div>`).join("")}
      `;
    }

    if (gridBody) {
      gridBody.innerHTML = gridHours()
        .map(
          (hour) => `
            <div class="schedule-grid__row">
              <div class="schedule-grid__hour">${hour}</div>
              ${days.map(() => `<div class="schedule-grid__cell"></div>`).join("")}
            </div>
          `,
        )
        .join("");
    }

    renderGridEvents(days);
  }

  function renderGridEvents(days = daysForEntries(entries.map((entry) => entry.day))): void {
    if (!eventsContainer || !grid) return;
    eventsContainer.innerHTML = "";

    const dayCount = days.length || defaultGridDays().length;
    const columnWidth = `calc((100% - ${TIME_COLUMN_WIDTH}px) / ${dayCount})`;

    for (const entry of entries) {
      const layout = computeEventLayout(entry.day, entry.start_time, entry.end_time, days);
      if (!layout) continue;

      const conflict = entries.some(
        (other) => other.id !== entry.id && meetingsOverlap(entry, other),
      );

      const card = document.createElement("article");
      card.className = `schedule-event${conflict ? " schedule-event--conflict" : ""}`;
      card.style.left = `calc(${TIME_COLUMN_WIDTH}px + ${layout.dayIndex} * ((100% - ${TIME_COLUMN_WIDTH}px) / ${dayCount}))`;
      card.style.top = `${layout.top}px`;
      card.style.width = columnWidth;
      card.style.height = `${layout.height}px`;
      card.dataset.entryId = entry.id;

      const place = [entry.campus, entry.room].filter(Boolean).join(" · ");
      card.innerHTML = `
        <p class="schedule-event__code">${entry.course_code}</p>
        <p class="schedule-event__section">${entry.section_code}</p>
        <p class="schedule-event__time">${formatClock(entry.start_time)} – ${formatClock(entry.end_time)}</p>
        ${place ? `<p class="schedule-event__place">${place}</p>` : ""}
        <button type="button" class="schedule-event__remove" aria-label="Remove ${entry.course_code} ${entry.section_code}">×</button>
      `;

      eventsContainer.appendChild(card);
    }
  }

  function addSection(courseCode: string, section: CourseSection): void {
    const newEntries: ScheduleGridEntry[] = section.meetings.map((meeting) => ({
      id: crypto.randomUUID(),
      course_code: courseCode,
      section_code: section.section_code,
      day: toScheduleDay(meeting.day),
      start_time: meeting.start_time.slice(0, 5),
      end_time: meeting.end_time.slice(0, 5),
      room: meeting.room,
      campus: meeting.campus,
    }));

    const validEntries = newEntries.filter((entry) => {
      const start = Number(entry.start_time.split(":")[0]);
      const end = Number(entry.end_time.split(":")[0]);
      return start >= SCHEDULE_START_HOUR && end <= SCHEDULE_END_HOUR;
    });

    if (validEntries.length === 0) {
      setStatus("This section falls outside the 8:00 AM – 7:00 PM grid.", "error");
      return;
    }

    entries = entries.filter(
      (entry) => sectionSelectionKey(entry.course_code, entry.section_code) !== sectionSelectionKey(courseCode, section.section_code),
    );

    const existingKeys = new Set(entries.map(entryKey));
    for (const entry of validEntries) {
      if (!existingKeys.has(entryKey(entry))) {
        entries.push(entry);
      }
    }

    writeStoredEntries(entries);
    renderSectionBrowser();
    renderGridStructure();
    setStatus(`Added ${courseCode} ${section.section_code} to your week.`, "success");
  }

  function removeSection(courseCode: string, sectionCode: string): void {
    entries = entries.filter(
      (entry) => sectionSelectionKey(entry.course_code, entry.section_code) !== sectionSelectionKey(courseCode, sectionCode),
    );
    writeStoredEntries(entries);
    renderSectionBrowser();
    renderGridStructure();
    setStatus(`Removed ${courseCode} ${sectionCode}.`, "success");
  }

  function removeEntry(entryId: string): void {
    entries = entries.filter((entry) => entry.id !== entryId);
    writeStoredEntries(entries);
    renderSectionBrowser();
    renderGridStructure();
    setStatus("Meeting removed from your week.", "success");
  }

  async function loadSectionsForCourse(courseCode: string): Promise<void> {
    if (!courseCode) return;
    setStatus(`Loading sections for ${courseCode}…`);
    try {
      const response = await fetchCourseSections({ courseCode });
      const courseGroups = response.groups.filter(
        (group) => normalizeCourseCode(group.course_code) === normalizeCourseCode(courseCode),
      );
      sectionGroups = [
        ...sectionGroups.filter(
          (group) => normalizeCourseCode(group.course_code) !== normalizeCourseCode(courseCode),
        ),
        ...courseGroups,
      ];
      const terms = uniqueTerms(courseGroups);
      if (terms.length > 0) {
        availableTerms = mergeTerms(availableTerms, terms);
        renderTermOptions();
      }
      renderSectionBrowser();
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load sections.", "error");
    }
  }

  renderCourseChips();
  renderTermOptions();
  renderGridStructure();

  if (activeCourse) {
    void loadSectionsForCourse(activeCourse);
  } else {
    renderSectionBrowser();
    setStatus("Pick a planned course or search below to load scraped section times.");
  }

  courseList?.addEventListener("click", (event) => {
    const chip = (event.target as Element | null)?.closest<HTMLElement>("[data-course-chip]");
    if (!chip?.dataset.courseChip) return;
    activeCourse = chip.dataset.courseChip;
    renderCourseChips();
    void loadSectionsForCourse(activeCourse);
  });

  termSelect?.addEventListener("change", () => {
    renderSectionBrowser();
  });

  root.querySelector<HTMLFormElement>("[data-schedule-search]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.querySelector<HTMLInputElement>("[name='courseCode']");
    const courseCode = input?.value.trim().toUpperCase() ?? "";
    if (!courseCode) return;
    activeCourse = courseCode;
    if (!plannedCourses.includes(courseCode)) {
      plannedCourses.push(courseCode);
    }
    renderCourseChips();
    void loadSectionsForCourse(courseCode);
    form.reset();
  });

  sectionBrowser?.addEventListener("click", (event) => {
    const addButton = (event.target as Element | null)?.closest<HTMLElement>("[data-add-section]");
    const removeButton = (event.target as Element | null)?.closest<HTMLElement>("[data-remove-section]");
    const card = (event.target as Element | null)?.closest<HTMLElement>("[data-section-card]");
    if (!card?.dataset.courseCode || !card.dataset.sectionCode) return;

    const group = sectionGroups.find(
      (item) =>
        normalizeCourseCode(item.course_code) === normalizeCourseCode(card.dataset.courseCode ?? "") &&
        item.term === resolveSelectedTerm(termSelect, availableTerms, options.focusTerm),
    );
    const section = group?.sections.find((item) => item.section_code === card.dataset.sectionCode);
    if (!section) return;

    if (removeButton) {
      removeSection(card.dataset.courseCode, card.dataset.sectionCode);
      return;
    }

    if (addButton) {
      addSection(card.dataset.courseCode, section);
    }
  });

  eventsContainer?.addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>(".schedule-event__remove");
    const card = button?.closest<HTMLElement>("[data-entry-id]");
    if (!button || !card?.dataset.entryId) return;
    removeEntry(card.dataset.entryId);
  });
}

export function bootSchedulePage(): void {
  const root = document.querySelector<HTMLElement>("[data-schedule-root]");
  if (!root) return;
  initSchedulePage({
    focusCourse: root.dataset.focusCourse || undefined,
    focusTerm: root.dataset.focusTerm || undefined,
  });
}

document.addEventListener("astro:page-load", bootSchedulePage);
bootSchedulePage();
