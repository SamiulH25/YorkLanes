import { fetchCdmTerms, fetchCourseSections } from "../lib/course-sections";
import { formatClock, toScheduleDay } from "../lib/schedule-days";
import {
  computeEventLayout,
  entryKey,
  gridHours,
  listLocalSavedSchedules,
  meetingsOverlap,
  readScheduleWeekState,
  SCHEDULE_END_HOUR,
  SCHEDULE_START_HOUR,
  sectionSelectionKey,
  TIME_COLUMN_WIDTH,
  weeklyGridDays,
  writeScheduleWeekState,
  type ScheduleGridEntry,
  type ScheduleWeekState,
} from "../lib/schedule-grid";
import {
  deleteSavedSchedule,
  fetchSavedSchedules,
  fetchScheduleWeek,
  saveScheduleWeek,
  seasonLabel,
  setActiveSchedule,
  type SavedScheduleSummary,
} from "../lib/schedules";
import {
  listPlanChecklistYears,
  listPlannedCourseCodesForYear,
  readActivePlanGraphSnapshot,
  scheduleWarningForCourse,
  type PlanSeasonFilter,
} from "../lib/plan-store";
import {
  componentLabel,
  filterSectionsForLecture,
  groupSectionsByComponent,
  parseSectionComponent,
  sectionBundleKey,
  summarizeWeeklyPattern,
  type SectionComponentType,
} from "../lib/schedule-sections";
import type { CourseSection, SectionGroup } from "../types/course-sections";

interface SchedulePageOptions {
  focusCourse?: string;
  focusTerm?: string;
  collapsePanel?: boolean;
}

type ScheduleMode = "home" | "create" | "editor";

