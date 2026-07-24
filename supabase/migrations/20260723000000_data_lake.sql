-- YorkLanes data lake: raw scrape/archive files in Supabase Storage + catalog index.
-- Curated tables (courses, course_sections, …) remain the warehouse layer in Postgres.

insert into storage.buckets (id, name, public, file_size_limit)
values ('data-lake', 'data-lake', false, 52428800)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

-- Private bucket: no public object reads. Service role (scraper) uploads via REST API.
create policy "data_lake_service_insert"
  on storage.objects for insert
  to service_role
  with check (bucket_id = 'data-lake');

create policy "data_lake_service_update"
  on storage.objects for update
  to service_role
  using (bucket_id = 'data-lake')
  with check (bucket_id = 'data-lake');

create policy "data_lake_service_select"
  on storage.objects for select
  to service_role
  using (bucket_id = 'data-lake');

create policy "data_lake_service_delete"
  on storage.objects for delete
  to service_role
  using (bucket_id = 'data-lake');

-- Optional maintainer read when signed in (dashboard tooling later).
create policy "data_lake_authenticated_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'data-lake');

create table if not exists public.data_lake_catalog (
  id            uuid primary key default gen_random_uuid(),
  bucket_id     text not null default 'data-lake',
  object_path   text not null,
  dataset_kind  text not null,
  source        text,
  content_type  text,
  byte_size     bigint,
  record_count  integer,
  metadata      jsonb not null default '{}'::jsonb,
  uploaded_at   timestamptz not null default now(),
  unique (bucket_id, object_path)
);

create index if not exists idx_data_lake_catalog_kind
  on public.data_lake_catalog (dataset_kind);

create index if not exists idx_data_lake_catalog_uploaded
  on public.data_lake_catalog (uploaded_at desc);

alter table public.data_lake_catalog enable row level security;

create policy "data_lake_catalog_select_public"
  on public.data_lake_catalog for select
  to anon, authenticated
  using (true);

create policy "data_lake_catalog_service_write"
  on public.data_lake_catalog for all
  to service_role
  using (true)
  with check (true);
