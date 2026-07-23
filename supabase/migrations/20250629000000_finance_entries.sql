-- Finance module (Taziz): student income and expense entries.

create table if not exists public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  label text not null,
  amount_cents integer not null check (amount_cents > 0),
  category text not null default 'Other',
  kind text not null check (kind in ('income', 'expense')),
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_finance_entries_user_created
  on public.finance_entries (user_id, created_at desc);

create index if not exists idx_finance_entries_user_kind
  on public.finance_entries (user_id, kind);

alter table public.finance_entries enable row level security;

drop policy if exists "finance_entries_all" on public.finance_entries;

create policy "finance_entries_all"
  on public.finance_entries for all using (true) with check (true);
