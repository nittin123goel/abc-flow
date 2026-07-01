import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../lib/api.js';
import { fmt } from '../../lib/format.js';
import { PageHeader } from '../../components/AppShell.jsx';
import { Modal } from '../../components/Modal.jsx';
import { AllocateModal, AdjustModal } from './AllocateModal.jsx';
import { toast } from '../../components/Toast.jsx';

export function AdminEmployees() {
  const [list, setList] = useState([]);
  const [allocFor, setAllocFor] = useState(null);
  const [adjustFor, setAdjustFor] = useState(null);
  const [pwdFor, setPwdFor] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setList(await apiGet('/api/admin/employees'));
  };
  useEffect(() => { load(); }, []);

  return (
    <>
      <PageHeader
        crumb="Operations"
        title="Employees"
        actions={
          <button onClick={() => setShowCreate(true)} className="btn-primary">+ Add Employee</button>
        }
      />

      <div className="text-sm text-[var(--muted)] mb-4">
        {list.length} employees
      </div>

      <div className="card">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Name</th>
              <th className="table-header">Code</th>
              <th className="table-header text-right">Allocated</th>
              <th className="table-header text-right">Spent</th>
              <th className="table-header text-right">Balance</th>
              <th className="table-header text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map(e => (
              <tr key={e.employee_id}>
                <td className="table-cell">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[var(--paper)] border border-[var(--rule-2)] flex items-center justify-center display font-semibold text-sm">
                      {e.full_name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-semibold text-[var(--ink)]">{e.full_name}</div>
                      <div className="text-xs text-[var(--muted)]">{e.email}</div>
                    </div>
                  </div>
                </td>
                <td className="table-cell mono text-xs">{e.employee_code}</td>
                <td className="table-cell text-right mono">{fmt(e.total_allocated)}</td>
                <td className="table-cell text-right mono" style={{ color: 'var(--debit)' }}>{fmt(e.total_spent)}</td>
                <td
                  className="table-cell text-right mono font-semibold"
                  style={{ color: e.balance < 1000 ? 'var(--debit)' : undefined }}
                >
                  {fmt(e.balance)}
                </td>
                <td className="table-cell text-right">
                  <div className="flex gap-1.5 justify-end">
                    <button
                      onClick={() => setAllocFor(e)}
                      className="btn-secondary !py-1.5 !px-3 text-xs"
                    >
                      Allocate
                    </button>
                    <button
                      onClick={() => setAdjustFor(e)}
                      className="btn-secondary !py-1.5 !px-3 text-xs"
                    >
                      Adjust
                    </button>
                    <button
                      onClick={() => setPwdFor(e)}
                      className="btn-secondary !py-1.5 !px-3 text-xs"
                    >
                      Password
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan="6"><div className="empty-state">No employees yet — add the first one</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {allocFor && (
        <AllocateModal employee={allocFor} onClose={() => setAllocFor(null)} onDone={() => { setAllocFor(null); load(); }} />
      )}
      {adjustFor && (
        <AdjustModal employee={adjustFor} onClose={() => setAdjustFor(null)} onDone={() => { setAdjustFor(null); load(); }} />
      )}
      {pwdFor && (
        <ResetPasswordModal employee={pwdFor} onClose={() => setPwdFor(null)} onDone={() => setPwdFor(null)} />
      )}
      {showCreate && (
        <CreateEmployeeModal onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); load(); }} />
      )}
    </>
  );
}

function CreateEmployeeModal({ onClose, onDone }) {
  const [form, setForm] = useState({
    full_name: '', email: '', employee_code: '', phone: '', password: '',
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiPost('/api/admin/employees', form);
      toast('Employee created');
      onDone?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="display text-2xl font-bold mb-6">New Employee</div>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Full Name</label>
            <input required className="input" value={form.full_name}
              onChange={e => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <label className="label">Employee Code</label>
            <input required className="input mono" placeholder="EMP005" value={form.employee_code}
              onChange={e => setForm({ ...form, employee_code: e.target.value.toUpperCase() })} />
          </div>
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" required className="input" value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label">Phone (optional)</label>
          <input className="input" value={form.phone}
            onChange={e => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="label">Initial Password</label>
          <input type="text" required minLength="8" className="input mono" value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })} />
          <div className="text-xs text-[var(--muted)] mt-1">Share with the employee securely. They can change it after first login.</div>
        </div>
        <div className="flex gap-2 pt-3">
          <button type="submit" disabled={busy} className="btn-primary flex-1">
            {busy ? 'Creating…' : 'Create Employee'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ employee, onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiPost(`/api/admin/employees/${employee.employee_id}/password`, { password });
      toast('Password updated');
      onDone?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="display text-2xl font-bold mb-1">Reset Password</div>
      <div className="text-sm text-[var(--muted)] mb-6">{employee.full_name} · {employee.email}</div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">New Password</label>
          <input type="text" required minLength="8" className="input mono" value={password}
            onChange={e => setPassword(e.target.value)} />
          <div className="text-xs text-[var(--muted)] mt-1">Minimum 8 characters. Share with the employee securely.</div>
        </div>
        <div className="flex gap-2 pt-3">
          <button type="submit" disabled={busy} className="btn-primary flex-1">
            {busy ? 'Updating…' : 'Update Password'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
