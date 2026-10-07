-- ============================================================================
-- CIERRE DE HALLAZGO CRÍTICO DE SEGURIDAD (RLS ausente en tablas de negocio)
-- ============================================================================
--
-- PROBLEMA
-- Las migraciones de las etapas 4, 7 y 8 crearon tablas con `create table` en el
-- esquema `public` y NUNCA ejecutaron `enable row level security` sobre ellas.
--
-- ¿Por qué es crítico en Supabase?
--   1. El esquema `public` se publica automáticamente a través de PostgREST
--      (la Data API). Cada tabla tiene un endpoint REST propio:
--      https://<proyecto>.supabase.co/rest/v1/<tabla>
--   2. Supabase concede por defecto privilegios SELECT/INSERT/UPDATE/DELETE a los
--      roles `anon` y `authenticated` sobre las tablas nuevas de `public`.
--   3. La anon key NO es un secreto: viaja en el bundle de JavaScript del
--      navegador y es visible para cualquiera. Supabase la documenta como pública.
--   4. Con RLS DESHABILITADO los privilegios no se filtran por fila: cualquiera
--      que extraiga la anon key del bundle podía leer y escribir TODAS las filas
--      de TODOS los tenants.
--
-- Tablas afectadas (10): price_lists, price_list_items, customer_price_lists,
-- branch_price_lists, commercial_rules, sales_commissions, payables,
-- payable_payments, financial_outflows, cash_reconciliations.
--
-- Es la misma clase de fallo que la CVE-2025-48757 (170+ aplicaciones con datos
-- expuestos por tablas sin RLS) y el lint `rls_disabled_in_public` (nivel ERROR)
-- del Security Advisor de Supabase.
--
-- POR QUÉ ESTA CORRECCIÓN NO ROMPE LA APLICACIÓN
-- El backend accede a Supabase exclusivamente con la service_role key
-- (lib/supabase/server.ts). `service_role` tiene BYPASSRLS, de modo que la RLS
-- no se evalúa para él. Además, las funciones RPC de estas etapas son
-- `security definer`, son propiedad del rol que aplica las migraciones (dueño de
-- las tablas) y sólo tienen `grant execute ... to service_role`. El cliente de
-- navegador (lib/supabase/client.ts) se usa únicamente para autenticación y no
-- consulta tablas directamente.
--
-- Por lo tanto: se habilita RLS (queda "denegado por defecto") y se añaden
-- políticas de denegación explícitas para anon/authenticated, siguiendo la misma
-- convención ya usada en 20260915000001_backend_tables_deny_policies.sql.
--
-- NOTA: no se usa `force row level security`, porque eso aplicaría RLS también al
-- dueño de la tabla y rompería las funciones `security definer`.
-- ============================================================================

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

-- ============================================================================
-- VERIFICACIÓN POST-DESPLIEGUE (ejecutar en el SQL Editor de Supabase)
-- Debe devolver CERO filas. Si devuelve alguna, esa tabla sigue expuesta.
-- ============================================================================
--
-- select c.relname as tabla_expuesta
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relkind = 'r'
--   and c.relrowsecurity = false
-- order by 1;
--
-- Prueba de penetración manual (sustituye URL y ANON_KEY). Debe devolver
-- `[]` o un error de permisos, nunca una lista de datos:
--
-- curl "https://<proyecto>.supabase.co/rest/v1/payables?select=*" \
--   -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
-- ============================================================================
