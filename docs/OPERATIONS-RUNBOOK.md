# Runbook operativo de Tienda-SS

## Despliegue de índices Firestore

Después de revisar `firestore.indexes.json` y antes de validar las APIs críticas, ejecutar:

```bash
firebase deploy --only firestore:indexes
```

La lista versionada debe mantenerse alineada con los índices creados en el proyecto ConexiaX.

Este documento define los controles mínimos para operar la aplicación en producción sin depender de conocimiento informal del equipo.

## Variables y secretos

Los valores sensibles deben configurarse en el proveedor de despliegue y nunca en Git. Como mínimo se requieren las variables descritas en `.env.example`: configuración pública de Firebase, `FIREBASE_SERVICE_ACCOUNT_KEY`, claves y precios de Stripe, `STRIPE_WEBHOOK_SECRET`, `APP_URL`, `RESEND_API_KEY`, `RESEND_FROM` y `SUPERADMIN_UIDS`.

Antes de cada despliegue se debe comprobar que los valores de producción no sean claves de prueba, que el dominio de `APP_URL` corresponda al entorno, que el webhook de Stripe apunte a `/api/billing/webhook` y que el correo remitente esté verificado.

## Health check

La disponibilidad básica se verifica mediante `GET /api/health`. La respuesta debe tener código HTTP `200`, `ok: true` y `Cache-Control: no-store`. El balanceador o monitor externo debe consultar esta ruta y alertar después de varios fallos consecutivos.

## Backup de Firestore

El backup de producción debe ejecutarse mediante la exportación administrada de Firestore hacia un bucket de almacenamiento dedicado. El bucket debe estar en una ubicación compatible con el proyecto, tener acceso restringido al equipo de operaciones y una política de retención.

Ejemplo de exportación manual desde una máquina con Google Cloud CLI autenticado:

```bash
gcloud firestore export gs://BUCKET_DE_BACKUPS/tienda-ss/$(date -u +%Y-%m-%dT%H-%M-%SZ) \
  --project=PROJECT_ID
```

La cuenta que ejecute la exportación necesita permisos de exportación de Firestore y escritura en el bucket. El nombre exacto del bucket y el proyecto deben almacenarse como configuración del entorno, no dentro del código fuente.

La política recomendada es conservar backups diarios durante 30 días y backups mensuales durante 12 meses, ajustándola a los requisitos comerciales y de protección de datos.

## Restauración

Nunca se debe restaurar directamente sobre producción como primera prueba. Se debe crear un proyecto o entorno de staging, importar allí el backup y ejecutar la suite de reglas, pruebas de migración y smoke tests de API.

Ejemplo de importación:

```bash
gcloud firestore import gs://BUCKET_DE_BACKUPS/tienda-ss/FECHA_DEL_BACKUP \
  --project=PROJECT_ID_STAGING
```

La restauración de producción requiere aprobación explícita, ventana de mantenimiento, backup inmediatamente anterior y un registro de quién aprobó la operación. Después de restaurar se deben verificar tenants, miembros, ventas, inventario, cuentas por cobrar, configuración de Stripe y reglas de Firestore.

## CI y criterios de merge

