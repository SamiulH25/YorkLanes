/**
 * Interactive degree plan editor — drag-and-drop, course selection, SVG dependency lines.
 *
 * Data: plan loaded via GET /api/plans/:id/graph (no inline JSON blob).
 * Entry: initPlanEditor() called from apps/web/src/pages/plan/index.astro
 */
import {
  cachePlanGraphSnapshot,
  countScheduleWarningsForTerm,
  listComplementaryWarnings,
  listScheduleWarnings,
  readPlanGraphSnapshot,
  scheduleWarningForCourse,
  type PlanGraphSnapshot,
} from "../lib/plan-store";
import {
  formatTermCredits,
  formatYearCredits,
  summarizeChecklistYear,
  summarizeTerm,
} from "../lib/plan-credits";
import {
  addPlanCourse,
  createPlanSummerTerm,
  fetchComplementarySummary,
  fetchPlanGraph,
  removePlanCourse,
  searchComplementaryCourses,
  updatePlanCourseCompletion,
  updatePlanLayout,
  uploadComplementaryPdf,
  type PlanGraphResponse,
  type PlanLayoutMove,
} from "../lib/plans";
import { parseScriptJson } from "../lib/serialize-for-script";
import { registerPageBoot } from "../lib/page-boot";
import { fetchCourses } from "../lib/courses";
import { planExpectsComplementaryStudies } from "../lib/plan-complementary";
import {
  formatComplementaryStubDisplay,
  formatStubDragLabel,
  isComplementaryStub,
  isComplementaryStubDraggable,
} from "../lib/complementary-stub";
import {
  isRequiredPlanCourse,
  readMissingRequiredCourses,
  reconcileMissingRequiredCourses,
  writeMissingRequiredCourses,
  type MissingRequiredCourse,
} from "../lib/plan-required-courses";
import {
  formatScheduleAlertsHint,
  formatScheduleWarningDetail,
  progressPercent,
  summarizeComplementaryWarnings,
} from "../lib/plan-alerts";
import { progressElectivesHref } from "../lib/progress";
import { readThemeColor } from "./theme.ts";
import type { DegreePlan, PlanCourse, PlanTerm } from "../types/plan";

interface EditorState {
  plan: DegreePlan;
  graph: PlanGraphSnapshot | null;
  selectedCourseId: string | null;
  draggingCourseId: string | null;
  missingRequiredCourses: MissingRequiredCourse[];
  saving: boolean;
  addCourseTermId: string | null;
  addCourseTermLabel: string | null;
  addCourseMode: "catalog" | "complementary";
  hasComplementaryCatalog: boolean;
  expectsComplementaryStudies: boolean;
  theme: {
    prereq: string;
    coreq: string;
    warning: string;
  };
}

type RedrawOptions = {
  /** Refresh selection/warning/completed chrome. Default true for interaction, false for scroll. */
  chrome?: boolean;
  /** Play path draw animation. Default true for selection changes, false for scroll. */
  animate?: boolean;
};

let redrawRaf = 0;
let pendingChrome = false;
let pendingAnimate = false;

function getStage(): HTMLElement | null {
  return document.getElementById("plan-editor-stage");
}

function getCanvas(): HTMLElement | null {
  return document.getElementById("plan-editor-canvas");
}

function getSvg(): SVGSVGElement | null {
  return document.getElementById("plan-deps-svg") as SVGSVGElement | null;
}

