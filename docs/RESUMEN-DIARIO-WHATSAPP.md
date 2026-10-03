# Resumen Diario Automático (WhatsApp + dentro del sistema)

Módulo que todos los días, a la hora local configurada por cada empresa, calcula el resumen del día
con datos reales de ConexiaX y lo entrega por WhatsApp al dueño y dentro del sistema.

El resumen incluye:

| Dato | Origen real en Supabase |
|---|---|
| Total de ventas del día | `sales` (excluye anuladas; `status in ('completed','returned')`) |
| Devoluciones y venta neta | `sale_returns` |
| Ganancia aproximada | `sale_items` × costo del kardex (`inventory_movements.unit_cost`, respaldo `products.cost`) − devoluciones − `expenses` |
| Cantidad de tickets y ticket promedio | `sales` |
| Producto más vendido | `sale_items` neto de devoluciones |
| Alertas importantes | `products`/`inventory_stocks` (agotado y stock bajo), `receivables` (vencidos y por vencer), `payables` (próximos 7 días) |
| Comparación | día anterior, promedio de 7 días y mismo día de las últimas 4 semanas, siempre contra la **misma ventana horaria** |

Archivos del módulo:

```
supabase/migrations/20261002000001_daily_summaries.sql   -- tabla + función SQL de cálculo
lib/daily-summary.ts                                     -- configuración, horarios y texto del mensaje
lib/daily-summary-service.ts                             -- orquestación (calcular → mensaje → enviar)
lib/whatsapp.ts                                          -- proveedores Meta Cloud API y Twilio
app/api/cron/daily-summary/route.ts                      -- corrida programada (idempotente)
app/api/daily-summaries/route.ts                         -- ver historial, generar ahora, enviar ahora
app/api/daily-summaries/settings/route.ts                -- hora, zona horaria, número y permisos
app/workspace/daily-summary/page.tsx                     -- pantalla dentro del sistema
tests/daily-summary.test.ts + tests/daily-summary-api.test.ts
```

## Paso 1 — Aplicar la migración en Supabase

```bash
# Con Supabase CLI enlazado al proyecto
supabase db push
# o pegar el contenido de supabase/migrations/20261002000001_daily_summaries.sql en el SQL Editor
```

Crea `daily_summaries` (RLS activo, solo `service_role` escribe) y la función
`generate_daily_summaries(target_tenant_id uuid, target_date date)`, que es la única que calcula cifras.
Es idempotente: la clave única `(tenant_id, summary_date)` refresca las métricas sin duplicar filas y
**conserva el estado de entrega de WhatsApp** de cada resumen.

Comprobación rápida (con `service_role`):

```sql
select public.generate_daily_summaries('<uuid de tu empresa>'::uuid, null);
select summary_date, sales_total, sales_count, gross_profit, estimated_net_profit, partial
  from public.daily_summaries
 order by summary_date desc
 limit 5;
```

## Paso 2 — Configurar el envío por WhatsApp (opcional)

El módulo funciona sin esto: el resumen se calcula y se ve en el sistema, solo queda sin enviar.

**Opción A — Meta WhatsApp Cloud API (recomendada)**

```bash
WHATSAPP_PROVIDER=meta
WHATSAPP_ACCESS_TOKEN=...        # token permanente de la app de Meta
WHATSAPP_PHONE_NUMBER_ID=...     # ID del número de WhatsApp Business
WHATSAPP_GRAPH_VERSION=v21.0     # opcional
```

**Opción B — Twilio WhatsApp**

```bash
WHATSAPP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=+14155238886
```

Reglas: las credenciales viven solo en el servidor; nunca se registran en logs (se sanean) y el
teléfono destino se guarda en la configuración de cada empresa (`tenant_settings`, clave `daily_summary`).
Si el proveedor no está configurado, `whatsapp_status` queda en `skipped`/`disabled` y el resumen sigue visible.

## Paso 3 — Programar la corrida

