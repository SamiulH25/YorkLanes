import type { FacultyChecklistInfo } from "../types/plan";

interface PlanSetupOptions {
  faculties: FacultyChecklistInfo[];
  apiUrl: string;
}

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".doc"];

function isAcceptedChecklist(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function init({ faculties, apiUrl }: PlanSetupOptions): void {
  const facultySelect = document.getElementById("facultyKey") as HTMLSelectElement | null;
  const downloadPanel = document.getElementById("download-panel");
  const instructions = document.getElementById("faculty-instructions");
  const link = document.getElementById("faculty-link") as HTMLAnchorElement | null;
  const hint = document.getElementById("faculty-hint");
  const form = document.getElementById("checklist-form") as HTMLFormElement | null;
  const fileInput = document.getElementById("checklist") as HTMLInputElement | null;
  const dropzone = document.getElementById("upload-dropzone");
  const filePreview = document.getElementById("file-preview");
  const fileName = document.getElementById("file-name");
  const fileSize = document.getElementById("file-size");
  const fileClear = document.getElementById("file-clear");
  const status = document.getElementById("form-status");
  const submitBtn = document.getElementById("submit-btn") as HTMLButtonElement | null;
  const detectedMeta = document.getElementById("detected-meta");

  let selectedFile: File | null = null;
  let dragDepth = 0;

  function showStatus(message: string, isError = false): void {
    if (!status) return;
    status.classList.remove("hidden");
    status.textContent = message;
    status.className = isError ? "mt-3 text-sm text-york-red" : "mt-3 text-sm text-york-muted";
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function syncInputFiles(file: File | null): void {
    if (!fileInput) return;
    if (!file) {
      fileInput.value = "";
      return;
    }
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
    } catch {
      // Some browsers block programmatic assignment; submit uses selectedFile fallback.
    }
  }

  function setSelectedFile(file: File | null): void {
    selectedFile = file;
    syncInputFiles(file);

    if (file && filePreview && fileName && fileSize) {
      filePreview.classList.remove("hidden");
      fileName.textContent = file.name;
      fileSize.textContent = formatBytes(file.size);
      submitBtn?.removeAttribute("disabled");
      detectedMeta?.classList.remove("hidden");
      status?.classList.add("hidden");
    } else {
      filePreview?.classList.add("hidden");
      detectedMeta?.classList.add("hidden");
      submitBtn?.setAttribute("disabled", "true");
    }
  }

  function onFacultyChange(): void {
    const selected = faculties.find((f) => f.key === facultySelect?.value);
    if (!selected) {
      downloadPanel?.classList.add("hidden");
      return;
    }

    downloadPanel?.classList.remove("hidden");
    if (instructions) instructions.textContent = selected.instructions;
    if (link) link.href = selected.url;
    if (hint) hint.textContent = `Accepted formats: ${selected.fileHint}`;
  }

  function setDropzoneActive(active: boolean): void {
    if (!dropzone) return;
    dropzone.classList.toggle("border-york-red", active);
    dropzone.classList.toggle("bg-york-red/5", active);
    dropzone.classList.toggle("dark:bg-york-red/10", active);
  }

  function handleIncomingFile(file: File | undefined | null): void {
    if (!file) return;
    if (!isAcceptedChecklist(file)) {
      showStatus("Please upload a PDF or DOCX checklist file.", true);
      return;
    }
    setSelectedFile(file);
  }

  function preventDragDefaults(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  }

  facultySelect?.addEventListener("change", onFacultyChange);

  // Block the browser from opening dropped files on the page or form.
  form?.addEventListener("dragenter", preventDragDefaults);
  form?.addEventListener("dragover", preventDragDefaults);
  form?.addEventListener("drop", preventDragDefaults);

  dropzone?.addEventListener("dragenter", (event) => {
    preventDragDefaults(event);
    dragDepth += 1;
    setDropzoneActive(true);
  });

  dropzone?.addEventListener("dragover", preventDragDefaults);

  dropzone?.addEventListener("dragleave", (event) => {
    preventDragDefaults(event);
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      setDropzoneActive(false);
    }
  });

  dropzone?.addEventListener("drop", (event) => {
    preventDragDefaults(event);
    dragDepth = 0;
    setDropzoneActive(false);
    handleIncomingFile(event.dataTransfer?.files?.[0]);
  });

  fileInput?.addEventListener("change", () => {
    handleIncomingFile(fileInput.files?.[0] ?? null);
  });

  fileClear?.addEventListener("click", (event) => {
    event.preventDefault();
    setSelectedFile(null);
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const file = selectedFile ?? fileInput?.files?.[0] ?? null;
    if (!file) {
      showStatus("Choose or drop a checklist file first.", true);
      return;
    }

    submitBtn?.setAttribute("disabled", "true");
    showStatus("Parsing checklist and building your plan...");

    try {
      const formData = new FormData(form);
      formData.set("checklist", file, file.name);

      const facultyKey = formData.get("facultyKey");
      if (!facultyKey) {
        formData.delete("facultyKey");
      }

      const response = await fetch(`${apiUrl}/api/plans/import`, {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Import failed");
      }

      sessionStorage.setItem("yorklanes-plan-id", payload.plan.id);
      window.location.href = `/plan?id=${payload.plan.id}`;
    } catch (error) {
      showStatus(error instanceof Error ? error.message : "Import failed", true);
      submitBtn?.removeAttribute("disabled");
    }
  });
}

export function initPlanSetup(options: PlanSetupOptions): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init(options));
  } else {
    init(options);
  }
}
