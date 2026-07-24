-- Assignments: add starring + updated_at.
-- The edit path (updateAssignment) already writes updated_at, but the column
-- was never created — this backfills it. `starred` powers star/unstar and the
-- "starred first" ordering.

alter table public.assignments
  add column if not exists starred boolean not null default false;

alter table public.assignments
  add column if not exists updated_at timestamptz not null default now();

-- Fast path for the default ordering: starred first, then soonest due, per user.
create index if not exists idx_assignments_user_starred_due
  on public.assignments (user_id, starred desc, due_at asc);
