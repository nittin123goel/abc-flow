-- ============================================================
-- Supabase Storage Setup for receipt uploads
-- Run this AFTER 001_init.sql
-- ============================================================

-- Create private bucket for receipts
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,                                          -- private bucket
  5242880,                                        -- 5 MB limit
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do nothing;

-- Storage RLS policies
-- Path convention: receipts/{employee_id}/{uuid}.{ext}

-- Employees can upload to their own folder
drop policy if exists "receipts_employee_upload" on storage.objects;
create policy "receipts_employee_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Employees can read their own receipts; admins can read all
drop policy if exists "receipts_read" on storage.objects;
create policy "receipts_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.current_user_role() = 'admin'
    )
  );

-- Only admin can delete
drop policy if exists "receipts_admin_delete" on storage.objects;
create policy "receipts_admin_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'receipts'
    and public.current_user_role() = 'admin'
  );