interface CardRect {
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

interface Anchor {
  x: number;
  y: number;
}

interface EdgeLayout {
  edge: PlanGraphSnapshot["dependencies"][number];
  fromRect: CardRect;
  toRect: CardRect;
  fromCol: number;
  toCol: number;
}

function readThemeColors(): EditorState["theme"] {
  return {
    prereq: readThemeColor("--theme-prereq"),
    coreq: readThemeColor("--theme-coreq"),
    warning: readThemeColor("--theme-warning"),
  };
}

function getCardRect(stageRect: DOMRect, card: HTMLElement): CardRect {
  const rect = card.getBoundingClientRect();
  const left = rect.left - stageRect.left;
  const top = rect.top - stageRect.top;
  return {
    left,
    top,
    width: rect.width,
    height: rect.height,
    centerX: left + rect.width / 2,
    centerY: top + rect.height / 2,
  };
}

function buildColumnIndexMap(stage: HTMLElement): Map<HTMLElement, number> {
  const map = new Map<HTMLElement, number>();
  stage.querySelectorAll<HTMLElement>(".plan-year-column").forEach((column, index) => {
    map.set(column, index);
  });
  return map;
}

function getTermColumnIndex(card: HTMLElement, columnMap: Map<HTMLElement, number>): number {
  const column = card.closest(".plan-year-column") as HTMLElement | null;
  if (!column) return 0;
  return columnMap.get(column) ?? 0;
}

function computeAnchors(
  from: CardRect,
  to: CardRect,
  fromCol: number,
  toCol: number,
): { from: Anchor; to: Anchor } {
  const pad = 4;

  if (fromCol < toCol) {
    return {
      from: { x: from.left + from.width - pad, y: from.centerY },
      to: { x: to.left + pad, y: to.centerY },
    };
  }

  if (fromCol > toCol) {
    return {
      from: { x: from.left + pad, y: from.centerY },
      to: { x: to.left + to.width - pad, y: to.centerY },
    };
  }

  if (from.top <= to.top) {
    return {
      from: { x: from.centerX, y: from.top + from.height - pad },
      to: { x: to.centerX, y: to.top + pad },
    };
  }

  return {
    from: { x: from.centerX, y: from.top + pad },
    to: { x: to.centerX, y: to.top + to.height - pad },
  };
}

/** Horizontal-tangent cubic — reads cleanly across term columns. */
function linkPath(from: Anchor, to: Anchor, lane: number): string {
  const dx = to.x - from.x;
  const laneOffset = lane * 14;
  const fromY = from.y + laneOffset;
  const toY = to.y + laneOffset;
  const bend = Math.max(36, Math.abs(dx) * 0.42);

  if (Math.abs(dx) > 24) {
    const c1x = from.x + (dx >= 0 ? bend : -bend);
    const c2x = to.x - (dx >= 0 ? bend : -bend);
    return `M ${from.x} ${fromY} C ${c1x} ${fromY}, ${c2x} ${toY}, ${to.x} ${toY}`;
  }

  const midY = (fromY + toY) / 2;
  return `M ${from.x} ${fromY} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${toY}`;
}

function shouldDrawEdge(
  edge: PlanGraphSnapshot["dependencies"][number],
  state: EditorState,
): boolean {
  if (!state.selectedCourseId) return false;
  return (
    edge.from_course_id === state.selectedCourseId ||
    edge.to_course_id === state.selectedCourseId
  );
}

function clearSelection(state: EditorState): void {
  state.selectedCourseId = null;
  scheduleRedraw(state, { chrome: true, animate: false });
  updateSelectionLegend(state);
}

function assignLanes(layouts: EdgeLayout[]): Map<EdgeLayout, number> {
  const lanes = new Map<EdgeLayout, number>();
  const buckets = new Map<string, EdgeLayout[]>();

  for (const layout of layouts) {
    const key = `${layout.fromCol}:${layout.toCol}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(layout);
    buckets.set(key, bucket);
  }

  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => a.fromRect.centerY - b.fromRect.centerY);
    const mid = (bucket.length - 1) / 2;
    bucket.forEach((layout, index) => {
      lanes.set(layout, index - mid);
    });
  }

  return lanes;
}

function createMarker(id: string, color: string): SVGMarkerElement {
  const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.setAttribute("id", id);
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("markerWidth", "6");
  marker.setAttribute("markerHeight", "6");
  marker.setAttribute("refX", "8");
  marker.setAttribute("refY", "5");
  marker.setAttribute("orient", "auto");
  marker.setAttribute("markerUnits", "strokeWidth");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  path.setAttribute("fill", color);
  marker.appendChild(path);
  return marker;
}

function setStatus(message: string, isError = false): void {
  const el = document.getElementById("plan-editor-status");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("text-york-red", isError);
  el.classList.toggle("text-york-muted", !isError);
}

function updateCreditDisplays(state: EditorState): void {
  const years = new Set(state.plan.terms.map((term) => term.checklist_year));
  for (const checklistYear of years) {
    const summary = summarizeChecklistYear(state.plan.terms, checklistYear);
    const yearEl = document.querySelector<HTMLElement>(
      `.plan-year-credits[data-checklist-year="${CSS.escape(String(checklistYear))}"]`,
    );
    if (yearEl) {
      yearEl.textContent = formatYearCredits(summary);
    }
  }

  for (const term of state.plan.terms) {
    const summary = summarizeTerm(term);
    const countEl = document.querySelector<HTMLElement>(
      `.plan-term-count[data-term-id="${CSS.escape(term.id)}"]`,
    );
    if (countEl) {
      countEl.textContent = `${summary.courseCount} course${summary.courseCount === 1 ? "" : "s"}`;
    }

    const creditsEl = document.querySelector<HTMLElement>(
      `.plan-term-credits[data-term-id="${CSS.escape(term.id)}"]`,
    );
    if (creditsEl) {
      creditsEl.textContent = formatTermCredits(summary);
    }
  }
}

function appendStubCardBody(body: HTMLElement, course: PlanCourse): void {
  if (isComplementaryStub(course)) {
    const display = formatComplementaryStubDisplay(course);
    const codeEl = document.createElement("p");
    codeEl.className = "plan-course-code";
    codeEl.textContent = display.header;
    body.appendChild(codeEl);

    const subtitleEl = document.createElement("p");
    subtitleEl.className = "plan-stub-options text-xs text-york-muted";
    subtitleEl.textContent = display.subtitle;
    body.appendChild(subtitleEl);
    return;
  }

  const displayLabel = course.section_label ?? course.title ?? course.course_code;
  const codeEl = document.createElement("p");
  codeEl.className = "plan-course-code";
  codeEl.textContent = displayLabel;
  body.appendChild(codeEl);

  if (course.title && course.title !== displayLabel) {
    const optionsEl = document.createElement("p");
    optionsEl.className = "plan-stub-options";
    optionsEl.textContent = course.title;
    body.appendChild(optionsEl);
  } else if (!course.title) {
    const hintEl = document.createElement("p");
    hintEl.className = "text-xs text-york-muted";
    hintEl.textContent = "Pick from checklist options";
    body.appendChild(hintEl);
  }
}

function createCourseCardElement(course: PlanCourse): HTMLLIElement {
  const card = document.createElement("li");
  card.className = "plan-course-card";
  if (course.entry_kind === "stub") {
    card.classList.add("plan-course-card--stub");
  }
  card.dataset.courseId = course.id;
  card.dataset.courseCode = course.course_code;
  card.dataset.entryKind = course.entry_kind ?? "course";
  if (course.section_label) {
    card.dataset.sectionLabel = course.section_label;
  }
  if (isComplementaryStub(course)) {
    card.dataset.complementaryStub = "true";
  }

  if (course.entry_kind !== "stub") {
    const completeWrap = document.createElement("label");
    completeWrap.className = "plan-course-complete-wrap";
    completeWrap.title = "Mark as completed";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "plan-course-complete";
    checkbox.checked = course.completed ?? false;
    checkbox.setAttribute("aria-label", `Mark ${course.course_code} as completed`);
    completeWrap.appendChild(checkbox);
    card.appendChild(completeWrap);

    if (isComplementaryPlacement(course)) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "plan-course-remove";
      removeBtn.title = `Remove ${course.course_code} from plan`;
      removeBtn.setAttribute("aria-label", `Remove ${course.course_code} from plan`);
      removeBtn.textContent = "×";
      card.appendChild(removeBtn);
    }
  }

  const warning = document.createElement("span");
  warning.className = "plan-course-warning";
  warning.hidden = true;
  warning.setAttribute("aria-label", "Unmet prerequisites");
  warning.textContent = "!";
  card.appendChild(warning);

  const scheduleWarn = document.createElement("span");
  scheduleWarn.className = "plan-course-schedule-warn";
  scheduleWarn.hidden = true;
  scheduleWarn.setAttribute("aria-label", "Season offering warning");
  scheduleWarn.textContent = "S";
  card.appendChild(scheduleWarn);

  const handle = document.createElement("span");
  handle.className = "plan-course-handle";
  handle.setAttribute("role", "button");
  handle.tabIndex = 0;
  if (course.entry_kind !== "stub" || isComplementaryStubDraggable(course)) {
    handle.draggable = true;
  }
  handle.setAttribute(
    "aria-label",
    `Drag ${formatStubDragLabel(course)} to another term or trash`,
  );
  handle.textContent = "⋮⋮";
  card.appendChild(handle);

  const body = document.createElement("div");
  body.className = "plan-course-body";

  if (course.entry_kind === "stub") {
    appendStubCardBody(body, course);
  } else {
    const codeEl = document.createElement("p");
    codeEl.className = "plan-course-code";
    codeEl.textContent = course.course_code;
    body.appendChild(codeEl);

    if (course.title) {
      const titleEl = document.createElement("p");
      titleEl.className = "text-xs text-york-muted";
      titleEl.textContent = course.title;
      body.appendChild(titleEl);
    }
  }

  if (course.credits != null) {
    const creditsEl = document.createElement("span");
    creditsEl.className = "plan-course-credits";
    creditsEl.textContent = `${course.credits} cr`;
    body.appendChild(creditsEl);
  }

  card.appendChild(body);
  return card;
}

function appendCourseCardToTerm(termId: string, course: PlanCourse): void {
  const list = document.querySelector<HTMLElement>(`.plan-course-list[data-term-id="${CSS.escape(termId)}"]`);
  if (!list) return;

  list.querySelector(".plan-course-empty")?.remove();
  list.appendChild(createCourseCardElement(course));
}

function listPlannedCourseCodes(plan: DegreePlan): Set<string> {
  const codes = new Set<string>();
  for (const term of plan.terms) {
    for (const course of term.courses) {
      if (course.entry_kind !== "stub") {
        codes.add(course.course_code.toUpperCase());
      }
    }
  }
  return codes;
}

function findAddedCourse(
  previous: DegreePlan,
  next: DegreePlan,
  termId: string,
  courseCode: string,
): PlanCourse | null {
  const normalized = courseCode.trim().toUpperCase();
  const previousIds = new Set(
    previous.terms.flatMap((term) => term.courses.map((course) => course.id)),
  );

  const term = next.terms.find((entry) => entry.id === termId);
  if (!term) return null;

  return (
    term.courses.find(
      (course) =>
        !previousIds.has(course.id) &&
        course.course_code.toUpperCase() === normalized &&
        course.entry_kind !== "stub",
    ) ?? null
  );
}

function isComplementaryPlacement(course: PlanCourse): boolean {
  return course.section_label === "Complementary Studies";
}

function persistMissingRequiredCourses(state: EditorState): void {
  writeMissingRequiredCourses(state.plan.id, state.missingRequiredCourses);
}

function syncMissingRequiredCourses(state: EditorState): void {
  const planned = listPlannedCourseCodes(state.plan);
  state.missingRequiredCourses = reconcileMissingRequiredCourses(
    state.missingRequiredCourses,
    planned,
  );
  persistMissingRequiredCourses(state);
}

function recordRemovedRequiredCourse(
  state: EditorState,
  entry: { code: string; title: string | null },
  formerTermId: string | null,
): void {
  const normalized = entry.code.trim().toUpperCase();
  const existing = state.missingRequiredCourses.find(
    (course) => course.code.trim().toUpperCase() === normalized,
  );
  if (existing) {
    existing.title = entry.title ?? existing.title;
    if (formerTermId) {
      existing.formerTermId = formerTermId;
    }
  } else {
    state.missingRequiredCourses.push({
      code: normalized,
      title: entry.title,
      formerTermId,
    });
  }
  persistMissingRequiredCourses(state);
}

function clearMissingRequiredCourse(state: EditorState, courseCode: string): void {
  const normalized = courseCode.trim().toUpperCase();
  const next = state.missingRequiredCourses.filter(
    (course) => course.code.trim().toUpperCase() !== normalized,
  );
  if (next.length === state.missingRequiredCourses.length) {
    return;
  }
  state.missingRequiredCourses = next;
  persistMissingRequiredCourses(state);
}

function updateMissingRequiredBanner(state: EditorState): void {
  updateWarningsBubble(state);
}

function createWarningsSection(title: string, tone?: "missing" | "notes" | "schedule" | "complementary"): HTMLElement {
  const section = document.createElement("section");
  section.className = "plan-warnings-section";
  if (tone) {
    section.classList.add(`plan-warnings-section--${tone}`);
  }
  const heading = document.createElement("h3");
  heading.className = "plan-warnings-section__title";
  heading.textContent = title;
  section.appendChild(heading);
  return section;
}

function appendWarningsHint(section: HTMLElement, text: string): void {
  const hint = document.createElement("p");
  hint.className = "plan-warnings-section__hint";
  hint.textContent = text;
  section.appendChild(hint);
}

function appendWarningsList(section: HTMLElement): HTMLUListElement {
  const list = document.createElement("ul");
  list.className = "plan-warnings-section__list";
  section.appendChild(list);
  return list;
}

function setWarningsBubbleOpen(open: boolean): void {
  const toggle = document.getElementById("plan-warnings-toggle");
  const panel = document.getElementById("plan-warnings-panel");
  if (!toggle || !panel) return;

  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  panel.classList.toggle("hidden", !open);
  panel.setAttribute("aria-hidden", open ? "false" : "true");
  panel.classList.toggle("plan-warnings-panel--open", open);
}

function updateWarningsBubble(state: EditorState): void {
  const toggle = document.getElementById("plan-warnings-toggle");
  const countEl = document.getElementById("plan-warnings-count");
  const body = document.getElementById("plan-warnings-body");
  if (!toggle || !countEl || !body) return;

  body.replaceChildren();
  let issueCount = 0;

  const parseWarnings = state.plan.parse_warnings ?? [];
  if (parseWarnings.length > 0) {
    issueCount += parseWarnings.length;
    const section = createWarningsSection("Parser notes", "notes");
    const list = appendWarningsList(section);
    for (const warning of parseWarnings) {
      const item = document.createElement("li");
      item.className = "plan-warnings-note";
      item.textContent = warning;
      list.appendChild(item);
    }
    body.appendChild(section);
  }

  if (state.missingRequiredCourses.length > 0) {
    issueCount += state.missingRequiredCourses.length;
    const section = createWarningsSection(
      state.missingRequiredCourses.length === 1
        ? "Missing required course"
        : "Missing required courses",
      "missing",
    );
    appendWarningsHint(
      section,
      "These checklist courses were removed from your plan. Re-add them with + Add course or drag a replacement into the same term.",
    );
    const list = appendWarningsList(section);
    for (const missing of state.missingRequiredCourses) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "plan-missing-required__item";
      button.dataset.formerTermId = missing.formerTermId ?? "";
      button.innerHTML = `<span class="plan-missing-required__code">${missing.code}</span>${
        missing.title
          ? `<span class="plan-missing-required__title-text">${missing.title}</span>`
          : ""
      }`;
      button.title = missing.formerTermId
        ? `Scroll to ${missing.code}'s former term`
        : `Removed required course: ${missing.title ? `${missing.code} — ${missing.title}` : missing.code}`;
      item.appendChild(button);
      list.appendChild(item);
    }
    body.appendChild(section);
  }

  if (state.graph) {
    const unmetPrereqs = state.graph.dependencies.filter(
      (edge) => !edge.satisfied && edge.kind === "prerequisite",
    );
    const unsatisfiedCoreqs = state.graph.dependencies.filter(
      (edge) => !edge.satisfied && edge.kind === "corequisite",
    );

    if (unmetPrereqs.length > 0) {
      issueCount += unmetPrereqs.length;
      const section = createWarningsSection("Unmet prerequisites");
      appendWarningsHint(section, "These courses are scheduled before their prerequisites.");
      const list = appendWarningsList(section);
      for (const edge of unmetPrereqs) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "plan-alert-row plan-alert-row--prereq";
        if (edge.to_course_id) {
          button.dataset.courseId = edge.to_course_id;
        }
        button.innerHTML = `
          <span class="plan-alert-row__badge" aria-hidden="true">!</span>
          <span class="plan-alert-row__content">
            <span class="plan-alert-row__title">
              <strong class="plan-alert-row__code">${edge.to}</strong>
            </span>
            <span class="plan-alert-row__detail">Requires ${edge.from} earlier in your plan</span>
          </span>`;
        button.title = edge.to_course_id ? "Show this course on the plan" : "";
        item.appendChild(button);
        list.appendChild(item);
      }
      body.appendChild(section);
    }