interface MergedSavedSchedule {
  planYear: number;
  planSeason: string;
  cdmTerm: string;
  courseCount: number;
  entryCount: number;
  isActive: boolean;
  source: "cloud" | "local";
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

function entriesFromSections(
  courseCode: string,
  sections: CourseSection[],
  bundleId: string,
  context: Pick<ScheduleWeekState, "planYear" | "planSeason" | "cdmTerm">,
): ScheduleGridEntry[] {
  const entries: ScheduleGridEntry[] = [];
  for (const section of sections) {
    const component = parseSectionComponent(section.section_code);
    for (const meeting of section.meetings) {
      entries.push({
        id: crypto.randomUUID(),
        course_code: courseCode,
        section_code: section.section_code,
        component_type: component.type,
        day: toScheduleDay(meeting.day),
        start_time: meeting.start_time.slice(0, 5),
        end_time: meeting.end_time.slice(0, 5),
        room: meeting.room,
        campus: meeting.campus,
        bundle_id: bundleId,
        plan_year: context.planYear,
        plan_season: context.planSeason,
        cdm_term: context.cdmTerm,
      });
    }
  }
  return entries;
}

function filterValidEntries(entries: ScheduleGridEntry[]): ScheduleGridEntry[] {
  return entries.filter((entry) => {
    const start = Number(entry.start_time.split(":")[0]);
    const end = Number(entry.end_time.split(":")[0]);
    return start >= SCHEDULE_START_HOUR && end <= SCHEDULE_END_HOUR;
  });
}

export function initSchedulePage(options: SchedulePageOptions = {}): void {
  const root = document.querySelector<HTMLElement>("[data-schedule-root]");
  if (!root) return;

  const yearSelect = root.querySelector<HTMLSelectElement>("[data-schedule-year]");
  const seasonSelect = root.querySelector<HTMLSelectElement>("[data-schedule-season]");
  const termSelect = root.querySelector<HTMLSelectElement>("[data-schedule-term]");
  const courseList = root.querySelector<HTMLElement>("[data-schedule-courses]");
  const sectionBrowser = root.querySelector<HTMLElement>("[data-schedule-sections]");
  const sectionHeading = root.querySelector<HTMLElement>("[data-schedule-section-heading]");
  const status = root.querySelector<HTMLElement>("[data-schedule-status]");
  const eventsContainer = root.querySelector<HTMLElement>("[data-schedule-events]");
  const gridHeader = root.querySelector<HTMLElement>("[data-schedule-grid-header]");
  const gridBody = root.querySelector<HTMLElement>("[data-schedule-grid-body]");
  const savedList = root.querySelector<HTMLElement>("[data-schedule-saved]");
  const setActiveButton = root.querySelector<HTMLButtonElement>("[data-schedule-set-active]");
  const timetableSubtitle = root.querySelector<HTMLElement>("[data-schedule-timetable-subtitle]");
  const confirmButton = root.querySelector<HTMLButtonElement>("[data-schedule-confirm]");
  const setupHint = root.querySelector<HTMLElement>("[data-schedule-setup-hint]");
  const homePanel = root.querySelector<HTMLElement>("[data-schedule-home]");
  const createPanel = root.querySelector<HTMLElement>("[data-schedule-create]");
  const editorPanel = root.querySelector<HTMLElement>("[data-schedule-editor]");
  const contextLabel = root.querySelector<HTMLElement>("[data-schedule-context-label]");
  const pageTitle = document.querySelector<HTMLElement>("[data-schedule-page-title]");
  const pageSubtitle = document.querySelector<HTMLElement>("[data-schedule-page-subtitle]");
  const workspaceLayout = root.querySelector<HTMLElement>("[data-schedule-workspace-layout]");
  const sidePanel = root.querySelector<HTMLElement>("[data-schedule-side-panel]");
  const panelToggle = root.querySelector<HTMLButtonElement>("[data-schedule-panel-toggle]");

  const planSnapshot = readActivePlanGraphSnapshot();
  const planYears = planSnapshot ? listPlanChecklistYears(planSnapshot) : [];
  const defaultYear = planYears[0] ?? 1;

  let planYear = Number(yearSelect?.value || defaultYear);
  let planSeason = (seasonSelect?.value || "all") as PlanSeasonFilter;
  let activeCourse = options.focusCourse?.trim().toUpperCase() || "";
  let entries: ScheduleGridEntry[] = [];
  let sectionGroups: SectionGroup[] = [];
  let availableTerms: string[] = options.focusTerm ? [options.focusTerm] : [];
  let savedSchedules: MergedSavedSchedule[] = [];
  let currentIsActive = false;
  let cloudSyncEnabled = false;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  let mode: ScheduleMode = "home";
  let panelCollapsed = options.collapsePanel ?? false;
  let didAutoOpenInitialSchedule = false;
  const componentPicks = new Map<string, Map<SectionComponentType, string>>();

  function selectedCdmTerm(): string {
    return resolveSelectedTerm(termSelect, availableTerms, options.focusTerm);
  }

  function hasScheduleContext(): boolean {
    return Boolean(selectedCdmTerm());
  }

  function updateConfirmButton(): void {
    const cdmTerm = selectedCdmTerm();
    if (confirmButton) confirmButton.disabled = !cdmTerm;
    if (setupHint) {
      setupHint.textContent = cdmTerm
        ? "Ready — courses will load from your degree plan."
        : planSnapshot
          ? "Pick a CDM term for this schedule."
          : "Open your degree plan first, then pick a CDM term.";
    }
  }

  function updateContextLabel(): void {
    if (!contextLabel) return;
    const cdmTerm = selectedCdmTerm();
    contextLabel.textContent = `Year ${planYear} · ${seasonLabel(planSeason)}${cdmTerm ? ` · ${cdmTerm}` : ""}`;
  }

  function setMode(nextMode: ScheduleMode): void {
    mode = nextMode;
    root!.dataset.scheduleMode = nextMode;
    homePanel?.toggleAttribute("hidden", nextMode !== "home");
    createPanel?.toggleAttribute("hidden", nextMode !== "create");
    editorPanel?.toggleAttribute("hidden", nextMode !== "editor");

    if (pageTitle) {
      pageTitle.textContent =
        nextMode === "home"
          ? "Weekly timetable"
          : nextMode === "create"
            ? "New schedule"
            : "Edit schedule";
    }
    if (pageSubtitle) {
      pageSubtitle.textContent =
        nextMode === "home"
          ? "Open a saved timetable or create one for a plan year and semester."
          : nextMode === "create"
            ? "Choose the plan year, semester, and CDM term for this timetable."
            : "Pick sections for each course, then view your weekly timetable.";
    }

    if (nextMode === "editor") {
      updateContextLabel();
      updateTimetableSubtitle();
      updateSetActiveButton();
    }
    if (nextMode === "create") {
      updateConfirmButton();
    }
  }

  function openHome(): void {
    setStatus("");
    setMode("home");
    void refreshSavedSchedules();
  }

  async function openCreate(): Promise<void> {
    setStatus("");
    setMode("create");
    await loadAvailableTerms();
    updateConfirmButton();
  }

  async function openSchedule(
    nextPlanYear: number,
    nextPlanSeason: PlanSeasonFilter,
    nextCdmTerm: string,
    collapsePanel = false,
  ): Promise<void> {
    planYear = nextPlanYear;
    planSeason = nextPlanSeason;
    if (yearSelect) yearSelect.value = String(planYear);
    if (seasonSelect) seasonSelect.value = planSeason;
    availableTerms = mergeTerms(availableTerms, [nextCdmTerm]);
    renderTermOptions();
    if (termSelect) termSelect.value = nextCdmTerm;

    setMode("editor");
    panelCollapsed = collapsePanel;
    updatePanelState();
    await loadWeekFromCloud();
    renderGridStructure();
    updateContextLabel();
    updateTimetableSubtitle();
    updateSetActiveButton();

    const courses = plannedCourses();
    if (!planSnapshot) {
      renderCourseChips();
      renderSectionBrowser();
      setStatus("Open your degree plan to load courses for this schedule.", "error");
      return;
    }
    if (courses.length === 0) {
      renderCourseChips();
      renderSectionBrowser();
      setStatus(`No courses found for Year ${planYear}${planSeason !== "all" ? ` (${planSeason})` : ""}.`, "error");
      return;
    }

    activeCourse = options.focusCourse?.trim().toUpperCase() || courses[0];
    await refreshVisibleCourses();
  }

  function updatePanelState(): void {
    workspaceLayout?.setAttribute("data-panel-collapsed", String(panelCollapsed));
    sidePanel?.setAttribute("aria-hidden", String(panelCollapsed));
    if (panelToggle) {
      panelToggle.setAttribute("aria-expanded", String(!panelCollapsed));
      panelToggle.textContent = panelCollapsed ? "Show section choices" : "Hide section choices";
    }
  }

  function togglePanel(): void {
    panelCollapsed = !panelCollapsed;
    updatePanelState();
  }

  async function loadAvailableTerms(): Promise<void> {
    const courses = plannedCourses();
    const probeCourse = courses[0] ?? options.focusCourse;
    try {
      const terms = probeCourse ? await fetchCdmTerms(probeCourse) : await fetchCdmTerms();
      availableTerms = terms.length > 0 ? terms : availableTerms;
      if (options.focusTerm) {
        availableTerms = mergeTerms(availableTerms, [options.focusTerm]);
      }
    } catch {
      if (options.focusTerm) {
        availableTerms = [options.focusTerm];
      }
    }
    renderTermOptions();
    updateConfirmButton();
  }

  async function confirmSchedule(): Promise<void> {
    if (!hasScheduleContext()) {
      setStatus("Choose a CDM term before continuing.", "error");
      return;
    }
    const cdmTerm = selectedCdmTerm();
    await openSchedule(planYear, planSeason, cdmTerm, false);
    setStatus(`Loaded courses for Year ${planYear}.`, "success");
  }

  function currentContext(): ScheduleWeekState {
    return {
      planYear,
      planSeason,
      cdmTerm: resolveSelectedTerm(termSelect, availableTerms, options.focusTerm),
      entries,
    };
  }

  function loadWeekForCurrentFilters(): void {
    const cdmTerm = resolveSelectedTerm(termSelect, availableTerms, options.focusTerm);
    const stored = readScheduleWeekState(planYear, planSeason, cdmTerm);
    entries = stored.entries;
    currentIsActive = false;
  }

  function restorePicksFromBundles(
    bundles: Array<{ courseCode?: string; course_code?: string; picks: Record<string, string> }>,
  ): void {
    componentPicks.clear();
    for (const bundle of bundles) {
      const courseCode = normalizeCourseCode(bundle.courseCode ?? bundle.course_code ?? "");
      if (!courseCode) continue;
      const picks = new Map(
        Object.entries(bundle.picks ?? {}) as Array<[SectionComponentType, string]>,
      );
      componentPicks.set(courseCode, picks);
    }
  }

  function bundlesPayload(): Array<{ course_code: string; bundle_id: string; picks: Record<string, string> }> {
    const byCourse = new Map<string, { bundle_id: string; picks: Record<string, string> }>();

    for (const entry of entries) {
      const code = normalizeCourseCode(entry.course_code);
      if (!byCourse.has(code)) {
        byCourse.set(code, {
          bundle_id: entry.bundle_id ?? crypto.randomUUID(),
          picks: {},
        });
      }
    }

    for (const [code, picks] of componentPicks) {
      const pickRecord = Object.fromEntries(picks);
      const existing = byCourse.get(code);
      if (existing) {
        existing.picks = pickRecord;
      } else {
        byCourse.set(code, { bundle_id: crypto.randomUUID(), picks: pickRecord });
      }
    }

    return [...byCourse.entries()].map(([course_code, value]) => ({
      course_code,
      bundle_id: value.bundle_id,
      picks: value.picks,
    }));
  }

  function persistWeek(): void {
    const state = currentContext();
    writeScheduleWeekState(state);
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      void saveWeekToCloud(state);
    }, 400);
  }

  async function saveWeekToCloud(state: ScheduleWeekState): Promise<void> {
    try {
      const saved = await saveScheduleWeek({
        planYear: state.planYear,
        planSeason: state.planSeason,
        cdmTerm: state.cdmTerm,
        entries: state.entries,
        bundles: bundlesPayload(),
      });
      if (!saved) return;
      cloudSyncEnabled = true;
      currentIsActive = saved.isActive;
      if (!saved.isActive && saved.entries.length > 0) {
        const all = await fetchSavedSchedules();
        if (!all.some((item) => item.isActive)) {
          const activated = await setActiveSchedule(state.planYear, state.planSeason, state.cdmTerm);
          if (activated) currentIsActive = true;
        }
      }
      await refreshSavedSchedules();
      updateSetActiveButton();
    } catch {
      // Keep local draft when cloud save fails.
    }
  }

  async function loadWeekFromCloud(): Promise<void> {
    const cdmTerm = resolveSelectedTerm(termSelect, availableTerms, options.focusTerm);
    if (!cdmTerm) {
      loadWeekForCurrentFilters();
      return;
    }

    try {
      const remote = await fetchScheduleWeek(planYear, planSeason, cdmTerm);
      if (remote) {
        cloudSyncEnabled = true;
        entries = remote.entries.map((entry) => ({
          ...entry,
          plan_year: planYear,
          plan_season: planSeason,
          cdm_term: cdmTerm,
        }));
        restorePicksFromBundles(remote.bundles);
        currentIsActive = remote.isActive;
        writeScheduleWeekState(currentContext());
      } else {
        loadWeekForCurrentFilters();
      }
    } catch {
      loadWeekForCurrentFilters();
    }
  }

  function mergeSavedSchedules(
    cloud: SavedScheduleSummary[],
    local: ReturnType<typeof listLocalSavedSchedules>,
  ): MergedSavedSchedule[] {
    const map = new Map<string, MergedSavedSchedule>();
    for (const item of local) {
      const key = `${item.planYear}|${item.planSeason}|${item.cdmTerm}`;
      map.set(key, {
        planYear: item.planYear,
        planSeason: item.planSeason,
        cdmTerm: item.cdmTerm,
        courseCount: item.courseCount,
        entryCount: item.entries.length,
        isActive: false,
        source: "local",
      });
    }
    for (const item of cloud) {
      const key = `${item.planYear}|${item.planSeason}|${item.cdmTerm}`;
      map.set(key, {
        planYear: item.planYear,
        planSeason: item.planSeason,
        cdmTerm: item.cdmTerm,
        courseCount: item.courseCount,
        entryCount: item.entryCount,
        isActive: item.isActive,
        source: "cloud",
      });
    }
    return [...map.values()].sort((a, b) => b.cdmTerm.localeCompare(a.cdmTerm) || a.planYear - b.planYear);
  }

  async function refreshSavedSchedules(): Promise<void> {
    let cloud: SavedScheduleSummary[] = [];
    try {
      cloud = await fetchSavedSchedules();
      if (cloud.length > 0) cloudSyncEnabled = true;
    } catch {
      cloud = [];
    }
    savedSchedules = mergeSavedSchedules(cloud, listLocalSavedSchedules());
    renderSavedSchedules();

    if (mode === "home" && options.collapsePanel && !didAutoOpenInitialSchedule) {
      didAutoOpenInitialSchedule = true;
      const active = savedSchedules.find((item) => item.isActive) ?? savedSchedules[0];
      if (active) {
        await openSchedule(active.planYear, active.planSeason as PlanSeasonFilter, active.cdmTerm, true);
      }
    }
  }

  function isCurrentScheduleKey(planYearValue: number, planSeasonValue: string, cdmTermValue: string): boolean {
    const cdmTerm = resolveSelectedTerm(termSelect, availableTerms, options.focusTerm);
    return planYearValue === planYear && planSeasonValue === planSeason && cdmTermValue === cdmTerm;
  }

  function updateSetActiveButton(): void {
    if (!setActiveButton) return;
    const cdmTerm = resolveSelectedTerm(termSelect, availableTerms, options.focusTerm);
    const hasEntries = entries.length > 0;
    setActiveButton.hidden = !cloudSyncEnabled || !hasEntries || !cdmTerm;
    setActiveButton.disabled = currentIsActive;
    setActiveButton.textContent = currentIsActive ? "Primary schedule" : "Set as primary";
  }

  function renderSavedSchedules(): void {
    if (!savedList) return;
    if (savedSchedules.length === 0) {
      savedList.innerHTML = `
        <div class="schedule-home-empty">
          <p class="schedule-status">No saved timetables yet.</p>
          <button type="button" class="btn-york mt-4 px-4 py-2 text-sm" data-schedule-new>
            Create your first schedule
          </button>
        </div>
      `;
      updateSetActiveButton();
      return;
    }

    savedList.innerHTML = savedSchedules
      .map((item) => {
        const active = isCurrentScheduleKey(item.planYear, item.planSeason, item.cdmTerm);
        return `
          <article class="schedule-saved-card${active ? " is-active" : ""}${item.isActive ? " is-dashboard" : ""}">
            <button type="button" class="schedule-saved-card__open" data-load-schedule
              data-plan-year="${item.planYear}"
              data-plan-season="${item.planSeason}"
              data-cdm-term="${item.cdmTerm}"
              data-entry-count="${item.entryCount}">
              <p class="schedule-saved-card__title">Year ${item.planYear} · ${seasonLabel(item.planSeason)}</p>
              <p class="schedule-saved-card__term">${item.cdmTerm}</p>
              <p class="schedule-saved-card__meta">${item.courseCount} course${item.courseCount === 1 ? "" : "s"} · ${item.entryCount} block${item.entryCount === 1 ? "" : "s"}</p>
              <p class="schedule-saved-card__cta">Open schedule →</p>
            </button>
            <div class="schedule-saved-card__actions">
              ${
                item.isActive
                  ? `<span class="schedule-saved-card__badge">Primary</span>`
                  : cloudSyncEnabled
                    ? `<button type="button" class="schedule-saved-card__action" data-activate-schedule
                        data-plan-year="${item.planYear}"
                        data-plan-season="${item.planSeason}"
                        data-cdm-term="${item.cdmTerm}">Set primary</button>`
                    : ""
              }
              <button type="button" class="schedule-saved-card__action schedule-saved-card__action--danger"
                data-delete-schedule
                data-plan-year="${item.planYear}"
                data-plan-season="${item.planSeason}"
                data-cdm-term="${item.cdmTerm}">Delete</button>
            </div>
          </article>
        `;
      })
      .join("");
    updateSetActiveButton();
  }

  function updateTimetableSubtitle(): void {
    if (!timetableSubtitle) return;
    const cdmTerm = selectedCdmTerm();
    timetableSubtitle.textContent = `Year ${planYear} · ${seasonLabel(planSeason)} · ${cdmTerm || "No term selected"}`;
  }

  function plannedCourses(): string[] {
    if (!planSnapshot) return [];
    return listPlannedCourseCodesForYear(planSnapshot, planYear, planSeason);
  }

  function setStatus(message: string, type: "info" | "success" | "error" = "info"): void {
    if (!status) return;
    status.hidden = !message;
    status.textContent = message;
    status.classList.remove("schedule-status--error", "schedule-status--success");
    if (type === "error") status.classList.add("schedule-status--error");
    if (type === "success") status.classList.add("schedule-status--success");
  }

  function selectedBundleSections(courseCode: string): CourseSection[] {
    const term = resolveSelectedTerm(termSelect, availableTerms, options.focusTerm);
    const group = sectionGroups.find(
      (item) =>
        normalizeCourseCode(item.course_code) === normalizeCourseCode(courseCode) && item.term === term,
    );
    if (!group) return [];

    const picks = componentPicks.get(normalizeCourseCode(courseCode));
    if (!picks || picks.size === 0) return [];

    return [...picks.values()]
      .map((sectionCode) => group.sections.find((section) => section.section_code === sectionCode))
      .filter((section): section is CourseSection => Boolean(section));
  }

  function onScheduleSections(courseCode: string): Set<string> {
    const keys = new Set<string>();
    for (const entry of entries) {
      if (normalizeCourseCode(entry.course_code) === normalizeCourseCode(courseCode)) {
        keys.add(sectionSelectionKey(entry.course_code, entry.section_code));
      }
    }
    return keys;
  }

  function lectureGroupForPick(courseCode: string, lecturePick: string): string | null {
    const term = resolveSelectedTerm(termSelect, availableTerms, options.focusTerm);
    const group = sectionGroups.find(
      (item) =>
        normalizeCourseCode(item.course_code) === normalizeCourseCode(courseCode) && item.term === term,
    );
    const section = group?.sections.find((item) => item.section_code === lecturePick);
    return section?.section_group ?? sectionBundleKey(lecturePick) ?? null;
  }

  function renderYearOptions(): void {
    if (!yearSelect) return;
    if (planYears.length === 0) {
      yearSelect.innerHTML = `<option value="1">Year 1</option>`;
      yearSelect.disabled = true;
      return;
    }
    yearSelect.disabled = false;
    yearSelect.innerHTML = planYears
      .map((year) => `<option value="${year}"${year === planYear ? " selected" : ""}>Year ${year}</option>`)
      .join("");
    yearSelect.value = String(planYear);
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

  function renderCourseChips(): void {
    if (!courseList) return;
    if (mode !== "editor") {
      courseList.innerHTML = "";
      return;
    }
    const courses = plannedCourses();
    if (!planSnapshot) {
      courseList.innerHTML = `
        <p class="schedule-status">
          Open your <a href="/plan" class="text-brand font-semibold hover:underline">degree plan</a> first
          to load Year ${planYear} courses.
        </p>
      `;
      return;
    }

    if (courses.length === 0) {
      courseList.innerHTML = `<p class="schedule-status">No courses found for Year ${planYear}${planSeason !== "all" ? ` (${planSeason})` : ""}.</p>`;
      return;
    }

    if (!activeCourse || !courses.includes(activeCourse)) {
      activeCourse = courses[0];
    }

    courseList.innerHTML = courses
      .map((courseCode) => {
        const placement = planSnapshot.placements.find((item) => item.course_code === courseCode);
        const warning = placement
          ? scheduleWarningForCourse(planSnapshot, placement.course_id)
          : undefined;
        const onSchedule = onScheduleSections(courseCode).size > 0;
        return `
          <button
            type="button"
            class="schedule-course-chip${courseCode === activeCourse ? " is-active" : ""}${onSchedule ? " is-on-schedule" : ""}"
            data-course-chip="${courseCode}"
          >
            ${courseCode}
            ${warning ? `<span class="schedule-course-chip__warn" title="${warning.message}">S</span>` : ""}
          </button>
        `;
      })
      .join("");
  }

  function syncDependentPicks(
    courseCode: string,
    groups: ReturnType<typeof groupSectionsByComponent>,
  ): void {
    const normalized = normalizeCourseCode(courseCode);
    const picks = componentPicks.get(normalized);
    if (!picks) return;

    const lecturePick = picks.get("lec");
    if (!lecturePick) return;
    const lectureGroup = lectureGroupForPick(courseCode, lecturePick);

    for (const group of groups) {
      if (group.type === "lec") continue;
      const visible = filterSectionsForLecture(lecturePick, group.sections, lectureGroup);
      const current = picks.get(group.type);
      if (current && !visible.some((section) => section.section_code === current)) {
        picks.delete(group.type);
      }
      if (!picks.has(group.type) && visible.length === 1) {
        picks.set(group.type, visible[0].section_code);
      }
    }
  }

  function renderComponentPickers(courseCode: string, groups: ReturnType<typeof groupSectionsByComponent>): string {
    const normalized = normalizeCourseCode(courseCode);
    let picks = componentPicks.get(normalized);
    if (!picks) {
      picks = new Map();
      componentPicks.set(normalized, picks);
    }

    const lectureGroup = groups.find((group) => group.type === "lec");
    const lecturePick = picks.get("lec") ?? lectureGroup?.sections[0]?.section_code ?? "";
    const tieGroup = lecturePick ? lectureGroupForPick(courseCode, lecturePick) : null;

    return groups
      .map((group) => {
        const sections =
          group.type === "lec"
            ? group.sections
            : filterSectionsForLecture(lecturePick, group.sections, tieGroup);
        const selected = picks?.get(group.type) ?? (group.type !== "lec" && sections.length === 1 ? sections[0].section_code : "");

        if (!picks?.has(group.type) && selected) {
          picks?.set(group.type, selected);
        }

        const hint =
          group.type === "lec"
            ? `Pick one ${group.label.toLowerCase()} for your weekly timetable`
            : lecturePick
              ? `Showing ${group.label.toLowerCase()} sections for ${lecturePick}`
              : `Pick a lecture first`;

        return `
          <section class="schedule-component-group">
            <div class="schedule-component-group__head">
              <h3 class="schedule-component-group__title">${group.label}</h3>
              <p class="schedule-component-group__hint">${hint}</p>
            </div>
            ${
              sections.length === 0
                ? `<p class="schedule-component-group__empty">No ${group.label.toLowerCase()} sections linked to ${lecturePick || "this lecture"}.</p>`
                : `<ul class="schedule-component-options">
              ${sections
                .map((section) => {
                  const instructor = meetingInstructors(section);
                  const pattern = summarizeWeeklyPattern(section);
                  const checked = selected === section.section_code ? "checked" : "";
                  return `
                    <li class="schedule-component-option">
                      <label class="schedule-component-option__label">
                        <input
                          type="radio"
                          name="component-${normalized}-${group.type}"
                          value="${section.section_code}"
                          data-component-pick
                          data-course-code="${courseCode}"
                          data-component-type="${group.type}"
                          ${checked}
                        />
                        <span class="schedule-component-option__body">
                          <span class="schedule-component-option__code">${section.section_code}</span>
                          <span class="schedule-component-option__pattern">${pattern}</span>
                          ${instructor ? `<span class="schedule-component-option__meta">${instructor}</span>` : ""}
                        </span>
                      </label>
                    </li>
                  `;
                })
                .join("")}
            </ul>`
            }
          </section>
        `;
      })
      .join("");
  }

  function renderSectionBrowser(): void {
    if (!sectionBrowser || !sectionHeading) return;

    if (mode !== "editor") {
      sectionHeading.textContent = "Section choices";
      sectionBrowser.innerHTML = "";
      return;
    }

    if (!activeCourse) {
      sectionHeading.textContent = "Section choices";
      sectionBrowser.innerHTML = `<p class="schedule-status">Select a Year ${planYear} course to build its weekly section set.</p>`;
      return;
    }

    const term = resolveSelectedTerm(termSelect, availableTerms, options.focusTerm);
    const group = sectionGroups.find(
      (item) =>
        normalizeCourseCode(item.course_code) === normalizeCourseCode(activeCourse) && item.term === term,
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

    const groups = groupSectionsByComponent(group.sections);
    ensureDefaultPicks(activeCourse, groups);
    syncDependentPicks(activeCourse, groups);
    const onSchedule = onScheduleSections(activeCourse);

    sectionBrowser.innerHTML = `
      <div class="schedule-course-builder">
        ${renderComponentPickers(activeCourse, groups)}
        <div class="schedule-section-actions">
          <button type="button" class="btn-york px-4 py-2 text-sm" data-add-bundle>Add to weekly timetable</button>
          ${
            onSchedule.size > 0
              ? `<button type="button" class="btn-ghost px-4 py-2 text-sm" data-remove-course-bundle>Remove ${activeCourse} from timetable</button>`
              : ""
          }
        </div>
      </div>
    `;
  }

  function renderGridStructure(): void {
    const days = weeklyGridDays();
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

  function renderGridEvents(days = weeklyGridDays()): void {
    if (!eventsContainer) return;
    eventsContainer.innerHTML = "";

    const dayCount = days.length;
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
        <p class="schedule-event__section">${componentLabel(entry.component_type)} · ${entry.section_code}</p>
        <p class="schedule-event__time">${formatClock(entry.start_time)} – ${formatClock(entry.end_time)}</p>
        ${place ? `<p class="schedule-event__place">${place}</p>` : ""}
      `;

      eventsContainer.appendChild(card);
    }
  }

  function ensureDefaultPicks(courseCode: string, groups: ReturnType<typeof groupSectionsByComponent>): void {
    const normalized = normalizeCourseCode(courseCode);
    let picks = componentPicks.get(normalized);
    if (!picks) {
      picks = new Map();
      componentPicks.set(normalized, picks);
    }

    for (const group of groups) {
      if (picks.has(group.type)) continue;
      if (group.type === "lec" && group.sections[0]) {
        picks.set("lec", group.sections[0].section_code);
        continue;
      }
      const lecturePick = picks.get("lec") ?? "";
      const tieGroup = lecturePick ? lectureGroupForPick(courseCode, lecturePick) : null;
      const visible = lecturePick ? filterSectionsForLecture(lecturePick, group.sections, tieGroup) : group.sections;
      if (visible.length === 1) {
        picks.set(group.type, visible[0].section_code);
      }
    }
  }

  function addCourseBundle(courseCode: string): void {
    const term = resolveSelectedTerm(termSelect, availableTerms, options.focusTerm);
    const group = sectionGroups.find(
      (item) =>
        normalizeCourseCode(item.course_code) === normalizeCourseCode(courseCode) && item.term === term,
    );
    if (!group) {
      setStatus(`No section data loaded for ${courseCode}.`, "error");
      return;
    }

    const groups = groupSectionsByComponent(group.sections);
    ensureDefaultPicks(courseCode, groups);
    syncDependentPicks(courseCode, groups);

    const lectureGroup = groups.find((item) => item.type === "lec");
    const picks = componentPicks.get(normalizeCourseCode(courseCode));
    if (lectureGroup && !picks?.get("lec")) {
      setStatus(`Choose a lecture section for ${courseCode} first.`, "error");
      return;
    }

    const lecturePick = picks?.get("lec") ?? "";
    const tieGroup = lecturePick ? lectureGroupForPick(courseCode, lecturePick) : null;
    for (const componentGroup of groups) {
      if (componentGroup.type === "lec") continue;
      const visible = filterSectionsForLecture(lecturePick, componentGroup.sections, tieGroup);
      if (visible.length > 0 && !picks?.get(componentGroup.type)) {
        setStatus(`Choose a ${componentGroup.label.toLowerCase()} for ${courseCode}.`, "error");
        return;
      }
    }

    const sections = selectedBundleSections(courseCode);
    if (sections.length === 0) {
      setStatus(`Choose at least one section component for ${courseCode}.`, "error");
      return;
    }

    const bundleId = crypto.randomUUID();
    const context = currentContext();
    const newEntries = filterValidEntries(entriesFromSections(courseCode, sections, bundleId, context));
    if (newEntries.length === 0) {
      setStatus("Selected sections fall outside the 8:00 AM – 7:00 PM weekly grid.", "error");
      return;
    }

    entries = entries.filter(
      (entry) => normalizeCourseCode(entry.course_code) !== normalizeCourseCode(courseCode),
    );

    const existingKeys = new Set(entries.map(entryKey));
    for (const entry of newEntries) {
      if (!existingKeys.has(entryKey(entry))) {
        entries.push(entry);
      }
    }

    persistWeek();
    renderCourseChips();
    renderSectionBrowser();
    renderGridStructure();
    updateSetActiveButton();
    setStatus(`Added ${courseCode} to your Year ${planYear} weekly timetable.`, "success");
  }

  function removeCourseBundle(courseCode: string): void {
    entries = entries.filter(
      (entry) => normalizeCourseCode(entry.course_code) !== normalizeCourseCode(courseCode),
    );
    persistWeek();
    renderCourseChips();
    renderSectionBrowser();
    renderGridStructure();
    updateSetActiveButton();
    setStatus(`Removed ${courseCode} from your weekly timetable.`, "success");
  }

  async function loadSectionsForCourse(courseCode: string): Promise<void> {
    if (!courseCode || mode !== "editor") return;
    setStatus(`Loading sections for ${courseCode}…`);
    try {
      const response = await fetchCourseSections({
        courseCode,
        term: resolveSelectedTerm(termSelect, availableTerms, options.focusTerm) || undefined,
      });
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

  async function refreshVisibleCourses(): Promise<void> {
    renderCourseChips();
    const courses = plannedCourses();
    if (courses.length === 0) {
      renderSectionBrowser();
      return;
    }
    for (const courseCode of courses) {
      await loadSectionsForCourse(courseCode);
    }
    if (activeCourse) {
      renderSectionBrowser();
    }
  }

  loadWeekForCurrentFilters();
  renderYearOptions();
  renderTermOptions();
  renderGridStructure();
  setMode("home");
  updatePanelState();
  void refreshSavedSchedules();

  const startNew = root.dataset.startNew === "true";
  if (startNew) {
    void openCreate();
  } else if (options.focusTerm && options.collapsePanel) {
    void openSchedule(planYear, planSeason, options.focusTerm, true);
  }

  yearSelect?.addEventListener("change", () => {
    planYear = Number(yearSelect.value || defaultYear);
    void loadAvailableTerms();
  });

  seasonSelect?.addEventListener("change", () => {
    planSeason = (seasonSelect.value || "all") as PlanSeasonFilter;
    void loadAvailableTerms();
  });

  termSelect?.addEventListener("change", () => {
    updateConfirmButton();
  });

  confirmButton?.addEventListener("click", () => {
    void confirmSchedule();
  });

  root.addEventListener("click", (event) => {
    const newButton = (event.target as Element | null)?.closest<HTMLElement>("[data-schedule-new]");
    if (newButton) {
      event.preventDefault();
      void openCreate();
    }
  });

  root.querySelectorAll<HTMLButtonElement>("[data-schedule-back-home]").forEach((button) => {
    button.addEventListener("click", () => {
      openHome();
    });
  });

  panelToggle?.addEventListener("click", () => {
    togglePanel();
  });

  courseList?.addEventListener("click", (event) => {
    const chip = (event.target as Element | null)?.closest<HTMLElement>("[data-course-chip]");
    if (!chip?.dataset.courseChip) return;
    activeCourse = chip.dataset.courseChip;
    renderCourseChips();
    renderSectionBrowser();
  });

  root.querySelector<HTMLFormElement>("[data-schedule-search]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const input = form.querySelector<HTMLInputElement>("[name='courseCode']");
    const courseCode = input?.value.trim().toUpperCase() ?? "";
    if (!courseCode) return;
    activeCourse = courseCode;
    void loadSectionsForCourse(courseCode).then(() => renderCourseChips());
    form.reset();
  });

  sectionBrowser?.addEventListener("change", (event) => {
    const input = (event.target as Element | null)?.closest<HTMLInputElement>("[data-component-pick]");
    if (!input?.dataset.courseCode || !input.dataset.componentType) return;
    const normalized = normalizeCourseCode(input.dataset.courseCode);
    let picks = componentPicks.get(normalized);
    if (!picks) {
      picks = new Map();
      componentPicks.set(normalized, picks);
    }
    picks.set(input.dataset.componentType as SectionComponentType, input.value);

    if (input.dataset.componentType === "lec" && activeCourse) {
      const term = resolveSelectedTerm(termSelect, availableTerms, options.focusTerm);
      const group = sectionGroups.find(
        (item) =>
          normalizeCourseCode(item.course_code) === normalizeCourseCode(activeCourse) && item.term === term,
      );
      if (group) {
        const groups = groupSectionsByComponent(group.sections);
        syncDependentPicks(activeCourse, groups);
      }
      renderSectionBrowser();
    }
  });

  sectionBrowser?.addEventListener("click", (event) => {
    const addBundle = (event.target as Element | null)?.closest<HTMLElement>("[data-add-bundle]");
    const removeBundle = (event.target as Element | null)?.closest<HTMLElement>("[data-remove-course-bundle]");
    if (addBundle && activeCourse) {
      addCourseBundle(activeCourse);
      return;
    }
    if (removeBundle && activeCourse) {
      removeCourseBundle(activeCourse);
    }
  });

  savedList?.addEventListener("click", (event) => {
    const loadButton = (event.target as Element | null)?.closest<HTMLElement>("[data-load-schedule]");
    const activateButton = (event.target as Element | null)?.closest<HTMLElement>("[data-activate-schedule]");
    const deleteButton = (event.target as Element | null)?.closest<HTMLElement>("[data-delete-schedule]");

    if (loadButton?.dataset.planYear && loadButton.dataset.cdmTerm) {
      const collapsePanel = Number(loadButton.dataset.entryCount || "0") === 0;
      void openSchedule(
        Number(loadButton.dataset.planYear),
        (loadButton.dataset.planSeason || "all") as PlanSeasonFilter,
        loadButton.dataset.cdmTerm,
        collapsePanel,
      );
      return;
    }

    if (activateButton?.dataset.planYear && activateButton.dataset.cdmTerm) {
      void setActiveSchedule(
        Number(activateButton.dataset.planYear),
        activateButton.dataset.planSeason || "all",
        activateButton.dataset.cdmTerm,
      ).then(async (ok) => {
        if (!ok) {
          setStatus("Could not set primary schedule. Save the timetable first or refresh the page.", "error");
          return;
        }
        currentIsActive = isCurrentScheduleKey(
          Number(activateButton.dataset.planYear),
          activateButton.dataset.planSeason || "all",
          activateButton.dataset.cdmTerm || "",
        );
        await refreshSavedSchedules();
        updateSetActiveButton();
        setStatus("This timetable is now shown on your dashboard.", "success");
      });
      return;
    }

    if (deleteButton?.dataset.planYear && deleteButton.dataset.cdmTerm) {
      const deleteYear = Number(deleteButton.dataset.planYear);
      const deleteSeason = deleteButton.dataset.planSeason || "all";
      const deleteTerm = deleteButton.dataset.cdmTerm;
      void deleteSavedSchedule(deleteYear, deleteSeason, deleteTerm).then(async () => {
        const localState = readScheduleWeekState(deleteYear, deleteSeason, deleteTerm);
        writeScheduleWeekState({ ...localState, entries: [] });
        if (isCurrentScheduleKey(deleteYear, deleteSeason, deleteTerm)) {
          entries = [];
          componentPicks.clear();
          openHome();
        }
        await refreshSavedSchedules();
        setStatus("Schedule deleted.", "success");
      });
    }
  });

  setActiveButton?.addEventListener("click", () => {
    const cdmTerm = resolveSelectedTerm(termSelect, availableTerms, options.focusTerm);
    if (!cdmTerm) return;
    void setActiveSchedule(planYear, planSeason, cdmTerm).then(async (ok) => {
      if (!ok) {
        setStatus("Could not set primary schedule. Save the timetable first or refresh the page.", "error");
        return;
      }
      currentIsActive = true;
      await refreshSavedSchedules();
      updateSetActiveButton();
      setStatus("This timetable is now shown on your dashboard.", "success");
    });
  });
}

export function bootSchedulePage(): void {
  const root = document.querySelector<HTMLElement>("[data-schedule-root]");
  if (!root || root.dataset.scheduleReady === "true") return;
  root.dataset.scheduleReady = "true";
  const collapsePanel = root.dataset.initialView === "timetable";
  initSchedulePage({
    focusCourse: root.dataset.focusCourse || undefined,
    focusTerm: root.dataset.focusTerm || undefined,
    collapsePanel,
  });
}

document.addEventListener("astro:page-load", () => {
  document.querySelectorAll<HTMLElement>("[data-schedule-root]").forEach((root) => {
    delete root.dataset.scheduleReady;
  });
  bootSchedulePage();
});
