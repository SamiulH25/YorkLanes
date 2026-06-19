import type { FacultyChecklistInfo } from "../types/plan";

interface PlanSetupOptions {
  faculties: FacultyChecklistInfo[];
  apiUrl: string;
}

export function initPlanSetup({ faculties, apiUrl }: PlanSetupOptions): void {
  const facultySelect = document.getElementById("facultyKey") as HTMLSelectElement | null;
  const downloadPanel = document.getElementById("download-panel");
  const instructions = document.getElementById("faculty-instructions");
  const link = document.getElementById("faculty-link") as HTMLAnchorElement | null;
  const hint = document.getElementById("faculty-hint");
  const form = document.getElementById("checklist-form");
  const fileInput = document.getElementById("checklist") as HTMLInputElement | null;
  const dropzone = document.getElementById("upload-dropzone");
  const filePreview = document.getElementById("file-preview");
  const fileName = document.getElementById("file-name");
  const fileSize = document.getElementById("file-size");
  const fileClear = document.getElementById("file-clear");
  const status = document.getElementById("form-status");
  const submitBtn = document.getElementById("submit-btn") as HTMLButtonElement | null;
  const detectedMeta = document.getElementById("detected-meta");

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function updateFilePreview(): void {
    const file = fileInput?.files?.[0];
    if (file && filePreview && fileName && fileSize) {
      filePreview.classList.remove("hidden");
      fileName.textContent = file.name;
      fileSize.textContent = formatBytes(file.size);
      submitBtn?.removeAttribute("disabled");
      detectedMeta?.classList.remove("hidden");
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

  facultySelect?.addEventListener("change", onFacultyChange);

  dropzone?.addEventListener("click", () => fileInput?.click());
  dropzone?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput?.click();
    }
  });

  dropzone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("border-york-red", "bg-york-red/5");
  });
  dropzone?.addEventListener("dragleave", () => {
    dropzone.classList.remove("border-york-red", "bg-york-red/5");
  });
  dropzone?.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("border-york-red", "bg-york-red/5");
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped && fileInput) {
      const dt = new DataTransfer();
      dt.items.add(dropped);
      fileInput.files = dt.files;
      updateFilePreview();
    }
  });

  fileInput?.addEventListener("change", updateFilePreview);
  fileClear?.addEventListener("click", () => {
    if (fileInput) fileInput.value = "";
    updateFilePreview();
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!(form instanceof HTMLFormElement) || !fileInput?.files?.[0]) return;

    submitBtn?.setAttribute("disabled", "true");
    if (status) {
      status.classList.remove("hidden");
      status.textContent = "Parsing checklist and building your plan...";
      status.className = "mt-3 text-sm text-york-muted";
    }

    try {
      const formData = new FormData(form);
      if (!formData.get("facultyKey")) {
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
      if (status) {
        status.textContent = error instanceof Error ? error.message : "Import failed";
        status.className = "mt-3 text-sm text-york-red";
      }
      submitBtn?.removeAttribute("disabled");
    }
  });
}