    if (unsatisfiedCoreqs.length > 0) {
      issueCount += unsatisfiedCoreqs.length;
      const section = createWarningsSection("Co-requisite scheduling");
      appendWarningsHint(section, "These courses should be taken in the same term.");
      const list = appendWarningsList(section);
      for (const edge of unsatisfiedCoreqs) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "plan-alert-row plan-alert-row--coreq";
        const focusId = edge.from_course_id ?? edge.to_course_id ?? "";
        if (focusId) {
          button.dataset.courseId = focusId;
        }
        button.innerHTML = `
          <span class="plan-alert-row__badge" aria-hidden="true">⟷</span>
          <span class="plan-alert-row__content">
            <span class="plan-alert-row__title">
              <strong class="plan-alert-row__code">${edge.from}</strong>
              <span class="plan-alert-row__meta">+ ${edge.to}</span>
            </span>
            <span class="plan-alert-row__detail">Not scheduled in the same term</span>
          </span>`;
        button.title = focusId ? "Show this course on the plan" : "";
        item.appendChild(button);
        list.appendChild(item);
      }
      body.appendChild(section);
    }

    const scheduleWarnings = listScheduleWarnings(state.graph);
    if (scheduleWarnings.length > 0) {
      issueCount += scheduleWarnings.length;
      const section = createWarningsSection("Season offering alerts", "schedule");
      appendWarningsHint(section, formatScheduleAlertsHint(scheduleWarnings));
      const list = appendWarningsList(section);
      for (const warning of scheduleWarnings) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "plan-alert-row plan-alert-row--schedule";
        button.dataset.courseId = warning.course_id;
        button.innerHTML = `
          <span class="plan-alert-row__badge" aria-hidden="true">S</span>
          <span class="plan-alert-row__content">
            <span class="plan-alert-row__title">
              <strong class="plan-alert-row__code">${warning.course_code}</strong>
              <span class="plan-alert-row__meta">${warning.term_label}</span>
            </span>
            <span class="plan-alert-row__detail">${formatScheduleWarningDetail(warning)}</span>
          </span>`;
        button.title = "Show this course on the plan";
        item.appendChild(button);
        list.appendChild(item);
      }
      body.appendChild(section);
    }

    if (state.expectsComplementaryStudies) {
      const warnings = listComplementaryWarnings(state.graph);
      if (warnings.length > 0) {
        const summary = summarizeComplementaryWarnings(warnings, state.plan);
        const section = createWarningsSection("Complementary studies", "complementary");
        appendWarningsHint(
          section,
          "Progress toward your uploaded complementary availability PDF and open checklist slots.",
        );

        if (state.hasComplementaryCatalog) {
          const linkRow = document.createElement("p");
          linkRow.className = "plan-warnings-section__action-row";
          const link = document.createElement("a");
          link.className = "plan-warnings-section__action";
          link.href = progressElectivesHref(state.plan.id);
          link.textContent = "View progress";
          linkRow.appendChild(link);
          section.appendChild(linkRow);
        }

        const list = appendWarningsList(section);

        if (summary.infoMessage) {
          const item = document.createElement("li");
          item.className = "plan-alert-info";
          item.textContent = summary.infoMessage;
          list.appendChild(item);
        } else {
          if (summary.creditProgress) {
            issueCount += 1;
            appendProgressBlock(
              list,
              "Complementary credits",
              summary.creditProgress.planned,
              summary.creditProgress.required,
              "warning",
            );
          }

          if (summary.subjectProgress) {
            issueCount += 1;
            appendProgressBlock(
              list,
              "Humanities / social science",
              summary.subjectProgress.planned,
              summary.subjectProgress.required,
              "accent",
            );
          }

          if (summary.openStubs.length > 0) {
            issueCount += summary.openStubs.length;
            const group = document.createElement("li");
            group.className = "plan-alert-stub-group";
            const heading = document.createElement("p");
            heading.className = "plan-alert-stub-group__title";
            heading.textContent = `Open slots (${summary.openStubs.length})`;
            group.appendChild(heading);

            const chips = document.createElement("div");
            chips.className = "plan-alert-stub-group__chips";
            for (const stub of summary.openStubs) {
              const chip = document.createElement("button");
              chip.type = "button";
              chip.className = "plan-alert-chip";
              chip.dataset.courseId = stub.courseId;
              chip.title = `Show ${stub.termLabel} slot on the plan`;
              chip.innerHTML = `<span class="plan-alert-chip__credits">${stub.credits || "?"} cr</span><span class="plan-alert-chip__term">${stub.termLabel}</span>`;
              chips.appendChild(chip);
            }
            group.appendChild(chips);
            list.appendChild(group);
          }

          if (summary.noCoursesYet) {
            issueCount += 1;
            const item = document.createElement("li");
            item.className = "plan-alert-note";
            item.textContent =
              "No complementary courses added yet — fill open slots or use Find complementary.";
            list.appendChild(item);
          }

          for (const invalid of summary.invalidCourses) {
            issueCount += 1;
            const item = document.createElement("li");
            const button = document.createElement("button");
            button.type = "button";
            button.className = "plan-alert-row plan-alert-row--complementary";
            button.dataset.courseId = invalid.courseId;
            button.innerHTML = `
              <span class="plan-alert-row__badge" aria-hidden="true">!</span>
              <span class="plan-alert-row__content">
                <span class="plan-alert-row__title">
                  <strong class="plan-alert-row__code">${invalid.courseCode}</strong>
                  <span class="plan-alert-row__meta">Not approved</span>
                </span>
                <span class="plan-alert-row__detail">Not on your uploaded complementary list or subject areas</span>
              </span>`;
            button.title = "Show this course on the plan";
            item.appendChild(button);
            list.appendChild(item);
          }
        }

        body.appendChild(section);
      }
    }
  }

  countEl.textContent = String(issueCount);
  toggle.classList.toggle("hidden", issueCount === 0);
  toggle.setAttribute(
    "aria-label",
    issueCount === 1 ? "1 plan issue" : `${issueCount} plan issues`,
  );

  if (issueCount === 0) {
    setWarningsBubbleOpen(false);
  }
}

function scrollToFormerTerm(formerTermId: string): void {
  const bubble = document.querySelector<HTMLElement>(
    `.plan-term-bubble[data-term-id="${CSS.escape(formerTermId)}"]`,
  );
  bubble?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
}

function setTrashZoneVisible(visible: boolean): void {
  const trash = document.getElementById("plan-trash-zone");
  if (!trash) return;
  trash.classList.toggle("plan-trash-zone--visible", visible);
  trash.toggleAttribute("hidden", !visible);
  trash.setAttribute("aria-hidden", visible ? "false" : "true");
}

function setTrashZoneActive(active: boolean): void {
  document.getElementById("plan-trash-zone")?.classList.toggle("plan-trash-zone--active", active);
}

function findDraggedCourseCard(courseId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `.plan-course-card[data-course-id="${CSS.escape(courseId)}"]`,
  );
}

function findCourseTermId(courseId: string): string | null {
  const card = findDraggedCourseCard(courseId);
  const list = card?.closest<HTMLElement>(".plan-course-list");
  return list?.dataset.termId ?? null;
}

function findPlanCourse(state: EditorState, courseId: string): PlanCourse | null {
  for (const term of state.plan.terms) {
    const course = term.courses.find((entry) => entry.id === courseId);
    if (course) return course;
  }
  return null;
}

function findAddedStubsInTerm(previous: DegreePlan, next: DegreePlan, termId: string): PlanCourse[] {
  const previousTerm = previous.terms.find((entry) => entry.id === termId);
  const nextTerm = next.terms.find((entry) => entry.id === termId);
  if (!previousTerm || !nextTerm) {
    return [];
  }

  const previousIds = new Set(previousTerm.courses.map((course) => course.id));
  return nextTerm.courses.filter(
    (course) => !previousIds.has(course.id) && course.entry_kind === "stub",
  );
}

function findRemovedCourseIdsInTerm(previous: DegreePlan, next: DegreePlan, termId: string): string[] {
  const previousTerm = previous.terms.find((entry) => entry.id === termId);
  const nextTerm = next.terms.find((entry) => entry.id === termId);
  if (!previousTerm || !nextTerm) {
    return [];
  }

  const nextIds = new Set(nextTerm.courses.map((course) => course.id));
  return previousTerm.courses.filter((course) => !nextIds.has(course.id)).map((course) => course.id);
}

function findChangedStubCreditsInTerm(
  previous: DegreePlan,
  next: DegreePlan,
  termId: string,
): PlanCourse[] {
  const previousTerm = previous.terms.find((entry) => entry.id === termId);
  const nextTerm = next.terms.find((entry) => entry.id === termId);
  if (!previousTerm || !nextTerm) {
    return [];
  }

  const previousById = new Map(previousTerm.courses.map((course) => [course.id, course]));
  return nextTerm.courses.filter((course) => {
    const previousCourse = previousById.get(course.id);
    return (
      previousCourse &&
      course.entry_kind === "stub" &&
      previousCourse.credits !== course.credits
    );
  });
}

function removeCourseCards(courseIds: string[]): void {
  for (const courseId of courseIds) {
    document
      .querySelector<HTMLElement>(`.plan-course-card[data-course-id="${CSS.escape(courseId)}"]`)
      ?.remove();
  }
}

function updateStubCreditsOnCard(stub: PlanCourse): void {
  const card = document.querySelector<HTMLElement>(
    `.plan-course-card[data-course-id="${CSS.escape(stub.id)}"]`,
  );
  const creditsEl = card?.querySelector<HTMLElement>(".plan-course-credits");
  if (creditsEl && stub.credits != null) {
    creditsEl.textContent = `${stub.credits} cr`;
  }
}

function termHasComplementaryStub(term: { courses: PlanCourse[] }): boolean {
  return term.courses.some((course) => isComplementaryStub(course));
}

function syncComplementaryTermMarker(termId: string, hasStub: boolean): void {
  const bubble = document.querySelector<HTMLElement>(
    `.plan-term-bubble[data-term-id="${CSS.escape(termId)}"]`,
  );
  if (!bubble) {
    return;
  }
  if (hasStub) {
    bubble.dataset.complementaryTerm = "true";
  } else {
    delete bubble.dataset.complementaryTerm;
  }
}

function syncComplementaryTermMarkers(plan: DegreePlan): void {
  for (const term of plan.terms) {
    syncComplementaryTermMarker(term.id, termHasComplementaryStub(term));
  }
}

function syncComplementaryTermMarkersAfterMove(courseId: string): void {
  const card = document.querySelector<HTMLElement>(
    `.plan-course-card[data-course-id="${CSS.escape(courseId)}"]`,
  );
  const destinationList = card?.closest<HTMLElement>(".plan-course-list[data-term-id]");
  const destinationTermId = destinationList?.dataset.termId;
  if (destinationTermId) {
    const hasStub = Boolean(
      destinationList?.querySelector('.plan-course-card[data-complementary-stub="true"]'),
    );
    syncComplementaryTermMarker(destinationTermId, hasStub);
  }

  document.querySelectorAll<HTMLElement>(".plan-term-bubble[data-term-id]").forEach((bubble) => {
    const termId = bubble.dataset.termId;
    if (!termId || termId === destinationTermId) {
      return;
    }
    const list = bubble.querySelector<HTMLElement>(`.plan-course-list[data-term-id="${CSS.escape(termId)}"]`);
    const hasStub = Boolean(
      list?.querySelector('.plan-course-card[data-complementary-stub="true"]'),
    );
    syncComplementaryTermMarker(termId, hasStub);
  });
}

function syncTermCourseDom(previous: DegreePlan, next: DegreePlan, termId: string): void {
  removeCourseCards(findRemovedCourseIdsInTerm(previous, next, termId));
  for (const stub of findChangedStubCreditsInTerm(previous, next, termId)) {
    updateStubCreditsOnCard(stub);
  }
  for (const stub of findAddedStubsInTerm(previous, next, termId)) {
    appendCourseCardToTerm(termId, stub);
  }

  const nextTerm = next.terms.find((entry) => entry.id === termId);
  if (nextTerm) {
    syncComplementaryTermMarker(termId, termHasComplementaryStub(nextTerm));
  }
}

