import { create } from 'zustand';
import { supabase } from '../lib/supabase.js';
import { apiGet } from '../lib/api.js';

export const useAuth = create((set, get) => ({
  user: null,           // public.users row { id, full_name, email, role, employee_code, ... }
  session: null,        // supabase session
  loading: true,
  error: null,

  // Initialize on app boot — checks for existing session
  init: async () => {
    set({ loading: true });
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      try {
        const user = await apiGet('/api/me');
        set({ session, user, loading: false });
      } catch (e) {
        console.error('Profile fetch failed:', e);
        await supabase.auth.signOut();
        set({ session: null, user: null, loading: false, error: e.message });
      }
    } else {
      set({ loading: false });
    }

    // listen for auth state changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        set({ session: null, user: null });
      } else if (event === 'SIGNED_IN' && session) {
        try {
          const user = await apiGet('/api/me');
          set({ session, user });
        } catch (e) {
          set({ session: null, user: null, error: e.message });
        }
      }
    });
  },

  signIn: async (email, password) => {
    set({ loading: true, error: null });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ loading: false, error: error.message });
      throw error;
    }
    try {
      const user = await apiGet('/api/me');
      set({ session: data.session, user, loading: false });
    } catch (e) {
      set({ loading: false, error: e.message });
      await supabase.auth.signOut();
      throw e;
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },
}));
