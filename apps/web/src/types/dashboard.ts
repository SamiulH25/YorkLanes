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
    completed?: number;
    total?: number;
    planId?: string;
    segments?: Array<{
      id: "major" | "generalEducation" | "electives";
      label: string;
      completed: number;
      percentOfTotal: number;
    }>;
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
  schedule: {
    today: TodayClassPreview[];
    primarySchedule?: {
      planYear: number;
      planSeason: string;
      cdmTerm: string;
    };
    /** @deprecated Use primarySchedule */
    activeSchedule?: {
      planYear: number;
      planSeason: string;
      cdmTerm: string;
    };
    hasPrimary: boolean;
    savedCount: number;
    message?: string;
  };
}

export interface AssignmentPreview {
  id: string;
  title: string;
  dueAt: string;
  courseCode?: string;
}

export interface TodayClassPreview {
  id: string;
  courseCode: string;
  sectionCode: string;
  componentType: string;
  startTime: string;
  endTime: string;
  room?: string | null;
  campus?: string | null;
  status?: "upcoming" | "in_progress" | "past";
}