function syncComplementaryCourseLabels(previous: DegreePlan, next: DegreePlan): void {
  const previousById = new Map(
    previous.terms.flatMap((term) => term.courses.map((course) => [course.id, course] as const)),
  );

  for (const term of next.terms) {
    for (const course of term.courses) {
      if (course.entry_kind === "stub") {
        continue;
      }

      const previousCourse = previousById.get(course.id);
      if (!previousCourse || previousCourse.section_label === course.section_label) {
        continue;
      }
      if (course.section_label !== "Complementary Studies") {
        continue;
      }

      const card = document.querySelector<HTMLElement>(
        `.plan-course-card[data-course-id="${CSS.escape(course.id)}"]`,
      );
      if (!card) {
        continue;
      }

      card.dataset.sectionLabel = course.section_label;
      if (!card.querySelector(".plan-course-remove")) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "plan-course-remove";
        removeBtn.title = `Remove ${course.course_code} from plan`;
        removeBtn.setAttribute("aria-label", `Remove ${course.course_code} from plan`);
        removeBtn.textContent = "×";
        const handle = card.querySelector(".plan-course-handle");
        if (handle) {
          card.insertBefore(removeBtn, handle);
        } else {
          card.appendChild(removeBtn);
        }
      }
    }
  }
}

function syncPlanCourseDom(previous: DegreePlan, next: DegreePlan): void {
  const termIds = new Set([
    ...previous.terms.map((term) => term.id),
    ...next.terms.map((term) => term.id),
  ]);
  for (const termId of termIds) {
    syncTermCourseDom(previous, next, termId);
  }
  syncComplementaryCourseLabels(previous, next);
}

function updateDependencySummary(state: EditorState): void {
  const el = document.getElementById("plan-dep-summary");
  if (!el) return;

  if (!state.graph) {
    el.textContent = "Loading prerequisite links…";
    return;
  }

  el.textContent = state.expectsComplementaryStudies
    ? "Click a course to see prerequisite links · season and complementary alerts are in the issues panel"
    : "Click a course to see prerequisite links · season alerts are in the issues panel";
}

function updateSelectionLegend(state: EditorState): void {
  const el = document.getElementById("plan-link-legend");
  if (!el) return;

  if (!state.selectedCourseId || !state.graph) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }

  let prereqCount = 0;
  let coreqCount = 0;
  for (const edge of state.graph.dependencies) {
    if (
      edge.kind === "prerequisite" &&
      edge.to_course_id === state.selectedCourseId
    ) {
      prereqCount += 1;
    } else if (
      edge.kind === "corequisite" &&
      (edge.from_course_id === state.selectedCourseId ||
        edge.to_course_id === state.selectedCourseId)
    ) {
      coreqCount += 1;
    }
  }

  el.classList.remove("hidden");
  el.textContent = `Blue = prerequisite (${prereqCount}) · Amber dashed = co-requisite (${coreqCount})`;
}

function updateTermWarningBadges(state: EditorState): void {
  if (!state.graph) return;

  document.querySelectorAll<HTMLElement>(".plan-term-bubble[data-term-id]").forEach((bubble) => {
    const termId = bubble.dataset.termId;
    if (!termId) return;

    const count = countScheduleWarningsForTerm(state.graph!, termId);
    const badge = bubble.querySelector<HTMLElement>(".plan-term-schedule-warn");
    if (!badge) return;

    badge.hidden = count === 0;
    badge.textContent = count > 0 ? String(count) : "";
    badge.title =
      count > 0
        ? `${count} course${count === 1 ? "" : "s"} in this term with no recorded ${bubble.dataset.season ?? "season"} offerings`
        : "";
    bubble.classList.toggle("plan-term-bubble--schedule-warn", count > 0);
  });
}

function updateWarningBadges(state: EditorState): void {
  if (!state.graph) return;

  const unmet = new Map<string, number>();
  for (const edge of state.graph.dependencies) {
    if (!edge.satisfied && edge.kind === "prerequisite" && edge.to_course_id) {
      unmet.set(edge.to_course_id, (unmet.get(edge.to_course_id) ?? 0) + 1);
    }
  }

  const scheduleByCourse = new Map<string, string>();
  for (const warning of state.graph.schedule_warnings ?? []) {
    scheduleByCourse.set(warning.course_id, warning.message);
  }

  document.querySelectorAll<HTMLElement>(".plan-course-card").forEach((card) => {
    const id = card.dataset.courseId ?? "";
    const count = unmet.get(id) ?? 0;
    const scheduleMessage = scheduleByCourse.get(id) ?? "";

    card.classList.toggle("plan-course-card--warning", count > 0);
    card.classList.toggle("plan-course-card--schedule-warn", Boolean(scheduleMessage));

    const badge = card.querySelector<HTMLElement>(".plan-course-warning");
    if (badge) {
      badge.hidden = count === 0;
      badge.title = count > 0 ? `${count} unmet prerequisite${count === 1 ? "" : "s"}` : "";
      badge.textContent = count > 0 ? "!" : "";
    }

    const scheduleBadge = card.querySelector<HTMLElement>(".plan-course-schedule-warn");
    if (scheduleBadge) {
      scheduleBadge.hidden = !scheduleMessage;
      scheduleBadge.title = scheduleMessage;
    }
  });
}

function updateCompletedStyles(state: EditorState): void {
  const completedIds = new Set<string>();
  if (state.graph) {
    for (const placement of state.graph.placements) {
      if (placement.completed) {
        completedIds.add(placement.course_id);
      }
    }
  }

  document.querySelectorAll<HTMLElement>(".plan-course-card").forEach((card) => {
    const id = card.dataset.courseId ?? "";
    const isCompleted = completedIds.has(id);
    card.classList.toggle("plan-course-card--completed", isCompleted);
    const checkbox = card.querySelector<HTMLInputElement>(".plan-course-complete");
    if (checkbox && checkbox.checked !== isCompleted) {
      checkbox.checked = isCompleted;
    }
  });
}

function highlightSelection(state: EditorState): void {
  const cards = document.querySelectorAll<HTMLElement>(".plan-course-card");
  const prereqRelated = new Set<string>();
  const coreqRelated = new Set<string>();

  if (state.selectedCourseId && state.graph) {
    for (const edge of state.graph.dependencies) {
      if (edge.to_course_id === state.selectedCourseId && edge.kind === "prerequisite") {
        if (edge.from_course_id) prereqRelated.add(edge.from_course_id);
      }
      if (edge.from_course_id === state.selectedCourseId && edge.kind === "prerequisite") {
        if (edge.to_course_id) prereqRelated.add(edge.to_course_id);
      }
      if (edge.kind === "corequisite") {
        if (edge.from_course_id === state.selectedCourseId && edge.to_course_id) {
          coreqRelated.add(edge.to_course_id);
        }
        if (edge.to_course_id === state.selectedCourseId && edge.from_course_id) {
          coreqRelated.add(edge.from_course_id);
        }
      }
    }
  }

  cards.forEach((card) => {
    const id = card.dataset.courseId ?? "";
    const selected = id === state.selectedCourseId;
    const isPrereq = prereqRelated.has(id) && !selected;
    const isCoreq = coreqRelated.has(id) && !selected;
    card.classList.toggle("plan-course-card--selected", selected);
    card.classList.toggle("plan-course-card--related-prereq", isPrereq);
    card.classList.toggle("plan-course-card--related-coreq", isCoreq);
  });

  const selectedEl = document.getElementById("plan-selected-course");
  if (!selectedEl) return;

  if (!state.selectedCourseId) {
    selectedEl.textContent = "";
    return;
  }

  const card = document.querySelector<HTMLElement>(
    `.plan-course-card[data-course-id="${CSS.escape(state.selectedCourseId)}"]`,
  );
  const scheduleWarning = state.graph
    ? scheduleWarningForCourse(state.graph, state.selectedCourseId)
    : undefined;

  let label = "";
  if (card?.dataset.courseCode) {
    label =
      card.dataset.entryKind === "stub"
        ? `Selected placeholder: ${card.querySelector(".plan-course-code")?.textContent ?? card.dataset.courseCode}`
        : `Selected: ${card.dataset.courseCode}`;
  }
  if (scheduleWarning) {
    label = label ? `${label} · ${scheduleWarning.message}` : scheduleWarning.message;
  }
  selectedEl.textContent = label;
}

function appendProgressBlock(
  parent: HTMLElement,
  label: string,
  planned: number,
  required: number,
  tone: "warning" | "accent" = "warning",
): void {
  const remaining = Math.max(0, required - planned);
  const percent = progressPercent(planned, required);
  const block = document.createElement("li");
  block.className = "plan-alert-progress";
  block.innerHTML = `
    <div class="plan-alert-progress__header">
      <span class="plan-alert-progress__label">${label}</span>
      <span class="plan-alert-progress__value">${planned} / ${required} cr${remaining > 0 ? ` · ${remaining} short` : ""}</span>
    </div>
    <div class="plan-alert-progress__track plan-alert-progress__track--${tone}" role="presentation">
      <span class="plan-alert-progress__fill" style="width: ${percent}%"></span>
    </div>`;
  parent.appendChild(block);
}

function syncComplementaryProgressLink(_state: EditorState): void {
  // Progress link is rendered inside the warnings bubble complementary section.
}

function focusComplementaryFromUrl(state: EditorState): void {
  if (!state.expectsComplementaryStudies) return;

  const params = new URLSearchParams(window.location.search);
  if (params.get("focus") !== "complementary") return;

  updateWarningsBubble(state);
  const toggle = document.getElementById("plan-warnings-toggle");
  if (toggle?.classList.contains("hidden")) {
    const toolbar = document.querySelector(".plan-complementary-toolbar");
    toolbar?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }

  setWarningsBubbleOpen(true);
  const section = document.querySelector<HTMLElement>(
    ".plan-warnings-section--complementary",
  );
  section?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  section?.classList.add("plan-warnings-section--focused");
  window.setTimeout(() => section?.classList.remove("plan-warnings-section--focused"), 1800);
}

function syncComplementaryToolbar(state: EditorState): void {
  if (!state.expectsComplementaryStudies) return;

  const findButton = document.getElementById("plan-find-complementary") as HTMLButtonElement | null;
  const label = document.getElementById("plan-complementary-label");
  if (findButton) {
    findButton.disabled = !state.hasComplementaryCatalog;
  }
  if (label) {
    const filename = state.plan.complementary_filename;
    label.textContent = filename ? `Complementary: ${filename}` : "Upload complementary PDF";
  }
  syncComplementaryProgressLink(state);
}

function syncCardChrome(state: EditorState): void {
  highlightSelection(state);
  updateWarningBadges(state);
  updateTermWarningBadges(state);
  updateWarningsBubble(state);
  updateCompletedStyles(state);
}

function clearSvg(svg: SVGSVGElement): void {
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }
}

