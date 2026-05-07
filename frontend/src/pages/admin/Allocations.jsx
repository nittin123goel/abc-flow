import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api.js';
import { fmt, fmtDate } from '../../lib/format.js';
import { PageHeader } from '../../components/AppShell.jsx';

export function AdminAllocations() {
  const [list, setList] = useState([]);

  useEffect(() => {
    apiGet('/api/admin/allocations').then(setList);
  }, []);

  const total = list.reduce((s, a) => s + Number(a.amount), 0);

  return (
    <>
      <PageHeader crumb="Operations" title="Allocations History" />

      <div className="text-sm text-[var(--muted)] mb-4">
        {list.length} allocations · {fmt(total)} total
      </div>

      <div className="card">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Date</th>
              <th className="table-header">Reference</th>
              <th className="table-header">Employee</th>
              <th className="table-header">Notes</th>
              <th className="table-header text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {list.map(a => (
              <tr key={a.id}>
                <td className="table-cell mono text-xs">{fmtDate(a.allocated_at)}</td>
                <td className="table-cell mono text-xs" style={{ color: 'var(--accent)' }}>{a.txn_ref}</td>
                <td className="table-cell font-semibold">{a.employee?.full_name || '—'}</td>
                <td className="table-cell text-[var(--muted)]">{a.notes || '—'}</td>
                <td className="table-cell text-right mono font-semibold" style={{ color: 'var(--credit)' }}>
                  +{fmt(a.amount)}
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan="5"><div className="empty-state">No allocations yet</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
