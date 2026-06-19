-- Idempotent RLS fix: replace legacy anon/authenticated-only policies if present.
-- Also safe when 20250619190000 already created degree_plans_all policies.

drop policy if exists "degree_plans_all_dev" on public.degree_plans;
drop policy if exists "plan_terms_all_dev" on public.plan_terms;
drop policy if exists "plan_courses_all_dev" on public.plan_courses;

drop policy if exists "degree_plans_all" on public.degree_plans;
drop policy if exists "plan_terms_all" on public.plan_terms;
drop policy if exists "plan_courses_all" on public.plan_courses;

create policy "degree_plans_all"
  on public.degree_plans for all using (true) with check (true);

create policy "plan_terms_all"
  on public.plan_terms for all using (true) with check (true);

create policy "plan_courses_all"
  on public.plan_courses for all using (true) with check (true);