La ruta `GET /api/cron/daily-summary` exige `Authorization: Bearer $CRON_SECRET` (igual que
`/api/cron/daily-alerts`) y decide por empresa si ya es la hora configurada, dentro de una ventana de gracia
de `DAILY_SUMMARY_WINDOW_HOURS` horas (6 por defecto).

- **Plan de Vercel con crons por hora** (ideal, permite una hora distinta por empresa): cambia en
  `vercel.json` el `schedule` a `"0 * * * *"`.
- **Plan Hobby (un disparo diario por cron)**: deja el `schedule` diario y hazlo coincidir con la hora
  configurada, por ejemplo `"0 2 * * *"` = 8:00 pm en Nicaragua (UTC-6). Para dos horas distintas
  (7:00 am y 8:00 pm) usa un cron externo.
- **Cron externo** (cron-job.org, GitHub Actions, EasyCron…): `GET https://tu-dominio/api/cron/daily-summary`
  con la cabecera `Authorization: Bearer <CRON_SECRET>`, cada hora o a la hora que necesites.

Parámetros útiles solo con el secreto:

```
/api/cron/daily-summary                        → procesa las empresas que ya cumplieron su hora
/api/cron/daily-summary?force=1                → ignora hora y ventana (respeta whatsappEnabled)
/api/cron/daily-summary?tenantId=<uuid>&force=1&date=2026-10-01&generateOnly=1   → prueba de un día puntual
```

## Paso 4 — Configurar cada empresa dentro del sistema

`Workspace → Resumen diario`:

1. **Activar resumen diario**.
2. **Tipo de resumen**: cierre del día en curso (8:00 pm) o día anterior completo (7:00 am).
3. **Hora local** y **zona horaria** (por defecto la de la empresa).
4. **Enviar por WhatsApp** + **número del dueño** en formato `+50588888888`.
5. **Guardar**. Cada cambio queda en el log de auditoría (`daily_summary.settings.update`).

Desde la misma pantalla se puede **Generar ahora** (recalcula y guarda, con límite de una vez cada 30 s
por empresa) y **Enviar por WhatsApp ahora** (reintenta un resumen puntual). El historial muestra los
últimos 30 resúmenes con su estado de entrega.

## Paso 5 — Verificación

```bash
npm run typecheck && npm run lint && npm test && npm run build
node --import tsx --test tests/daily-summary.test.ts tests/daily-summary-api.test.ts
```

La lógica SQL se validó además contra PostgreSQL real (PGlite) con datos de ejemplo: ventas, kardex,
devolución parcial, gastos, cartera vencida, cuentas por pagar, comparación diaria y guardas de rol.

## Seguridad

- Las tablas y funciones nuevas son `service_role` únicamente (`revoke all ... from public, anon, authenticated`).
- Las rutas de la API exigen sesión de Supabase, `x-tenant-id` válido, permiso `dashboard` y rol
  `owner`/`admin`/`gerente`/`jefe`; las consultas siempre filtran por el UUID real de la empresa.
- `generate_daily_summaries` rechaza cualquier ejecución que no venga de `service_role`.
- El cron exige `CRON_SECRET` comparado con `timingSafeEqual`.
- El mensaje no incluye datos de clientes ni teléfonos: solo agregados del negocio.

## Problemas frecuentes

| Síntoma | Causa / solución |
|---|---|
| `DATABASE_MIGRATION_REQUIRED` | Falta aplicar la migración (Paso 1). |
| `WHATSAPP_NOT_CONFIGURED` | Faltan variables de entorno del proveedor o no se reinició el despliegue. |
| `WHATSAPP_PHONE_INVALID` | El número debe incluir código de país: `+50588888888`. |
| El resumen no llega a la hora | La hora configurada debe caer dentro de la ventana del cron (`DAILY_SUMMARY_WINDOW_HOURS`). Con cron diario, alinea el `schedule`. |
| Llega dos veces | No debería: el envío se marca `sent` por `(tenant_id, summary_date)` y no se repite. Revisa si hay dos crons llamando la ruta. |
