import {
  ONBOARDING_COMPLETE_KEY,
  ONBOARDING_DRAFT_KEY,
  planSetupUrl,
  saveOnboardingProgramme,
  type OnboardingProgramme,
} from "../lib/onboarding";

interface FacultyOption {
  key: string;
  name: string;
}

interface InitOptions {
  step: number;
  signedIn: boolean;
  faculties: FacultyOption[];
}

function readDraft(): Partial<OnboardingProgramme> | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Partial<OnboardingProgramme>) : null;
  } catch {
    return null;
  }
}

function writeDraft(draft: OnboardingProgramme): void {
  localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draft));
}

export function initOnboardingPage({ step, signedIn, faculties }: InitOptions): void {
  if (step === 2) {
    const form = document.getElementById("onboarding-programme-form");
    const draft = readDraft();

    if (draft) {
      const facultyEl = document.getElementById("facultyKey") as HTMLSelectElement | null;
      const programmeEl = document.getElementById("programmeName") as HTMLInputElement | null;
      const yearEl = document.getElementById("startingYear") as HTMLSelectElement | null;
      if (draft.facultyKey && facultyEl) facultyEl.value = draft.facultyKey;
      if (draft.programmeName && programmeEl) programmeEl.value = draft.programmeName;
      if (draft.startingYear && yearEl) yearEl.value = String(draft.startingYear);
    }

    form?.addEventListener("submit", (event) => {
      event.preventDefault();

      const facultyKey = (document.getElementById("facultyKey") as HTMLSelectElement).value;
      const programmeName = (document.getElementById("programmeName") as HTMLInputElement).value.trim();
      const startingYear = Number((document.getElementById("startingYear") as HTMLSelectElement).value);

      if (!facultyKey || !programmeName) return;

      writeDraft({ facultyKey, programmeName, startingYear });
      window.location.href = signedIn ? "/onboarding?step=4" : "/onboarding?step=3";
    });
  }

  if (step === 4) {
    if (!signedIn) {
      window.location.replace("/onboarding?step=3");
      return;
    }

    const draft = readDraft();
    const summaryBox = document.getElementById("onboarding-summary");
    const summaryProgramme = document.getElementById("summary-programme");
    const summaryFaculty = document.getElementById("summary-faculty");

    if (draft?.programmeName && summaryBox && summaryProgramme && summaryFaculty) {
      summaryBox.classList.remove("hidden");
      summaryProgramme.textContent = `${draft.programmeName} · ${draft.startingYear ?? ""}`;
      const faculty = faculties.find((item) => item.key === draft.facultyKey);
      summaryFaculty.textContent = faculty?.name ?? draft.facultyKey ?? "";
    }

    document.getElementById("onboarding-finish-btn")?.addEventListener("click", async () => {
      const errorEl = document.getElementById("onboarding-finish-error");
      const btn = document.getElementById("onboarding-finish-btn") as HTMLButtonElement | null;

      if (!draft?.programmeName || !draft.facultyKey || !draft.startingYear) {
        if (errorEl) {
          errorEl.textContent = "Go back to step 2 and enter your faculty and programme.";
          errorEl.classList.remove("hidden");
        }
        return;
      }

      if (!signedIn) {
        if (errorEl) {
          errorEl.textContent = "Sign in first before importing a checklist.";
          errorEl.classList.remove("hidden");
        }
        return;
      }

      if (btn) btn.disabled = true;
      if (errorEl) errorEl.classList.add("hidden");

      try {
        await saveOnboardingProgramme(draft.programmeName, draft.startingYear);
        localStorage.setItem(ONBOARDING_COMPLETE_KEY, "1");
        window.location.href = planSetupUrl(draft as OnboardingProgramme);
      } catch (error) {
        if (errorEl) {
          errorEl.textContent = error instanceof Error ? error.message : "Something went wrong";
          errorEl.classList.remove("hidden");
        }
        if (btn) btn.disabled = false;
      }
    });
  }
}
