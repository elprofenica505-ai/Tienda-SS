-- Lock down helper functions used by RLS.
-- Backend uses the server-only Supabase service role; these helpers are not public RPCs.
revoke execute on function public.current_auth_user_id() from public, anon, authenticated;
revoke execute on function public.is_active_tenant_member(uuid) from public, anon, authenticated;
revoke execute on function public.is_tenant_admin(uuid) from public, anon, authenticated;
revoke execute on function public.has_active_branch_access(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.has_tenant_access(uuid) from public, anon, authenticated;
revoke execute on function public.has_tenant_admin_access(uuid) from public, anon, authenticated;
