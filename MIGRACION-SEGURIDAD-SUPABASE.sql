-- ============================================================================
--  TIENDA-SS / CONEXIAX - MIGRACION DE SEGURIDAD
--  Fecha: 2026-10-07
--
--  COMO APLICARLO
--    Opcion A (CLI, recomendada):
--        supabase link --project-ref <tu-project-ref>
--        supabase db push
--    Opcion B (manual):
--        Supabase Dashboard -> SQL Editor -> New query -> pegar TODO -> Run
--
--  USA el rol postgres (dueno del proyecto). NO uses service_role.
--  Cada paso va en su propia transaccion: si algo falla, ese paso no se aplica.
--  Tiempo estimado: menos de 5 segundos. No interrumpe la aplicacion.
--
--  RESPALDO: confirma en Dashboard -> Database -> Backups que hay un backup
--  reciente antes de ejecutar.
-- ============================================================================


-- ############################################################################
-- PASO 1 DE 2 - CIERRE DEL HALLAZGO CRITICO (RLS ausente en 10 tablas)
--   Tablas: price_lists, price_list_items, customer_price_lists,
--   branch_price_lists, commercial_rules, sales_commissions, payables,
--   payable_payments, financial_outflows, cash_reconciliations.
--   Activa RLS, revoca privilegios de anon/authenticated, agrega politicas de
--   denegacion explicitas y endurece los privilegios por defecto.
--   NO afecta a service_role: conserva acceso total (BYPASSRLS).
-- ############################################################################

begin;

-- 1) Etapa 4 — reglas comerciales, listas de precios y comisiones.
alter table public.price_lists enable row level security;
alter table public.price_list_items enable row level security;
alter table public.customer_price_lists enable row level security;
alter table public.branch_price_lists enable row level security;
alter table public.commercial_rules enable row level security;
alter table public.sales_commissions enable row level security;

-- 2) Etapa 7 — cuentas por pagar y salidas de dinero.
alter table public.payables enable row level security;
alter table public.payable_payments enable row level security;
alter table public.financial_outflows enable row level security;

-- 3) Etapa 8 — arqueos de caja inmutables.
alter table public.cash_reconciliations enable row level security;

-- 4) Retirar los privilegios por defecto de los roles de la Data API. Son datos
--    de backend: sólo se escriben/leen desde el servidor con service_role.
revoke all on table public.price_lists,
                   public.price_list_items,
                   public.customer_price_lists,
                   public.branch_price_lists,
                   public.commercial_rules,
                   public.sales_commissions,
                   public.payables,
                   public.payable_payments,
                   public.financial_outflows,
                   public.cash_reconciliations
  from anon, authenticated;

-- 5) Políticas de denegación explícitas: documentan la intención y hacen que el
--    Security Advisor distinga "backend-only a propósito" de "tabla olvidada".
drop policy if exists price_lists_client_deny on public.price_lists;
create policy price_lists_client_deny on public.price_lists
  for all to anon, authenticated using (false) with check (false);

drop policy if exists price_list_items_client_deny on public.price_list_items;
create policy price_list_items_client_deny on public.price_list_items
  for all to anon, authenticated using (false) with check (false);

drop policy if exists customer_price_lists_client_deny on public.customer_price_lists;
create policy customer_price_lists_client_deny on public.customer_price_lists
  for all to anon, authenticated using (false) with check (false);

drop policy if exists branch_price_lists_client_deny on public.branch_price_lists;
create policy branch_price_lists_client_deny on public.branch_price_lists
  for all to anon, authenticated using (false) with check (false);

drop policy if exists commercial_rules_client_deny on public.commercial_rules;
create policy commercial_rules_client_deny on public.commercial_rules
  for all to anon, authenticated using (false) with check (false);

drop policy if exists sales_commissions_client_deny on public.sales_commissions;
create policy sales_commissions_client_deny on public.sales_commissions
  for all to anon, authenticated using (false) with check (false);

drop policy if exists payables_client_deny on public.payables;
create policy payables_client_deny on public.payables
  for all to anon, authenticated using (false) with check (false);

drop policy if exists payable_payments_client_deny on public.payable_payments;
create policy payable_payments_client_deny on public.payable_payments
  for all to anon, authenticated using (false) with check (false);

drop policy if exists financial_outflows_client_deny on public.financial_outflows;
create policy financial_outflows_client_deny on public.financial_outflows
  for all to anon, authenticated using (false) with check (false);

drop policy if exists cash_reconciliations_client_deny on public.cash_reconciliations;
create policy cash_reconciliations_client_deny on public.cash_reconciliations
  for all to anon, authenticated using (false) with check (false);

-- 6) Endurecer los privilegios por defecto para que una tabla futura creada en
--    `public` NO nazca expuesta a la Data API. Cualquier tabla nueva deberá
--    otorgar privilegios de forma explícita en su propia migración.
alter default privileges in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;

-- 7) TRUNCATE no consulta la RLS: un `grant truncate` permitiría vaciar la tabla
--    incluso con RLS activa. Se retira para los roles de la Data API.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

commit;

-- ############################################################################
-- PASO 2 DE 2 - RED DE SEGURIDAD PARA FUNCIONES FUTURAS
--   En PostgreSQL `create function` concede EXECUTE a PUBLIC automaticamente, y
--   anon/authenticated heredan de PUBLIC. Las 66 funciones actuales ya revocan ese
--   permiso en sus propias migraciones; este paso evita que una funcion FUTURA
--   nazca invocable desde POST /rest/v1/rpc.
--
--   ORDEN SEGURO: primero se OTORGA EXECUTE a service_role (el backend nunca
--   pierde acceso) y despues se revoca de public/anon/authenticated.
--   El propietario de cada funcion conserva EXECUTE siempre, por lo que las
--   llamadas internas de las funciones security definer siguen funcionando.
--   NO afecta a service_role.
-- ############################################################################

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

-- ############################################################################
-- VERIFICACION 1 - Tablas aun expuestas. DEBE DEVOLVER CERO FILAS.
-- ############################################################################
select c.relname as tabla_expuesta
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
order by 1;

-- ############################################################################
-- VERIFICACION 2 - Funciones ejecutables por anon/authenticated.
--                   DEBE DEVOLVER CERO FILAS.
-- ############################################################################
select p.proname as funcion_expuesta, r.rolname as rol
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a on true
join pg_roles r on r.oid = a.grantee
where n.nspname = 'public'
  and a.privilege_type = 'EXECUTE'
  and r.rolname in ('anon', 'authenticated')
order by 1, 2;

-- ############################################################################
-- VERIFICACION 3 - service_role CONSERVA acceso. DEBE DEVOLVER > 0.
-- ############################################################################
select count(*) as funciones_para_service_role
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a on true
join pg_roles r on r.oid = a.grantee
where n.nspname = 'public'
  and a.privilege_type = 'EXECUTE'
  and r.rolname = 'service_role';
