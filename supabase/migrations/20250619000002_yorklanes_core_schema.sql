-- YorkLanes core schema (dashboard foundation)
-- Mirrors apps/api/src/db/schema.sql. Add new feature tables here as migrations.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Auth and users
-- TODO: integrate with Supabase Auth (auth.users) or Google OAuth via API
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  google_id text unique not null,
  email text unique not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Onboarding / degree programme selection (Samiul)
-- ---------------------------------------------------------------------------
create table if not exists public.user_programmes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  programme_name text not null,
  starting_year int not null,
  created_at timestamptz not null default now(),
  unique (user_id)
);

-- ---------------------------------------------------------------------------
-- Course catalogue (Jericho + Python scraper)
-- ---------------------------------------------------------------------------
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  description text,
  credits numeric(3, 1),
  department text,
  scraped_at timestamptz not null default now()
);

create table if not exists public.course_prerequisites (
  course_id uuid not null references public.courses(id) on delete cascade,
  prerequisite_code text not null,
  primary key (course_id, prerequisite_code)
);

-- ---------------------------------------------------------------------------
-- Assignments (Sarah)
-- id, title, course_code, due_at, done
-- ---------------------------------------------------------------------------
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  title text unique not null,
  course_code text not null,
  description text,
  due_at timestamptz not null,
  done boolean not null default false
);

create index if not exists assignments_due_at_idx on public.assignments (due_at);
-- ---------------------------------------------------------------------------
-- Feature tables (add in future migrations)
-- Degree plans (Samiul): plan_terms, plan_courses
-- Schedule builder (Nabeela): schedules, schedule_sections
-- Progress tracker (Thor): requirement_progress
-- Finance module (Taziz): finance_entries
-- Assignment calendar (Sarah): assignments
-- ---------------------------------------------------------------------------

create index if not exists idx_courses_code on public.courses (code);
create index if not exists idx_courses_department on public.courses (department);
