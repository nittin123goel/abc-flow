import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../lib/api.js';
import { fmt, fmtFull, fmtDate, fmtDateShort } from '../../lib/format.js';
import { PageHeader } from '../../components/AppShell.jsx';
import { useAuth } from '../../stores/auth.js';

export function EmployeeDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  const load = async () => {
    const [me, expenses, allocations] = await Promise.all([
      apiGet('/api/me'),
      apiGet('/api/me/expenses'),
      apiGet('/api/me/allocations'),
    ]);
    setData({ me, expenses, allocations });
  };

  useEffect(() => { load(); }, []);
  if (!data) return <div className="empty-state">Loading…</div>;

  const balance = Number(data.me.summary?.balance ?? 0);
  const allocated = Number(data.me.summary?.total_allocated ?? 0);
  const spent = Number(data.me.summary?.total_spent ?? 0);
  const lowBalance = balance < 1000;

  // This week
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const thisWeek = data.expenses.filter(e => new Date(e.expense_date) >= weekAgo);
  const weekTotal = thisWeek.reduce((s, e) => s + Number(e.amount), 0);

  // This month
  const monthStart = new Date().toISOString().slice(0, 7);
  const thisMonth = data.expenses.filter(e => e.expense_date.startsWith(monthStart));
  const monthTotal = thisMonth.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <>
      <PageHeader
        crumb={`Welcome, ${user.full_name.split(' ')[0]}`}
        title="My Wallet"
        actions={<Link to="/employee/add" className="btn-primary">+ Add Expense</Link>}
      />

      {/* HERO BALANCE */}
      <div
        className="card p-8 mb-6 relative overflow-hidden"
        style={{
          background: lowBalance ? 'linear-gradient(135deg, #FBEAEA, #fff)' : 'linear-gradient(135deg, var(--paper-2), #fff)',
        }}
      >
        <div className="kpi-label mb-3">Available Balance</div>
        <div
          className="display font-bold leading-none mb-2"
          style={{
            fontSize: '64px',
            color: lowBalance ? 'var(--debit)' : 'var(--ink)',
            letterSpacing: '-0.03em',
          }}
        >
          {fmtFull(balance)}
        </div>
        {lowBalance && (
          <div className="stamp mt-4">⚠ Low Balance — Request top-up</div>
        )}

        <div className="grid grid-cols-3 gap-6 mt-8 pt-6 border-t border-[var(--rule)]">
          <div>
            <div className="kpi-label mb-1">Total Allocated</div>
            <div className="display text-xl font-semibold mono">{fmt(allocated)}</div>
          </div>
          <div>
            <div className="kpi-label mb-1">Total Spent</div>
            <div className="display text-xl font-semibold mono" style={{ color: 'var(--debit)' }}>
              {fmt(spent)}
            </div>
          </div>
          <div>
            <div className="kpi-label mb-1">Employee Code</div>
            <div className="display text-xl font-semibold mono">{user.employee_code}</div>
          </div>
        </div>
      </div>

      {/* QUICK STATS */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card p-5">
          <div className="kpi-label mb-2">This Week</div>
          <div className="display text-2xl font-bold">{fmt(weekTotal)}</div>
          <div className="text-xs text-[var(--muted)] mt-1">{thisWeek.length} transactions</div>
        </div>
        <div className="card p-5">
          <div className="kpi-label mb-2">This Month</div>
          <div className="display text-2xl font-bold">{fmt(monthTotal)}</div>
          <div className="text-xs text-[var(--muted)] mt-1">{thisMonth.length} transactions</div>
        </div>
      </div>

      {/* RECENT EXPENSES */}
      <div className="card">
        <div className="p-5 border-b border-[var(--rule)] flex items-center justify-between">
          <div className="display text-lg font-semibold">Recent Expenses</div>
          <Link to="/employee/history" className="btn-ghost">View all →</Link>
        </div>
        <div className="divide-y divide-[var(--rule)]">
          {data.expenses.slice(0, 8).map(e => (
            <div key={e.id} className="p-4 flex items-center gap-4 hover:bg-[var(--paper-2)] transition">
              <div className="w-1.5 h-10 rounded-full bg-[var(--debit)]" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">
                  {e.description || e.subcategory?.name || e.category?.name || 'Expense'}
                </div>
                <div className="text-xs text-[var(--muted)] mt-0.5">
                  <span className="mono">{e.txn_ref}</span> · {e.category?.name}
                  {e.subcategory?.name && ` → ${e.subcategory.name}`} · {fmtDateShort(e.expense_date)}
                </div>
              </div>
              <div className="text-right mono font-semibold" style={{ color: 'var(--debit)' }}>
                −{fmt(e.amount)}
              </div>
            </div>
          ))}
          {data.expenses.length === 0 && (
            <div className="empty-state">No expenses yet — <Link to="/employee/add" className="underline">add your first one</Link></div>
          )}
        </div>
      </div>
    </>
  );
}
