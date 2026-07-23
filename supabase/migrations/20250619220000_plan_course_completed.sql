-- Track completed courses in the degree plan editor

alter table public.plan_courses
  add column if not exists completed boolean not null default false;

create index if not exists idx_plan_courses_completed on public.plan_courses (completed)
  where completed = true;
