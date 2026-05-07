import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../lib/api.js';
import { PageHeader } from '../../components/AppShell.jsx';
import { Modal } from '../../components/Modal.jsx';
import { toast } from '../../components/Toast.jsx';

export function AdminCategories() {
  const [cats, setCats] = useState([]);
  const [showCat, setShowCat] = useState(false);
  const [showSub, setShowSub] = useState(null);

  const load = async () => setCats(await apiGet('/api/admin/categories'));
  useEffect(() => { load(); }, []);

  return (
    <>
      <PageHeader
        crumb="Operations"
        title="Categories & Subcategories"
        actions={<button onClick={() => setShowCat(true)} className="btn-primary">+ Add Category</button>}
      />

      <div className="text-sm text-[var(--muted)] mb-4">
        {cats.length} categories · {cats.reduce((s, c) => s + (c.subcategories?.length || 0), 0)} subcategories
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cats.map(c => (
          <div key={c.id} className="card p-5">
            <div className="flex items-start justify-between mb-2">
              <div className="display text-lg font-semibold">{c.name}</div>
              <div className="badge bg-[var(--paper-2)] text-[var(--muted)]">
                {c.subcategories?.length || 0} subs
              </div>
            </div>
            <div className="text-xs text-[var(--muted)] mb-4">{c.description || '—'}</div>
            <div className="space-y-1 mb-4">
              {(c.subcategories || []).map(s => (
                <div key={s.id} className="flex items-center justify-between text-sm py-1.5 border-b border-[var(--rule)]">
                  <span>{s.name}</span>
                </div>
              ))}
              {(!c.subcategories || c.subcategories.length === 0) && (
                <div className="text-xs text-[var(--muted)] italic py-2">No subcategories yet</div>
              )}
            </div>
            <button onClick={() => setShowSub(c)} className="w-full btn-secondary text-xs">+ Add Subcategory</button>
          </div>
        ))}
      </div>

      {showCat && <NewCategoryModal onClose={() => setShowCat(false)} onDone={() => { setShowCat(false); load(); }} />}
      {showSub && <NewSubcategoryModal category={showSub} onClose={() => setShowSub(null)} onDone={() => { setShowSub(null); load(); }} />}
    </>
  );
}

function NewCategoryModal({ onClose, onDone }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiPost('/api/admin/categories', { name, description: desc });
      toast('Category created');
      onDone?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="display text-2xl font-bold mb-6">New Category</div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input required autoFocus className="input" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea rows="2" className="input" value={desc} onChange={e => setDesc(e.target.value)} />
        </div>
        <div className="flex gap-2 pt-3">
          <button disabled={busy} type="submit" className="btn-primary flex-1">{busy ? 'Creating…' : 'Create'}</button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function NewSubcategoryModal({ category, onClose, onDone }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiPost(`/api/admin/categories/${category.id}/subcategories`, { name });
      toast('Subcategory added');
      onDone?.();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="kpi-label mb-2">Add Subcategory</div>
      <div className="display text-2xl font-bold mb-6">under {category.name}</div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Subcategory Name</label>
          <input required autoFocus className="input" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="flex gap-2 pt-3">
          <button disabled={busy} type="submit" className="btn-primary flex-1">{busy ? 'Adding…' : 'Add'}</button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
