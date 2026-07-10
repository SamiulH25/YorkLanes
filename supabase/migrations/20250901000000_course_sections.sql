-- Course section timetables (scraped from York CDM "York Courses" site)
-- Kept separate from the manual `schedules` builder feature.

create table if not exists public.course_sections (
  id            uuid primary key default gen_random_uuid(),
  term          text not null,
  course_code   text not null,
  section_code  text not null,
  day           text not null,                 -- 'MON'..'FRI'
  start_time    time not null,
  end_time      time not null,
  duration      interval generated always as (end_time - start_time) stored,
  campus        text,
  room          text,
  instructor    text,
  delivery_mode text,
  scraped_at    timestamptz not null default now(),
  unique (term, course_code, section_code, day, start_time, end_time)
);

create index if not exists idx_course_sections_course      on public.course_sections (course_code);
create index if not exists idx_course_sections_term        on public.course_sections (term);
create index if not exists idx_course_sections_course_term on public.course_sections (course_code, term);

alter table public.course_sections enable row level security;

create policy "course_sections_select_public"
  on public.course_sections for select
  to anon, authenticated
  using (true);
