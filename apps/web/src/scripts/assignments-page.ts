/**
 * Assignments page — client-side mutations.
 * Form POSTs do not persist reliably with Astro View Transitions (ClientRouter),
 * so saves go directly to /api/assignments from the browser (proxied with session cookies).
 */
import { registerPageBoot } from "../lib/page-boot";
import {
  createAssignment,
  deleteAssignment,
  setAssignmentDone,
  setAssignmentStarred,
  updateAssignment,
} from "../lib/assignments";

const FLASH_KEY = "yorklanes-assignments-flash";

type FlashMessage = {
  target: "form" | "edit" | "banner";
  kind: "success" | "error";
  message: string;
};

function setFlash(flash: FlashMessage): void {
  sessionStorage.setItem(FLASH_KEY, JSON.stringify(flash));
}

function readFlash(): FlashMessage | null {
  const raw = sessionStorage.getItem(FLASH_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(FLASH_KEY);
  try {
    return JSON.parse(raw) as FlashMessage;
  } catch {
    return null;
  }
}

function showFlash(flash: FlashMessage): void {
  const banner = document.getElementById("assignments-flash-banner");
  if (flash.target === "banner" && banner) {
    banner.textContent = flash.message;
    banner.classList.remove("hidden");
    banner.classList.toggle("border-emerald-500/30", flash.kind === "success");
    banner.classList.toggle("bg-emerald-500/10", flash.kind === "success");
    banner.classList.toggle("text-emerald-800", flash.kind === "success");
    banner.classList.toggle("dark:text-emerald-200", flash.kind === "success");
    banner.classList.toggle("border-york-red/30", flash.kind === "error");
    banner.classList.toggle("bg-york-red/5", flash.kind === "error");
    banner.classList.toggle("text-york-red", flash.kind === "error");
    return;
  }

  const formError = document.getElementById("assignments-form-error");
  const editError = document.getElementById("assignments-edit-error");
  const editSuccess = document.getElementById("assignments-edit-success");

  if (flash.target === "form" && formError) {
    formError.textContent = flash.message;
    formError.classList.remove("hidden");
    document.getElementById("add-assignment-form")?.classList.remove("hidden");
    document.getElementById("add-assignment-form-hint")?.classList.add("hidden");
    return;
  }

  if (flash.target === "edit" && flash.kind === "error" && editError) {
    editError.textContent = flash.message;
    editError.classList.remove("hidden");
    openEditFormFromFlash();
    return;
  }

  if (flash.target === "edit" && flash.kind === "success" && editSuccess) {
    editSuccess.textContent = flash.message;
    editSuccess.classList.remove("hidden");
    openEditFormFromFlash();
  }
}

function openEditFormFromFlash(): void {
  const editForm = document.getElementById("edit-assignment-form");
  const editHint = document.getElementById("edit-assignment-form-hint");
  editForm?.classList.remove("hidden");
  editHint?.classList.add("hidden");
}

function reloadAfterSave(flash: FlashMessage): void {
  setFlash(flash);
  window.location.reload();
}

function initAssignmentsPage(): void {
  const root = document.getElementById("assignments-root");
  if (!root || root.dataset.assignmentsInit === "true") return;
  root.dataset.assignmentsInit = "true";

  const flash = readFlash();
  if (flash) showFlash(flash);

  const showBtn = document.getElementById("show-add-assignment-form-btn");
  const hideBtn = document.getElementById("hide-add-assignment-form-btn");
  const form = document.getElementById("add-assignment-form") as HTMLFormElement | null;
  const hint = document.getElementById("add-assignment-form-hint");

  const editForm = document.getElementById("edit-assignment-form") as HTMLFormElement | null;
  const editHint = document.getElementById("edit-assignment-form-hint");
  const editHideBtn = document.getElementById("hide-edit-assignment-form-btn");
  const deleteBtn = document.getElementById("delete-assignment-btn");

  const deleteModal = document.getElementById("delete-modal");
  const cancelDeleteBtn = document.getElementById("cancel-delete-btn");
  const deleteForm = deleteModal?.querySelector("form") as HTMLFormElement | null;
  const deleteIdInput = document.getElementById("delete-id") as HTMLInputElement | null;
  const deleteTitleEl = document.getElementById("delete-title");
  const deleteCourseEl = document.getElementById("delete-course");
  const deleteDueEl = document.getElementById("delete-due");

  const editIdInput = document.getElementById("edit-id") as HTMLInputElement | null;
  const editTitleInput = document.getElementById("edit-title") as HTMLInputElement | null;
  const editCourseInput = document.getElementById("edit-course") as HTMLInputElement | null;
  const editDescriptionInput = document.getElementById("edit-description") as HTMLInputElement | null;
  const editDueInput = document.getElementById("edit-due") as HTMLInputElement | null;

  type EditData = {
    id?: string;
    title?: string;
    course?: string;
    description?: string;
    due?: string;
  };

  function formatDateForInput(dateString?: string): string {
    if (!dateString) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(dateString)) return dateString.slice(0, 10);
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function setFormOpen(open: boolean): void {
    form?.classList.toggle("hidden", !open);
    hint?.classList.toggle("hidden", open);
  }

  function setEditFormOpen(open: boolean, assignmentData: EditData | null = null): void {
    if (open && assignmentData && editIdInput) {
      editIdInput.value = assignmentData.id ?? "";
      if (editTitleInput) editTitleInput.value = assignmentData.title ?? "";
      if (editCourseInput) editCourseInput.value = assignmentData.course ?? "";
      if (editDescriptionInput) editDescriptionInput.value = assignmentData.description || "";
      if (editDueInput) editDueInput.value = formatDateForInput(assignmentData.due);

      deleteBtn?.classList.remove("hidden");
      if (deleteBtn) {
        deleteBtn.dataset.id = assignmentData.id ?? "";
        deleteBtn.dataset.title = assignmentData.title ?? "";
        deleteBtn.dataset.course = assignmentData.course ?? "";
        deleteBtn.dataset.due = assignmentData.due ?? "";
      }
    }

    editForm?.classList.toggle("hidden", !open);
    editHint?.classList.toggle("hidden", open);
    if (open) editForm?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  showBtn?.addEventListener("click", () => {
    setFormOpen(true);
    setEditFormOpen(false);
  });
  hideBtn?.addEventListener("click", () => setFormOpen(false));
  editHideBtn?.addEventListener("click", () => setEditFormOpen(false));

  document.querySelectorAll(".js-edit-trigger").forEach((item) => {
    item.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest(".js-inline-action")) return;
      const el = item as HTMLElement;
      setEditFormOpen(true, {
        id: el.dataset.id,
        title: el.dataset.title,
        course: el.dataset.course,
        description: el.dataset.description,
        due: el.dataset.due,
      });
      setFormOpen(false);
    });
  });

  document.querySelectorAll(".js-day").forEach((cell) => {
    cell.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest(".js-edit-trigger")) return;
      const date = (cell as HTMLElement).dataset.date;
      const addDueInput = document.getElementById("add-due") as HTMLInputElement | null;
      if (addDueInput && date) addDueInput.value = date;
      setFormOpen(true);
      setEditFormOpen(false);
      form?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });

  deleteBtn?.addEventListener("click", () => {
    const id = deleteBtn.dataset.id;
    if (!id || !deleteIdInput) return;
    deleteIdInput.value = id;
    if (deleteTitleEl) deleteTitleEl.textContent = deleteBtn.dataset.title || "Untitled";
    if (deleteCourseEl) deleteCourseEl.textContent = deleteBtn.dataset.course || "No course code";
    if (deleteDueEl) {
      const due = deleteBtn.dataset.due;
      deleteDueEl.textContent = due
        ? `Due: ${new Date(due).toLocaleDateString("en-CA", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          })}`
        : "";
    }
    deleteModal?.classList.remove("hidden");
  });

  cancelDeleteBtn?.addEventListener("click", () => deleteModal?.classList.add("hidden"));
  deleteModal?.addEventListener("click", (e) => {
    if (e.target === deleteModal) deleteModal.classList.add("hidden");
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.dataset.submitting === "true") return;

    const formData = new FormData(form);
    const title = formData.get("title")?.toString().trim() ?? "";
    const courseCode = formData.get("courseCode")?.toString().trim() ?? "";
    const description = formData.get("description")?.toString().trim() ?? "";
    const dueDate = formData.get("dueDate")?.toString().trim() ?? "";

    if (!title || !courseCode || !dueDate) {
      showFlash({ target: "form", kind: "error", message: "Title, course code, and due date are required." });
      return;
    }

    form.dataset.submitting = "true";
    try {
      await createAssignment({ title, courseCode, description, dueDate });
      reloadAfterSave({ target: "banner", kind: "success", message: `Added "${title}"` });
    } catch (error) {
      delete form.dataset.submitting;
      showFlash({
        target: "form",
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to add assignment.",
      });
    }
  });

  editForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (editForm.dataset.submitting === "true") return;
    const formData = new FormData(editForm);
    const id = formData.get("id")?.toString().trim() ?? "";
    const title = formData.get("title")?.toString().trim() ?? "";
    const courseCode = formData.get("courseCode")?.toString().trim() ?? "";
    const description = formData.get("description")?.toString().trim() ?? "";
    const dueDate = formData.get("dueDate")?.toString().trim() ?? "";

    if (!id) {
      showFlash({ target: "edit", kind: "error", message: "Select an assignment to edit first." });
      return;
    }

    if (!title || !courseCode || !dueDate) {
      showFlash({ target: "edit", kind: "error", message: "Title, course code, and due date are required." });
      return;
    }

    editForm.dataset.submitting = "true";
    try {
      await updateAssignment(id, { title, courseCode, description, dueDate });
      reloadAfterSave({ target: "edit", kind: "success", message: `Updated "${title}"` });
    } catch (error) {
      delete editForm.dataset.submitting;
      showFlash({
        target: "edit",
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to update assignment.",
      });
    }
  });

  deleteForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (deleteForm.dataset.submitting === "true") return;
    const formData = new FormData(deleteForm);
    const id = formData.get("id")?.toString().trim() ?? "";
    if (!id) return;

    deleteForm.dataset.submitting = "true";
    try {
      await deleteAssignment(id);
      reloadAfterSave({ target: "banner", kind: "success", message: "Assignment deleted successfully" });
    } catch (error) {
      delete deleteForm.dataset.submitting;
      deleteModal?.classList.add("hidden");
      showFlash({
        target: "edit",
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to delete assignment.",
      });
    }
  });

  document.querySelectorAll<HTMLFormElement>("form.js-inline-action").forEach((inlineForm) => {
    inlineForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (inlineForm.dataset.submitting === "true") return;

      const formData = new FormData(inlineForm);
      const action = formData.get("_action")?.toString() ?? "";
      const id = formData.get("id")?.toString() ?? "";
      if (!id) return;

      inlineForm.dataset.submitting = "true";
      try {
        if (action === "toggle-done") {
          await setAssignmentDone(id, formData.get("done")?.toString() === "true");
        } else if (action === "toggle-star") {
          await setAssignmentStarred(id, formData.get("starred")?.toString() === "true");
        } else {
          return;
        }
        window.location.reload();
      } catch (error) {
        delete inlineForm.dataset.submitting;
        showFlash({
          target: "edit",
          kind: "error",
          message: error instanceof Error ? error.message : "Failed to update assignment.",
        });
      }
    });
  });

  const editErrorEl = editForm?.closest("section")?.querySelector("#assignments-edit-error:not(.hidden)");
  if (editErrorEl) setEditFormOpen(true);
}

function bootAssignmentsPage(): void {
  const root = document.getElementById("assignments-root");
  if (!root) return;
  if (root.dataset.assignmentsInit === "true") return;
  initAssignmentsPage();
}

registerPageBoot("#assignments-root", "assignmentsInit", bootAssignmentsPage);

export { bootAssignmentsPage };
