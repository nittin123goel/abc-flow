import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api.js';
import { fmt, fmtDate } from '../../lib/format.js';
import { PageHeader } from '../../components/AppShell.jsx';

export function EmployeeAllocations() {
  const [list, setList] = useState([]);

  useEffect(() => {
    apiGet('/api/me/allocations').then(setList);
  }, []);

  const total = list.reduce((s, a) => s + Number(a.amount), 0);

  return (
    <>
      <PageHeader crumb="My Account" title="Allocations Received" />

      <div className="card mb-4 p-5">
        <div className="kpi-label mb-1">Lifetime Allocated · {list.length} top-ups</div>
        <div className="display text-3xl font-bold" style={{ color: 'var(--credit)' }}>{fmt(total)}</div>
      </div>

      <div className="card">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Date</th>
              <th className="table-header">Reference</th>
              <th className="table-header">Notes</th>
              <th className="table-header text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {list.map(a => (
              <tr key={a.id}>
                <td className="table-cell mono text-xs">{fmtDate(a.allocated_at)}</td>
                <td className="table-cell mono text-xs" style={{ color: 'var(--accent)' }}>{a.txn_ref}</td>
                <td className="table-cell text-[var(--ink-2)]">{a.notes || '—'}</td>
                <td className="table-cell text-right mono font-semibold" style={{ color: 'var(--credit)' }}>
                  +{fmt(a.amount)}
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan="4"><div className="empty-state">No allocations received yet</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
