import { fetchCdmTerms, fetchCourseSections } from "../lib/course-sections";
import { formatFetchError } from "../lib/fetch-retry";
import { formatClock } from "../lib/schedule-days";
import {
  buildScheduleConflictIndex,
  computeEventLayout,
  findCrossBundleConflicts,
  findScheduleConflicts,
  gridHours,
  listLocalSavedSchedules,
  readScheduleWeekState,
  sectionSelectionKey,
  summarizeScheduleConflicts,
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
  SchedulesApiError,
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
import { registerPageBoot } from "../lib/page-boot";
import { parseScriptJson } from "../lib/serialize-for-script";
import {
  entriesFromSections,
  enumerateValidSchedules,
  filterValidEntries,
  findAlternativeIndex,
  PINNED_PICK_KEY,
  type ScheduleAlternative,
} from "../lib/schedule-shuffle";
import {
  componentLabel,
  filterSectionsForLecture,
  groupSectionsByComponent,
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

function sectionGroupKey(courseCode: string, term: string): string {
  return `${normalizeCourseCode(courseCode)}|${term}`;
}

function meetingInstructors(section: CourseSection): string {
  return [...new Set(section.meetings.map((meeting) => meeting.instructor).filter(Boolean))].join(", ");
}

function rebuildSectionGroupLookup(groups: SectionGroup[]): Map<string, SectionGroup> {
  const lookup = new Map<string, SectionGroup>();
  for (const group of groups) {
    lookup.set(sectionGroupKey(group.course_code, group.term), group);
  }
  return lookup;
}

function readScheduleSsrPayload(): {
  schedules: SavedScheduleSummary[];
  cdmTerms: string[];
  error: string | null;
} {
  const el = document.getElementById("schedule-ssr");
  return (
    parseScriptJson<{
      schedules?: SavedScheduleSummary[];
      cdmTerms?: string[];
      error?: string | null;
    }>(el?.textContent ?? null) ?? { schedules: [], cdmTerms: [], error: null }
  );
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
  const dashboardHint = root.querySelector<HTMLElement>("[data-schedule-dashboard-hint]");
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
  const shufflePrev = root.querySelector<HTMLButtonElement>("[data-schedule-shuffle-prev]");
  const shuffleNext = root.querySelector<HTMLButtonElement>("[data-schedule-shuffle-next]");
  const shuffleMeta = root.querySelector<HTMLElement>("[data-schedule-shuffle-meta]");
  const gridEmpty = root.querySelector<HTMLElement>("[data-schedule-grid-empty]");
  const gridShell = root.querySelector<HTMLElement>(".schedule-grid-shell");

  const planSnapshot = readActivePlanGraphSnapshot();
  const planYears = planSnapshot ? listPlanChecklistYears(planSnapshot) : [];
  const defaultYear = planYears[0] ?? 1;
  const scheduleSsr = readScheduleSsrPayload();

  let planYear = Number(yearSelect?.value || defaultYear);
  let planSeason = (seasonSelect?.value || "all") as PlanSeasonFilter;
  let activeCourse = options.focusCourse?.trim().toUpperCase() || "";
  let entries: ScheduleGridEntry[] = [];
  let sectionGroups: SectionGroup[] = [];
  let sectionGroupLookup = rebuildSectionGroupLookup(sectionGroups);
  let availableTerms: string[] =
    scheduleSsr.cdmTerms.length > 0
      ? scheduleSsr.cdmTerms
      : options.focusTerm
        ? [options.focusTerm]
        : [];
  let savedSchedules: MergedSavedSchedule[] = [];
  let currentIsActive = false;
  let cloudSyncEnabled = false;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  let mode: ScheduleMode = "home";
  let panelCollapsed = options.collapsePanel ?? false;
  let didAutoOpenInitialSchedule = false;
  const componentPicks = new Map<string, Map<SectionComponentType, string>>();
  const pinnedCourses = new Set<string>();
  let scheduleAlternatives: ScheduleAlternative[] = [];
  let shuffleIndex = 0;

  function selectedTerm(): string {
    return resolveSelectedTerm(termSelect, availableTerms, options.focusTerm);
  }

  function sectionGroupForCourse(courseCode: string, term = selectedTerm()): SectionGroup | undefined {
    if (!term) return undefined;
    return sectionGroupLookup.get(sectionGroupKey(courseCode, term));
  }

  function updateSectionGroups(nextGroups: SectionGroup[]): void {
    sectionGroups = nextGroups;
    sectionGroupLookup = rebuildSectionGroupLookup(sectionGroups);
  }

  function hasScheduleContext(): boolean {
    return Boolean(selectedTerm());
  }

  function updateConfirmButton(): void {
    const cdmTerm = selectedTerm();
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
    const cdmTerm = selectedTerm();
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
      updateShuffleMeta();
      updateGridEmptyState();
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
    refreshConflictIndex();
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
    renderCourseChips();
    setStatus(`Loading sections for ${activeCourse}…`);
    try {
      const loaded = await mergeSectionsForCourse(activeCourse);
      if (loaded) {
        renderTermOptions();
        renderSectionBrowser();
      }
    } catch (error) {
      setStatus(formatFetchError(error, "Could not load section data."), "error");
    }

    bootstrapPlannedSchedule();
    renderConflictBanner();
    void loadRemainingCourseSections(activeCourse, courses);
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
    } catch (error) {
      if (availableTerms.length === 0 && options.focusTerm) {
        availableTerms = [options.focusTerm];
      }
      if (availableTerms.length === 0) {
        const message = error instanceof Error ? error.message : "Could not load CDM terms.";
        setStatus(message, "error");
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
    const cdmTerm = selectedTerm();
    await openSchedule(planYear, planSeason, cdmTerm, false);
    setStatus(`Loaded courses for Year ${planYear}.`, "success");
  }

  function currentContext(): ScheduleWeekState {
    return {
      planYear,
      planSeason,
      cdmTerm: resolveSelectedTerm(termSelect, availableTerms, options.focusTerm),
      entries,
      pinnedCourses: [...pinnedCourses],
    };
  }

  function loadWeekForCurrentFilters(): void {
    const cdmTerm = resolveSelectedTerm(termSelect, availableTerms, options.focusTerm);
    const stored = readScheduleWeekState(planYear, planSeason, cdmTerm);
    entries = stored.entries;
    pinnedCourses.clear();
    for (const courseCode of stored.pinnedCourses ?? []) {
      pinnedCourses.add(normalizeCourseCode(courseCode));
    }
    currentIsActive = false;
    refreshConflictIndex();
  }

  function picksWithoutMeta(picks: Record<string, string>): Record<string, string> {
    const copy = { ...picks };
    delete copy[PINNED_PICK_KEY];
    return copy;
  }

  function restorePicksFromBundles(
    bundles: Array<{ courseCode?: string; course_code?: string; picks: Record<string, string> }>,
  ): void {
    componentPicks.clear();
    pinnedCourses.clear();
    for (const bundle of bundles) {
      const courseCode = normalizeCourseCode(bundle.courseCode ?? bundle.course_code ?? "");
      if (!courseCode) continue;
      const rawPicks = bundle.picks ?? {};
      if (rawPicks[PINNED_PICK_KEY] === "true" || String(rawPicks[PINNED_PICK_KEY]) === "true") {
        pinnedCourses.add(courseCode);
      }
      const picks = new Map(
        Object.entries(picksWithoutMeta(rawPicks)) as Array<[SectionComponentType, string]>,
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
      if (pinnedCourses.has(code)) {
        pickRecord[PINNED_PICK_KEY] = "true";
      }
      const existing = byCourse.get(code);
      if (existing) {
        existing.picks = pickRecord;
      } else {
        byCourse.set(code, { bundle_id: crypto.randomUUID(), picks: pickRecord });
      }
    }

    for (const code of pinnedCourses) {
      if (!byCourse.has(code)) {
        byCourse.set(code, {
          bundle_id: crypto.randomUUID(),
          picks: { [PINNED_PICK_KEY]: "true" },
        });
      } else if (!byCourse.get(code)!.picks[PINNED_PICK_KEY]) {
        byCourse.get(code)!.picks[PINNED_PICK_KEY] = "true";
      }
    }

    return [...byCourse.entries()].map(([course_code, value]) => ({
      course_code,
      bundle_id: value.bundle_id,
      picks: value.picks,
    }));
  }

  function pinnedScheduleEntries(): ScheduleGridEntry[] {
    return entries.filter((entry) => pinnedCourses.has(normalizeCourseCode(entry.course_code)));
  }

  function isCoursePinned(courseCode: string): boolean {
    return pinnedCourses.has(normalizeCourseCode(courseCode));
  }

  function toggleCoursePin(courseCode: string): void {
    const normalized = normalizeCourseCode(courseCode);
    if (pinnedCourses.has(normalized)) {
      pinnedCourses.delete(normalized);
      setStatus(`Unpinned ${normalized}. Lab and tutorial times can change when you cycle timetables.`, "info");
    } else {
      pinnedCourses.add(normalized);
      setStatus(`Pinned ${normalized}. Lecture, lab, and tutorial times will stay put.`, "success");
    }
    rebuildScheduleAlternatives();
    persistWeek();
    renderCourseChips();
    renderSectionBrowser();
    renderGridEvents();
    updateShuffleMeta();
  }

  function coursesWithSectionData(): string[] {
    const term = selectedTerm();
    if (!term) return [];
    return plannedCourses().filter((courseCode) => {
      const group = sectionGroupForCourse(courseCode, term);
      return Boolean(group?.sections.length);
    });
  }

  function coursesForShuffle(): string[] {
    return coursesWithSectionData();
  }

  function primeComponentPicksForPlannedCourses(): void {
    for (const courseCode of coursesWithSectionData()) {
      const group = sectionGroupForCourse(courseCode);
      if (!group) continue;
      const groups = groupSectionsByComponent(group.sections);
      ensureDefaultPicks(courseCode, groups);
      syncDependentPicks(courseCode, groups);
    }
  }

  function rebuildScheduleAlternatives(): void {
    const term = resolveSelectedTerm(termSelect, availableTerms, options.focusTerm);
    const courseCodes = coursesForShuffle();
    if (courseCodes.length === 0) {
      scheduleAlternatives = [];
      shuffleIndex = 0;
      updateShuffleMeta();
      return;
    }

    scheduleAlternatives = enumerateValidSchedules(
      courseCodes,
      pinnedCourses,
      sectionGroups,
      term,
      currentContext(),
      pinnedScheduleEntries(),
      componentPicks,
    );
    shuffleIndex = findAlternativeIndex(scheduleAlternatives, componentPicks);
    updateShuffleMeta();
  }

  function updateShuffleMeta(): void {
    if (!shufflePrev || !shuffleNext || !shuffleMeta) return;
    const courseCodes = coursesForShuffle();
    const unpinnedCount = courseCodes.filter((code) => !isCoursePinned(code)).length;
    const show = mode === "editor" && courseCodes.length > 0;
    const alternativeCount = scheduleAlternatives.length;
    const canNavigate = show && alternativeCount > 1 && unpinnedCount > 0;

    shufflePrev.hidden = !show;
    shuffleNext.hidden = !show;
    shufflePrev.disabled = !canNavigate;
    shuffleNext.disabled = !canNavigate;

    if (!show) {
      shuffleMeta.hidden = true;
      shuffleMeta.textContent = "";
      return;
    }

    if (unpinnedCount === 0) {
      shuffleMeta.hidden = false;
      shuffleMeta.textContent = "Unpin a course to cycle lab and tutorial times.";
      return;
    }

    if (alternativeCount <= 1) {
      shuffleMeta.hidden = false;
      shuffleMeta.textContent =
        alternativeCount === 0
          ? "No conflict-free alternatives for your current lecture sections."
          : "Only one valid timetable for your current lecture sections.";
      return;
    }

    shuffleMeta.hidden = false;
    shuffleMeta.textContent = `${shuffleIndex + 1} of ${alternativeCount} timetables`;
  }

  function stepScheduleAlternative(direction: -1 | 1): void {
    primeComponentPicksForPlannedCourses();
    rebuildScheduleAlternatives();
    if (scheduleAlternatives.length <= 1) {
      setStatus(
        scheduleAlternatives.length === 0
          ? "No conflict-free timetables found for your planned courses. Try unpinning a course or changing lecture sections."
          : "Already on the only valid timetable for your planned courses.",
        "error",
      );
      updateShuffleMeta();
      return;
    }

    const baseIndex = findAlternativeIndex(scheduleAlternatives, componentPicks);
    shuffleIndex = (baseIndex + direction + scheduleAlternatives.length) % scheduleAlternatives.length;
    applyScheduleAlternative(scheduleAlternatives[shuffleIndex]!);
    updateShuffleMeta();
    setStatus(`Showing timetable ${shuffleIndex + 1} of ${scheduleAlternatives.length}.`, "success");
  }

  function updateGridEmptyState(): void {
    if (!gridEmpty) return;
    const show = mode === "editor" && entries.length === 0;
    gridEmpty.hidden = !show;
    gridEmpty.classList.toggle("hidden", !show);
    gridShell?.classList.toggle("schedule-grid-shell--empty", show);
  }

  function applyScheduleAlternative(alternative: ScheduleAlternative): void {
    for (const [courseCode, picks] of alternative.picksByCourse) {
      componentPicks.set(courseCode, new Map(picks));
    }
    entries = alternative.entries.map((entry) => ({ ...entry }));
    refreshConflictIndex();
    persistWeek();
    renderCourseChips();
    renderSectionBrowser();
    renderGridEvents();
    updateSetActiveButton();
    updateGridEmptyState();
    renderConflictBanner();
    updateShuffleMeta();
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
      if (!saved) {
        setStatus("Sign in to sync your timetable to the dashboard.", "error");
        return;
      }
      cloudSyncEnabled = true;
      currentIsActive = saved.isActive;
      updateSetActiveButton();
      if (entries.length > 0 && currentIsActive) {
        setStatus("Timetable saved — today's classes will show on your dashboard.", "success");
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not sync your timetable. Check that you are signed in and the API is running.";
      setStatus(message, "error");
    }
  }

  async function loadWeekFromCloud(): Promise<void> {
    const cdmTerm = resolveSelectedTerm(termSelect, availableTerms, options.focusTerm);
    if (!cdmTerm) {
      loadWeekForCurrentFilters();
      return;
    }

    let loadedFromLocal = false;
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
        loadedFromLocal = entries.length > 0;
      }
    } catch {
      loadWeekForCurrentFilters();
      loadedFromLocal = entries.length > 0;
    }

    if (loadedFromLocal) {
      persistWeek();
    }
    refreshConflictIndex();
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
    const ssr = readScheduleSsrPayload();
    let cloud: SavedScheduleSummary[] = ssr.schedules;
    if (ssr.error) {
      setStatus(ssr.error, "error");
    }
    if (cloud.length > 0) {
      cloudSyncEnabled = true;
      savedSchedules = mergeSavedSchedules(cloud, listLocalSavedSchedules());
      renderSavedSchedules();
    }

    try {
      const fetched = await fetchSavedSchedules();
      cloud = fetched;
      if (cloud.length > 0) cloudSyncEnabled = true;
    } catch (error) {
      if (cloud.length === 0) {
        cloud = [];
        const local = listLocalSavedSchedules();
        if (error instanceof SchedulesApiError) {
          if (error.status !== 401 || local.length === 0) {
            setStatus(error.message, "error");
          }
        } else if (error instanceof Error) {
          setStatus(error.message, "error");
        }
      }
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

  function scheduleExistsInCloud(planYearValue: number, planSeasonValue: string, cdmTermValue: string): boolean {
    return savedSchedules.some(
      (item) =>
        item.source === "cloud" &&
        item.planYear === planYearValue &&
        item.planSeason === planSeasonValue &&
        item.cdmTerm === cdmTermValue,
    );
  }

  async function ensureScheduleSavedToCloud(): Promise<boolean> {
    const cdmTerm = selectedTerm();
    if (!cdmTerm) return false;

    if (scheduleExistsInCloud(planYear, planSeason, cdmTerm)) {
      return true;
    }

    try {
      const saved = await saveScheduleWeek({
        planYear,
        planSeason,
        cdmTerm,
        entries,
        bundles: bundlesPayload(),
      });
      if (!saved) return false;
      cloudSyncEnabled = true;
      currentIsActive = saved.isActive;
      writeScheduleWeekState(currentContext());
      return true;
    } catch {
      return false;
    }
  }

  async function activateForDashboard(
    targetPlanYear: number,
    targetPlanSeason: string,
    targetCdmTerm: string,
  ): Promise<boolean> {
    const matchesCurrent =
      targetPlanYear === planYear &&
      targetPlanSeason === planSeason &&
      targetCdmTerm === selectedTerm();

    if (matchesCurrent) {
      const saved = await ensureScheduleSavedToCloud();
      if (!saved) return false;
    }

    const ok = await setActiveSchedule(targetPlanYear, targetPlanSeason, targetCdmTerm);
    if (!ok) return false;

    currentIsActive = isCurrentScheduleKey(targetPlanYear, targetPlanSeason, targetCdmTerm);
    await refreshSavedSchedules();
    updateSetActiveButton();
    updateDashboardHint();
    return true;
  }

  function updateDashboardHint(): void {
    if (!dashboardHint) return;
    const cloudSchedules = savedSchedules.filter((item) => item.source === "cloud");
    const hasPrimary = cloudSchedules.some((item) => item.isActive);
    const show = mode === "home" && cloudSchedules.length > 0 && !hasPrimary;
    dashboardHint.hidden = !show;
    dashboardHint.classList.toggle("hidden", !show);
  }

  function updateSetActiveButton(): void {
    if (!setActiveButton) return;
    const cdmTerm = selectedTerm();
    const showInEditor = mode === "editor" && Boolean(cdmTerm);
    setActiveButton.hidden = !showInEditor;
    setActiveButton.disabled = !showInEditor || currentIsActive;
    setActiveButton.classList.toggle("schedule-dashboard-btn--active", currentIsActive);
    setActiveButton.textContent = currentIsActive ? "Dashboard schedule" : "Use on dashboard";
    setActiveButton.title = currentIsActive
      ? "This timetable powers today's classes on your dashboard"
      : "Show this timetable's classes on your dashboard home page";
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
      updateDashboardHint();
      return;
    }

    savedList.innerHTML = savedSchedules
      .map((item) => {
        const active = isCurrentScheduleKey(item.planYear, item.planSeason, item.cdmTerm);
        const canSetDashboard = item.source === "cloud";
        return `
          <article class="schedule-saved-card${active ? " is-active" : ""}${item.isActive ? " is-dashboard" : ""}">
            <button type="button" class="schedule-saved-card__open" data-load-schedule
              data-plan-year="${item.planYear}"
              data-plan-season="${item.planSeason}"
              data-cdm-term="${item.cdmTerm}"
              data-entry-count="${item.entryCount}">
              <div class="schedule-saved-card__header">
                <p class="schedule-saved-card__title">Year ${item.planYear} · ${seasonLabel(item.planSeason)}</p>
                ${
                  item.isActive
                    ? `<span class="schedule-saved-card__badge">Dashboard schedule</span>`
                    : ""
                }
              </div>
              <p class="schedule-saved-card__term">${item.cdmTerm}</p>
              <p class="schedule-saved-card__meta">${item.courseCount} course${item.courseCount === 1 ? "" : "s"} · ${item.entryCount} block${item.entryCount === 1 ? "" : "s"}</p>
              <p class="schedule-saved-card__cta">Open schedule →</p>
            </button>
            <div class="schedule-saved-card__actions">
              ${
                !item.isActive && canSetDashboard
                  ? `<button type="button" class="schedule-saved-card__action schedule-saved-card__action--primary" data-activate-schedule
                        data-plan-year="${item.planYear}"
                        data-plan-season="${item.planSeason}"
                        data-cdm-term="${item.cdmTerm}">Use on dashboard</button>`
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
    updateDashboardHint();
  }

  function updateTimetableSubtitle(): void {
    if (!timetableSubtitle) return;
    const cdmTerm = selectedTerm();
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
    if (message) {
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
    }
  }

  let conflictIndex = buildScheduleConflictIndex(entries);

  function refreshConflictIndex(): void {
    conflictIndex = buildScheduleConflictIndex(entries);
  }

  function renderConflictBanner(): void {
    if (!status || mode !== "editor") return;
    const conflicts = findScheduleConflicts(entries);
    if (conflicts.length === 0) return;

    const summary = summarizeScheduleConflicts(conflicts);
    const extra = conflicts.length > 3 ? ` (+${conflicts.length - 3} more)` : "";
    setStatus(
      `${conflicts.length} time conflict${conflicts.length === 1 ? "" : "s"}: ${summary}${extra}`,
      "error",
    );
  }

  function selectedBundleSections(courseCode: string): CourseSection[] {
    const group = sectionGroupForCourse(courseCode);
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
    const group = sectionGroupForCourse(courseCode);
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
        const hasConflict =
          onSchedule && conflictIndex.conflictingCourseCodes.has(normalizeCourseCode(courseCode));
        const pinned = onSchedule && isCoursePinned(courseCode);
        return `
          <div class="schedule-course-row${courseCode === activeCourse ? " is-active" : ""}${onSchedule ? " is-on-schedule" : ""}${hasConflict ? " is-conflict" : ""}">
            <button
              type="button"
              class="schedule-course-chip${courseCode === activeCourse ? " is-active" : ""}${onSchedule ? " is-on-schedule" : ""}${hasConflict ? " is-conflict" : ""}${pinned ? " is-pinned" : ""}"
              data-course-chip="${courseCode}"
            >
              ${courseCode}
              ${hasConflict ? `<span class="schedule-course-chip__conflict" title="Time conflict with another course">!</span>` : ""}
              ${warning ? `<span class="schedule-course-chip__warn" title="${warning.message}">S</span>` : ""}
            </button>
            ${
              onSchedule
                ? `<div class="schedule-course-row__actions">
                    <button
                      type="button"
                      class="schedule-course-row__pin${pinned ? " is-pinned" : ""}"
                      data-chip-pin="${courseCode}"
                      title="${pinned ? "Unpin course" : "Pin course during shuffle"}"
                      aria-label="${pinned ? "Unpin course" : "Pin course"}"
                    >📌</button>
                    <button
                      type="button"
                      class="schedule-course-row__remove"
                      data-chip-remove="${courseCode}"
                      title="Remove ${courseCode} from timetable"
                      aria-label="Remove ${courseCode}"
                    >×</button>
                  </div>`
                : ""
            }
          </div>
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

    const term = selectedTerm();
    const group = sectionGroupForCourse(activeCourse, term);

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
          ${
            onSchedule.size > 0
              ? `<p class="schedule-section-actions__hint text-xs text-muted">
                  Section changes update the full ${activeCourse} bundle on your timetable.
                </p>
                <button type="button" class="btn-ghost px-4 py-2 text-sm" data-toggle-course-pin>
                  ${isCoursePinned(activeCourse) ? "Unpin course" : "Pin course"}
                </button>
                <button type="button" class="btn-ghost px-4 py-2 text-sm" data-remove-course-bundle>Remove ${activeCourse} from timetable</button>`
              : `<button type="button" class="btn-york px-4 py-2 text-sm" data-add-bundle>Add ${activeCourse} to timetable</button>`
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
    updateGridEmptyState();
  }

  function renderGridEvents(days = weeklyGridDays()): void {
    if (!eventsContainer) return;
    eventsContainer.innerHTML = "";

    const dayCount = days.length;
    const columnWidth = `calc((100% - ${TIME_COLUMN_WIDTH}px) / ${dayCount})`;
    const { conflictingEntryIds } = conflictIndex;

    for (const entry of entries) {
      const layout = computeEventLayout(entry.day, entry.start_time, entry.end_time, days);
      if (!layout) continue;

      const conflict = conflictingEntryIds.has(entry.id);
      const pinned = isCoursePinned(entry.course_code);

      const card = document.createElement("article");
      card.className = `schedule-event${conflict ? " schedule-event--conflict" : ""}${pinned ? " schedule-event--pinned" : ""}`;
      card.style.left = `calc(${TIME_COLUMN_WIDTH}px + ${layout.dayIndex} * ((100% - ${TIME_COLUMN_WIDTH}px) / ${dayCount}))`;
      card.style.top = `${layout.top}px`;
      card.style.width = columnWidth;
      card.style.height = `${layout.height}px`;
      card.dataset.entryId = entry.id;
      card.dataset.courseCode = entry.course_code;

      const place = [entry.campus, entry.room].filter(Boolean).join(" · ");
      const timeLabel = `${formatClock(entry.start_time)} – ${formatClock(entry.end_time)}`;
      card.setAttribute(
        "aria-label",
        `${entry.course_code} ${componentLabel(entry.component_type)} ${entry.section_code}, ${entry.day} ${timeLabel}${place ? `, ${place}` : ""}${conflict ? ", time conflict" : ""}`,
      );
      card.innerHTML = `
        <p class="schedule-event__code">${pinned ? `<span class="schedule-event__pin-icon" aria-hidden="true">📌</span>` : ""}${entry.course_code}</p>
        <p class="schedule-event__section">${componentLabel(entry.component_type)} · ${entry.section_code}</p>
        <p class="schedule-event__time">${timeLabel}</p>
        ${place ? `<p class="schedule-event__place">${place}</p>` : ""}
        ${conflict ? `<p class="schedule-event__conflict">Time conflict</p>` : ""}
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

  function syncCourseBundleToSchedule(
    courseCode: string,
    syncOptions: { silent?: boolean } = {},
  ): boolean {
    const group = sectionGroupForCourse(courseCode);
    if (!group) {
      if (!syncOptions.silent) {
        setStatus(`No section data loaded for ${courseCode}.`, "error");
      }
      return false;
    }

    const groups = groupSectionsByComponent(group.sections);
    ensureDefaultPicks(courseCode, groups);
    syncDependentPicks(courseCode, groups);

    const lectureGroup = groups.find((item) => item.type === "lec");
    const picks = componentPicks.get(normalizeCourseCode(courseCode));
    if (lectureGroup && !picks?.get("lec")) {
      if (!syncOptions.silent) {
        setStatus(`Choose a lecture section for ${courseCode} first.`, "error");
      }
      return false;
    }

    const lecturePick = picks?.get("lec") ?? "";
    const tieGroup = lecturePick ? lectureGroupForPick(courseCode, lecturePick) : null;
    for (const componentGroup of groups) {
      if (componentGroup.type === "lec") continue;
      const visible = filterSectionsForLecture(lecturePick, componentGroup.sections, tieGroup);
      if (visible.length > 0 && !picks?.get(componentGroup.type)) {
        if (!syncOptions.silent) {
          setStatus(`Choose a ${componentGroup.label.toLowerCase()} for ${courseCode}.`, "error");
        }
        return false;
      }
    }

    const sections = selectedBundleSections(courseCode);
    if (sections.length === 0) {
      if (!syncOptions.silent) {
        setStatus(`Choose at least one section component for ${courseCode}.`, "error");
      }
      return false;
    }

    const bundleId =
      entries.find((entry) => normalizeCourseCode(entry.course_code) === normalizeCourseCode(courseCode))
        ?.bundle_id ?? crypto.randomUUID();
    const context = currentContext();
    const newEntries = filterValidEntries(entriesFromSections(courseCode, sections, bundleId, context));
    if (newEntries.length === 0) {
      if (!syncOptions.silent) {
        setStatus("Selected sections fall outside the 8:00 AM – 7:00 PM weekly grid.", "error");
      }
      return false;
    }

    const remaining = entries.filter(
      (entry) => normalizeCourseCode(entry.course_code) !== normalizeCourseCode(courseCode),
    );
    const conflicts = findCrossBundleConflicts(newEntries, remaining);
    if (conflicts.length > 0) {
      if (!syncOptions.silent) {
        const summary = summarizeScheduleConflicts(conflicts);
        setStatus(`Cannot add ${courseCode} — time conflict: ${summary}`, "error");
      }
      return false;
    }

    entries = [...remaining, ...newEntries];
    refreshConflictIndex();
    rebuildScheduleAlternatives();

    persistWeek();
    renderCourseChips();
    renderSectionBrowser();
    renderGridEvents();
    updateSetActiveButton();
    if (!syncOptions.silent) {
      setStatus(`Updated ${courseCode} on your Year ${planYear} weekly timetable.`, "success");
    }
    renderConflictBanner();
    return true;
  }

  function addCourseBundle(courseCode: string): void {
    syncCourseBundleToSchedule(courseCode);
  }

  function bootstrapPlannedSchedule(): void {
    const planned = plannedCourses();
    if (planned.length === 0) return;

    primeComponentPicksForPlannedCourses();
    rebuildScheduleAlternatives();

    const withData = coursesWithSectionData();
    const missingFromPlan = withData.filter((code) => onScheduleSections(code).size === 0);

    if (missingFromPlan.length === 0 && entries.length > 0 && scheduleAlternatives.length > 0) {
      shuffleIndex = findAlternativeIndex(scheduleAlternatives, componentPicks);
      updateShuffleMeta();
      return;
    }

    if (scheduleAlternatives.length > 0) {
      shuffleIndex = entries.length > 0
        ? findAlternativeIndex(scheduleAlternatives, componentPicks)
        : 0;
      applyScheduleAlternative(scheduleAlternatives[shuffleIndex]!);
      setStatus(
        `Loaded ${withData.length} planned course${withData.length === 1 ? "" : "s"} onto your timetable. Use ← → to cycle conflict-free schedules.`,
        "success",
      );
      return;
    }

    let added = 0;
    for (const courseCode of planned) {
      if (onScheduleSections(courseCode).size > 0) continue;
      if (syncCourseBundleToSchedule(courseCode, { silent: true })) {
        added += 1;
      }
    }
    rebuildScheduleAlternatives();

    if (added > 0) {
      setStatus(`Loaded ${added} course${added === 1 ? "" : "s"} from your degree plan onto the timetable.`, "success");
      return;
    }

    if (coursesWithSectionData().length > 0) {
      setStatus(
        "No conflict-free timetable found for all planned courses. Try unpinning a course or changing lecture sections.",
        "error",
      );
    }
  }

  function removeCourseBundle(courseCode: string): void {
    const normalized = normalizeCourseCode(courseCode);
    entries = entries.filter(
      (entry) => normalizeCourseCode(entry.course_code) !== normalized,
    );
    componentPicks.delete(normalized);
    pinnedCourses.delete(normalized);
    refreshConflictIndex();
    rebuildScheduleAlternatives();
    persistWeek();
    renderCourseChips();
    renderSectionBrowser();
    renderGridEvents();
    updateSetActiveButton();
    setStatus(`Removed ${courseCode} from your weekly timetable.`, "success");
    renderConflictBanner();
  }

  async function mergeSectionsForCourse(courseCode: string): Promise<boolean> {
    const response = await fetchCourseSections({
      courseCode,
      term: resolveSelectedTerm(termSelect, availableTerms, options.focusTerm) || undefined,
    });
    const courseGroups = response.groups.filter(
      (group) => normalizeCourseCode(group.course_code) === normalizeCourseCode(courseCode),
    );
    if (courseGroups.length === 0) return false;

    updateSectionGroups([
      ...sectionGroups.filter(
        (group) => normalizeCourseCode(group.course_code) !== normalizeCourseCode(courseCode),
      ),
      ...courseGroups,
    ]);
    const terms = uniqueTerms(courseGroups);
    if (terms.length > 0) {
      availableTerms = mergeTerms(availableTerms, terms);
    }
    return true;
  }

  async function loadSectionsForCourse(courseCode: string): Promise<void> {
    if (!courseCode || mode !== "editor") return;
    setStatus(`Loading sections for ${courseCode}…`);
    try {
      await mergeSectionsForCourse(courseCode);
      renderTermOptions();
      renderSectionBrowser();
      setStatus("");
    } catch (error) {
      setStatus(formatFetchError(error, "Failed to load sections."), "error");
    }
  }

  async function loadRemainingCourseSections(
    priorityCourse: string,
    courses: string[],
  ): Promise<void> {
    const remaining = courses.filter(
      (courseCode) => normalizeCourseCode(courseCode) !== normalizeCourseCode(priorityCourse),
    );
    if (remaining.length === 0 || mode !== "editor") return;

    let loadedCount = 0;
    for (const courseCode of remaining) {
      if (mode !== "editor") return;
      try {
        if (await mergeSectionsForCourse(courseCode)) {
          loadedCount += 1;
        }
      } catch {
        // Keep loading other courses even if one fails.
      }
    }

    if (loadedCount === 0 || mode !== "editor") return;

    renderTermOptions();
    if (activeCourse) {
      renderSectionBrowser();
    }
    rebuildScheduleAlternatives();
    if (entries.length === 0 && scheduleAlternatives.length > 0) {
      bootstrapPlannedSchedule();
    }
    renderGridEvents();
    renderConflictBanner();
    setStatus("");
  }

  loadWeekForCurrentFilters();
  renderYearOptions();
  renderTermOptions();
  renderGridStructure();
  setMode("home");
  updatePanelState();
  void refreshSavedSchedules();
  void loadAvailableTerms();

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
    const pinButton = (event.target as Element | null)?.closest<HTMLElement>("[data-chip-pin]");
    if (pinButton?.dataset.chipPin) {
      event.preventDefault();
      event.stopPropagation();
      toggleCoursePin(pinButton.dataset.chipPin);
      return;
    }

    const removeButton = (event.target as Element | null)?.closest<HTMLElement>("[data-chip-remove]");
    if (removeButton?.dataset.chipRemove) {
      event.preventDefault();
      event.stopPropagation();
      removeCourseBundle(removeButton.dataset.chipRemove);
      return;
    }

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
      const group = sectionGroupForCourse(activeCourse);
      if (group) {
        const groups = groupSectionsByComponent(group.sections);
        syncDependentPicks(activeCourse, groups);
      }
      renderSectionBrowser();
    }

    if (activeCourse && onScheduleSections(activeCourse).size > 0) {
      syncCourseBundleToSchedule(activeCourse, { silent: true });
      rebuildScheduleAlternatives();
    }
  });

  sectionBrowser?.addEventListener("click", (event) => {
    const addBundle = (event.target as Element | null)?.closest<HTMLElement>("[data-add-bundle]");
    const removeBundle = (event.target as Element | null)?.closest<HTMLElement>("[data-remove-course-bundle]");
    const togglePin = (event.target as Element | null)?.closest<HTMLElement>("[data-toggle-course-pin]");
    if (addBundle && activeCourse) {
      addCourseBundle(activeCourse);
      return;
    }
    if (togglePin && activeCourse) {
      toggleCoursePin(activeCourse);
      return;
    }
    if (removeBundle && activeCourse) {
      removeCourseBundle(activeCourse);
    }
  });

  shufflePrev?.addEventListener("click", () => {
    stepScheduleAlternative(-1);
  });

  shuffleNext?.addEventListener("click", () => {
    stepScheduleAlternative(1);
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
      void activateForDashboard(
        Number(activateButton.dataset.planYear),
        activateButton.dataset.planSeason || "all",
        activateButton.dataset.cdmTerm,
      ).then((ok) => {
        if (!ok) {
          setStatus("Could not set dashboard schedule. Save the timetable first or refresh the page.", "error");
          return;
        }
        setStatus("This timetable now powers today's classes on your dashboard.", "success");
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
          pinnedCourses.clear();
          openHome();
        }
        await refreshSavedSchedules();
        setStatus("Schedule deleted.", "success");
      });
    }
  });

  setActiveButton?.addEventListener("click", () => {
    const cdmTerm = selectedTerm();
    if (!cdmTerm) return;
    void activateForDashboard(planYear, planSeason, cdmTerm).then((ok) => {
      if (!ok) {
        setStatus("Could not set dashboard schedule. Try saving your timetable first.", "error");
        return;
      }
      setStatus("This timetable now powers today's classes on your dashboard.", "success");
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

registerPageBoot("[data-schedule-root]", "scheduleReady", bootSchedulePage);
