-- Finance module (Taziz): recurring income and expense support.

alter table public.finance_entries
  add column if not exists recurrence text not null default 'none';

alter table public.finance_entries
  drop constraint if exists finance_entries_recurrence_check;

alter table public.finance_entries
  add constraint finance_entries_recurrence_check
  check (recurrence in ('none', 'weekly', 'monthly', 'yearly'));

create index if not exists idx_finance_entries_user_recurrence
  on public.finance_entries (user_id, recurrence)
  where recurrence <> 'none';
