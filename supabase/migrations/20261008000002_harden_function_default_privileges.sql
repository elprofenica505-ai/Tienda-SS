-- ============================================================================
-- ENDURECIMIENTO: privilegios de EJECUCIÓN de funciones en el esquema public
-- ============================================================================
--
-- CONTEXTO
-- En PostgreSQL, `create function` concede EXECUTE al pseudo-rol PUBLIC de forma
-- automática. Como `anon` y `authenticated` heredan de PUBLIC, toda función
-- nueva en `public` queda invocable desde la Data API de Supabase
-- (`POST /rest/v1/rpc/<funcion>`) nada más crearse. Si esa función es
-- `security definer` y no valida al llamante, un atacante sin cuenta podría
-- ejecutar lógica de negocio arbitraria.
--
-- ESTADO VERIFICADO DE ESTE PROYECTO (auditoría del 2026-10-07)
--   * Las 66 funciones de `public` ya tienen su `revoke all on function ...
--     from public, anon, authenticated` explícito en su propia migración.
--   * Los 6 helpers de RLS (`has_tenant_access`, `is_active_tenant_member`, ...)
--     además fueron revocados en 0004_security_lockdown.sql.
--   * Ninguna de las 11 funciones sin `grant execute ... to service_role` se
--     invoca por RPC desde la aplicación (son helpers de RLS, funciones de
--     trigger y funciones internas).
--
-- Es decir: NO existe una vulnerabilidad abierta aquí. Esta migración es una red
-- de seguridad para que una función FUTURA no nazca expuesta por olvido.
--
-- SEGURIDAD DE ESTA MIGRACIÓN (por qué no rompe nada)
--   1. Primero se OTORGA EXECUTE a service_role en TODAS las funciones. El
--      backend usa service_role, así que su acceso queda garantizado de forma
--      explícita antes de revocar cualquier cosa.
--   2. El propietario de una función CONSERVA siempre EXECUTE: el ACL por defecto
--      de una función es `{propietario=X/propietario, =X/propietario}`, por lo que
--      revocar de PUBLIC no elimina la entrada del propietario. Las llamadas
--      internas de las funciones `security definer` (p. ej. `erp_normalize_items`,
--      `erp_server_price_items`) siguen funcionando porque se ejecutan como el
--      propietario.
--   3. Las funciones de trigger son seguras: PostgreSQL sólo comprueba EXECUTE
--      al CREAR el trigger, no en tiempo de ejecución, así que revocar el permiso
--      no detiene los triggers ya existentes
--      (`inventory_movement_immutable_guard`, `inventory_movement_kardex_guard`,
--      `enforce_receivable_credit_limit`).
--
-- IMPORTANTE — el bloque final usa `ALTER DEFAULT PRIVILEGES` SIN `IN SCHEMA`.
-- Según la documentación de PostgreSQL, los privilegios por defecto indicados por
-- esquema se SUMAN a los globales y "no se puede revocar un privilegio por
-- esquema si fue otorgado globalmente; el REVOKE por esquema sólo revierte un
-- GRANT previo por esquema". Como el EXECUTE a PUBLIC es un valor global
-- incorporado de PostgreSQL, un `ALTER DEFAULT PRIVILEGES IN SCHEMA public
-- REVOKE EXECUTE ON FUNCTIONS` sería un NO-OP silencioso. Por eso se usa la forma
-- global, envuelta en un bloque que tolera falta de permisos para no romper la
-- migración en proyectos donde el rol no pueda cambiar esos valores.
-- ============================================================================

begin;

-- 1) Garantizar explícitamente el acceso del backend ANTES de revocar nada.
grant execute on all functions in schema public to service_role;

-- 2) Retirar el EXECUTE implícito de PUBLIC (y de los roles de la Data API) en
--    todas las funciones existentes del esquema public.
revoke execute on all functions in schema public from public, anon, authenticated;

-- 3) Red de seguridad para funciones FUTURAS. Se usa la forma global porque la
--    forma con `IN SCHEMA` no puede revocar un privilegio otorgado globalmente.
--    Envuelto para tolerar `insufficient_privilege`: si el rol actual no puede
--    alterar los privilegios por defecto, se avisa pero la migración se aplica.
do $$
begin
  execute 'alter default privileges for role ' || quote_ident(current_user)
       || ' revoke execute on functions from public';
  execute 'alter default privileges for role ' || quote_ident(current_user)
       || ' revoke execute on functions from anon, authenticated';
  raise notice 'Privilegios por defecto endurecidos para el rol % (las funciones nuevas no nacen ejecutables por anon/authenticated).', current_user;
exception
  when insufficient_privilege then
    raise notice 'AVISO: el rol % no puede alterar los privilegios por defecto. Las funciones futuras deberán revocar EXECUTE en su propia migración (la prueba tests/rls-coverage.test.ts lo verifica en CI).', current_user;
  when undefined_object then
    raise notice 'AVISO: los roles anon/authenticated no existen en esta base de datos; se omite el endurecimiento de privilegios por defecto.';
end $$;

commit;

-- ============================================================================
-- VERIFICACIÓN POST-DESPLIEGUE (ejecutar en el SQL Editor de Supabase)
-- ============================================================================
--
-- 1) Funciones todavía ejecutables por anon o authenticated. DEBE DEVOLVER CERO.
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
-- 2) El backend CONSERVA acceso. DEBE DEVOLVER > 0.
--
-- select count(*) as funciones_para_service_role
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- join aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a on true
-- join pg_roles r on r.oid = a.grantee
-- where n.nspname = 'public'
--   and a.privilege_type = 'EXECUTE'
--   and r.rolname = 'service_role';
-- ============================================================================
