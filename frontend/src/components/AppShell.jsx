import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../stores/auth.js';
import { fmtDate } from '../lib/format.js';

const adminNav = [
  { group: 'Overview', items: [
    { to: '/admin', label: 'Dashboard', end: true },
    { to: '/admin/cashflow', label: 'Cash Flow' },
  ]},
  { group: 'Operations', items: [
    { to: '/admin/employees', label: 'Employees' },
    { to: '/admin/categories', label: 'Categories' },
    { to: '/admin/allocations', label: 'Allocations' },
  ]},
  { group: 'Reports', items: [
    { to: '/admin/daily', label: 'Daily Spending' },
    { to: '/admin/monthly', label: 'Monthly Summary' },
    { to: '/admin/ledger', label: 'General Ledger' },
  ]},
];

const employeeNav = [
  { group: 'My Account', items: [
    { to: '/employee', label: 'Dashboard', end: true },
    { to: '/employee/add', label: 'Add Expense' },
    { to: '/employee/history', label: 'Expense History' },
    { to: '/employee/allocations', label: 'My Allocations' },
  ]},
];

export function AppShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const nav = user.role === 'admin' ? adminNav : employeeNav;

  return (
    <div className="min-h-screen flex">
      {/* SIDEBAR */}
      <aside className="w-[260px] border-r border-[var(--rule)] bg-[var(--paper-2)] flex flex-col sticky top-0 h-screen no-print">
        <div className="p-6 border-b border-[var(--rule)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 border-2 border-[var(--ink)] rounded-full flex items-center justify-center">
              <span className="display text-sm font-bold">A</span>
            </div>
            <div>
              <div className="display font-bold text-base leading-none">ABC Metals</div>
              <div className="text-[10px] tracking-[0.16em] uppercase text-[var(--muted)] font-semibold mt-1">Ledger System</div>
            </div>
          </div>
        </div>

        <div className="p-4 border-b border-[var(--rule)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--ink)] text-[var(--paper)] flex items-center justify-center display font-semibold">
              {user.full_name?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">{user.full_name}</div>
              <div
                className="text-[10px] tracking-[0.14em] uppercase font-semibold mt-0.5"
                style={{ color: user.role === 'admin' ? 'var(--accent)' : 'var(--credit)' }}
              >
                {user.role === 'admin' ? 'Administrator' : user.employee_code}
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav.map(group => (
            <div key={group.group}>
              <div className="px-3 py-2 mt-2 text-[10px] tracking-[0.16em] uppercase text-[var(--muted-2)] font-bold">
                {group.group}
              </div>
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <span className="nav-dot"></span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-[var(--rule)] space-y-1">
          <button
            className="nav-item w-full"
            onClick={async () => {
              await signOut();
              navigate('/login');
            }}
          >
            <span className="nav-dot"></span>
            Sign Out
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 bg-[var(--paper)]/95 backdrop-blur border-b border-[var(--rule)] px-8 py-4 flex items-center justify-between no-print">
          <div id="page-header"></div>
          <div className="text-xs text-[var(--muted)] mono">{fmtDate(new Date())}</div>
        </header>
        <div className="p-8 fade-up">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

// Helper component pages can use to set the header
export function PageHeader({ crumb, title, actions }) {
  // Render into header portal — for simplicity we just render inline at top of page
  return (
    <div className="flex items-start justify-between mb-6 -mt-2">
      <div>
        <div className="text-[10px] tracking-[0.16em] uppercase text-[var(--muted)] font-semibold mb-1">
          {crumb}
        </div>
        <div className="display text-2xl font-bold">{title}</div>
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
