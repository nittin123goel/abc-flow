import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost, apiUpload } from '../../lib/api.js';
import { fmt, fmtFull, today } from '../../lib/format.js';
import { PageHeader } from '../../components/AppShell.jsx';
import { toast } from '../../components/Toast.jsx';
import { useAuth } from '../../stores/auth.js';

export function EmployeeAddExpense() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cats, setCats] = useState([]);
  const [balance, setBalance] = useState(0);
  const [form, setForm] = useState({
    amount: '', category_id: '', subcategory_id: '', description: '', expense_date: today(),
  });
  const [receiptFile, setReceiptFile] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet('/api/categories').then(setCats);
    apiGet('/api/me/balance').then(d => setBalance(d.balance));
  }, []);

  const cat = cats.find(c => c.id === form.category_id);
  const subs = cat?.subcategories || [];

  const newBalance = balance - (Number(form.amount) || 0);
  const lowAfter = newBalance < 1000;
  const exceedsBalance = newBalance < 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.amount || !form.category_id) {
      toast('Amount and category required', 'error');
      return;
    }
    setBusy(true);
    try {
      let receipt_path = null;
      if (receiptFile) {
        const upload = await apiUpload('/api/me/receipts', receiptFile);
        receipt_path = upload.path;
      }
      await apiPost('/api/me/expenses', {
        ...form,
        amount: Number(form.amount),
        receipt_path,
      });
      toast(`Expense of ${fmt(Number(form.amount))} recorded`);
      navigate('/employee');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader crumb="My Account" title="New Expense" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* FORM */}
        <form onSubmit={submit} className="lg:col-span-2 card p-6 space-y-5">
          <div>
            <label className="label">Amount (₹)</label>
            <input
              type="number" step="0.01" min="0.01" required autoFocus
              className="input mono text-3xl !py-4 font-bold"
              placeholder="0.00"
              value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })}
            />
            {exceedsBalance && (
              <div className="text-xs mt-2 font-semibold" style={{ color: 'var(--debit)' }}>
                ⚠ Exceeds available balance
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Category</label>
              <select
                required
                className="input"
                value={form.category_id}
                onChange={e => setForm({ ...form, category_id: e.target.value, subcategory_id: '' })}
              >
                <option value="">Select…</option>
                {cats.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Subcategory</label>
              <select
                className="input"
                value={form.subcategory_id}
                disabled={!form.category_id || subs.length === 0}
                onChange={e => setForm({ ...form, subcategory_id: e.target.value })}
              >
                <option value="">— optional —</option>
                {subs.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Date</label>
            <input
              type="date"
              required
              max={today()}
              className="input"
              value={form.expense_date}
              onChange={e => setForm({ ...form, expense_date: e.target.value })}
            />
          </div>

          <div>
            <label className="label">Description</label>
            <textarea
              rows="3"
              className="input"
              placeholder="What was this for?"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div>
            <label className="label">Receipt (optional)</label>
            <div className="border-2 border-dashed border-[var(--rule-2)] rounded-sm p-5 text-center">
              {receiptFile ? (
                <div>
                  <div className="text-sm font-semibold mb-1">{receiptFile.name}</div>
                  <div className="text-xs text-[var(--muted)] mb-2">
                    {(receiptFile.size / 1024).toFixed(1)} KB
                  </div>
                  <button
                    type="button"
                    onClick={() => setReceiptFile(null)}
                    className="btn-ghost text-xs"
                  >Remove</button>
                </div>
              ) : (
                <label className="cursor-pointer">
                  <input
                    type="file"
                    className="hidden"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f && f.size > 5 * 1024 * 1024) {
                        toast('File too large (max 5 MB)', 'error');
                        return;
                      }
                      setReceiptFile(f);
                    }}
                  />
                  <div className="text-sm text-[var(--muted)]">
                    Click to upload (JPG, PNG, WebP, PDF · max 5 MB)
                  </div>
                </label>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-3">
            <button type="submit" disabled={busy || exceedsBalance} className="btn-primary flex-1">
              {busy ? 'Recording…' : 'Record Expense'}
            </button>
            <button type="button" onClick={() => navigate('/employee')} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>

        {/* PREVIEW */}
        <div className="card p-6 h-fit sticky top-24">
          <div className="kpi-label mb-3">Live Preview</div>

          <div className="space-y-4 text-sm">
            <div>
              <div className="kpi-label mb-1">Current Balance</div>
              <div className="display text-2xl font-bold mono">{fmtFull(balance)}</div>
            </div>

            <div className="border-t border-[var(--rule)] pt-4">
              <div className="kpi-label mb-1">Expense</div>
              <div
                className="display text-3xl font-bold mono"
                style={{ color: 'var(--debit)' }}
              >
                −{fmtFull(Number(form.amount) || 0)}
              </div>
            </div>

            <div className="border-t border-[var(--rule)] pt-4">
              <div className="kpi-label mb-1">Balance After</div>
              <div
                className="display text-2xl font-bold mono"
                style={{ color: exceedsBalance ? 'var(--debit)' : lowAfter ? 'var(--gold)' : 'var(--credit)' }}
              >
                {fmtFull(newBalance)}
              </div>
              {lowAfter && !exceedsBalance && (
                <div className="text-xs mt-1" style={{ color: 'var(--gold)' }}>
                  ⚠ This will leave you with low balance
                </div>
              )}
            </div>

            <div className="border-t border-[var(--rule)] pt-4 text-xs text-[var(--muted)] space-y-1">
              <div>📋 Category: <span className="text-[var(--ink-2)]">{cat?.name || '—'}</span></div>
              <div>📁 Subcategory: <span className="text-[var(--ink-2)]">
                {subs.find(s => s.id === form.subcategory_id)?.name || '—'}
              </span></div>
              <div>📅 Date: <span className="text-[var(--ink-2)]">{form.expense_date}</span></div>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-[var(--rule)] text-xs text-[var(--muted)]">
            <strong>Note:</strong> Once recorded, this expense cannot be edited or deleted. Contact admin if a correction is needed.
          </div>
        </div>
      </div>
    </>
  );
}
