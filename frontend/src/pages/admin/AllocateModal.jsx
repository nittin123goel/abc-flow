import { useState } from 'react';
import { Modal } from '../../components/Modal.jsx';
import { apiPost } from '../../lib/api.js';
import { fmt } from '../../lib/format.js';
import { toast } from '../../components/Toast.jsx';

export function AllocateModal({ employee, onClose, onDone }) {
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!amount || +amount <= 0) return;
    setBusy(true);
    try {
      await apiPost('/api/admin/allocations', {
        employee_id: employee.employee_id || employee.id,
        amount: +amount,
        notes,
      });
      toast(`Allocated ${fmt(+amount)} to ${employee.full_name}`);
      onDone?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="kpi-label mb-2" style={{ color: 'var(--credit)' }}>Allocate Coins</div>
      <div className="display text-2xl font-bold mb-1">to {employee.full_name}</div>
      <div className="text-xs text-[var(--muted)] mb-6">
        Current balance: <span className="mono font-semibold">{fmt(employee.balance || 0)}</span>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Amount (₹)</label>
          <input
            type="number" step="1" min="1" required autoFocus
            className="input mono text-xl font-semibold"
            placeholder="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. October allocation, top-up for site visit…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>
        <div className="flex gap-2 pt-3">
          <button type="submit" disabled={busy} className="btn-primary flex-1">
            {busy ? 'Posting…' : 'Allocate'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </form>

      <div className="mt-5 pt-5 border-t border-[var(--rule)] text-xs text-[var(--muted)] flex items-start gap-2">
        <span>ⓘ</span>
        <span>
          This creates a double-entry: <strong>Debit</strong> {employee.full_name}'s wallet,{' '}
          <strong>Credit</strong> Company Cash.
        </span>
      </div>
    </Modal>
  );
}

export function AdjustModal({ employee, onClose, onDone }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!amount || +amount === 0 || !reason.trim()) return;
    setBusy(true);
    try {
      await apiPost('/api/admin/adjustments', {
        employee_id: employee.employee_id || employee.id,
        amount: +amount,
        reason: reason.trim(),
      });
      toast(`Adjustment posted for ${employee.full_name}`);
      onDone?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="kpi-label mb-2" style={{ color: 'var(--accent)' }}>Manual Adjustment</div>
      <div className="display text-2xl font-bold mb-1">{employee.full_name}</div>
      <div className="text-xs text-[var(--muted)] mb-6">
        Current balance: <span className="mono font-semibold">{fmt(employee.balance || 0)}</span>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Amount (use negative to deduct)</label>
          <input
            type="number" step="1" required autoFocus
            className="input mono text-xl font-semibold"
            placeholder="e.g. 500 or -200"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
          <div className="text-xs text-[var(--muted)] mt-2">
            Positive adds · Negative deducts
          </div>
        </div>
        <div>
          <label className="label">Reason (required)</label>
          <textarea
            required rows="2"
            className="input"
            placeholder="e.g. Refund of returned material, error correction…"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>
        <div className="flex gap-2 pt-3">
          <button type="submit" disabled={busy} className="btn-primary flex-1">
            {busy ? 'Posting…' : 'Post Adjustment'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