Todo pull request debe pasar:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run test:rules
```

El workflow ubicado en `.github/workflows/ci.yml` ejecuta estos controles en los jobs de calidad y reglas de Firestore. Un cambio que falle una de estas etapas no debe fusionarse.

## Despliegue

El despliegue debe ejecutarse primero en staging. Allí se validan login, onboarding, cambio de tenant, creación de producto, venta, cobro, invitación de miembro, cambio de permisos, checkout y recepción de eventos Stripe. Solo después de completar el smoke test se promueve a producción.

La migración de roles debe ejecutarse primero en modo simulación y con un informe revisado. El modo de aplicación requiere la confirmación explícita documentada en `docs/MIGRATION-USER-ROLES.md`.

## Rollback

Ante un fallo de aplicación, se debe revertir al artefacto anterior y conservar los logs y el identificador de despliegue. Ante corrupción de datos, no se debe intentar “arreglar” manualmente sin backup: se debe congelar la escritura, identificar el punto temporal del incidente, crear una copia del estado actual y restaurar en staging para validar el procedimiento antes de tocar producción.

## Respuesta a incidentes

Los incidentes de autenticación, aislamiento entre tenants, ventas duplicadas, inventario inconsistente, cobros incorrectos o webhook Stripe fallido son de prioridad crítica. El operador debe conservar el request ID, tenant afectado, timestamp UTC, endpoint, respuesta HTTP y evento Stripe relacionado. Nunca deben registrarse tokens, contraseñas, claves privadas ni números completos de tarjeta.

## Checklist de salida estable

| Control | Evidencia requerida |
|---|---|
| Build | Salida exitosa de `npm run build` |
| Calidad | Typecheck y lint sin errores ni advertencias |
| Tests | `npm test` y `npm run test:rules` exitosos |
| Seguridad | Verificación de autenticación, tenant y roles en API |
| Facturación | Webhook firmado, duplicado y reintento comprobados |
| Backup | Exportación reciente con restauración validada en staging |
| Observabilidad | Health check monitorizado y logs disponibles |
| Rollback | Artefacto anterior identificado y procedimiento probado |
| Aprobación | Responsable de producto y responsable técnico registrados |

## Observabilidad implementada

Todas las rutas bajo `/api/` reciben un `x-correlation-id` generado o propagado por middleware. El middleware registra `api.request.received` sin autorización, cookies, tokens ni cuerpos de solicitud. Las respuestas conservan el correlation ID para relacionar el reporte del usuario con los logs.

Next.js usa `instrumentation.ts` para capturar errores no controlados de requests. `lib/error-reporting.ts` elimina patrones de credenciales y registra `request.failed` con ruta, método, tenant, UID disponible, nombre seguro del error y correlation ID. Esta captura basada en logs estructurados es compatible con Vercel Log Drains, un SIEM o Sentry mediante integración del proveedor, sin guardar secretos en la aplicación.

Los eventos de alerta mínimos son `alert.billing.payment_failed`, `auth.login.rate_limited`, `alert.stripe.webhook.failed` y `request.failed`. Configura alertas en el proveedor de logs con estas condiciones:

| Alerta | Condición sugerida | Ventana | Acción |
|---|---|---:|---|
| Fallos de facturación | `event = alert.billing.payment_failed` | 5 min | Revisar tenant, invoice y Stripe Dashboard. |
| Autenticación masiva | `event = auth.login.rate_limited` | 10 min | Revisar IPs y hashes de correo; aumentar protección si es ataque. |
| Errores 5xx | `event = request.failed` o status 5xx del proveedor | 5 min | Agrupar por `routePath` y `correlationId`; revisar deployment. |
| Webhook Stripe fallido | `event = alert.stripe.webhook.failed` | Inmediato | Corregir causa y reenviar el evento desde Stripe. |

## Readiness real

`GET /api/health` solo comprueba que el proceso responda. `GET /api/health?ready=true` verifica proceso, lectura real de Firestore en `system/health` y una llamada real a Stripe mediante `accounts.retrieve()`. Devuelve `503` si Firestore o Stripe no están operativos.

## Backup automatizado, retención y cifrado

`.github/workflows/firestore-backup.yml` ejecuta `scripts/backup-firestore.sh` diariamente a las 02:17 UTC y permite ejecución manual. Usa Workload Identity Federation, por lo que no requiere guardar una clave JSON permanente en GitHub.

Configura estos secretos de GitHub Actions: `GCP_WIF_PROVIDER`, `GCP_BACKUP_SERVICE_ACCOUNT`, `GCP_FIRESTORE_PROJECT` y `FIRESTORE_BACKUP_BUCKET`. La cuenta debe poder exportar Firestore y escribir en el bucket.

El script genera un manifest, conserva 35 días por defecto y elimina prefijos fechados fuera de la retención. El bucket debe tener acceso restringido, versionado y cifrado administrado por Google como mínimo; usa CMEK si la política de la empresa exige control de claves. La ejecución diaria implica un objetivo RPO aproximado de 24 horas.

## Procedimiento de restore y objetivos

`scripts/restore-firestore.sh` importa un prefijo fechado. Nunca se debe restaurar sobre producción como primera prueba:

1. Seleccionar el prefijo y verificar su `manifest.json`.
2. Importar en un proyecto de recuperación o staging.
3. Verificar `/api/health?ready=true`, login, tenants, miembros, ventas, inventario, crédito y `auditLogs`.
4. Ejecutar `npm run test:rules` y smoke tests.
5. Medir duración y registrar conteos antes de aprobar producción.
6. Para producción, congelar escrituras, guardar un backup inmediatamente anterior y registrar la aprobación del incidente.

Con backup diario, el objetivo RPO inicial es **24 horas**. El RTO objetivo es **menor a 4 horas** para un tenant normal, pero no se considera cumplido hasta realizar un restore de ensayo y registrar su duración real.

## Estados Stripe y recuperación

Los eventos se almacenan en `billingEvents/{eventId}` y siguen `received → processing → processed` o `failed`. Los fallidos y procesos abandonados son reintentables hasta el límite configurado. Antes de reenviar desde Stripe, revisa el `eventId`, correlation ID, secreto del webhook, cuenta Firebase Admin y orden temporal del evento.

## Release 7 — procedimiento de despliegue y rollback

Cada release debe identificar commit, deployment de staging, deployment de producción, responsable técnico y responsable de producto. El orden operativo es: ejecutar CI completo, desplegar a staging, ejecutar smoke test, verificar health/readiness, revisar logs y promover el mismo artefacto a producción. No se deben construir artefactos distintos entre staging y producción.

El rollback de aplicación consiste en promover el deployment anterior identificado en Vercel y conservar el correlation ID del incidente. El rollback de datos no se hace con edición manual: se congela la escritura, se crea un backup nuevo, se restaura primero en staging y se valida con reglas, salud, tenants, miembros, ventas, inventario y crédito.

## Smoke test de staging

El smoke test mínimo cubre `/api/health`, `/api/health?ready=true`, login, onboarding, creación de producto, venta, crédito, invitación, cambio de tenant, cambio de plan, exportación CSV, importación CSV, generación de API key, lectura de `/api/v1/catalog` y webhook firmado duplicado. Cada ejecución debe guardar fecha UTC, commit, URL y resultado por caso.

## Integraciones y fiscalidad

Las rutas `/api/v1/*` usan API keys con hash y aislamiento por tenant. El contrato público está en `docs/PUBLIC-API-PREVIEW.md`. Los webhooks preview requieren HMAC-SHA256, tolerancia de cinco minutos e idempotencia por evento.

Las ventas guardan numeración y campos fiscales NIO en backend. La fiscalidad electrónica está en estado `pending_adapter`; no se debe anunciar emisión fiscal electrónica hasta terminar la validación normativa descrita en `docs/FISCAL-NICARAGUA-IMPLEMENTATION.md`.

## Prueba de carga

La prueba base se ejecuta con `BASE_URL=https://staging.example node scripts/load-test.mjs`. Se acepta p95 menor o igual a 1 segundo y éxito mínimo de 99% para el health check. Los límites por tenant, endpoint, API pública, páginas e importación están registrados en `docs/LOAD-TEST-2026-09-08.md`. La evidencia debe incluir región, commit, concurrency, solicitudes, p50, p95, máximo y fallos.

## Release checklist firmado

El checklist de salida es un control de aprobación y no sustituye evidencia técnica. Las firmas deben ser realizadas por las personas responsables en el sistema de gestión de cambios.

| Control | Evidencia | Responsable | Firma/fecha |
|---|---|---|---|
| CI completo | URL del workflow y commit | Técnico | Pendiente de firma humana |
| Smoke staging | `docs/RELEASE-SMOKE-2026-09-08.md` | Técnico | Pendiente de firma humana |
| Restore staging | URL/log de ensayo y duración | Operaciones | Pendiente de firma humana |
| Fiscalidad | Revisión tributaria Nicaragua | Producto/asesor fiscal | Pendiente de firma humana |
| Promoción producción | URL de deployment | Técnico | Pendiente de firma humana |
| Aprobación comercial | Registro de cambio | Producto | Pendiente de firma humana |
