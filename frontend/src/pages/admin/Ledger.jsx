import { useEffect, useState } from 'react';
import { apiGet, apiDownload } from '../../lib/api.js';
import { fmt, fmtFull, fmtDateShort } from '../../lib/format.js';
import { PageHeader } from '../../components/AppShell.jsx';

export function AdminLedger() {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [filters, setFilters] = useState({ employee_id: '', type: '', from: '', to: '' });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
    const [ledger, emps] = await Promise.all([
      apiGet(`/api/admin/reports/ledger?${params}`),
      apiGet('/api/admin/employees'),
    ]);
    setRows(ledger);
    setEmployees(emps);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters]);

  const totalDebit = rows.reduce((s, r) => s + Number(r.debit), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <>
      <PageHeader
        crumb="Reports"
        title="General Ledger"
        actions={
          <>
            <button
              onClick={() => {
                const params = new URLSearchParams();
                Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
                apiDownload(`/api/admin/export/ledger.xlsx?${params}`, `ledger-${new Date().toISOString().slice(0,10)}.xlsx`);
              }}
              className="btn-secondary text-xs"
            >⤓ Excel</button>
            <button
              onClick={() => {
                const params = new URLSearchParams();
                Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
                apiDownload(`/api/admin/export/ledger.pdf?${params}`, `ledger-${new Date().toISOString().slice(0,10)}.pdf`);
              }}
              className="btn-secondary text-xs"
            >⤓ PDF</button>
          </>
        }
      />

      {/* FILTERS */}
      <div className="card p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
          <label className="label">Employee</label>
          <select
            className="input"
            value={filters.employee_id}
            onChange={e => setFilters(f => ({ ...f, employee_id: e.target.value }))}
          >
            <option value="">All wallets</option>
            {employees.map(e => (
              <option key={e.employee_id} value={e.employee_id}>{e.full_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Type</label>
          <select
            className="input"
            value={filters.type}
            onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}
          >
            <option value="">All types</option>
            <option value="allocation">Allocation</option>
            <option value="expense">Expense</option>
            <option value="adjustment">Adjustment</option>
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={filters.from}
            onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={filters.to}
            onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
        </div>
        <div className="flex items-end">
          <button
            onClick={() => setFilters({ employee_id: '', type: '', from: '', to: '' })}
            className="btn-secondary w-full"
          >
            Clear
          </button>
        </div>
      </div>

      {/* TOTALS */}
      <div className="card mb-4 p-5 grid grid-cols-3 gap-6">
        <div>
          <div className="kpi-label mb-1">Total Debits</div>
          <div className="display text-2xl font-bold" style={{ color: 'var(--debit)' }}>{fmt(totalDebit)}</div>
        </div>
        <div>
          <div className="kpi-label mb-1">Total Credits</div>
          <div className="display text-2xl font-bold" style={{ color: 'var(--credit)' }}>{fmt(totalCredit)}</div>
        </div>
        <div>
          <div className="kpi-label mb-1">Status</div>
          <div className="display text-2xl font-bold" style={{ color: balanced ? 'var(--credit)' : 'var(--debit)' }}>
            {balanced ? '✓ Balanced' : 'Mismatch'}
          </div>
        </div>
      </div>

      {/* LEDGER TABLE */}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Date</th>
              <th className="table-header">Voucher</th>
              <th className="table-header">Type</th>
              <th className="table-header">Particulars</th>
              <th className="table-header">Account</th>
              <th className="table-header text-right">Debit (Dr.)</th>
              <th className="table-header text-right">Credit (Cr.)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7"><div className="empty-state">Loading ledger…</div></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan="7"><div className="empty-state">No entries match these filters</div></td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td className="table-cell mono text-xs">{fmtDateShort(r.txn_date)}</td>
                <td className="table-cell mono text-xs" style={{ color: 'var(--accent)' }}>{r.txn_ref}</td>
                <td className="table-cell">
                  <span className="badge" style={{
                    background: r.txn_type === 'allocation' ? '#E8F1ED' :
                                r.txn_type === 'expense' ? '#FBEAEA' : '#F7EBED',
                    color: r.txn_type === 'allocation' ? 'var(--credit)' :
                            r.txn_type === 'expense' ? 'var(--debit)' : 'var(--accent)',
                  }}>
                    {r.txn_type}
                  </span>
                </td>
                <td className="table-cell text-[var(--ink-2)]">{r.description || '—'}</td>
                <td className="table-cell text-xs text-[var(--muted)]">{r.account_label}</td>
                <td className="table-cell text-right mono" style={{ color: r.debit > 0 ? 'var(--debit)' : 'var(--muted-2)' }}>
                  {r.debit > 0 ? fmtFull(r.debit) : '—'}
                </td>
                <td className="table-cell text-right mono" style={{ color: r.credit > 0 ? 'var(--credit)' : 'var(--muted-2)' }}>
                  {r.credit > 0 ? fmtFull(r.credit) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-[var(--paper-2)] font-bold">
                <td colSpan="5" className="table-cell text-right">TOTAL</td>
                <td className="table-cell text-right mono" style={{ color: 'var(--debit)' }}>{fmtFull(totalDebit)}</td>
                <td className="table-cell text-right mono" style={{ color: 'var(--credit)' }}>{fmtFull(totalCredit)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}
