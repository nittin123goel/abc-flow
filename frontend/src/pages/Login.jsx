import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../stores/auth.js';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      await signIn(email, password);
      // The init() flow will populate the user, then App's redirect picks the right home.
      navigate('/');
    } catch (e) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="min-h-screen login-bg flex items-center justify-center p-6 relative">
      <div className="relative z-10 w-full max-w-5xl grid md:grid-cols-2 gap-12 items-center">
        {/* LEFT */}
        <div className="space-y-8">
          <div className="flex items-center gap-4">
            <div className="seal">
              <span className="display text-2xl font-bold">A</span>
            </div>
            <div>
              <div className="text-xs tracking-[0.3em] text-[var(--muted)] uppercase font-semibold mb-1">
                Established 2026
              </div>
              <div className="display text-2xl font-bold tracking-tight">ABC Metals Co.</div>
            </div>
          </div>

          <div>
            <div className="display text-6xl md:text-7xl font-bold leading-[0.95] tracking-tight">
              Cash flow,<br />
              <em className="not-italic font-light" style={{ color: 'var(--accent)' }}>accounted</em><br />
              <span className="text-[var(--muted)]">to the rupee.</span>
            </div>
          </div>

          <p className="text-[15px] text-[var(--ink-2)] leading-relaxed max-w-md">
            A double-entry ledger system for tracking employee allocations, daily expenses, and company-wide cash flow.
          </p>

          <div className="flex items-center gap-6 pt-4">
            <div className="stamp">v1.0 · Production</div>
          </div>
        </div>

        {/* RIGHT — login card */}
        <div className="card p-10 relative">
          <div className="absolute top-0 right-0 px-4 py-1.5 bg-[var(--ink)] text-[var(--paper)] text-[10px] tracking-[0.2em] uppercase font-semibold">
            Sign In
          </div>

          <div className="mb-8">
            <div className="display text-3xl font-bold mb-2">Welcome back</div>
            <p className="text-sm text-[var(--muted)]">Enter your credentials to access the ledger.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                className="input"
                placeholder="you@abcmetals.in"
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="input"
                placeholder="••••••••"
              />
            </div>

            {err && (
              <div className="text-xs p-3 border border-[var(--debit)] bg-red-50 text-[var(--debit)] rounded-sm">
                {err}
              </div>
            )}

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div className="divider-fancy text-[10px] tracking-[0.2em] uppercase font-semibold mt-8">
            Need access?
          </div>
          <p className="text-xs text-[var(--muted)] text-center mt-4 leading-relaxed">
            Contact your administrator to provision an account.
          </p>
        </div>
      </div>
    </section>
  );
}
