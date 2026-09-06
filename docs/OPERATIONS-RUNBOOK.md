# Runbook operativo de Tienda-SS

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
