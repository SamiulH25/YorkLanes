-- The assignments table itself is created in 20250619000002_yorklanes_core_schema.sql;

alter table public.assignments
  add column if not exists user_id uuid references public.users(id) on delete cascade;

alter table public.assignments
  add column if not exists created_at timestamptz not null default now();

-- Titles are unique per user, not globally: two courses may share an assignment name.
alter table public.assignments
  drop constraint if exists assignments_title_key;

create index if not exists idx_assignments_user_due
  on public.assignments (user_id, due_at);

alter table public.assignments enable row level security;

drop policy if exists "assignments_all" on public.assignments;

create policy "assignments_all"
  on public.assignments for all using (true) with check (true);
