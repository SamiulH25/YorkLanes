import { getApiUrl } from "./api-url";

export interface OnboardingProgramme {
  facultyKey: string;
  programmeName: string;
  startingYear: number;
}

export interface OnboardingStatus {
  signedIn: boolean;
  completed: boolean;
  programme: {
    programmeName: string;
    startingYear: number;
  } | null;
}

export const ONBOARDING_COMPLETE_KEY = "yorklanes-onboarding-complete";
export const ONBOARDING_DRAFT_KEY = "yorklanes-onboarding-draft";

function requestInit(cookieHeader?: string | null): RequestInit {
  const headers: HeadersInit = {};
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }
  return { headers, credentials: cookieHeader ? undefined : "include" };
}

export async function fetchOnboardingStatus(
  cookieHeader?: string | null,
): Promise<OnboardingStatus> {
  try {
    const response = await fetch(`${getApiUrl()}/api/onboarding/status`, requestInit(cookieHeader));
    if (!response.ok) {
      return { signedIn: false, completed: false, programme: null };
    }
    return (await response.json()) as OnboardingStatus;
  } catch {
    return { signedIn: false, completed: false, programme: null };
  }
}

export async function saveOnboardingProgramme(
  programmeName: string,
  startingYear: number,
  cookieHeader?: string | null,
): Promise<void> {
  const response = await fetch(`${getApiUrl()}/api/onboarding/programme`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...requestInit(cookieHeader).headers },
    body: JSON.stringify({ programmeName, startingYear }),
    credentials: cookieHeader ? undefined : "include",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Failed to save programme");
  }
}

export function planSetupUrl(draft: OnboardingProgramme): string {
  const params = new URLSearchParams();
  if (draft.facultyKey) params.set("facultyKey", draft.facultyKey);
  if (draft.programmeName) params.set("programmeName", draft.programmeName);
  params.set("startingYear", String(draft.startingYear));
  const query = params.toString();
  return query ? `/plan/setup?${query}` : "/plan/setup";
}
