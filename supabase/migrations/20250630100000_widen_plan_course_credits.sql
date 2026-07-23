-- plan_courses.credits was numeric(3, 1), which overflows above 99.9.
-- Credit-slot checklists store section totals (e.g. 120 degree credits, 48 major credits).

alter table public.plan_courses
  alter column credits type numeric(5, 1);
