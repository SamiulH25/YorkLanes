-- User weekly timetables (Nabeela / schedule builder).

create table if not exists public.user_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  plan_year int not null check (plan_year > 0),
  plan_season text not null default 'all' check (plan_season in ('all', 'fall', 'winter', 'summer')),
  cdm_term text not null,
  is_active boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, plan_year, plan_season, cdm_term)
);

create table if not exists public.schedule_entries (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.user_schedules(id) on delete cascade,
  course_code text not null,
  section_code text not null,
  component_type text not null check (component_type in ('lec', 'tut', 'lab', 'sem', 'other')),
  day text not null,
  start_time time not null,
  end_time time not null,
  room text,
  campus text,
  bundle_id uuid not null,
  sort_order int not null default 0
);

create table if not exists public.schedule_course_bundles (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.user_schedules(id) on delete cascade,
  course_code text not null,
  bundle_id uuid not null,
  picks jsonb not null default '{}',
  unique (schedule_id, course_code)
);

create index if not exists idx_user_schedules_user on public.user_schedules (user_id, updated_at desc);
create index if not exists idx_schedule_entries_schedule on public.schedule_entries (schedule_id);
create index if not exists idx_schedule_entries_day_time on public.schedule_entries (schedule_id, day, start_time);

alter table public.user_schedules enable row level security;
alter table public.schedule_entries enable row level security;
alter table public.schedule_course_bundles enable row level security;

drop policy if exists "user_schedules_all" on public.user_schedules;
create policy "user_schedules_all"
  on public.user_schedules for all using (true) with check (true);

drop policy if exists "schedule_entries_all" on public.schedule_entries;
create policy "schedule_entries_all"
  on public.schedule_entries for all using (true) with check (true);

drop policy if exists "schedule_course_bundles_all" on public.schedule_course_bundles;
create policy "schedule_course_bundles_all"
  on public.schedule_course_bundles for all using (true) with check (true);
