-- Fix Supabase Security Advisor: views must evaluate permissions as the caller.
-- This preserves the aging calculation while ensuring underlying receivables RLS
-- is enforced for the querying user instead of the view owner.

begin;

alter view public.receivables_aging set (security_invoker = true);

commit;
