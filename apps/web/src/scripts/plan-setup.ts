const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".doc"];

interface PlanSetupOptions {
  apiUrl?: string;
}

function isAcceptedChecklist(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initPlanSetup(options: PlanSetupOptions = {}): void {
  const form = document.getElementById("checklist-form") as HTMLFormElement | null;
  const apiUrl = options.apiUrl ?? form?.dataset.apiUrl ?? "http://localhost:3001";
  const facultySelect = document.getElementById("facultyKey") as HTMLSelectElement | null;
  const facultyPanels = document.querySelectorAll<HTMLElement>("[data-faculty-panel]");
  const fileInput = document.getElementById("checklist") as HTMLInputElement | null;
  const dropzone = document.getElementById("upload-dropzone");
  const filePreview = document.getElementById("file-preview");
  const fileName = document.getElementById("file-name");
  const fileSize = document.getElementById("file-size");
  const fileClear = document.getElementById("file-clear");
  const status = document.getElementById("form-status");
  const submitBtn = document.getElementById("submit-btn") as HTMLButtonElement | null;

  let selectedFile: File | null = null;
  let dragDepth = 0;

  function showStatus(message: string, isError = false): void {
    if (!status) return;
    status.classList.remove("hidden");
    status.textContent = message;
    status.className = isError ? "mt-3 text-sm text-york-red" : "mt-3 text-sm text-york-muted";
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
      // Submit uses selectedFile fallback.
    }
  }

  function setSelectedFile(file: File | null): void {
    selectedFile = file;
    syncInputFiles(file);

    if (file && filePreview && fileName && fileSize) {
      filePreview.classList.remove("hidden");
      fileName.textContent = file.name;
      fileSize.textContent = formatBytes(file.size);
      status?.classList.add("hidden");
    } else {
      filePreview?.classList.add("hidden");
    }
  }

  function onFacultyChange(): void {
    const key = facultySelect?.value ?? "";
    facultyPanels.forEach((panel) => {
      panel.classList.toggle("hidden", panel.dataset.facultyPanel !== key);
    });
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
    event.stopPropagation();
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
      const formData = new FormData();
      formData.set("checklist", file, file.name);

      const facultyKey = facultySelect?.value;
      if (facultyKey) {
        formData.set("facultyKey", facultyKey);
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
