import { supabaseAdmin } from '../config/supabase.js';

// Verifies the Supabase JWT from Authorization header
// and attaches { id, email, role, full_name, employee_code } to req.user
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }
    const token = authHeader.slice('Bearer '.length);

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Look up the public.users row (role, name, etc.)
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('users')
      .select('id, employee_code, full_name, email, role, is_active, supervisor_id')
      .eq('id', user.id)
      .single();

    if (profileErr || !profile) {
      return res.status(403).json({
        error: 'User profile not found in public.users — admin must complete bootstrap.',
      });
    }
    if (!profile.is_active) {
      return res.status(403).json({ error: 'Account inactive' });
    }

    req.user = profile;
    req.token = token;
    next();
  } catch (e) {
    console.error('Auth error:', e);
    res.status(500).json({ error: 'Auth check failed' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}
