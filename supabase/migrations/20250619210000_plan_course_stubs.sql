-- Placeholder entries for complementary / elective checklist sections

alter table public.plan_courses
  add column if not exists entry_kind text not null default 'course';

alter table public.plan_courses
  add column if not exists section_label text;

comment on column public.plan_courses.entry_kind is 'course = concrete code; stub = checklist placeholder (complementary, electives, etc.)';
