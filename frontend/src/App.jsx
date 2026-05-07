import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './stores/auth.js';
import { AppShell } from './components/AppShell.jsx';
import { ToastContainer } from './components/Toast.jsx';

import { Login } from './pages/Login.jsx';

import { AdminDashboard } from './pages/admin/Dashboard.jsx';
import { AdminEmployees } from './pages/admin/Employees.jsx';
import { AdminCategories } from './pages/admin/Categories.jsx';
import { AdminAllocations } from './pages/admin/Allocations.jsx';
import { AdminLedger } from './pages/admin/Ledger.jsx';
import { AdminDaily, AdminMonthly, AdminCashflow } from './pages/admin/Reports.jsx';

import { EmployeeDashboard } from './pages/employee/Dashboard.jsx';
import { EmployeeAddExpense } from './pages/employee/AddExpense.jsx';
import { EmployeeHistory } from './pages/employee/History.jsx';
import { EmployeeAllocations } from './pages/employee/Allocations.jsx';

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : '/employee'} replace />;
}

function RequireAuth({ children, role }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-[var(--muted)]">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (role && user.role !== role) {
    return <Navigate to={user.role === 'admin' ? '/admin' : '/employee'} replace />;
  }
  return children;
}

export default function App() {
  const init = useAuth(s => s.init);
  useEffect(() => { init(); }, [init]);

  return (
    <>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<Login />} />

        {/* ADMIN */}
        <Route
          path="/admin"
          element={<RequireAuth role="admin"><AppShell /></RequireAuth>}
        >
          <Route index element={<AdminDashboard />} />
          <Route path="employees" element={<AdminEmployees />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="allocations" element={<AdminAllocations />} />
          <Route path="ledger" element={<AdminLedger />} />
          <Route path="daily" element={<AdminDaily />} />
          <Route path="monthly" element={<AdminMonthly />} />
          <Route path="cashflow" element={<AdminCashflow />} />
        </Route>

        {/* EMPLOYEE */}
        <Route
          path="/employee"
          element={<RequireAuth role="employee"><AppShell /></RequireAuth>}
        >
          <Route index element={<EmployeeDashboard />} />
          <Route path="add" element={<EmployeeAddExpense />} />
          <Route path="history" element={<EmployeeHistory />} />
          <Route path="allocations" element={<EmployeeAllocations />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastContainer />
    </>
  );
}
