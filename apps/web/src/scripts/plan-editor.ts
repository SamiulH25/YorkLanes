import {
  cachePlanGraphSnapshot,
  type PlanGraphSnapshot,
} from "../lib/plan-store";
import { fetchPlanGraph, updatePlanLayout, type PlanLayoutMove } from "../lib/plans";
import type { DegreePlan } from "../types/plan";

interface EditorState {
  plan: DegreePlan;
  graph: PlanGraphSnapshot | null;
  selectedCourseId: string | null;
  draggingCourseId: string | null;
  saving: boolean;
}

function getStage(): HTMLElement | null {
  return document.getElementById("plan-editor-stage");
}

function getCanvas(): HTMLElement | null {
  return document.getElementById("plan-editor-canvas");
}

function getSvg(): SVGSVGElement | null {
  return document.getElementById("plan-deps-svg") as SVGSVGElement | null;
}

function relativeRect(container: HTMLElement, el: HTMLElement) {
  const c = container.getBoundingClientRect();
  const e = el.getBoundingClientRect();
  return {
    left: e.left - c.left + container.scrollLeft,
    top: e.top - c.top + container.scrollTop,
    width: e.width,
    height: e.height,
  };
}

function curvePath(fromX: number, fromY: number, toX: number, toY: number): string {
  const midY = (fromY + toY) / 2;
  return `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;
}

function setStatus(message: string, isError = false): void {
  const el = document.getElementById("plan-editor-status");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("text-york-red", isError);
  el.classList.toggle("text-york-muted", !isError);
}

function updateDependencySummary(state: EditorState): void {
  const el = document.getElementById("plan-dep-summary");
  if (!el || !state.graph) return;

  const total = state.graph.dependencies.length;
  const violations = state.graph.dependencies.filter((d) => !d.satisfied).length;

  if (total === 0) {
    el.textContent = "No prerequisite links in catalog for these courses yet.";
    return;
  }

  el.textContent =
    violations === 0
      ? `${total} prerequisite link${total === 1 ? "" : "s"} — all satisfied`
      : `${violations} of ${total} prerequisite link${total === 1 ? "" : "s"} out of order`;
}

function highlightSelection(state: EditorState): void {
  const cards = document.querySelectorAll<HTMLElement>(".plan-course-card");
  const relatedIds = new Set<string>();

  if (state.selectedCourseId && state.graph) {
    relatedIds.add(state.selectedCourseId);
    for (const edge of state.graph.dependencies) {
      if (edge.from_course_id === state.selectedCourseId) {
        if (edge.to_course_id) relatedIds.add(edge.to_course_id);
      }
      if (edge.to_course_id === state.selectedCourseId) {
        if (edge.from_course_id) relatedIds.add(edge.from_course_id);
      }
    }
  }

  cards.forEach((card) => {
    const id = card.dataset.courseId ?? "";
    const selected = id === state.selectedCourseId;
    const related = relatedIds.has(id) && !selected;
    card.classList.toggle("plan-course-card--selected", selected);
    card.classList.toggle("plan-course-card--related", related);
  });

  const selectedEl = document.getElementById("plan-selected-course");
  if (!selectedEl) return;

  if (!state.selectedCourseId) {
    selectedEl.textContent = "";
    return;
  }

  const card = document.querySelector<HTMLElement>(
    `.plan-course-card[data-course-id="${state.selectedCourseId}"]`,
  );
  selectedEl.textContent = card?.dataset.courseCode
    ? `Selected: ${card.dataset.courseCode}`
    : "";
}

export function drawDependencies(state: EditorState): void {
  const stage = getStage();
  const svg = getSvg();
  if (!stage || !svg) return;

  const w = stage.scrollWidth;
  const h = stage.scrollHeight;
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  svg.style.width = `${w}px`;
  svg.style.height = `${h}px`;

  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  for (const [id, color] of [
    ["arrow-ok", "#6b7280"],
    ["arrow-bad", "#c41230"],
    ["arrow-highlight", "#c41230"],
  ] as const) {
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", id);
    marker.setAttribute("markerWidth", "8");
    marker.setAttribute("markerHeight", "8");
    marker.setAttribute("refX", "6");
    marker.setAttribute("refY", "4");
    marker.setAttribute("orient", "auto");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M0,0 L8,4 L0,8 Z");
    path.setAttribute("fill", color);
    marker.appendChild(path);
    defs.appendChild(marker);
  }
  svg.appendChild(defs);

  if (!state.graph) return;

  const canvas = getCanvas();
  if (!canvas) return;

  for (const edge of state.graph.dependencies) {
    if (!edge.from_course_id || !edge.to_course_id) continue;

    const fromCard = stage.querySelector<HTMLElement>(
      `[data-course-id="${edge.from_course_id}"]`,
    );
    const toCard = stage.querySelector<HTMLElement>(
      `[data-course-id="${edge.to_course_id}"]`,
    );
    if (!fromCard || !toCard) continue;

    const fromRect = relativeRect(canvas, fromCard);
    const toRect = relativeRect(canvas, toCard);
    const fromX = fromRect.left + fromRect.width / 2;
    const fromY = fromRect.top + fromRect.height;
    const toX = toRect.left + toRect.width / 2;
    const toY = toRect.top;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", curvePath(fromX, fromY, toX, toY));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-width", "2");

    const selected =
      state.selectedCourseId === edge.from_course_id ||
      state.selectedCourseId === edge.to_course_id;

    if (selected) {
      path.setAttribute("stroke", "#c41230");
      path.setAttribute("marker-end", "url(#arrow-highlight)");
      path.setAttribute("opacity", "1");
    } else if (edge.satisfied) {
      path.setAttribute("stroke", "#9ca3af");
      path.setAttribute("marker-end", "url(#arrow-ok)");
      path.setAttribute("opacity", "0.55");
    } else {
      path.setAttribute("stroke", "#c41230");
      path.setAttribute("marker-end", "url(#arrow-bad)");
      path.setAttribute("opacity", "0.85");
    }

    path.setAttribute("data-from", edge.from);
    path.setAttribute("data-to", edge.to);
    svg.appendChild(path);
  }

  highlightSelection(state);
}

function moveCourseInDom(courseId: string, targetList: HTMLElement, insertIndex: number): void {
  const card = document.querySelector<HTMLElement>(`.plan-course-card[data-course-id="${courseId}"]`);
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

async function persistLayout(state: EditorState): Promise<void> {
  const moves: PlanLayoutMove[] = [];
  document.querySelectorAll<HTMLElement>(".plan-course-list[data-term-id]").forEach((list) => {
    const termId = list.dataset.termId;
    if (!termId) return;
    list.querySelectorAll<HTMLElement>(".plan-course-card").forEach((card, index) => {
      const courseId = card.dataset.courseId;
      if (courseId) moves.push({ courseId, termId, sortOrder: index });
    });
  });

  if (moves.length === 0) return;

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
    setStatus("Layout saved");
    drawDependencies(state);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to save layout", true);
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

    const card = handle.closest<HTMLElement>(".plan-course-card");
    const courseId = card?.dataset.courseId;
    if (!courseId) {
      event.preventDefault();
      return;
    }

    state.draggingCourseId = courseId;
    card?.classList.add("plan-course-card--dragging");
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
  });

  root.addEventListener("dragover", (event) => {
    const list = (event.target as HTMLElement).closest<HTMLElement>(".plan-course-list");
    if (!list || !state.draggingCourseId) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    list.classList.add("plan-course-list--active");
  });

  root.addEventListener("dragleave", (event) => {
    const list = (event.target as HTMLElement).closest<HTMLElement>(".plan-course-list");
    if (!list) return;
    const related = event.relatedTarget as Node | null;
    if (related && list.contains(related)) return;
    list.classList.remove("plan-course-list--active");
  });

  root.addEventListener("drop", (event) => {
    const list = (event.target as HTMLElement).closest<HTMLElement>(".plan-course-list");
    if (!list || !state.draggingCourseId || state.saving) return;
    event.preventDefault();
    list.classList.remove("plan-course-list--active");

    const termId = list.dataset.termId;
    const courseId = state.draggingCourseId;
    if (!termId) return;

    const insertIndex = computeInsertIndex(list, event.clientY);
    moveCourseInDom(courseId, list, insertIndex);
    drawDependencies(state);
    void persistLayout(state);
  });
}

function bindSelection(state: EditorState): void {
  const root = document.getElementById("plan-editor");
  if (!root) return;

  root.addEventListener("click", (event) => {
    const handle = (event.target as HTMLElement).closest(".plan-course-handle");
    if (handle) return;

    const body = (event.target as HTMLElement).closest(".plan-course-body");
    const card = body?.closest<HTMLElement>(".plan-course-card");
    if (!card) {
      state.selectedCourseId = null;
      highlightSelection(state);
      drawDependencies(state);
      return;
    }

    const courseId = card.dataset.courseId ?? null;
    state.selectedCourseId = state.selectedCourseId === courseId ? null : courseId;
    highlightSelection(state);
    drawDependencies(state);
  });
}

function bindRedrawOnLayoutChange(state: EditorState): void {
  const canvas = getCanvas();
  const stage = getStage();
  if (!canvas || !stage) return;

  const redraw = () => drawDependencies(state);
  canvas.addEventListener("scroll", redraw, { passive: true });
  window.addEventListener("resize", redraw);

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(redraw);
    observer.observe(stage);
  }
}

async function loadGraph(state: EditorState): Promise<void> {
  setStatus("Loading prerequisites…");
  try {
    const response = await fetchPlanGraph(state.plan.id);
    state.plan = response.plan;
    state.graph = {
      ...response.graph,
      plan: response.plan,
      updated_at: new Date().toISOString(),
    };
    cachePlanGraphSnapshot(state.graph);
    updateDependencySummary(state);
    setStatus("Drag courses by the handle · click a card to highlight prerequisites");
    drawDependencies(state);
  } catch (error) {
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
      updated_at: new Date().toISOString(),
    };
    cachePlanGraphSnapshot(state.graph);
  }
}

export function initPlanEditor(plan: DegreePlan): void {
  const root = document.getElementById("plan-editor");
  if (!root) return;

  const state: EditorState = {
    plan,
    graph: null,
    selectedCourseId: null,
    draggingCourseId: null,
    saving: false,
  };

  bindDragAndDrop(state);
  bindSelection(state);
  bindRedrawOnLayoutChange(state);
  void loadGraph(state);
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
