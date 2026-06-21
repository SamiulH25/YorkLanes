/**
 * Interactive degree plan editor — drag-and-drop, course selection, SVG dependency lines.
 *
 * Data: plan JSON embedded in the page (#plan-data), graph from GET /api/plans/:id/graph
 * Entry: initPlanEditor() called from apps/web/src/pages/plan/index.astro
 */
import {
  cachePlanGraphSnapshot,
  type PlanGraphSnapshot,
} from "../lib/plan-store";
import {
  fetchPlanGraph,
  updatePlanCourseCompletion,
  updatePlanLayout,
  type PlanLayoutMove,
} from "../lib/plans";
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

function getCardRect(stage: HTMLElement, card: HTMLElement): CardRect {
  const stageRect = stage.getBoundingClientRect();
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

function getTermColumnIndex(stage: HTMLElement, card: HTMLElement): number {
  const column = card.closest(".plan-term-column") as HTMLElement | null;
  if (!column) return 0;
  const columns = [...stage.querySelectorAll<HTMLElement>(".plan-term-column")];
  return columns.indexOf(column);
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
  highlightSelection(state);
  drawDependencies(state);
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

function createMarker(
  id: string,
  color: string,
): SVGMarkerElement {
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

function updateDependencySummary(state: EditorState): void {
  const el = document.getElementById("plan-dep-summary");
  if (!el || !state.graph) return;

  const total = state.graph.dependencies.length;
  const violations = state.graph.dependencies.filter(
    (d) => !d.satisfied && d.kind === "prerequisite",
  ).length;
  const coreqIssues = state.graph.dependencies.filter(
    (d) => !d.satisfied && d.kind === "corequisite",
  ).length;

  if (total === 0) {
    el.textContent = "No prerequisite or co-requisite links in catalog for these courses yet.";
    return;
  }

  const parts: string[] = [];
  if (violations > 0) {
    parts.push(`${violations} unmet prerequisite${violations === 1 ? "" : "s"}`);
  }
  if (coreqIssues > 0) {
    parts.push(`${coreqIssues} co-req scheduling issue${coreqIssues === 1 ? "" : "s"}`);
  }
  if (parts.length === 0) {
    el.textContent = `${total} catalog link${total === 1 ? "" : "s"} — click a course to inspect`;
    return;
  }
  el.textContent = `${parts.join(" · ")} — click a course for details`;
}

function updateSelectionLegend(state: EditorState): void {
  const el = document.getElementById("plan-link-legend");
  if (!el) return;

  if (!state.selectedCourseId || !state.graph) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }

  const prereqs = state.graph.dependencies.filter(
    (edge) =>
      edge.kind === "prerequisite" && edge.to_course_id === state.selectedCourseId,
  );
  const coreqs = state.graph.dependencies.filter(
    (edge) =>
      edge.kind === "corequisite" &&
      (edge.from_course_id === state.selectedCourseId ||
        edge.to_course_id === state.selectedCourseId),
  );

  el.classList.remove("hidden");
  el.textContent = `Blue = prerequisite (${prereqs.length}) · Amber dashed = co-requisite (${coreqs.length})`;
}

function updateWarningBadges(state: EditorState): void {
  if (!state.graph) return;

  const unmet = new Map<string, number>();
  for (const edge of state.graph.dependencies) {
    if (!edge.satisfied && edge.kind === "prerequisite" && edge.to_course_id) {
      unmet.set(edge.to_course_id, (unmet.get(edge.to_course_id) ?? 0) + 1);
    }
  }

  document.querySelectorAll<HTMLElement>(".plan-course-card").forEach((card) => {
    const id = card.dataset.courseId ?? "";
    const count = unmet.get(id) ?? 0;
    card.classList.toggle("plan-course-card--warning", count > 0);
    const badge = card.querySelector<HTMLElement>(".plan-course-warning");
    if (badge) {
      badge.hidden = count === 0;
      badge.title = count > 0 ? `${count} unmet prerequisite${count === 1 ? "" : "s"}` : "";
      badge.textContent = count > 0 ? "!" : "";
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
    if (checkbox) {
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
    `.plan-course-card[data-course-id="${state.selectedCourseId}"]`,
  );
  selectedEl.textContent = card?.dataset.courseCode
    ? card.dataset.entryKind === "stub"
      ? `Selected placeholder: ${card.querySelector(".plan-course-code")?.textContent ?? card.dataset.courseCode}`
      : `Selected: ${card.dataset.courseCode}`
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
  defs.appendChild(createMarker("arrow-prereq", "#60a5fa"));
  defs.appendChild(createMarker("arrow-prereq-warn", "#f87171"));
  defs.appendChild(createMarker("arrow-coreq", "#fbbf24"));
  defs.appendChild(createMarker("arrow-coreq-warn", "#fb923c"));
  svg.appendChild(defs);

  if (!state.graph) return;

  const layouts: EdgeLayout[] = [];

  for (const edge of state.graph.dependencies) {
    if (!edge.from_course_id || !edge.to_course_id) continue;
    if (!shouldDrawEdge(edge, state)) continue;

    const fromCard = stage.querySelector<HTMLElement>(
      `[data-course-id="${edge.from_course_id}"]`,
    );
    const toCard = stage.querySelector<HTMLElement>(
      `[data-course-id="${edge.to_course_id}"]`,
    );
    if (!fromCard || !toCard) continue;
    if (fromCard.dataset.entryKind === "stub" || toCard.dataset.entryKind === "stub") continue;

    layouts.push({
      edge,
      fromRect: getCardRect(stage, fromCard),
      toRect: getCardRect(stage, toCard),
      fromCol: getTermColumnIndex(stage, fromCard),
      toCol: getTermColumnIndex(stage, toCard),
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
        path.setAttribute("stroke", "#fbbf24");
        path.setAttribute("marker-end", "url(#arrow-coreq)");
        path.setAttribute("opacity", "0.95");
      } else {
        path.setAttribute("stroke", "#fb923c");
        path.setAttribute("marker-end", "url(#arrow-coreq-warn)");
        path.setAttribute("opacity", "1");
      }
    } else if (edge.satisfied) {
      path.setAttribute("stroke", "#60a5fa");
      path.setAttribute("stroke-width", "2.25");
      path.setAttribute("marker-end", "url(#arrow-prereq)");
      path.setAttribute("opacity", "0.95");
    } else {
      path.setAttribute("stroke", "#f87171");
      path.setAttribute("stroke-width", "2.5");
      path.setAttribute("marker-end", "url(#arrow-prereq-warn)");
      path.setAttribute("opacity", "1");
    }

    path.setAttribute("data-from", edge.from);
    path.setAttribute("data-to", edge.to);
    svg.appendChild(path);
  }

  highlightSelection(state);
  updateWarningBadges(state);
  updateCompletedStyles(state);
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
    setStatus(completed ? "Marked complete" : "Marked incomplete");
    drawDependencies(state);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to update completion", true);
    updateCompletedStyles(state);
  } finally {
    state.saving = false;
  }
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
    const target = event.target as HTMLElement;
    if (target.closest(".plan-course-handle")) return;
    if (target.closest(".plan-course-complete")) return;

    const card = target.closest(".plan-course-body")?.closest<HTMLElement>(".plan-course-card");
    if (card?.dataset.courseId) {
      state.selectedCourseId = card.dataset.courseId;
      highlightSelection(state);
      drawDependencies(state);
      updateSelectionLegend(state);
      return;
    }

    if (state.selectedCourseId) {
      clearSelection(state);
    }
  });
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
    setStatus("Click a course to see prereqs · tick completed courses you have already taken");
    drawDependencies(state);
    updateSelectionLegend(state);
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
  bindCompletionToggles(state);
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
