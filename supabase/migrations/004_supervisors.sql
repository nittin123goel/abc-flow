-- ============================================================
-- ABC Metals Cash Flow — Supervisor role + team hierarchy
-- Run in Supabase SQL Editor AFTER 001_init.sql
-- Idempotent: safe to re-run.
-- ============================================================

-- ===== 1. ROLE + HIERARCHY COLUMN =====

-- Allow the new 'supervisor' role
alter table public.users drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check check (role in ('admin', 'supervisor', 'employee'));

-- Which supervisor an employee reports to (null for admins/supervisors)
alter table public.users
  add column if not exists supervisor_id uuid references public.users(id) on delete set null;

create index if not exists idx_users_supervisor on public.users(supervisor_id);

-- ===== 2. HELPERS =====

-- True when the current user is the supervisor of the given employee
create or replace function public.is_supervisor_of(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = p_employee_id and supervisor_id = auth.uid()
  );
$$;

-- ===== 3. VIEWS =====

-- Employee summary now carries the managing supervisor.
-- Dropped + recreated because we add columns in the middle (CREATE OR REPLACE
-- only allows appending columns at the end).
drop view if exists public.v_employee_summary;
create view public.v_employee_summary as
select
  u.id as employee_id,
  u.full_name,
  u.employee_code,
  u.email,
  u.is_active,
  u.supervisor_id,
  s.full_name as supervisor_name,
  coalesce((select sum(amount) from public.coin_allocations where employee_id = u.id), 0) as total_allocated,
  coalesce((select sum(amount) from public.expenses where employee_id = u.id), 0) as total_spent,
  coalesce(eb.balance, 0) as balance
from public.users u
left join public.users s on s.id = u.supervisor_id
left join public.v_employee_balance eb on eb.employee_id = u.id
where u.role = 'employee';

-- ===== 4. BUSINESS-LOGIC FUNCTIONS (allow scoped supervisors) =====

-- Post a coin allocation (admin → any employee, supervisor → own team)
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
  v_role text;
  v_txn_ref text;
  v_id uuid;
  v_today date := current_date;
begin
  select role into v_role from public.users where id = v_admin_id;
  if v_role = 'supervisor' and not public.is_supervisor_of(p_employee_id) then
    raise exception 'Supervisors can only allocate to their own team';
  elsif v_role not in ('admin', 'supervisor') then
    raise exception 'Only admins or supervisors can allocate coins';
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

-- Post a balance adjustment (admin → any employee, supervisor → own team)
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
  v_role text;
  v_txn_ref text;
  v_id uuid;
  v_today date := current_date;
begin
  select role into v_role from public.users where id = v_admin_id;
  if v_role = 'supervisor' and not public.is_supervisor_of(p_employee_id) then
    raise exception 'Supervisors can only adjust their own team';
  elsif v_role not in ('admin', 'supervisor') then
    raise exception 'Only admins or supervisors can post adjustments';
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

-- ===== 5. RLS — grant supervisors scoped access (defense in depth) =====
-- (The backend uses the service-role key for reads and scopes in-handler;
--  these policies protect any direct client access via the user's JWT.)

-- USERS: supervisor may read self + their team
drop policy if exists "users_self_read" on public.users;
create policy "users_self_read" on public.users for select to authenticated
  using (
    id = auth.uid()
    or supervisor_id = auth.uid()
    or public.current_user_role() = 'admin'
  );

-- CATEGORIES: supervisors may create/manage
drop policy if exists "categories_admin_write" on public.categories;
create policy "categories_admin_write" on public.categories for all to authenticated
  using (public.current_user_role() in ('admin', 'supervisor'))
  with check (public.current_user_role() in ('admin', 'supervisor'));

-- SUBCATEGORIES: supervisors may create/manage
drop policy if exists "subcategories_admin_write" on public.subcategories;
create policy "subcategories_admin_write" on public.subcategories for all to authenticated
  using (public.current_user_role() in ('admin', 'supervisor'))
  with check (public.current_user_role() in ('admin', 'supervisor'));

-- ALLOCATIONS: supervisor may read their team's
drop policy if exists "allocations_self_read" on public.coin_allocations;
create policy "allocations_self_read" on public.coin_allocations for select to authenticated
  using (
    employee_id = auth.uid()
    or public.current_user_role() = 'admin'
    or public.is_supervisor_of(employee_id)
  );

-- EXPENSES: supervisor may read their team's
drop policy if exists "expenses_self_read" on public.expenses;
create policy "expenses_self_read" on public.expenses for select to authenticated
  using (
    employee_id = auth.uid()
    or public.current_user_role() = 'admin'
    or public.is_supervisor_of(employee_id)
  );

-- ADJUSTMENTS: supervisor may read their team's
drop policy if exists "adjustments_self_read" on public.balance_adjustments;
create policy "adjustments_self_read" on public.balance_adjustments for select to authenticated
  using (
    employee_id = auth.uid()
    or public.current_user_role() = 'admin'
    or public.is_supervisor_of(employee_id)
  );

-- LEDGER: supervisor may read wallet entries of their team
drop policy if exists "ledger_self_read" on public.ledger_entries;
create policy "ledger_self_read" on public.ledger_entries for select to authenticated
  using (
    (account_type = 'employee_wallet' and account_ref_id = auth.uid())
    or public.current_user_role() = 'admin'
    or (account_type = 'employee_wallet' and public.is_supervisor_of(account_ref_id))
  );
