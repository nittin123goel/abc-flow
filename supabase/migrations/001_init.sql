-- ============================================================
-- ABC Metals Cash Flow System — Initial Schema
-- Run this in Supabase SQL Editor (or via CLI)
-- ============================================================

-- ===== TABLES =====

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_code text unique not null,
  full_name text not null,
  email text unique not null,
  phone text,
  role text not null check (role in ('admin', 'employee')),
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text,
  is_active boolean default true,
  created_by uuid references public.users(id),
  created_at timestamptz default now()
);

create table if not exists public.subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now(),
  unique (category_id, name)
);

create table if not exists public.coin_allocations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.users(id),
  amount numeric(12,2) not null check (amount > 0),
  allocated_by uuid not null references public.users(id),
  notes text,
  txn_ref text unique not null,
  allocated_at timestamptz default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.users(id),
  amount numeric(12,2) not null check (amount > 0),
  category_id uuid not null references public.categories(id),
  subcategory_id uuid references public.subcategories(id),
  description text,
  receipt_path text,
  expense_date date not null,
  txn_ref text unique not null,
  created_at timestamptz default now()
);

create table if not exists public.balance_adjustments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.users(id),
  amount numeric(12,2) not null,
  reason text not null,
  adjusted_by uuid not null references public.users(id),
  txn_ref text unique not null,
  created_at timestamptz default now()
);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  txn_ref text not null,
  txn_type text not null check (txn_type in ('allocation', 'expense', 'adjustment')),
  account_type text not null check (account_type in ('company_cash', 'employee_wallet', 'expense_account')),
  account_ref_id uuid,
  debit numeric(12,2) not null default 0,
  credit numeric(12,2) not null default 0,
  description text,
  txn_date date not null,
  created_at timestamptz default now(),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz default now()
);

create table if not exists public.txn_counter (
  id int primary key default 1,
  counter int not null default 0,
  check (id = 1)
);

insert into public.txn_counter (id, counter) values (1, 0)
  on conflict (id) do nothing;

-- ===== INDEXES =====

create index if not exists idx_users_role on public.users(role);
create index if not exists idx_subcategories_category on public.subcategories(category_id);
create index if not exists idx_allocations_employee on public.coin_allocations(employee_id);
create index if not exists idx_allocations_date on public.coin_allocations(allocated_at);
create index if not exists idx_expenses_employee on public.expenses(employee_id);
create index if not exists idx_expenses_date on public.expenses(expense_date);
create index if not exists idx_expenses_category on public.expenses(category_id);
create index if not exists idx_ledger_txn_ref on public.ledger_entries(txn_ref);
create index if not exists idx_ledger_account on public.ledger_entries(account_type, account_ref_id);
create index if not exists idx_ledger_date on public.ledger_entries(txn_date);

-- ===== HELPER FUNCTIONS =====

-- Generate next transaction reference
create or replace function public.next_txn_ref(prefix text)
returns text
language plpgsql
as $$
declare
  next_num int;
  year_str text;
begin
  update public.txn_counter set counter = counter + 1 where id = 1 returning counter into next_num;
  year_str := to_char(now(), 'YYYY');
  return prefix || '-' || year_str || '-' || lpad(next_num::text, 6, '0');
end;
$$;

-- Get current user's role from JWT
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

-- ===== BUSINESS LOGIC FUNCTIONS =====

