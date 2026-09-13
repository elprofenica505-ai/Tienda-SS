-- ConexiaX / Supabase-only Storage foundation
-- Files are private and must be stored under: <tenant_uuid>/<category>/<filename>

insert into storage.buckets (id, name, public)
values ('tenant-files', 'tenant-files', false)
on conflict (id) do update set public = excluded.public;

create policy tenant_files_select
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'tenant-files'
    and public.is_active_tenant_member((storage.foldername(name))[1]::uuid)
  );

create policy tenant_files_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'tenant-files'
    and public.is_active_tenant_member((storage.foldername(name))[1]::uuid)
  );

create policy tenant_files_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'tenant-files'
    and public.is_active_tenant_member((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'tenant-files'
    and public.is_active_tenant_member((storage.foldername(name))[1]::uuid)
  );

create policy tenant_files_delete_admin
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'tenant-files'
    and public.is_tenant_admin((storage.foldername(name))[1]::uuid)
  );
