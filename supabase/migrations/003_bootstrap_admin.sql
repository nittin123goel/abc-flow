-- ============================================================
-- Bootstrap First Admin User
-- 
-- Run this AFTER you've created the admin user in Supabase Auth UI:
--   1. Go to Authentication → Users → Add User
--   2. Email: nittin@abcmetals.in (or your choice), set a password
--   3. Copy the user's UUID
--   4. Replace YOUR_AUTH_USER_UUID below and run this
-- ============================================================

-- Replace 'YOUR_AUTH_USER_UUID' with the UUID from auth.users
-- Replace email/name with your actual admin

insert into public.users (id, employee_code, full_name, email, role, is_active)
values (
  'YOUR_AUTH_USER_UUID'::uuid,
  'ADM001',
  'Nittin Goel',
  'nittin@abcmetals.in',
  'admin',
  true
)
on conflict (id) do update
  set role = 'admin',
      is_active = true,
      full_name = excluded.full_name,
      employee_code = excluded.employee_code;
