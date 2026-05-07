import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../../lib/api.js';
import { fmt, fmtDate, fmtDateShort, today } from '../../lib/format.js';
import { PageHeader } from '../../components/AppShell.jsx';
import { AllocateModal } from './AllocateModal.jsx';

export function AdminDashboard() {
  const [data, setData] = useState(null);
  const [allocFor, setAllocFor] = useState(null);
  const [recent, setRecent] = useState([]);
  const navigate = useNavigate();

  const load = async () => {
    const [dash, ledger] = await Promise.all([
      apiGet('/api/admin/reports/dashboard'),
      apiGet('/api/admin/reports/ledger'),
    ]);
    setData(dash);
    setRecent([...ledger].sort((a, b) => b.txn_date.localeCompare(a.txn_date)).slice(0, 12));
  };

  useEffect(() => { load(); }, []);
  if (!data) return <div className="empty-state">Loading dashboard…</div>;

  const { totals, employees, days } = data;
  const maxDay = Math.max(...days.map(d => d.total), 1);
  const spenders = [...employees].sort((a, b) => b.total_spent - a.total_spent);

  return (
    <>
      <PageHeader crumb="Overview" title="Dashboard" />

      {/* KPI ROW */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Kpi label="Total Allocated" value={fmt(totals.allocated)} sub="lifetime" color="accent" />
        <Kpi label="Total Spent" value={fmt(totals.spent)} sub="lifetime" color="debit" />
        <Kpi label="Outstanding" value={fmt(totals.outstanding)} sub="across wallets" color="credit" />
        <Kpi label="Today" value={fmt(totals.today)} sub={fmtDate(new Date())} />
      </div>

      {/* CHART + LEADERBOARD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="kpi-label mb-1">14-Day Trend</div>
              <div className="display text-xl font-semibold">Daily Spending</div>
            </div>
            <div className="text-xs text-[var(--muted)] mono">
              {fmt(days.reduce((s, d) => s + d.total, 0))} total
            </div>
          </div>
          <div className="flex items-end gap-1.5 h-44">
            {days.map(d => {
              const h = Math.max((d.total / maxDay) * 100, 2);
              const isToday = d.date === today();
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5 group">
                  <div className="text-[9px] mono text-[var(--muted)] opacity-0 group-hover:opacity-100 transition">
                    {fmt(d.total)}
                  </div>
                  <div
                    style={{
                      height: `${h}%`,
                      background: isToday ? 'var(--accent)' : 'var(--ink)',
                      opacity: d.total > 0 ? 1 : 0.15,
                    }}
                    className="w-full rounded-t-sm hover:opacity-80 transition"
                  />
                  <div className="text-[9px] mono text-[var(--muted-2)]">
                    {new Date(d.date).getDate()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-6">
          <div className="kpi-label mb-1">Leaderboard</div>
          <div className="display text-xl font-semibold mb-5">Top Spenders</div>
          <div className="space-y-4">
            {spenders.slice(0, 4).map((s, i) => (
              <div key={s.employee_id}>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-[var(--paper)] border border-[var(--rule-2)] flex items-center justify-center text-[10px] mono font-semibold">
                      {i + 1}
                    </div>
                    <span className="font-semibold">{s.full_name}</span>
                  </div>
                  <span className="mono font-semibold text-sm">{fmt(s.total_spent)}</span>
                </div>
                <div className="h-1 bg-[var(--paper-2)] rounded-full overflow-hidden ml-9">
                  <div
                    style={{ width: `${Math.min(100, (s.total_spent / Math.max(spenders[0]?.total_spent || 1, 1)) * 100)}%` }}
                    className="h-full bg-[var(--ink)]"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* WALLETS + RECENT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="p-5 border-b border-[var(--rule)] flex items-center justify-between">
            <div>
              <div className="kpi-label mb-1">Live Wallets</div>
              <div className="display text-lg font-semibold">Employee Balances</div>
            </div>
            <button onClick={() => navigate('/admin/employees')} className="btn-ghost">
              Manage →
            </button>
          </div>
          <div className="divide-y divide-[var(--rule)]">
            {employees.map(e => (
              <div key={e.employee_id} className="p-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-[var(--paper)] border border-[var(--rule-2)] flex items-center justify-center display font-semibold text-sm">
                  {e.full_name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm">{e.full_name}</div>
                    <div
                      className="mono font-semibold"
                      style={{ color: e.balance < 1000 ? 'var(--debit)' : undefined }}
                    >
                      {fmt(e.balance)}
                    </div>
                  </div>
                  <div className="text-xs text-[var(--muted)] mt-1">
                    {e.employee_code} · Allocated {fmt(e.total_allocated)} · Spent {fmt(e.total_spent)}
                  </div>
                </div>
                <button
                  onClick={() => setAllocFor(e)}
                  className="btn-secondary !py-1.5 !px-3 text-xs"
                >
                  + Allocate
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="p-5 border-b border-[var(--rule)] flex items-center justify-between">
            <div>
              <div className="kpi-label mb-1">Live Feed</div>
              <div className="display text-lg font-semibold">Recent Transactions</div>
            </div>
            <button onClick={() => navigate('/admin/ledger')} className="btn-ghost">
              Full Ledger →
            </button>
          </div>
          <div className="divide-y divide-[var(--rule)] max-h-[400px] overflow-y-auto">
            {recent.length === 0 && <div className="empty-state">No transactions yet</div>}
            {recent.map(l => (
              <div key={l.id} className="p-4 flex items-center gap-4 hover:bg-[var(--paper-2)] transition">
                <div
                  className="w-1.5 h-8 rounded-full"
                  style={{
                    background:
                      l.txn_type === 'allocation' ? 'var(--credit)' :
                      l.txn_type === 'expense' ? 'var(--debit)' : 'var(--accent)',
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{l.description || l.txn_type}</div>
                  <div className="text-xs text-[var(--muted)] mt-0.5 mono">
                    {l.txn_ref} · {fmtDateShort(l.txn_date)}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className="mono font-semibold text-sm"
                    style={{ color: l.debit > 0 ? 'var(--debit)' : 'var(--credit)' }}
                  >
                    {l.debit > 0 ? '+' : '−'}{fmt(l.debit > 0 ? l.debit : l.credit)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--muted-2)] font-semibold mt-0.5">
                    {l.debit > 0 ? 'DEBIT' : 'CREDIT'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {allocFor && (
        <AllocateModal
          employee={allocFor}
          onClose={() => setAllocFor(null)}
          onDone={() => { setAllocFor(null); load(); }}
        />
      )}
    </>
  );
}

function Kpi({ label, value, sub, color = 'ink' }) {
  const colors = {
    ink: 'var(--ink)', accent: 'var(--accent)', debit: 'var(--debit)', credit: 'var(--credit)',
  };
  return (
    <div className="card p-5 relative overflow-hidden">
      <div className="kpi-label mb-3">{label}</div>
      <div className="kpi-value" style={{ color: colors[color] }}>{value}</div>
      <div className="text-xs text-[var(--muted)] mt-2">{sub}</div>
      <div className="absolute top-0 right-0 w-1 h-full" style={{ background: colors[color] }} />
    </div>
  );
}