function redrawSvg(state: EditorState, options: RedrawOptions = {}): void {
  const stage = getStage();
  const svg = getSvg();
  if (!stage || !svg) return;

  const animate = options.animate !== false;
  svg.classList.toggle("plan-deps-layer--animate", animate);

  // Nothing selected → empty SVG (cheap early exit, still size the layer).
  if (!state.selectedCourseId || !state.graph) {
    const w = stage.scrollWidth;
    const h = stage.scrollHeight;
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));
    svg.style.width = `${w}px`;
    svg.style.height = `${h}px`;
    clearSvg(svg);
    return;
  }

  const w = stage.scrollWidth;
  const h = stage.scrollHeight;
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  svg.style.width = `${w}px`;
  svg.style.height = `${h}px`;

  clearSvg(svg);

  const { prereq: prereqColor, coreq: coreqColor, warning: warningColor } = state.theme;

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.appendChild(createMarker("arrow-prereq", prereqColor));
  defs.appendChild(createMarker("arrow-prereq-warn", warningColor));
  defs.appendChild(createMarker("arrow-coreq", coreqColor));
  defs.appendChild(createMarker("arrow-coreq-warn", warningColor));
  svg.appendChild(defs);

  const stageRect = stage.getBoundingClientRect();
  const columnMap = buildColumnIndexMap(stage);
  const cardCache = new Map<string, HTMLElement | null>();
  const rectCache = new Map<string, CardRect>();

  function resolveCard(courseId: string): HTMLElement | null {
    if (cardCache.has(courseId)) return cardCache.get(courseId) ?? null;
    const card = stage!.querySelector<HTMLElement>(
      `[data-course-id="${CSS.escape(courseId)}"]`,
    );
    cardCache.set(courseId, card);
    return card;
  }

  function resolveRect(courseId: string, card: HTMLElement): CardRect {
    let rect = rectCache.get(courseId);
    if (!rect) {
      rect = getCardRect(stageRect, card);
      rectCache.set(courseId, rect);
    }
    return rect;
  }

  const layouts: EdgeLayout[] = [];

  for (const edge of state.graph.dependencies) {
    if (!edge.from_course_id || !edge.to_course_id) continue;
    if (!shouldDrawEdge(edge, state)) continue;

    const fromCard = resolveCard(edge.from_course_id);
    const toCard = resolveCard(edge.to_course_id);
    if (!fromCard || !toCard) continue;
    if (fromCard.dataset.entryKind === "stub" || toCard.dataset.entryKind === "stub") continue;

    layouts.push({
      edge,
      fromRect: resolveRect(edge.from_course_id, fromCard),
      toRect: resolveRect(edge.to_course_id, toCard),
      fromCol: getTermColumnIndex(fromCard, columnMap),
      toCol: getTermColumnIndex(toCard, columnMap),
    });
  }

  const lanes = assignLanes(layouts);
  const sortedLayouts = [...layouts].sort((a, b) => {
    if (a.edge.kind !== b.edge.kind) {
      return a.edge.kind === "corequisite" ? 1 : -1;
    }
    if (a.edge.satisfied !== b.edge.satisfied) return a.edge.satisfied ? -1 : 1;
    return 0;
  });

  const fragment = document.createDocumentFragment();

  for (const layout of sortedLayouts) {
    const { edge, fromRect, toRect, fromCol, toCol } = layout;
    const anchors = computeAnchors(fromRect, toRect, fromCol, toCol);
    const lane = lanes.get(layout) ?? 0;
    const isCoreq = edge.kind === "corequisite";

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", linkPath(anchors.from, anchors.to, lane));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("vector-effect", "non-scaling-stroke");
    path.setAttribute("data-kind", edge.kind);

    if (isCoreq) {
      path.setAttribute("stroke-width", "2.25");
      path.setAttribute("stroke-dasharray", "7 5");
      if (edge.satisfied) {
        path.setAttribute("stroke", coreqColor);
        path.setAttribute("marker-end", "url(#arrow-coreq)");
        path.setAttribute("opacity", "0.95");
      } else {
        path.setAttribute("stroke", warningColor);
        path.setAttribute("marker-end", "url(#arrow-coreq-warn)");
        path.setAttribute("opacity", "1");
      }
    } else if (edge.satisfied) {
      path.setAttribute("stroke", prereqColor);
      path.setAttribute("stroke-width", "2.25");
      path.setAttribute("marker-end", "url(#arrow-prereq)");
      path.setAttribute("opacity", "0.95");
    } else {
      path.setAttribute("stroke", warningColor);
      path.setAttribute("stroke-width", "2.5");
      path.setAttribute("marker-end", "url(#arrow-prereq-warn)");
      path.setAttribute("opacity", "1");
    }

    path.setAttribute("data-from", edge.from);
    path.setAttribute("data-to", edge.to);
    fragment.appendChild(path);
  }

  svg.appendChild(fragment);
}

/** Public entry used by callers that expect a full paint + chrome sync. */
export function drawDependencies(state: EditorState): void {
  redrawSvg(state, { animate: true });
  syncCardChrome(state);
}

function scheduleRedraw(state: EditorState, options: RedrawOptions = {}): void {
  if (options.chrome !== false) pendingChrome = true;
  if (options.animate) pendingAnimate = true;

  if (redrawRaf) return;

  redrawRaf = requestAnimationFrame(() => {
    redrawRaf = 0;
    const chrome = pendingChrome;
    const animate = pendingAnimate;
    pendingChrome = false;
    pendingAnimate = false;

    // Skip SVG work on scroll when nothing is selected.
    if (!state.selectedCourseId && !chrome) {
      const svg = getSvg();
      if (svg && svg.childNodes.length > 0) clearSvg(svg);
      return;
    }

    redrawSvg(state, { animate });
    if (chrome) syncCardChrome(state);
  });
}

function moveCourseInDom(courseId: string, targetList: HTMLElement, insertIndex: number): void {
  const card = document.querySelector<HTMLElement>(
    `.plan-course-card[data-course-id="${CSS.escape(courseId)}"]`,
  );
  if (!card) return;

  const items = [...targetList.querySelectorAll<HTMLElement>(".plan-course-card")].filter(
    (el) => el !== card,
  );
  const empty = targetList.querySelector(".plan-course-empty");
  empty?.remove();

  if (insertIndex >= items.length) {
    targetList.appendChild(card);
  } else {
    targetList.insertBefore(card, items[insertIndex]);
  }
}

function computeInsertIndex(list: HTMLElement, clientY: number): number {
  const cards = [...list.querySelectorAll<HTMLElement>(".plan-course-card")];
  for (let i = 0; i < cards.length; i++) {
    const rect = cards[i].getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (clientY < mid) return i;
  }
  return cards.length;
}

/** Diff DOM layout against in-memory plan — only ship courses that actually moved. */
function collectChangedMoves(state: EditorState): PlanLayoutMove[] {
  const previous = new Map<string, { termId: string; sortOrder: number }>();
  for (const term of state.plan.terms) {
    term.courses.forEach((course, index) => {
      previous.set(course.id, { termId: term.id, sortOrder: index });
    });
  }

  const moves: PlanLayoutMove[] = [];
  document.querySelectorAll<HTMLElement>(".plan-course-list[data-term-id]").forEach((list) => {
    const termId = list.dataset.termId;
    if (!termId) return;
    list.querySelectorAll<HTMLElement>(".plan-course-card").forEach((card, index) => {
      const courseId = card.dataset.courseId;
      if (!courseId) return;
      const prior = previous.get(courseId);
      if (!prior || prior.termId !== termId || prior.sortOrder !== index) {
        moves.push({ courseId, termId, sortOrder: index });
      }
    });
  });

  return moves;
}

async function toggleCourseCompletion(
  state: EditorState,
  courseId: string,
  completed: boolean,
): Promise<void> {
  state.saving = true;
  setStatus(completed ? "Marking complete…" : "Marking incomplete…");

  try {
    const response = await updatePlanCourseCompletion(state.plan.id, courseId, completed);
    state.plan = response.plan;
    state.graph = {
      ...response.graph,
      plan: response.plan,
      updated_at: new Date().toISOString(),
    };
    cachePlanGraphSnapshot(state.graph);
    updateDependencySummary(state);
    updateCreditDisplays(state);
    setStatus(completed ? "Marked complete" : "Marked incomplete");
    scheduleRedraw(state, { chrome: true, animate: false });
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to update completion", true);
    updateCompletedStyles(state);
  } finally {
    state.saving = false;
  }
}

async function persistLayout(state: EditorState): Promise<void> {
  const moves = collectChangedMoves(state);
  if (moves.length === 0) {
    setStatus("Layout up to date");
    return;
  }

  state.saving = true;
  setStatus("Saving layout…");

  try {
    const response = await updatePlanLayout(state.plan.id, moves);
    state.plan = response.plan;
    state.graph = {
      ...response.graph,
      plan: response.plan,
      updated_at: new Date().toISOString(),
    };
    cachePlanGraphSnapshot(state.graph);
    updateDependencySummary(state);
    updateCreditDisplays(state);
    syncComplementaryTermMarkers(state.plan);
    setStatus("Layout saved");
    scheduleRedraw(state, { chrome: true, animate: false });
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to save layout", true);
  } finally {
    state.saving = false;
  }
}

function findDropList(target: HTMLElement): HTMLElement | null {
  const list = target.closest<HTMLElement>(".plan-course-list");
  if (list) return list;

  const emptySummer = target.closest<HTMLElement>(
    ".plan-term-bubble--empty.plan-term-bubble--summer[data-checklist-year]",
  );
  return (
    emptySummer?.querySelector<HTMLElement>(".plan-course-list[data-checklist-year]") ?? null
  );
}

async function dropCourseToNewSummerTerm(
  state: EditorState,
  checklistYear: number,
  courseId: string,
  clientY: number,
): Promise<void> {
  state.saving = true;
  setStatus(`Creating summer term for year ${checklistYear}…`);

  try {
    const response = await createPlanSummerTerm(state.plan.id, checklistYear);
    applyGraphResponse(state, response);
    const term = findSummerTermForYear(response.plan, checklistYear);
    if (!term) {
      throw new Error("Summer term was not created");
    }

    replaceEmptySummerSlot(term);
    const newList = document.querySelector<HTMLElement>(
      `.plan-course-list[data-term-id="${CSS.escape(term.id)}"]`,
    );
    if (!newList) {
      throw new Error("Summer term drop zone not found");
    }

    const insertIndex = computeInsertIndex(newList, clientY);
    moveCourseInDom(courseId, newList, insertIndex);
    syncComplementaryTermMarkersAfterMove(courseId);
    updateDependencySummary(state);
    updateCreditDisplays(state);
    scheduleRedraw(state, { chrome: true, animate: false });
    await persistLayout(state);
    setStatus("Moved to summer");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to move to summer", true);
  } finally {
    state.saving = false;
  }
}

