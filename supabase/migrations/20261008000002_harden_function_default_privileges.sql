-- ============================================================================
-- ENDURECIMIENTO: privilegios por defecto de FUNCIONES en el esquema public
-- ============================================================================
--
-- CONTEXTO
-- En PostgreSQL, `create function` concede EXECUTE al pseudo-rol PUBLIC de forma
-- automática. Como `anon` y `authenticated` heredan de PUBLIC, toda función
-- nueva en `public` queda invocable desde la Data API de Supabase
-- (`POST /rest/v1/rpc/<funcion>`) nada más crearse.
--
-- Si esa función es `security definer` (como casi todas las de este proyecto) y
-- no valida al llamante, un atacante sin cuenta podría ejecutar lógica de
-- negocio arbitraria. Es el vector que la documentación de Supabase describe:
-- revocar los privilegios por defecto NO elimina el EXECUTE implícito de PUBLIC.
--
-- ESTADO VERIFICADO DE ESTE PROYECTO (auditoría del 2026-10-07)
-- Las 66 funciones de `public` ya tienen su `revoke all on function ... from
-- public, anon, authenticated` explícito en su propia migración. Esta migración
-- no corrige nada roto: añade una red de seguridad para que una función FUTURA
-- no nazca expuesta por olvido.
--
-- POR QUÉ NO ROMPE LA APLICACIÓN
--   * El backend usa service_role, que conserva su acceso.
--   * Las funciones RLS (`has_tenant_access`, `is_active_tenant_member`, etc.) ya
--     estaban revocadas para anon/authenticated desde 0004_security_lockdown.sql,
--     por lo que revocarlas de nuevo no cambia el estado efectivo.
--   * Cualquier función futura que necesite acceso desde el cliente deberá
--     otorgarlo de forma explícita en su migración (que es lo deseable).
--
-- IMPORTANTE: este script NO revoca `execute` a `service_role`.
-- ============================================================================

begin;

-- 1) Retirar el EXECUTE implícito de PUBLIC en las funciones ya existentes y
--    dejar el estado explícito y auditable.
revoke execute on all functions in schema public from public, anon, authenticated;

-- 2) Red de seguridad: las funciones que se creen en el futuro por este rol en el
--    esquema public NO nacerán ejecutables por anon/authenticated/PUBLIC.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

commit;

-- ============================================================================
-- VERIFICACIÓN POST-DESPLIEGUE (ejecutar en el SQL Editor de Supabase)
-- ============================================================================
--
-- 1) ¿Qué funciones siguen siendo ejecutables por anon o authenticated?
--    Debe devolver CERO filas.
--
-- select p.proname as funcion_expuesta, r.rolname as rol
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- join aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a on true
-- join pg_roles r on r.oid = a.grantee
-- where n.nspname = 'public'
--   and a.privilege_type = 'EXECUTE'
--   and r.rolname in ('anon', 'authenticated')
-- order by 1, 2;
--
-- 2) Comprobar que service_role SÍ conserva acceso (debe devolver filas):
--
-- select count(*) as funciones_service_role
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- join aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a on true
-- join pg_roles r on r.oid = a.grantee
-- where n.nspname = 'public'
--   and a.privilege_type = 'EXECUTE'
--   and r.rolname = 'service_role';
-- ============================================================================
