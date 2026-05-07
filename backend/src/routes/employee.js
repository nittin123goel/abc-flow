import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { supabaseAdmin, supabaseForUser } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// GET /api/me — profile + summary
router.get('/me', async (req, res) => {
  const { data: summary } = await supabaseAdmin
    .from('v_employee_summary')
    .select('*')
    .eq('employee_id', req.user.id)
    .single();
  res.json({ ...req.user, summary });
});

// GET /api/me/balance
router.get('/me/balance', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('v_employee_balance')
    .select('balance')
    .eq('employee_id', req.user.id)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ balance: data?.balance ?? 0 });
});

// GET /api/me/expenses
router.get('/me/expenses', async (req, res) => {
  const { from, to, category_id } = req.query;
  let q = supabaseAdmin
    .from('expenses')
    .select(`
      *,
      category:categories!expenses_category_id_fkey(name),
      subcategory:subcategories!expenses_subcategory_id_fkey(name)
    `)
    .eq('employee_id', req.user.id)
    .order('expense_date', { ascending: false });

  if (from) q = q.gte('expense_date', from);
  if (to) q = q.lte('expense_date', to);
  if (category_id) q = q.eq('category_id', category_id);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/me/allocations
router.get('/me/allocations', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('coin_allocations')
    .select('*')
    .eq('employee_id', req.user.id)
    .order('allocated_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/me/expenses
router.post('/me/expenses', async (req, res) => {
  const { amount, category_id, subcategory_id, description, expense_date, receipt_path } = req.body;
  if (!amount || !category_id || !expense_date) {
    return res.status(400).json({ error: 'amount, category_id, expense_date required' });
  }
  const sb = supabaseForUser(req.token);
  const { data, error } = await sb.rpc('post_expense', {
    p_amount: amount,
    p_category_id: category_id,
    p_subcategory_id: subcategory_id || null,
    p_description: description || null,
    p_expense_date: expense_date,
    p_receipt_path: receipt_path || null,
  });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ expense_id: data });
});

// POST /api/me/receipts — upload receipt to Supabase Storage
router.post('/me/receipts', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const ext = req.file.originalname.split('.').pop().toLowerCase();
  const filename = `${crypto.randomUUID()}.${ext}`;
  const path = `${req.user.id}/${filename}`;

  const { data, error } = await supabaseAdmin.storage
    .from('receipts')
    .upload(path, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false,
    });

  if (error) return res.status(400).json({ error: error.message });
  res.json({ path: data.path });
});

// GET /api/me/receipts/signed-url?path=...
router.get('/me/receipts/signed-url', async (req, res) => {
  const path = req.query.path;
  if (!path) return res.status(400).json({ error: 'path required' });

  // Verify the path belongs to this user (or admin)
  if (req.user.role !== 'admin' && !path.startsWith(`${req.user.id}/`)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { data, error } = await supabaseAdmin.storage
    .from('receipts')
    .createSignedUrl(path, 60 * 5); // 5 min

  if (error) return res.status(400).json({ error: error.message });
  res.json({ url: data.signedUrl });
});

// GET /api/categories — public reference data (any auth user)
router.get('/categories', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('*, subcategories(*)')
    .eq('is_active', true)
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