function bindDragAndDrop(state: EditorState): void {
  const root = document.getElementById("plan-editor");
  if (!root) return;

  root.addEventListener("dragstart", (event) => {
    const handle = (event.target as HTMLElement).closest(".plan-course-handle");
    if (!handle) {
      event.preventDefault();
      return;
    }

    // Avoid focus ring / stray keyboard focus on the drag affordance.
    if (handle instanceof HTMLElement) {
      handle.blur();
    }

    const card = handle.closest<HTMLElement>(".plan-course-card");
    const courseId = card?.dataset.courseId;
    if (!card || !courseId) {
      event.preventDefault();
      return;
    }

    const course = findPlanCourse(state, courseId);
    if (!course || (course.entry_kind === "stub" && !isComplementaryStubDraggable(course))) {
      event.preventDefault();
      return;
    }

    state.draggingCourseId = courseId;
    card.classList.add("plan-course-card--dragging");
    setTrashZoneVisible(true);
    event.dataTransfer?.setData("text/plain", courseId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
    }
  });

  root.addEventListener("dragend", () => {
    state.draggingCourseId = null;
    document.querySelectorAll(".plan-course-card--dragging").forEach((el) => {
      el.classList.remove("plan-course-card--dragging");
    });
    document.querySelectorAll(".plan-course-list--active").forEach((el) => {
      el.classList.remove("plan-course-list--active");
    });
    setTrashZoneActive(false);
    setTrashZoneVisible(false);
  });

  root.addEventListener("dragover", (event) => {
    if (state.draggingCourseId && (event.target as HTMLElement).closest("#plan-trash-zone")) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      setTrashZoneActive(true);
      return;
    }

    setTrashZoneActive(false);
    const list = findDropList(event.target as HTMLElement);
    if (!list || !state.draggingCourseId) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    list.classList.add("plan-course-list--active");
  });

  root.addEventListener("dragleave", (event) => {
    const trash = document.getElementById("plan-trash-zone");
    const related = event.relatedTarget as Node | null;
    if (trash && related && !trash.contains(related)) {
      setTrashZoneActive(false);
    }

    const list = findDropList(event.target as HTMLElement);
    if (!list) return;
    if (related && list.contains(related)) return;
    const emptySummer = list.closest<HTMLElement>(
      ".plan-term-bubble--empty.plan-term-bubble--summer",
    );
    if (related && emptySummer?.contains(related)) return;
    list.classList.remove("plan-course-list--active");
  });

  root.addEventListener("drop", (event) => {
    if (!state.draggingCourseId || state.saving) return;

    if ((event.target as HTMLElement).closest("#plan-trash-zone")) {
      event.preventDefault();
      setTrashZoneActive(false);

      const courseId = state.draggingCourseId;
      const course = findPlanCourse(state, courseId);
      if (!course || course.entry_kind === "stub") {
        setStatus("Checklist placeholders cannot be removed", true);
        return;
      }

      const termId = findCourseTermId(courseId);
      if (!termId) return;

      void submitRemoveCourse(state, termId, courseId, course.course_code);
      return;
    }

    const list = findDropList(event.target as HTMLElement);
    if (!list) return;
    event.preventDefault();
    list.classList.remove("plan-course-list--active");

    const courseId = state.draggingCourseId;
    const termId = list.dataset.termId;
    const checklistYear = list.dataset.checklistYear
      ? Number(list.dataset.checklistYear)
      : null;

    if (!termId && checklistYear && Number.isInteger(checklistYear)) {
      void dropCourseToNewSummerTerm(state, checklistYear, courseId, event.clientY);
      return;
    }

    if (!termId) return;

    const insertIndex = computeInsertIndex(list, event.clientY);
    moveCourseInDom(courseId, list, insertIndex);
    syncComplementaryTermMarkersAfterMove(courseId);
    scheduleRedraw(state, { chrome: true, animate: false });
    void persistLayout(state);
  });
}

function bindWarningsBubble(state: EditorState): void {
  const bubble = document.getElementById("plan-warnings-bubble");
  const toggle = document.getElementById("plan-warnings-toggle");
  const panel = document.getElementById("plan-warnings-panel");
  const body = document.getElementById("plan-warnings-body");
  if (!bubble || !toggle || !panel || !body || bubble.dataset.warningsBound === "true") return;
  bubble.dataset.warningsBound = "true";

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = toggle.getAttribute("aria-expanded") !== "true";
    setWarningsBubbleOpen(open);
  });

  panel.querySelector("[data-action='close-warnings']")?.addEventListener("click", () => {
    setWarningsBubbleOpen(false);
  });

  document.addEventListener("click", (event) => {
    if (!bubble.contains(event.target as Node)) {
      setWarningsBubbleOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setWarningsBubbleOpen(false);
      toggle.focus();
    }
  });

  body.addEventListener("click", (event) => {
    const missingButton = (event.target as HTMLElement).closest<HTMLButtonElement>(
      ".plan-missing-required__item",
    );
    const formerTermId = missingButton?.dataset.formerTermId;
    if (formerTermId) {
      scrollToFormerTerm(formerTermId);
      return;
    }

    const courseButton = (event.target as HTMLElement).closest<HTMLButtonElement>(
      ".plan-alert-row--schedule, .plan-alert-row--complementary, .plan-alert-row--prereq, .plan-alert-row--coreq, .plan-alert-chip",
    );
    const courseId = courseButton?.dataset.courseId;
    if (!courseId) return;

    state.selectedCourseId = courseId;
    scheduleRedraw(state, { chrome: true, animate: true });
    updateSelectionLegend(state);
    setWarningsBubbleOpen(false);

    const card = document.querySelector<HTMLElement>(
      `.plan-course-card[data-course-id="${CSS.escape(courseId)}"]`,
    );
    card?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  });
}

function findDefaultComplementaryTermId(plan: DegreePlan): { termId: string; label: string } | null {
  for (const term of plan.terms) {
    if (termHasComplementaryStub(term)) {
      return { termId: term.id, label: term.label };
    }
  }
  return null;
}

function openAddCourseDialog(
  state: EditorState,
  options: {
    termId: string;
    termLabel: string;
    mode: "catalog" | "complementary";
    dialog: HTMLDialogElement;
    searchInput: HTMLInputElement;
    resultsList: HTMLElement;
    searchStatus: HTMLElement | null;
    errorEl: HTMLElement | null;
    termLabelEl: HTMLElement | null;
    kickerEl: HTMLElement | null;
    titleEl: HTMLElement | null;
  },
): void {
  state.addCourseTermId = options.termId;
  state.addCourseTermLabel = options.termLabel;
  state.addCourseMode = options.mode;

  if (options.termLabelEl) {
    options.termLabelEl.textContent = `Adding to ${options.termLabel}`;
  }
  if (options.kickerEl) {
    options.kickerEl.textContent =
      options.mode === "complementary" ? "Complementary studies" : "Add to plan";
  }
  if (options.titleEl) {
    options.titleEl.textContent =
      options.mode === "complementary" ? "Search complementaries" : "Search courses";
  }
  if (options.searchInput) {
    options.searchInput.placeholder =
      options.mode === "complementary"
        ? "Complementary course code…"
        : "Course code or title…";
  }

  options.errorEl?.classList.add("hidden");
  if (options.errorEl) options.errorEl.textContent = "";
  options.dialog.showModal();
  options.searchInput.value = "";
  options.resultsList.replaceChildren();
  if (options.searchStatus) {
    options.searchStatus.textContent =
      options.mode === "complementary"
        ? "Search your uploaded complementary availability list."
        : "Type a course code or title to search.";
  }
  window.setTimeout(() => options.searchInput.focus(), 0);
}

function bindSelection(state: EditorState): void {
  const root = document.getElementById("plan-editor");
  if (!root) return;

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest(".plan-course-handle")) return;
    if (target.closest(".plan-course-complete")) return;
    if (target.closest(".plan-course-remove")) return;

    const card = target.closest(".plan-course-body")?.closest<HTMLElement>(".plan-course-card");
    if (card?.dataset.courseId) {
      state.selectedCourseId = card.dataset.courseId;
      scheduleRedraw(state, { chrome: true, animate: true });
      updateSelectionLegend(state);
      return;
    }

    if (state.selectedCourseId) {
      clearSelection(state);
    }
  });
}

function findSummerTermForYear(plan: DegreePlan, checklistYear: number): PlanTerm | null {
  return (
    plan.terms.find(
      (term) =>
        term.checklist_year === checklistYear && term.session.toLowerCase().includes("summer"),
    ) ?? null
  );
}

function replaceEmptySummerSlot(term: PlanTerm): void {
  const column = document.querySelector<HTMLElement>(
    `.plan-year-column[data-checklist-year="${CSS.escape(String(term.checklist_year))}"]`,
  );
  const emptyBubble = column?.querySelector<HTMLElement>(
    ".plan-term-bubble--summer.plan-term-bubble--empty",
  );
  if (!emptyBubble) return;

  const termSummary = summarizeTerm(term);
  const count = termSummary.courseCount;

  const bubble = document.createElement("div");
  bubble.className = "plan-term-bubble plan-term-bubble--summer";
  bubble.dataset.termId = term.id;
  bubble.dataset.season = "summer";

  bubble.innerHTML = `
    <div class="plan-term-header">
      <p class="plan-term-session">Summer</p>
      <h3 class="plan-term-title"></h3>
      <span class="plan-term-schedule-warn" hidden aria-label="Season offering warnings in this term"></span>
    </div>
    <ul class="plan-course-list" data-term-id="${term.id}" data-drop-zone>
      <li class="plan-course-empty">Drop courses here</li>
    </ul>
    <button type="button" class="plan-term-add-course" data-term-id="${term.id}" data-term-label="">
      + Add course
    </button>
    <div class="plan-term-footer">
      <span class="plan-term-count" data-term-id="${term.id}">${count} course${count === 1 ? "" : "s"}</span>
      <span class="plan-term-credits" data-term-id="${term.id}">${formatTermCredits(termSummary)}</span>
    </div>
  `;

  const titleEl = bubble.querySelector<HTMLElement>(".plan-term-title");
  if (titleEl) titleEl.textContent = term.label;

  const addButton = bubble.querySelector<HTMLButtonElement>(".plan-term-add-course");
  if (addButton) addButton.dataset.termLabel = term.label;

  if (termHasComplementaryStub(term)) {
    bubble.dataset.complementaryTerm = "true";
  }

  emptyBubble.replaceWith(bubble);
}

async function createSummerTermAndOpenAdd(
  state: EditorState,
  checklistYear: number,
  ui: {
    dialog: HTMLDialogElement;
    searchInput: HTMLInputElement;
    resultsList: HTMLElement;
    searchStatus: HTMLElement | null;
    errorEl: HTMLElement | null;
    termLabelEl: HTMLElement | null;
    kickerEl: HTMLElement | null;
    titleEl: HTMLElement | null;
    triggerButton: HTMLButtonElement;
  },
): Promise<void> {
  if (state.saving) return;

  state.saving = true;
  ui.triggerButton.disabled = true;
  setStatus(`Creating summer term for year ${checklistYear}…`);

  try {
    const response = await createPlanSummerTerm(state.plan.id, checklistYear);
    applyGraphResponse(state, response);
    const term = findSummerTermForYear(response.plan, checklistYear);
    if (!term) {
      throw new Error("Summer term was not created");
    }

    replaceEmptySummerSlot(term);
    updateDependencySummary(state);
    updateCreditDisplays(state);
    scheduleRedraw(state, { chrome: true, animate: false });

    openAddCourseDialog(state, {
      termId: term.id,
      termLabel: term.label,
      mode: "catalog",
      dialog: ui.dialog,
      searchInput: ui.searchInput,
      resultsList: ui.resultsList,
      searchStatus: ui.searchStatus,
      errorEl: ui.errorEl,
      termLabelEl: ui.termLabelEl,
      kickerEl: ui.kickerEl,
      titleEl: ui.titleEl,
    });
    setStatus("Summer term ready — search for a course to add");
  } catch (error) {
    ui.triggerButton.disabled = false;
    setStatus(error instanceof Error ? error.message : "Failed to create summer term", true);
  } finally {
    state.saving = false;
  }
}

