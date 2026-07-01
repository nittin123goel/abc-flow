import express from 'express';
import { supabaseAdmin, supabaseForUser } from '../config/supabase.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  exportLedgerExcel, exportLedgerPDF,
  exportExpensesExcel, exportExpensesPDF,
} from '../services/export.js';

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

// ===== EMPLOYEES =====

router.get('/employees', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('v_employee_summary')
    .select('*')
    .order('full_name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Create new employee — creates auth user + public.users row
router.post('/employees', async (req, res) => {
  const { email, password, full_name, employee_code, phone } = req.body;
  if (!email || !password || !full_name || !employee_code) {
    return res.status(400).json({ error: 'email, password, full_name, employee_code required' });
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

router.patch('/employees/:id', async (req, res) => {
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

// Reset an employee's password — admin action
router.post('/employees/:id/password', async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }

  // Guard: only allow resetting passwords for employees, never other admins
  const { data: target, error: lookupErr } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('id', req.params.id)
    .single();
  if (lookupErr || !target) return res.status(404).json({ error: 'Employee not found' });
  if (target.role !== 'employee') {
    return res.status(403).json({ error: 'Can only reset employee passwords' });
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
  const { data, error } = await supabaseAdmin
    .from('coin_allocations')
    .select('*, employee:users!coin_allocations_employee_id_fkey(full_name, employee_code)')
    .order('allocated_at', { ascending: false });
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
  const [employees, allocations, expenses] = await Promise.all([
    supabaseAdmin.from('v_employee_summary').select('*'),
    supabaseAdmin.from('coin_allocations').select('amount, allocated_at'),
    supabaseAdmin.from('expenses').select('amount, expense_date, employee_id, category_id'),
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
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from('expenses')
    .select(`
      *,
      employee:users!expenses_employee_id_fkey(full_name, employee_code),
      category:categories!expenses_category_id_fkey(name),
      subcategory:subcategories!expenses_subcategory_id_fkey(name)
    `)
    .eq('expense_date', date)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/reports/monthly', async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const start = `${month}-01`;
  const endDate = new Date(start);
  endDate.setMonth(endDate.getMonth() + 1);
  const end = endDate.toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
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
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/reports/ledger', async (req, res) => {
  const { employee_id, type, from, to } = req.query;
  let q = supabaseAdmin.from('ledger_entries').select('*').order('txn_date').order('txn_ref');
  if (employee_id) q = q.eq('account_ref_id', employee_id).eq('account_type', 'employee_wallet');
  if (type) q = q.eq('txn_type', type);
  if (from) q = q.gte('txn_date', from);
  if (to) q = q.lte('txn_date', to);

  const { data: entries, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

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
