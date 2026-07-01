import express from 'express';
import { supabaseAdmin, supabaseForUser } from '../config/supabase.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  exportLedgerExcel, exportLedgerPDF,
  exportExpensesExcel, exportExpensesPDF,
} from '../services/export.js';

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'supervisor'));

// Employee IDs the requester may see/act on.
// Returns null for admins (meaning "all employees"), or an array
// (possibly empty) of employee ids for supervisors (their own team).
async function teamScope(req) {
  if (req.user.role === 'admin') return null;
  const { data } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('supervisor_id', req.user.id)
    .eq('role', 'employee');
  return (data || []).map((u) => u.id);
}

// ===== EMPLOYEES =====

router.get('/employees', async (req, res) => {
  let q = supabaseAdmin.from('v_employee_summary').select('*').order('full_name');
  if (req.user.role === 'supervisor') q = q.eq('supervisor_id', req.user.id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Supervisors (admin only) — used for management + the assign-supervisor dropdown
router.get('/supervisors', requireRole('admin'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, full_name, email, employee_code, is_active')
    .eq('role', 'supervisor')
    .order('full_name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Create a supervisor (admin only)
router.post('/supervisors', requireRole('admin'), async (req, res) => {
  const { email, password, full_name, employee_code, phone } = req.body;
  if (!email || !password || !full_name || !employee_code) {
    return res.status(400).json({ error: 'email, password, full_name, employee_code required' });
  }

  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email, password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (authErr) return res.status(400).json({ error: authErr.message });

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('users')
    .insert({
      id: authData.user.id,
      email, full_name, employee_code, phone,
      role: 'supervisor',
      is_active: true,
    })
    .select()
    .single();

  if (profileErr) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return res.status(400).json({ error: profileErr.message });
  }
  res.json(profile);
});

// Create new employee — creates auth user + public.users row
router.post('/employees', async (req, res) => {
  const { email, password, full_name, employee_code, phone } = req.body;
  if (!email || !password || !full_name || !employee_code) {
    return res.status(400).json({ error: 'email, password, full_name, employee_code required' });
  }

  // Determine the managing supervisor. Supervisors always create under
  // themselves; admins must pick an existing supervisor.
  let supervisor_id;
  if (req.user.role === 'supervisor') {
    supervisor_id = req.user.id;
  } else {
    supervisor_id = req.body.supervisor_id;
    if (!supervisor_id) {
      return res.status(400).json({ error: 'supervisor_id is required' });
    }
    const { data: sup } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('id', supervisor_id)
      .single();
    if (!sup || sup.role !== 'supervisor') {
      return res.status(400).json({ error: 'supervisor_id must reference a valid supervisor' });
    }
  }

  // 1. Create auth user
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email, password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (authErr) return res.status(400).json({ error: authErr.message });

  // 2. Create public.users row
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('users')
    .insert({
      id: authData.user.id,
      email, full_name, employee_code, phone,
      role: 'employee',
      supervisor_id,
      is_active: true,
    })
    .select()
    .single();

  if (profileErr) {
    // rollback auth user
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return res.status(400).json({ error: profileErr.message });
  }
  res.json(profile);
});

// Loads a user the requester is allowed to manage as an employee.
// Admin → any employee; supervisor → only their own team. Returns null otherwise.
async function loadManageableEmployee(req, id) {
  const { data: target } = await supabaseAdmin
    .from('users')
    .select('id, role, supervisor_id')
    .eq('id', id)
    .single();
  if (!target || target.role !== 'employee') return null;
  if (req.user.role === 'admin') return target;
  if (target.supervisor_id === req.user.id) return target;
  return null;
}

router.patch('/employees/:id', async (req, res) => {
  const target = await loadManageableEmployee(req, req.params.id);
  if (!target) return res.status(403).json({ error: 'Not allowed to manage this employee' });

  const { full_name, phone, is_active } = req.body;
  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ full_name, phone, is_active, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Reset a password — admin resets employees & supervisors; supervisor resets own team
router.post('/employees/:id/password', async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }

  const { data: target } = await supabaseAdmin
    .from('users')
    .select('id, role, supervisor_id')
    .eq('id', req.params.id)
    .single();
  if (!target) return res.status(404).json({ error: 'User not found' });

  const canReset =
    req.user.role === 'admin'
      ? target.role !== 'admin' // admin may reset supervisors + employees, not other admins
      : target.role === 'employee' && target.supervisor_id === req.user.id; // supervisor → own team
  if (!canReset) {
    return res.status(403).json({ error: 'Not allowed to reset this password' });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(req.params.id, { password });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// ===== CATEGORIES & SUBCATEGORIES =====

router.get('/categories', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('*, subcategories(*)')
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/categories', async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const { data, error } = await supabaseAdmin
    .from('categories')
    .insert({ name, description, created_by: req.user.id })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.post('/categories/:id/subcategories', async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const { data, error } = await supabaseAdmin
    .from('subcategories')
    .insert({ category_id: req.params.id, name, description })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ===== ALLOCATIONS =====

router.get('/allocations', async (req, res) => {
  const ids = await teamScope(req);
  if (ids && ids.length === 0) return res.json([]);
  let q = supabaseAdmin
    .from('coin_allocations')
    .select('*, employee:users!coin_allocations_employee_id_fkey(full_name, employee_code)')
    .order('allocated_at', { ascending: false });
  if (ids) q = q.in('employee_id', ids);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/allocations', async (req, res) => {
  const { employee_id, amount, notes } = req.body;
  if (!employee_id || !amount) return res.status(400).json({ error: 'employee_id and amount required' });

  const sb = supabaseForUser(req.token);
  const { data, error } = await sb.rpc('post_allocation', {
    p_employee_id: employee_id,
    p_amount: amount,
    p_notes: notes || null,
  });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ allocation_id: data });
});

// ===== ADJUSTMENTS =====

router.post('/adjustments', async (req, res) => {
  const { employee_id, amount, reason } = req.body;
  if (!employee_id || amount === undefined || !reason) {
    return res.status(400).json({ error: 'employee_id, amount, reason required' });
  }
  const sb = supabaseForUser(req.token);
  const { data, error } = await sb.rpc('post_adjustment', {
    p_employee_id: employee_id,
    p_amount: amount,
    p_reason: reason,
  });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ adjustment_id: data });
});

// ===== REPORTS =====

router.get('/reports/dashboard', async (req, res) => {
  const ids = await teamScope(req);
  const scopeEmp = (q) => (ids ? q.in('employee_id', ids) : q);
  const empQ = supabaseAdmin.from('v_employee_summary').select('*');
  const [employees, allocations, expenses] = await Promise.all([
    ids ? empQ.eq('supervisor_id', req.user.id) : empQ,
    scopeEmp(supabaseAdmin.from('coin_allocations').select('amount, allocated_at, employee_id')),
    scopeEmp(supabaseAdmin.from('expenses').select('amount, expense_date, employee_id, category_id')),
  ]);

  const totalAllocated = (allocations.data || []).reduce((s, a) => s + Number(a.amount), 0);
  const totalSpent = (expenses.data || []).reduce((s, e) => s + Number(e.amount), 0);
  const today = new Date().toISOString().slice(0, 10);
  const todaySpending = (expenses.data || []).filter(e => e.expense_date === today).reduce((s, e) => s + Number(e.amount), 0);

  // Last 14 days
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dStr = d.toISOString().slice(0, 10);
    const total = (expenses.data || []).filter(e => e.expense_date === dStr).reduce((s, e) => s + Number(e.amount), 0);
    days.push({ date: dStr, total });
  }

  res.json({
    totals: { allocated: totalAllocated, spent: totalSpent, outstanding: totalAllocated - totalSpent, today: todaySpending },
    employees: employees.data || [],
    days,
  });
});

router.get('/reports/daily', async (req, res) => {
  const ids = await teamScope(req);
  if (ids && ids.length === 0) return res.json([]);
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  let q = supabaseAdmin
    .from('expenses')
    .select(`
      *,
      employee:users!expenses_employee_id_fkey(full_name, employee_code),
      category:categories!expenses_category_id_fkey(name),
      subcategory:subcategories!expenses_subcategory_id_fkey(name)
    `)
    .eq('expense_date', date)
    .order('created_at', { ascending: false });
  if (ids) q = q.in('employee_id', ids);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/reports/monthly', async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const start = `${month}-01`;
  const endDate = new Date(start);
  endDate.setMonth(endDate.getMonth() + 1);
  const end = endDate.toISOString().slice(0, 10);

  const ids = await teamScope(req);
  if (ids && ids.length === 0) return res.json([]);
  let q = supabaseAdmin
    .from('expenses')
    .select(`
      *,
      employee:users!expenses_employee_id_fkey(full_name, employee_code),
      category:categories!expenses_category_id_fkey(name),
      subcategory:subcategories!expenses_subcategory_id_fkey(name)
    `)
    .gte('expense_date', start)
    .lt('expense_date', end)
    .order('expense_date', { ascending: false });
  if (ids) q = q.in('employee_id', ids);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/reports/ledger', async (req, res) => {
  const { employee_id, type, from, to } = req.query;

  // Decide which wallets the result is restricted to (null = no restriction).
  const teamIds = await teamScope(req); // null for admin
  let walletIds = null;
  if (employee_id) {
    if (teamIds && !teamIds.includes(employee_id)) return res.json([]); // supervisor outside team
    walletIds = [employee_id];
  } else if (teamIds) {
    walletIds = teamIds; // supervisor: whole team
  }
  if (walletIds && walletIds.length === 0) return res.json([]);

  const applyFilters = (q) => {
    if (type) q = q.eq('txn_type', type);
    if (from) q = q.gte('txn_date', from);
    if (to) q = q.lte('txn_date', to);
    return q;
  };

  let entries;
  if (walletIds) {
    // Find the vouchers touching these wallets, then return BOTH sides of
    // each voucher so the ledger stays balanced (debit + matching credit).
    const refQ = applyFilters(
      supabaseAdmin
        .from('ledger_entries')
        .select('txn_ref')
        .eq('account_type', 'employee_wallet')
        .in('account_ref_id', walletIds),
    );
    const { data: refRows, error: refErr } = await refQ;
    if (refErr) return res.status(500).json({ error: refErr.message });
    const refs = [...new Set((refRows || []).map((r) => r.txn_ref))];
    if (refs.length === 0) return res.json([]);

    const { data, error } = await applyFilters(
      supabaseAdmin.from('ledger_entries').select('*').in('txn_ref', refs),
    ).order('txn_date').order('created_at');
    if (error) return res.status(500).json({ error: error.message });
    entries = data;
  } else {
    const { data, error } = await applyFilters(
      supabaseAdmin.from('ledger_entries').select('*'),
    ).order('txn_date').order('created_at');
    if (error) return res.status(500).json({ error: error.message });
    entries = data;
  }

  // Hydrate account labels
  const employees = await supabaseAdmin.from('users').select('id, full_name').eq('role', 'employee');
  const categories = await supabaseAdmin.from('categories').select('id, name');
  const empMap = new Map((employees.data || []).map(u => [u.id, u.full_name]));
  const catMap = new Map((categories.data || []).map(c => [c.id, c.name]));

  const hydrated = (entries || []).map(e => ({
    ...e,
    account_label:
      e.account_type === 'employee_wallet' ? `Wallet · ${empMap.get(e.account_ref_id) || '—'}`
      : e.account_type === 'expense_account' ? `Expense · ${catMap.get(e.account_ref_id) || '—'}`
      : 'Company Cash',
  }));

  res.json(hydrated);
});

// ===== EXPORTS =====

router.get('/export/ledger.xlsx', async (req, res) => {
  const r = await fetch(`${req.protocol}://${req.get('host')}/api/admin/reports/ledger?${new URLSearchParams(req.query)}`, {
    headers: { Authorization: `Bearer ${req.token}` },
  });
  const rows = await r.json();
  await exportLedgerExcel(rows, res);
});

router.get('/export/ledger.pdf', async (req, res) => {
  const r = await fetch(`${req.protocol}://${req.get('host')}/api/admin/reports/ledger?${new URLSearchParams(req.query)}`, {
    headers: { Authorization: `Bearer ${req.token}` },
  });
  const rows = await r.json();
  exportLedgerPDF(rows, res);
});

router.get('/export/daily.xlsx', async (req, res) => {
  const r = await fetch(`${req.protocol}://${req.get('host')}/api/admin/reports/daily?${new URLSearchParams(req.query)}`, {
    headers: { Authorization: `Bearer ${req.token}` },
  });
  const rows = (await r.json()).map(e => ({
    expense_date: e.expense_date,
    txn_ref: e.txn_ref,
    employee_name: e.employee?.full_name,
    category_name: e.category?.name,
    subcategory_name: e.subcategory?.name,
    description: e.description,
    amount: e.amount,
  }));
  await exportExpensesExcel(rows, res, 'daily-report');
});

router.get('/export/monthly.xlsx', async (req, res) => {
  const r = await fetch(`${req.protocol}://${req.get('host')}/api/admin/reports/monthly?${new URLSearchParams(req.query)}`, {
    headers: { Authorization: `Bearer ${req.token}` },
  });
  const rows = (await r.json()).map(e => ({
    expense_date: e.expense_date,
    txn_ref: e.txn_ref,
    employee_name: e.employee?.full_name,
    category_name: e.category?.name,
    subcategory_name: e.subcategory?.name,
    description: e.description,
    amount: e.amount,
  }));
  await exportExpensesExcel(rows, res, 'monthly-report');
});

router.get('/export/monthly.pdf', async (req, res) => {
  const r = await fetch(`${req.protocol}://${req.get('host')}/api/admin/reports/monthly?${new URLSearchParams(req.query)}`, {
    headers: { Authorization: `Bearer ${req.token}` },
  });
  const rows = (await r.json()).map(e => ({
    expense_date: e.expense_date,
    txn_ref: e.txn_ref,
    employee_name: e.employee?.full_name,
    category_name: e.category?.name,
    description: e.description,
    amount: e.amount,
  }));
  exportExpensesPDF(rows, res, 'Monthly Report');
});

export default router;
