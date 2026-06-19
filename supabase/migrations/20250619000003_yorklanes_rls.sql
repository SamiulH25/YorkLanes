-- Row Level Security policies for YorkLanes + quickstart tables
-- Tighten these before production. Service role bypasses RLS for server-side API use.

alter table public.todos enable row level security;
alter table public.users enable row level security;
alter table public.user_programmes enable row level security;
alter table public.courses enable row level security;
alter table public.course_prerequisites enable row level security;

-- Todos: allow read for anon key demo (apps/web/src/pages/todos.astro)
create policy "todos_select_anon"
  on public.todos
  for select
  to anon, authenticated
  using (true);

create policy "todos_insert_authenticated"
  on public.todos
  for insert
  to authenticated
  with check (true);

-- Course catalogue: public read (scraped public data)
create policy "courses_select_public"
  on public.courses
  for select
  to anon, authenticated
  using (true);

create policy "course_prerequisites_select_public"
  on public.course_prerequisites
  for select
  to anon, authenticated
  using (true);

-- User-owned data: authenticated users only (placeholder until auth.uid() is wired)
create policy "users_select_own"
  on public.users
  for select
  to authenticated
  using (true);

create policy "users_insert_own"
  on public.users
  for insert
  to authenticated
  with check (true);

create policy "user_programmes_select_own"
  on public.user_programmes
  for select
  to authenticated
  using (true);

create policy "user_programmes_insert_own"
  on public.user_programmes
  for insert
  to authenticated
  with check (true);

-- Scraper and API should use the service role key for writes to courses tables.
-- Add service_role policies or disable RLS on write paths when the API uses service role.
