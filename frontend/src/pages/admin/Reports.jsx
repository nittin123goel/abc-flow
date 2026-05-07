import { useEffect, useState } from 'react';
import { apiGet, apiDownload } from '../../lib/api.js';
import { fmt, fmtDate, fmtDateShort, today } from '../../lib/format.js';
import { PageHeader } from '../../components/AppShell.jsx';

export function AdminDaily() {
  const [date, setDate] = useState(today());
  const [list, setList] = useState([]);

  useEffect(() => {
    apiGet(`/api/admin/reports/daily?date=${date}`).then(setList);
  }, [date]);

  const total = list.reduce((s, e) => s + Number(e.amount), 0);
  const byEmp = list.reduce((acc, e) => {
    const name = e.employee?.full_name || '—';
    acc[name] = (acc[name] || 0) + Number(e.amount);
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        crumb="Reports"
        title="Daily Spending"
        actions={
          <>
            <button
              onClick={() => apiDownload(`/api/admin/export/daily.xlsx?date=${date}`, `daily-${date}.xlsx`)}
              className="btn-secondary text-xs"
            >⤓ Excel</button>
            <button onClick={() => window.print()} className="btn-secondary text-xs">⎙ Print PDF</button>
          </>
        }
      />

      <div className="flex items-center gap-3 mb-6">
        <span className="label !mb-0">Date</span>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input !w-auto" />
      </div>

      <div className="card mb-4 p-5 flex items-center justify-between">
        <div>
          <div className="kpi-label mb-1">Total spend on {fmtDate(date)}</div>
          <div className="kpi-value" style={{ color: 'var(--debit)' }}>{fmt(total)}</div>
        </div>
        <div className="text-right">
          <div className="kpi-label mb-1">Transactions</div>
          <div className="kpi-value">{list.length}</div>
        </div>
      </div>

      {Object.keys(byEmp).length > 0 && (
        <div className="card mb-4">
          <div className="p-4 border-b border-[var(--rule)] display text-base font-semibold">
            Per-Employee Breakdown
          </div>
          <div className="divide-y divide-[var(--rule)]">
            {Object.entries(byEmp).map(([name, amt]) => (
              <div key={name} className="p-4 flex justify-between items-center">
                <span className="font-semibold">{name}</span>
                <span className="mono">{fmt(amt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Reference</th>
              <th className="table-header">Employee</th>
              <th className="table-header">Category</th>
              <th className="table-header">Description</th>
              <th className="table-header text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {list.map(e => (
              <tr key={e.id}>
                <td className="table-cell mono text-xs" style={{ color: 'var(--accent)' }}>{e.txn_ref}</td>
                <td className="table-cell font-semibold">{e.employee?.full_name}</td>
                <td className="table-cell">
                  {e.category?.name} <span className="text-[var(--muted)]">→</span> {e.subcategory?.name || '—'}
                </td>
                <td className="table-cell text-[var(--muted)]">{e.description || '—'}</td>
                <td className="table-cell text-right mono font-semibold" style={{ color: 'var(--debit)' }}>
                  {fmt(e.amount)}
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan="5"><div className="empty-state">No expenses on this date</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function AdminMonthly() {
  const cur = today().slice(0, 7);
  const [month, setMonth] = useState(cur);
  const [list, setList] = useState([]);

  useEffect(() => {
    apiGet(`/api/admin/reports/monthly?month=${month}`).then(setList);
  }, [month]);

  const total = list.reduce((s, e) => s + Number(e.amount), 0);
  const byCat = list.reduce((acc, e) => {
    const k = e.category?.name || '—';
    if (!acc[k]) acc[k] = { total: 0, items: [] };
    acc[k].total += Number(e.amount);
    acc[k].items.push(e);
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        crumb="Reports"
        title="Monthly Summary"
        actions={
          <>
            <button
              onClick={() => apiDownload(`/api/admin/export/monthly.xlsx?month=${month}`, `monthly-${month}.xlsx`)}
              className="btn-secondary text-xs"
            >⤓ Excel</button>
            <button
              onClick={() => apiDownload(`/api/admin/export/monthly.pdf?month=${month}`, `monthly-${month}.pdf`)}
              className="btn-secondary text-xs"
            >⤓ PDF</button>
          </>
        }
      />

      <div className="flex items-center gap-3 mb-6">
        <span className="label !mb-0">Month</span>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="input !w-auto" />
      </div>

      <div className="card mb-6 p-5 flex items-center justify-between">
        <div>
          <div className="kpi-label mb-1">Total · {month}</div>
          <div className="kpi-value" style={{ color: 'var(--debit)' }}>{fmt(total)}</div>
        </div>
        <div className="text-right">
          <div className="kpi-label mb-1">Entries</div>
          <div className="kpi-value">{list.length}</div>
        </div>
      </div>

      {Object.keys(byCat).length === 0 && (
        <div className="card empty-state">No expenses in this month</div>
      )}

      {Object.entries(byCat).map(([catName, data]) => (
        <div key={catName} className="card mb-4">
          <div className="p-4 border-b border-[var(--rule)] flex items-center justify-between bg-[var(--paper-2)]">
            <div className="display text-base font-semibold">{catName}</div>
            <div className="mono font-semibold">{fmt(data.total)}</div>
          </div>
          <table className="w-full">
            <tbody>
              {data.items.map(e => (
                <tr key={e.id}>
                  <td className="table-cell mono text-xs">{fmtDateShort(e.expense_date)}</td>
                  <td className="table-cell">{e.employee?.full_name}</td>
                  <td className="table-cell text-[var(--muted)]">
                    {e.subcategory?.name || '—'} · {e.description || ''}
                  </td>
                  <td className="table-cell text-right mono">{fmt(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

export function AdminCashflow() {
  const [data, setData] = useState(null);

  useEffect(() => {
    apiGet('/api/admin/reports/dashboard').then(setData);
  }, []);

  if (!data) return <div className="empty-state">Loading…</div>;
  const { totals, employees } = data;

  return (
    <>
      <PageHeader crumb="Overview" title="Company Cash Flow" />

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card p-6">
          <div className="kpi-label mb-3">Inflow (Allocations)</div>
          <div className="display text-3xl font-bold" style={{ color: 'var(--credit)' }}>{fmt(totals.allocated)}</div>
        </div>
        <div className="card p-6">
          <div className="kpi-label mb-3">Outflow (Expenses)</div>
          <div className="display text-3xl font-bold" style={{ color: 'var(--debit)' }}>{fmt(totals.spent)}</div>
        </div>
        <div className="card p-6">
          <div className="kpi-label mb-3">Net Float (Outstanding)</div>
          <div className="display text-3xl font-bold">{fmt(totals.outstanding)}</div>
        </div>
      </div>

      <div className="card p-6">
        <div className="display text-lg font-semibold mb-5">By Employee</div>
        <div className="space-y-4">
          {employees.map(e => {
            const pct = totals.spent > 0 ? (e.total_spent / totals.spent) * 100 : 0;
            return (
              <div key={e.employee_id}>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-semibold">{e.full_name}</span>
                  <span className="mono">
                    {fmt(e.total_spent)} <span className="text-[var(--muted)]">· {pct.toFixed(1)}%</span>
                  </span>
                </div>
                <div className="h-2 bg-[var(--paper-2)] rounded-full overflow-hidden">
                  <div style={{ width: `${pct}%`, background: 'var(--accent)' }} className="h-full" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
