-- ============================================================================
-- Reset de la cuota diaria de exportaciones (3/día) para UN tenant específico
-- ============================================================================
--
--  ⚠️  ERROR 22P02 "invalid input syntax for type uuid"
--
--  Ese error aparece cuando se ejecuta este script SIN reemplazar el marcador
--  por un UUID real (p. ej. dejando '<TU_TENANT_UUID>' o '<TENANT_UUID>').
--  PostgreSQL intenta convertir ese texto a `uuid` y falla.
--
--  NO ejecutes el script completo tal cual. Sigue el PASO 0 y luego usa el
--  bloque del PASO 2, que es idempotente y no necesita marcadores.
--
-- ----------------------------------------------------------------------------
-- PASO 0 — Obtener el UUID REAL del tenant
-- ----------------------------------------------------------------------------
-- Ejecuta SOLO esta consulta primero y copia el valor de la columna `id`:

select id, name, slug, timezone, plan
from public.tenants
order by created_at desc
limit 50;

-- Si conoces el nombre o el slug de la empresa de prueba, filtra:
-- select id, name, slug, timezone, plan
-- from public.tenants
-- where name ilike '%nombre parcial%' or slug ilike '%slug parcial%';

-- Un UUID válido tiene este aspecto (8-4-4-4-12 caracteres hexadecimales):
--   3f2b1c7e-9a84-4d1f-b0c2-15e6a7d8e9f0
-- Si lo que vas a pegar contiene '<', '>' o la palabra TENANT, está mal.


-- ----------------------------------------------------------------------------
-- PASO 1 — Ver el estado actual del contador (opcional pero recomendado)
-- ----------------------------------------------------------------------------
-- Reemplaza el UUID de ejemplo por el que copiaste en el PASO 0.

-- select tenant_id, local_date, export_count, last_exported_by, updated_at
-- from public.financial_report_export_daily_usage
-- where tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
-- order by local_date desc
-- limit 30;


-- ----------------------------------------------------------------------------
-- PASO 2 — Reset idempotente del día actual (RECOMENDADO)
-- ----------------------------------------------------------------------------
-- Bloque autocontenido: cambia ÚNICAMENTE el valor de `v_tenant_id`.
-- Es idempotente: puedes ejecutarlo tantas veces como quieras y el resultado
-- siempre es "0 exportaciones usadas hoy". Valida el UUID antes de tocar datos,
-- así que nunca verás un 22P02 críptico.

do $$
declare
  -- 👇 PEGA AQUÍ EL UUID REAL OBTENIDO EN EL PASO 0
  v_tenant_text text := '00000000-0000-0000-0000-000000000000';
  v_tenant_id   uuid;
  v_local_date  date;
  v_timezone    text;
begin
  if v_tenant_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception
      'v_tenant_id no es un UUID válido: %. Ejecuta el PASO 0 y pega el id real del tenant (sin < >).',
      v_tenant_text;
  end if;

  v_tenant_id := v_tenant_text::uuid;

  -- Misma resolución de zona horaria que `consume_financial_report_export`.
  select coalesce(nullif(t.timezone, ''), 'America/Managua')
    into v_timezone
  from public.tenants t
  where t.id = v_tenant_id;

  if not found then
    raise exception 'No existe ningún tenant con id %. Verifica el UUID en el PASO 0.', v_tenant_id;
  end if;

  v_local_date := (now() at time zone v_timezone)::date;

  insert into public.financial_report_export_daily_usage (tenant_id, local_date, export_count, updated_at)
  values (v_tenant_id, v_local_date, 0, now())
  on conflict (tenant_id, local_date)
  do update set export_count = 0, updated_at = now();

  raise notice 'Cuota diaria reseteada a 0 para tenant % en la fecha local % (zona %).',
    v_tenant_id, v_local_date, v_timezone;
end;
$$;


-- ----------------------------------------------------------------------------
-- PASO 3 — Verificación
-- ----------------------------------------------------------------------------
-- Reemplaza el UUID y comprueba que `export_count` = 0 para la fecha de hoy.

-- select tenant_id, local_date, export_count, updated_at
-- from public.financial_report_export_daily_usage
-- where tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
-- order by local_date desc
-- limit 5;


-- ----------------------------------------------------------------------------
-- PASO 4 — Limpiezas opcionales (SOLO entornos de prueba)
-- ----------------------------------------------------------------------------
-- Borrar todo el histórico diario de ese tenant:
-- delete from public.financial_report_export_daily_usage
-- where tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;

-- Borrar contadores mensuales antiguos (ya no se usan tras la migración daily-only):
-- delete from public.entitlement_usage
-- where tenant_id = '00000000-0000-0000-0000-000000000000'::uuid;

-- ⚠️ Nunca ejecutes un DELETE sin la cláusula `where tenant_id = ...`:
--    harías un reset global y afectarías a todas las empresas del SaaS.
