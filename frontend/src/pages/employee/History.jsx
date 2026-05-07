import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api.js';
import { fmt, fmtDate, fmtDateShort } from '../../lib/format.js';
import { PageHeader } from '../../components/AppShell.jsx';

export function EmployeeHistory() {
  const [expenses, setExpenses] = useState([]);
  const [cats, setCats] = useState([]);
  const [filter, setFilter] = useState({ category_id: '', from: '', to: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet('/api/categories').then(setCats);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(filter).forEach(([k, v]) => { if (v) params.append(k, v); });
    setLoading(true);
    apiGet(`/api/me/expenses?${params}`).then(d => {
      setExpenses(d);
      setLoading(false);
    });
  }, [filter]);

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);

  const openReceipt = async (path) => {
    if (!path) return;
    try {
      const { url } = await apiGet(`/api/me/receipts/signed-url?path=${encodeURIComponent(path)}`);
      window.open(url, '_blank');
    } catch (err) {
      alert('Could not open receipt: ' + err.message);
    }
  };

  return (
    <>
      <PageHeader crumb="My Account" title="Expense History" />

      {/* FILTERS */}
      <div className="card p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="label">Category</label>
          <select
            className="input"
            value={filter.category_id}
            onChange={e => setFilter(f => ({ ...f, category_id: e.target.value }))}
          >
            <option value="">All</option>
            {cats.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={filter.from}
            onChange={e => setFilter(f => ({ ...f, from: e.target.value }))} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={filter.to}
            onChange={e => setFilter(f => ({ ...f, to: e.target.value }))} />
        </div>
        <div className="flex items-end">
          <button
            onClick={() => setFilter({ category_id: '', from: '', to: '' })}
            className="btn-secondary w-full"
          >Clear</button>
        </div>
      </div>

      <div className="card p-5 mb-4 flex items-center justify-between">
        <div>
          <div className="kpi-label mb-1">Total · {expenses.length} expenses</div>
          <div className="display text-3xl font-bold" style={{ color: 'var(--debit)' }}>{fmt(total)}</div>
        </div>
      </div>

      <div className="card">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Date</th>
              <th className="table-header">Reference</th>
              <th className="table-header">Category</th>
              <th className="table-header">Description</th>
              <th className="table-header">Receipt</th>
              <th className="table-header text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6"><div className="empty-state">Loading…</div></td></tr>
            ) : expenses.length === 0 ? (
              <tr><td colSpan="6"><div className="empty-state">No expenses match these filters</div></td></tr>
            ) : expenses.map(e => (
              <tr key={e.id}>
                <td className="table-cell mono text-xs">{fmtDateShort(e.expense_date)}</td>
                <td className="table-cell mono text-xs" style={{ color: 'var(--accent)' }}>{e.txn_ref}</td>
                <td className="table-cell text-xs">
                  <div>{e.category?.name}</div>
                  <div className="text-[var(--muted)]">{e.subcategory?.name}</div>
                </td>
                <td className="table-cell text-[var(--ink-2)]">{e.description || '—'}</td>
                <td className="table-cell">
                  {e.receipt_path ? (
                    <button onClick={() => openReceipt(e.receipt_path)} className="btn-ghost text-xs">
                      View ↗
                    </button>
                  ) : <span className="text-[var(--muted-2)] text-xs">—</span>}
                </td>
                <td className="table-cell text-right mono font-semibold" style={{ color: 'var(--debit)' }}>
                  {fmt(e.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
