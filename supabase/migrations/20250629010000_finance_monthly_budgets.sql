-- Finance module (Taziz): monthly budget targets.

create table if not exists public.finance_monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  amount_cents integer not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_finance_monthly_budgets_user_month
  on public.finance_monthly_budgets (user_id, month)
  where user_id is not null;

create unique index if not exists idx_finance_monthly_budgets_guest_month
  on public.finance_monthly_budgets (month)
  where user_id is null;

alter table public.finance_monthly_budgets enable row level security;

drop policy if exists "finance_monthly_budgets_all" on public.finance_monthly_budgets;

create policy "finance_monthly_budgets_all"
  on public.finance_monthly_budgets for all using (true) with check (true);
