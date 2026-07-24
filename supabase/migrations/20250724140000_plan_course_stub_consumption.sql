-- Track which complementary stub slot a course consumed (decrement case only).

alter table public.plan_courses
  add column if not exists consumed_stub_id uuid references public.plan_courses (id) on delete set null;

comment on column public.plan_courses.consumed_stub_id is
  'When a complementary course partially consumed a stub (e.g. 6cr -> 3cr), points at the remaining stub row.';
