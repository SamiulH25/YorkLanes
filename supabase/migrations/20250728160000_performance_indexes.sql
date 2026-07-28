-- Performance indexes for hot API query paths.

CREATE INDEX IF NOT EXISTS idx_degree_plans_user_updated
  ON public.degree_plans (user_id, updated_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_entries_user_occurred
  ON public.finance_entries (user_id, occurred_on DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_entries_user_expense_occurred
  ON public.finance_entries (user_id, occurred_on)
  WHERE kind = 'expense';

CREATE INDEX IF NOT EXISTS idx_assignments_user_pending_due
  ON public.assignments (user_id, due_at)
  WHERE done = false;

CREATE INDEX IF NOT EXISTS idx_user_schedules_user_active_updated
  ON public.user_schedules (user_id, updated_at DESC)
  WHERE is_active = true;
