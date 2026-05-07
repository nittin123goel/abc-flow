import { create } from 'zustand';

const useToast = create((set) => ({
  toasts: [],
  show: (msg, kind = 'info') => {
    const id = Date.now() + Math.random();
    set(s => ({ toasts: [...s.toasts, { id, msg, kind }] }));
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, 2400);
  },
}));

export const toast = (msg, kind = 'info') => useToast.getState().show(msg, kind);

export function ToastContainer() {
  const toasts = useToast(s => s.toasts);
  return (
    <div className="fixed bottom-6 right-6 z-50 space-y-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`px-5 py-3 rounded-sm shadow-2xl text-sm font-medium fade-up ${
            t.kind === 'error'
              ? 'bg-[var(--debit)] text-white'
              : 'bg-[var(--ink)] text-[var(--paper)]'
          }`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
