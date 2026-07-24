-- Per-plan complementary studies catalogue parsed from faculty PDF uploads

alter table public.degree_plans
  add column if not exists complementary_filename text,
  add column if not exists complementary_catalog jsonb;

comment on column public.degree_plans.complementary_filename is
  'Original filename of the uploaded complementary studies availability PDF';
comment on column public.degree_plans.complementary_catalog is
  'Parsed complementary studies rules, subject areas, and listed courses';