function bindAddCourse(state: EditorState): void {
  const root = document.getElementById("plan-editor");
  const dialog = document.getElementById("plan-add-course-dialog") as HTMLDialogElement | null;
  const searchInput = document.getElementById("plan-add-course-search") as HTMLInputElement | null;
  const resultsList = document.getElementById("plan-add-course-results");
  const termLabel = document.getElementById("plan-add-course-term");
  const kickerEl = document.getElementById("plan-add-course-kicker");
  const titleEl = document.getElementById("plan-add-course-title");
  const searchStatus = document.getElementById("plan-add-course-status");
  const errorEl = document.getElementById("plan-add-course-error");
  const findComplementaryBtn = document.getElementById("plan-find-complementary");
  const searchForm = dialog?.querySelector<HTMLFormElement>(".plan-add-course-form");
  if (!root || !dialog || !searchInput || !resultsList) return;

  let searchTimer = 0;
  let searchRequest = 0;

  const closeDialog = (): void => {
    dialog.close();
    state.addCourseTermId = null;
    state.addCourseTermLabel = null;
    state.addCourseMode = "catalog";
    searchInput.value = "";
    resultsList.replaceChildren();
    if (searchStatus) searchStatus.textContent = "";
    errorEl?.classList.add("hidden");
    if (errorEl) errorEl.textContent = "";
  };

  const renderCatalogResults = (
    courses: Awaited<ReturnType<typeof fetchCourses>>["courses"],
  ): void => {
    resultsList.replaceChildren();
    const planned = listPlannedCourseCodes(state.plan);

    if (courses.length === 0) {
      const empty = document.createElement("li");
      empty.className = "plan-add-course-empty";
      empty.textContent = "No matching courses in the catalogue.";
      resultsList.appendChild(empty);
      return;
    }

    for (const course of courses) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "plan-add-course-result";
      button.dataset.courseCode = course.code;

      const code = document.createElement("span");
      code.className = "plan-add-course-result-code";
      code.textContent = course.code;
      button.appendChild(code);

      const title = document.createElement("span");
      title.className = "plan-add-course-result-title";
      title.textContent = course.title;
      button.appendChild(title);

      if (course.credits != null) {
        const credits = document.createElement("span");
        credits.className = "plan-add-course-result-credits";
        credits.textContent = `${course.credits} cr`;
        button.appendChild(credits);
      }

      if (planned.has(course.code.toUpperCase())) {
        button.disabled = true;
        button.title = "Already on your plan";
      }

      item.appendChild(button);
      resultsList.appendChild(item);
    }
  };

  const renderComplementaryResults = (
    courses: Awaited<ReturnType<typeof searchComplementaryCourses>>["courses"],
  ): void => {
    resultsList.replaceChildren();
    const planned = listPlannedCourseCodes(state.plan);

    if (courses.length === 0) {
      const empty = document.createElement("li");
      empty.className = "plan-add-course-empty";
      empty.textContent = "No matching complementary courses in your uploaded PDF.";
      resultsList.appendChild(empty);
      return;
    }

    for (const course of courses) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "plan-add-course-result";
      button.dataset.courseCode = course.code;

      const code = document.createElement("span");
      code.className = "plan-add-course-result-code";
      code.textContent = course.code;
      button.appendChild(code);

      const credits = document.createElement("span");
      credits.className = "plan-add-course-result-credits";
      credits.textContent = `${course.credits} cr`;
      button.appendChild(credits);

      if (course.counts_as_subject_area) {
        const badge = document.createElement("span");
        badge.className = "plan-add-course-result-title";
        badge.textContent = "Counts toward humanities/social science";
        button.appendChild(badge);
      }

      if (planned.has(course.code.toUpperCase())) {
        button.disabled = true;
        button.title = "Already on your plan";
      }

      item.appendChild(button);
      resultsList.appendChild(item);
    }
  };

  const runSearch = async (query: string): Promise<void> => {
    const requestId = ++searchRequest;
    if (!query.trim()) {
      resultsList.replaceChildren();
      if (searchStatus) {
        searchStatus.textContent =
          state.addCourseMode === "complementary"
            ? "Search your uploaded complementary availability list."
            : "Type a course code or title to search.";
      }
      return;
    }

    if (searchStatus) searchStatus.textContent = "Searching…";
    try {
      if (state.addCourseMode === "complementary") {
        if (!state.expectsComplementaryStudies) {
          resultsList.replaceChildren();
          if (searchStatus) searchStatus.textContent = "Type a course code or title to search.";
          return;
        }
        const { courses, total } = await searchComplementaryCourses(state.plan.id, query.trim(), 12);
        if (requestId !== searchRequest) return;
        renderComplementaryResults(courses);
        if (searchStatus) {
          searchStatus.textContent =
            total > courses.length ? `Showing ${courses.length} of ${total} matches` : `${total} match${total === 1 ? "" : "es"}`;
        }
      } else {
        const { courses, total } = await fetchCourses({ search: query.trim(), limit: 12 });
        if (requestId !== searchRequest) return;
        renderCatalogResults(courses);
        if (searchStatus) {
          searchStatus.textContent =
            total > courses.length ? `Showing ${courses.length} of ${total} matches` : `${total} match${total === 1 ? "" : "es"}`;
        }
      }
    } catch (error) {
      if (requestId !== searchRequest) return;
      resultsList.replaceChildren();
      if (searchStatus) {
        searchStatus.textContent =
          error instanceof Error ? error.message : "Search failed";
      }
    }
  };

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;

    const summerButton = target.closest<HTMLButtonElement>(".plan-term-add-summer");
    if (summerButton?.dataset.checklistYear) {
      const checklistYear = Number(summerButton.dataset.checklistYear);
      if (!Number.isInteger(checklistYear) || checklistYear < 1) return;
      void createSummerTermAndOpenAdd(state, checklistYear, {
        dialog,
        searchInput,
        resultsList,
        searchStatus,
        errorEl,
        termLabelEl: termLabel,
        kickerEl,
        titleEl,
        triggerButton: summerButton,
      });
      return;
    }

    const addButton = target.closest<HTMLElement>(".plan-term-add-course");
    if (addButton?.dataset.termId) {
      const termBubble = addButton.closest<HTMLElement>(".plan-term-bubble");
      const mode =
        state.expectsComplementaryStudies &&
        termBubble?.dataset.complementaryTerm === "true" &&
        state.hasComplementaryCatalog
          ? "complementary"
          : "catalog";
      openAddCourseDialog(state, {
        termId: addButton.dataset.termId,
        termLabel: addButton.dataset.termLabel ?? "this term",
        mode,
        dialog,
        searchInput,
        resultsList,
        searchStatus,
        errorEl,
        termLabelEl: termLabel,
        kickerEl,
        titleEl,
      });
      return;
    }

    if (target.closest("[data-action='close-add-course']")) {
      closeDialog();
      return;
    }

    const resultButton = target.closest<HTMLButtonElement>(".plan-add-course-result");
    if (resultButton?.dataset.courseCode && state.addCourseTermId && !state.saving) {
      void submitAddCourse(state, state.addCourseTermId, resultButton.dataset.courseCode, {
        closeDialog,
        errorEl,
        fromComplementary: state.addCourseMode === "complementary",
        setResultBusy: (busy) => {
          resultButton.disabled = busy;
        },
      });
    }
  });

  findComplementaryBtn?.addEventListener("click", () => {
    if (!state.expectsComplementaryStudies) return;

    const targetTerm = findDefaultComplementaryTermId(state.plan);
    if (!targetTerm) {
      setStatus("Add a complementary studies stub to your plan first, or use + Add course on a complementary term.", true);
      return;
    }
    openAddCourseDialog(state, {
      termId: targetTerm.termId,
      termLabel: targetTerm.label,
      mode: "complementary",
      dialog,
      searchInput,
      resultsList,
      searchStatus,
      errorEl,
      termLabelEl: termLabel,
      kickerEl,
      titleEl,
    });
  });

  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    resultsList.replaceChildren();
    if (searchStatus) searchStatus.textContent = "Searching…";
    const query = searchInput.value;
    searchTimer = window.setTimeout(() => {
      void runSearch(query);
    }, 250);
  });

  searchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    window.clearTimeout(searchTimer);
    void runSearch(searchInput.value);
  });

  dialog.addEventListener("close", () => {
    if (dialog.returnValue === "cancel") {
      closeDialog();
    }
  });

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog();
  });
}

