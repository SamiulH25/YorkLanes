/**
 * Shared TypeScript types for dashboard data.
 *
 * EXPAND HERE: keep in sync with apps/api/src/types/dashboard.ts
 */
export interface DashboardSummary {
  user: {
    displayName: string;
    programme: string | null;
    startingYear: number | null;
  };
  progress: {
    percentComplete: number;
    label: string;
  };
  assignments: {
    upcoming: AssignmentPreview[];
    message?: string;
  };
  finance: {
    balance: number;
    income: number;
    expenses: number;
    currency: string;
    /** Selected budget month as YYYY-MM */
    month: string;
    monthSpent: number;
    monthBudget: number;
    monthRemaining: number;
    /** True when totals came from the signed-in user's finance rows */
    linked: boolean;
    message?: string;
  };
  quickLinks: QuickLink[];
}

export interface AssignmentPreview {
  id: string;
  title: string;
  dueAt: string;
  courseCode?: string;
}

export interface QuickLink {
  label: string;
  href?: string;
  featureOwner: string;
  status: "not-started" | "in-progress" | "ready";
}
