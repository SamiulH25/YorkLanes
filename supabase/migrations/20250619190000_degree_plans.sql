-- Degree plan editor (Samiul): parsed checklists and user plans

create table if not exists public.degree_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  faculty_key text not null,
  programme_name text,
  starting_year int not null,
  source_filename text,
  source_type text,
  parse_warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_terms (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.degree_plans(id) on delete cascade,
  label text not null,
  session text not null,
  academic_year int not null,
  checklist_year int not null,
  sort_order int not null
);

create table if not exists public.plan_courses (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.plan_terms(id) on delete cascade,
  course_code text not null,
  credits numeric(3, 1),
  title text,
  checklist_year int,
  sort_order int not null default 0
);

create index if not exists idx_degree_plans_user on public.degree_plans (user_id);
create index if not exists idx_plan_terms_plan on public.plan_terms (plan_id);
create index if not exists idx_plan_courses_term on public.plan_courses (term_id);

alter table public.degree_plans enable row level security;
alter table public.plan_terms enable row level security;
alter table public.plan_courses enable row level security;

create policy "degree_plans_all"
  on public.degree_plans for all using (true) with check (true);

create policy "plan_terms_all"
  on public.plan_terms for all using (true) with check (true);

create policy "plan_courses_all"
  on public.plan_courses for all using (true) with check (true);