async function submitRemoveCourse(
  state: EditorState,
  termId: string,
  courseId: string,
  courseCode: string,
): Promise<void> {
  const previousPlan = state.plan;
  const course = findPlanCourse(state, courseId);
  const wasRequired = course ? isRequiredPlanCourse(course) : false;
  state.saving = true;
  setStatus(`Removing ${courseCode}…`);

  try {
    const response = await removePlanCourse(state.plan.id, courseId);
    applyGraphResponse(state, response);
    syncTermCourseDom(previousPlan, response.plan, termId);
    if (response.removed_required_course) {
      recordRemovedRequiredCourse(state, response.removed_required_course, termId);
    } else if (wasRequired) {
      recordRemovedRequiredCourse(
        state,
        { code: courseCode, title: course?.title ?? null },
        termId,
      );
    }
    syncMissingRequiredCourses(state);
    updateMissingRequiredBanner(state);
    if (state.selectedCourseId === courseId) {
      clearSelection(state);
    }
    updateDependencySummary(state);
    updateCreditDisplays(state);
    updateSelectionLegend(state);
    scheduleRedraw(state, { chrome: true, animate: true });
    setStatus(`Removed ${courseCode}`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to remove course", true);
  } finally {
    state.saving = false;
  }
}

async function submitAddCourse(
  state: EditorState,
  termId: string,
  courseCode: string,
  ui: {
    closeDialog: () => void;
    errorEl: HTMLElement | null;
    fromComplementary?: boolean;
    setResultBusy: (busy: boolean) => void;
  },
): Promise<void> {
  const previousPlan = state.plan;
  state.saving = true;
  ui.setResultBusy(true);
  setStatus(`Adding ${courseCode.trim().toUpperCase()}…`);

  try {
    const response = await addPlanCourse(state.plan.id, termId, courseCode, {
      fromComplementary: ui.fromComplementary === true,
    });
    const added = findAddedCourse(previousPlan, response.plan, termId, courseCode);
    applyGraphResponse(state, response);
    syncTermCourseDom(previousPlan, response.plan, termId);
    if (added) {
      appendCourseCardToTerm(termId, added);
      state.selectedCourseId = added.id;
    }
    clearMissingRequiredCourse(state, courseCode);
    syncMissingRequiredCourses(state);
    updateMissingRequiredBanner(state);
    updateDependencySummary(state);
    updateCreditDisplays(state);
    updateSelectionLegend(state);
    scheduleRedraw(state, { chrome: true, animate: true });
    setStatus(`Added ${courseCode.trim().toUpperCase()}`);
    ui.closeDialog();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add course";
    setStatus(message, true);
    if (ui.errorEl) {
      ui.errorEl.textContent = message;
      ui.errorEl.classList.remove("hidden");
    }
  } finally {
    state.saving = false;
    ui.setResultBusy(false);
  }
}

function complementaryStatusMessage(summary: {
  listed_course_count: number;
  programme_hint: string | null;
}): string {
  const hint = summary.programme_hint ? ` (${summary.programme_hint})` : "";
  return `${summary.listed_course_count} approved courses loaded${hint}.`;
}

function bindComplementaryUpload(state: EditorState): void {
  if (!state.expectsComplementaryStudies) return;

  const input = document.getElementById("plan-complementary-input") as HTMLInputElement | null;
  const dropzone = document.getElementById("plan-complementary-dropzone");
  const statusEl = document.getElementById("plan-complementary-status");
  if (!input || !dropzone) return;

  let dragDepth = 0;

  const setUploadStatus = (message: string, isError = false): void => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = isError
      ? "plan-complementary-status text-xs text-york-red"
      : "plan-complementary-status text-xs text-york-muted";
  };

  const setActive = (active: boolean): void => {
    dropzone.classList.toggle("plan-complementary-dropzone--active", active);
  };

  const handleFile = async (file: File | null | undefined): Promise<void> => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setUploadStatus("Please upload a PDF complementary studies document.", true);
      return;
    }

    state.saving = true;
    setUploadStatus("Parsing complementary PDF…");
    const previousPlan = state.plan;
    try {
      const response = await uploadComplementaryPdf(state.plan.id, file);
      state.plan = response.plan;
      applyGraphResponse(state, response);
      syncPlanCourseDom(previousPlan, response.plan);
      updateCreditDisplays(state);
      state.hasComplementaryCatalog = true;
      syncComplementaryToolbar(state);
      updateDependencySummary(state);
      scheduleRedraw(state, { chrome: true, animate: false });
      const count =
        response.catalog &&
        typeof response.catalog === "object" &&
        "listed_courses" in response.catalog &&
        Array.isArray((response.catalog as { listed_courses: unknown[] }).listed_courses)
          ? (response.catalog as { listed_courses: unknown[] }).listed_courses.length
          : 0;
      setUploadStatus(
        count > 0
          ? `Loaded ${count} complementary courses from ${file.name}.`
          : `Loaded complementary rules from ${file.name}.`,
      );
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : "Upload failed", true);
    } finally {
      state.saving = false;
      input.value = "";
    }
  };

  const preventDefaults = (event: DragEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  };

  dropzone.addEventListener("dragenter", (event) => {
    preventDefaults(event);
    dragDepth += 1;
    setActive(true);
  });
  dropzone.addEventListener("dragover", preventDefaults);
  dropzone.addEventListener("dragleave", (event) => {
    preventDefaults(event);
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setActive(false);
  });
  dropzone.addEventListener("drop", (event) => {
    preventDefaults(event);
    dragDepth = 0;
    setActive(false);
    void handleFile(event.dataTransfer?.files?.[0]);
  });
  input.addEventListener("change", () => {
    void handleFile(input.files?.[0]);
  });
}

async function loadComplementarySummary(state: EditorState): Promise<void> {
  if (!state.expectsComplementaryStudies) return;

  const statusEl = document.getElementById("plan-complementary-status");
  try {
    const payload = await fetchComplementarySummary(state.plan.id);
    state.hasComplementaryCatalog = Boolean(payload.summary);
    state.plan.complementary_filename = payload.filename;
    syncComplementaryToolbar(state);
    if (payload.summary && statusEl) {
      statusEl.textContent = complementaryStatusMessage(payload.summary);
    }
  } catch {
    state.hasComplementaryCatalog = Boolean(state.plan.complementary_filename);
    syncComplementaryToolbar(state);
  }
}

function bindCompletionToggles(state: EditorState): void {
  const root = document.getElementById("plan-editor");
  if (!root) return;

  root.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    if (!input.classList.contains("plan-course-complete")) return;

    const card = input.closest<HTMLElement>(".plan-course-card");
    const courseId = card?.dataset.courseId;
    if (!courseId || state.saving) {
      input.checked = !input.checked;
      return;
    }

    void toggleCourseCompletion(state, courseId, input.checked);
  });
}

function bindCourseRemoval(state: EditorState): void {
  const root = document.getElementById("plan-editor");
  if (!root) return;

  root.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".plan-course-remove");
    if (!button || state.saving) return;

    event.preventDefault();
    event.stopPropagation();

    const card = button.closest<HTMLElement>(".plan-course-card");
    const courseId = card?.dataset.courseId;
    const courseCode = card?.dataset.courseCode;
    if (!courseId || !courseCode || card.dataset.sectionLabel !== "Complementary Studies") {
      return;
    }

    const list = card.closest<HTMLElement>(".plan-course-list");
    const termId = list?.dataset.termId;
    if (!termId) return;

    void submitRemoveCourse(state, termId, courseId, courseCode);
  });
}

function bindRedrawOnLayoutChange(state: EditorState): void {
  const canvas = getCanvas();
  const stage = getStage();
  if (!canvas || !stage) return;

  // Scroll/resize: SVG geometry only — never walk card chrome.
  const onScrollOrResize = () => scheduleRedraw(state, { chrome: false, animate: false });
  canvas.addEventListener("scroll", onScrollOrResize, { passive: true });
  window.addEventListener("resize", onScrollOrResize);

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(onScrollOrResize);
    observer.observe(stage);
  }
}

function applyGraphResponse(
  state: EditorState,
  response: { plan: DegreePlan; graph: Omit<PlanGraphSnapshot, "plan" | "updated_at"> },
): void {
  state.plan = response.plan;
  state.graph = {
    ...response.graph,
    plan: response.plan,
    updated_at: new Date().toISOString(),
  };
  cachePlanGraphSnapshot(state.graph);
}

async function loadGraph(state: EditorState): Promise<void> {
  // Instant paint from session cache when available, then revalidate.
  const cached = readPlanGraphSnapshot(state.plan.id);
  if (cached?.dependencies) {
    state.graph = {
      ...cached,
      plan: cached.plan ?? state.plan,
    };
    updateDependencySummary(state);
    scheduleRedraw(state, { chrome: true, animate: false });
    setStatus("Refreshing prerequisites…");
  } else {
    setStatus("Loading prerequisites…");
  }

  try {
    const response = await fetchPlanGraph(state.plan.id);
    applyGraphResponse(state, response);
    updateDependencySummary(state);
    setStatus("Click a course to see prereqs · season alerts use scraped F/W/S history");
    scheduleRedraw(state, { chrome: true, animate: false });
    updateSelectionLegend(state);
    focusComplementaryFromUrl(state);
  } catch (error) {
    if (!state.graph) {
      setStatus(
        error instanceof Error ? error.message : "Could not load prerequisite graph",
        true,
      );
      state.graph = {
        plan_id: state.plan.id,
        plan: state.plan,
        placements: [],
        dependencies: [],
        course_codes: [],
        offering_seasons: {},
        schedule_warnings: [],
        complementary_warnings: [],
        updated_at: new Date().toISOString(),
      };
      cachePlanGraphSnapshot(state.graph);
    } else {
      setStatus("Using cached prerequisites (refresh failed)", true);
    }
  }
}

export function initPlanEditor(
  plan: DegreePlan,
  preloadedGraph?: Omit<PlanGraphSnapshot, "plan" | "updated_at"> | null,
): void {
  const root = document.getElementById("plan-editor");
  if (!root) return;

  if (redrawRaf) {
    cancelAnimationFrame(redrawRaf);
    redrawRaf = 0;
    pendingChrome = false;
    pendingAnimate = false;
  }

  const state: EditorState = {
    plan,
    graph: null,
    selectedCourseId: null,
    draggingCourseId: null,
    missingRequiredCourses: reconcileMissingRequiredCourses(
      readMissingRequiredCourses(plan.id),
      listPlannedCourseCodes(plan),
    ),
    saving: false,
    addCourseTermId: null,
    addCourseTermLabel: null,
    addCourseMode: "catalog",
    hasComplementaryCatalog: Boolean(plan.complementary_filename),
    expectsComplementaryStudies: planExpectsComplementaryStudies(plan),
    theme: readThemeColors(),
  };

  document.addEventListener("yorklanes:theme-change", () => {
    state.theme = readThemeColors();
    scheduleRedraw(state, { chrome: false, animate: false });
  });

  syncComplementaryToolbar(state);
  persistMissingRequiredCourses(state);
  updateMissingRequiredBanner(state);
  bindDragAndDrop(state);
  bindWarningsBubble(state);
  bindAddCourse(state);
  bindComplementaryUpload(state);
  bindSelection(state);
  bindCompletionToggles(state);
  bindCourseRemoval(state);
  bindRedrawOnLayoutChange(state);
  void loadComplementarySummary(state).then(() => {
    focusComplementaryFromUrl(state);
  });
  if (preloadedGraph) {
    applyGraphResponse(state, { plan, graph: preloadedGraph });
    updateDependencySummary(state);
    setStatus("Click a course to see prereqs · season alerts use scraped F/W/S history");
    scheduleRedraw(state, { chrome: true, animate: false });
    updateSelectionLegend(state);
    focusComplementaryFromUrl(state);
  } else {
    void loadGraph(state);
  }
}

export function readPlanGraphFromPage(): PlanGraphResponse | null {
  const el = document.getElementById("plan-graph-ssr");
  return parseScriptJson<PlanGraphResponse>(el?.textContent ?? null);
}

export function readPlanFromPage(): DegreePlan | null {
  const el = document.getElementById("plan-data");
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as DegreePlan;
  } catch {
    return null;
  }
}

export async function bootPlanEditor(): Promise<void> {
  const root = document.getElementById("plan-editor");
  if (!root || root.dataset.planEditorReady === "true") return;
  root.dataset.planEditorReady = "true";

  const ssrGraph = readPlanGraphFromPage();
  if (ssrGraph) {
    initPlanEditor(ssrGraph.plan, ssrGraph.graph);
    return;
  }

  const embedded = readPlanFromPage();
  if (embedded) {
    initPlanEditor(embedded);
    return;
  }

  const planId = root.dataset.planId?.trim();
  if (!planId) return;

  const graphError = document.querySelector<HTMLElement>("[data-plan-graph-error]");
  if (graphError?.textContent) {
    setStatus(graphError.textContent, true);
    return;
  }

  setStatus("Loading degree plan…");
  try {
    const response = await fetchPlanGraph(planId);
    initPlanEditor(response.plan, response.graph);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not load degree plan", true);
  }
}

registerPageBoot("#plan-editor", "planEditorReady", () => {
  void bootPlanEditor();
});