-- Post a coin allocation (admin → employee)
-- Creates the allocation record + double-entry ledger rows
create or replace function public.post_allocation(
  p_employee_id uuid,
  p_amount numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin_role text;
  v_txn_ref text;
  v_id uuid;
  v_today date := current_date;
begin
  select role into v_admin_role from public.users where id = v_admin_id;
  if v_admin_role is distinct from 'admin' then
    raise exception 'Only admins can allocate coins';
  end if;

  if p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  v_txn_ref := public.next_txn_ref('ALLOC');

  insert into public.coin_allocations (employee_id, amount, allocated_by, notes, txn_ref)
  values (p_employee_id, p_amount, v_admin_id, p_notes, v_txn_ref)
  returning id into v_id;

  insert into public.ledger_entries (txn_ref, txn_type, account_type, account_ref_id, debit, credit, description, txn_date)
  values
    (v_txn_ref, 'allocation', 'employee_wallet', p_employee_id, p_amount, 0, coalesce(p_notes, 'Coin allocation'), v_today),
    (v_txn_ref, 'allocation', 'company_cash', null, 0, p_amount, coalesce(p_notes, 'Coin allocation'), v_today);

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (v_admin_id, 'allocation_created', 'coin_allocations', v_id,
    jsonb_build_object('employee_id', p_employee_id, 'amount', p_amount, 'txn_ref', v_txn_ref));

  return v_id;
end;
$$;

-- Post an expense (employee)
create or replace function public.post_expense(
  p_amount numeric,
  p_category_id uuid,
  p_subcategory_id uuid,
  p_description text,
  p_expense_date date,
  p_receipt_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid := auth.uid();
  v_role text;
  v_txn_ref text;
  v_id uuid;
begin
  select role into v_role from public.users where id = v_employee_id;
  if v_role is null then
    raise exception 'User not registered';
  end if;

  if p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;
  if p_expense_date > current_date then
    raise exception 'Expense date cannot be in the future';
  end if;

  v_txn_ref := public.next_txn_ref('EXP');

  insert into public.expenses (employee_id, amount, category_id, subcategory_id, description, receipt_path, expense_date, txn_ref)
  values (v_employee_id, p_amount, p_category_id, p_subcategory_id, p_description, p_receipt_path, p_expense_date, v_txn_ref)
  returning id into v_id;

  insert into public.ledger_entries (txn_ref, txn_type, account_type, account_ref_id, debit, credit, description, txn_date)
  values
    (v_txn_ref, 'expense', 'expense_account', p_category_id, p_amount, 0, p_description, p_expense_date),
    (v_txn_ref, 'expense', 'employee_wallet', v_employee_id, 0, p_amount, p_description, p_expense_date);

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (v_employee_id, 'expense_created', 'expenses', v_id,
    jsonb_build_object('amount', p_amount, 'category_id', p_category_id, 'txn_ref', v_txn_ref));

  return v_id;
end;
$$;

-- Post a balance adjustment (admin)
create or replace function public.post_adjustment(
  p_employee_id uuid,
  p_amount numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin_role text;
  v_txn_ref text;
  v_id uuid;
  v_today date := current_date;
begin
  select role into v_admin_role from public.users where id = v_admin_id;
  if v_admin_role is distinct from 'admin' then
    raise exception 'Only admins can post adjustments';
  end if;
  if p_amount = 0 then
    raise exception 'Adjustment amount cannot be zero';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Reason is required';
  end if;

  v_txn_ref := public.next_txn_ref('ADJ');

  insert into public.balance_adjustments (employee_id, amount, reason, adjusted_by, txn_ref)
  values (p_employee_id, p_amount, p_reason, v_admin_id, v_txn_ref)
  returning id into v_id;

  if p_amount > 0 then
    insert into public.ledger_entries (txn_ref, txn_type, account_type, account_ref_id, debit, credit, description, txn_date)
    values
      (v_txn_ref, 'adjustment', 'employee_wallet', p_employee_id, p_amount, 0, 'ADJ: ' || p_reason, v_today),
      (v_txn_ref, 'adjustment', 'company_cash', null, 0, p_amount, 'ADJ: ' || p_reason, v_today);
  else
    insert into public.ledger_entries (txn_ref, txn_type, account_type, account_ref_id, debit, credit, description, txn_date)
    values
      (v_txn_ref, 'adjustment', 'company_cash', null, abs(p_amount), 0, 'ADJ: ' || p_reason, v_today),
      (v_txn_ref, 'adjustment', 'employee_wallet', p_employee_id, 0, abs(p_amount), 'ADJ: ' || p_reason, v_today);
  end if;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (v_admin_id, 'adjustment_posted', 'balance_adjustments', v_id,
    jsonb_build_object('employee_id', p_employee_id, 'amount', p_amount, 'reason', p_reason, 'txn_ref', v_txn_ref));

  return v_id;
end;
$$;

-- ===== VIEWS =====

create or replace view public.v_employee_balance as
select
  u.id as employee_id,
  u.full_name,
  u.employee_code,
  coalesce(sum(case when le.account_type = 'employee_wallet' and le.account_ref_id = u.id then le.debit - le.credit else 0 end), 0) as balance
from public.users u
left join public.ledger_entries le on le.account_type = 'employee_wallet' and le.account_ref_id = u.id
where u.role = 'employee'
group by u.id, u.full_name, u.employee_code;

create or replace view public.v_employee_summary as
select
  u.id as employee_id,
  u.full_name,
  u.employee_code,
  u.email,
  u.is_active,
  coalesce((select sum(amount) from public.coin_allocations where employee_id = u.id), 0) as total_allocated,
  coalesce((select sum(amount) from public.expenses where employee_id = u.id), 0) as total_spent,
  coalesce(eb.balance, 0) as balance
from public.users u
left join public.v_employee_balance eb on eb.employee_id = u.id
where u.role = 'employee';

-- ===== ROW LEVEL SECURITY =====

alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.subcategories enable row level security;
alter table public.coin_allocations enable row level security;
alter table public.expenses enable row level security;
alter table public.balance_adjustments enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.audit_logs enable row level security;

-- USERS
drop policy if exists "users_self_read" on public.users;
create policy "users_self_read" on public.users for select to authenticated
  using (id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "users_admin_write" on public.users;
create policy "users_admin_write" on public.users for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- CATEGORIES
drop policy if exists "categories_read_all" on public.categories;
create policy "categories_read_all" on public.categories for select to authenticated using (true);

drop policy if exists "categories_admin_write" on public.categories;
create policy "categories_admin_write" on public.categories for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- SUBCATEGORIES
drop policy if exists "subcategories_read_all" on public.subcategories;
create policy "subcategories_read_all" on public.subcategories for select to authenticated using (true);

drop policy if exists "subcategories_admin_write" on public.subcategories;
create policy "subcategories_admin_write" on public.subcategories for all to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ALLOCATIONS
drop policy if exists "allocations_self_read" on public.coin_allocations;
create policy "allocations_self_read" on public.coin_allocations for select to authenticated
  using (employee_id = auth.uid() or public.current_user_role() = 'admin');

-- (writes go through post_allocation function, no direct insert policy needed)

-- EXPENSES — employees can read own + insert own; cannot update/delete
drop policy if exists "expenses_self_read" on public.expenses;
create policy "expenses_self_read" on public.expenses for select to authenticated
  using (employee_id = auth.uid() or public.current_user_role() = 'admin');

-- (writes go through post_expense function)

-- ADJUSTMENTS
drop policy if exists "adjustments_self_read" on public.balance_adjustments;
create policy "adjustments_self_read" on public.balance_adjustments for select to authenticated
  using (employee_id = auth.uid() or public.current_user_role() = 'admin');

-- LEDGER — employees see only their wallet entries; admin sees all
drop policy if exists "ledger_self_read" on public.ledger_entries;
create policy "ledger_self_read" on public.ledger_entries for select to authenticated
  using (
    (account_type = 'employee_wallet' and account_ref_id = auth.uid())
    or public.current_user_role() = 'admin'
  );

-- AUDIT LOGS — admin only
drop policy if exists "audit_admin_read" on public.audit_logs;
create policy "audit_admin_read" on public.audit_logs for select to authenticated
  using (public.current_user_role() = 'admin');

-- ===== SEED CATEGORIES =====

insert into public.categories (name, description) values
  ('Travel & Transport', 'Vehicle, fuel, transport-related expenses'),
  ('Office & Admin', 'Stationery, utilities, office supplies'),
  ('Operations', 'Production, raw material, labor'),
  ('Marketing', 'Advertising, promotions, client meetings'),
  ('Miscellaneous', 'Other business expenses')
on conflict (name) do nothing;

insert into public.subcategories (category_id, name)
select c.id, sub.name from public.categories c
join (values
  ('Travel & Transport', 'Fuel'),
  ('Travel & Transport', 'Tolls & Parking'),
  ('Travel & Transport', 'Public Transport'),
  ('Office & Admin', 'Stationery'),
  ('Office & Admin', 'Office Snacks'),
  ('Office & Admin', 'Utility Bills'),
  ('Operations', 'Raw Material'),
  ('Operations', 'Daily Wages'),
  ('Operations', 'Equipment'),
  ('Marketing', 'Client Meeting'),
  ('Marketing', 'Print & Branding'),
  ('Miscellaneous', 'Other')
) as sub(category_name, name) on c.name = sub.category_name
on conflict (category_id, name) do nothing;
