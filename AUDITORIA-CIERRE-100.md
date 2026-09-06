# Auditoría de cierre del SaaS Tienda-SS

**Repositorio auditado:** `elprofenica505-ai/Tienda-SS`  
**Rama:** `SaaS-MultiTenant-Profesional`  
**Fecha de revisión:** 6 de septiembre de 2026  
**Objetivo:** determinar qué falta realmente para pasar de un SaaS funcional en desarrollo a una versión estable, operable y publicable.

## Resumen ejecutivo

El proyecto **no está al 100%**, pero tampoco parte de cero. La base funcional ya es considerable: existe una aplicación Next.js con Firebase, autenticación por Firebase Admin, aislamiento por tenant, roles multiempresa, módulos de catálogo, inventario, ventas, clientes, cuentas por cobrar, finanzas, reportes, notificaciones, miembros, permisos, superadministración y Stripe Billing.

La compilación de producción termina correctamente y el análisis estático no reporta errores, aunque sí **20 advertencias**. Las pruebas existentes cubren permisos, migración de roles y reglas de Firestore, pero todavía no cubren de forma suficiente las rutas HTTP críticas ni los flujos de negocio end-to-end.

La conclusión importante es que las tareas de la imagen describen correctamente el trabajo pendiente: el riesgo principal ya no es “construir pantallas”, sino **cerrar seguridad de producción, consistencia de negocio, facturación, observabilidad, respaldo, pruebas automatizadas y operación de lanzamiento**.

## Estado comprobado

| Área | Estado observado | Evidencia | Evaluación |
|---|---|---|---|
| Compilación | `next build` completa | Salida de build con 37 páginas generadas y rutas API | Verde, sujeto a corregir advertencias |
| TypeScript | La comprobación se ejecutó tras instalar dependencias | `npm run typecheck` | Debe mantenerse como gate obligatorio |
| Lint | Sin errores, con 20 advertencias | `npm run lint` | Amarillo; no debe aceptarse como “limpio” |
| Pruebas | Existen 20 casos aproximados en tres archivos | `tests/permissions.test.ts`, `tests/migrate-user-roles.test.ts`, `tests/firestore.rules.test.mjs` | Insuficiente para producción |
| Multi-tenancy | Middleware de tenant y reglas Firestore implementados | `lib/tenant.ts`, `firestore.rules`, `docs/FIRESTORE-ISOLATION-TEST-PLAN.md` | Base sólida, falta probar rutas Admin SDK |
| Roles y permisos | Matriz extensa de roles y permisos | `lib/permissions.ts`, `docs/API-ROLES-PERMISSIONS.md` | Parcialmente cerrado |
| Facturación | Checkout, portal y webhook Stripe presentes | `app/api/billing/route.ts`, `app/api/billing/webhook/route.ts` | Funcional, pero falta endurecimiento operacional |
| CI/CD | No se encontró workflow de GitHub Actions ni pipeline de despliegue | Inventario del repositorio | Falta completamente |
| Observabilidad | No se encontró sistema de errores, métricas, health check ni trazas | Búsqueda de `sentry`, `otel`, `health`, `prometheus` | Falta completamente |
| Backup y restauración | Solo hay documentación que recomienda backup antes de migrar | `docs/MIGRATION-USER-ROLES.md` | Falta un procedimiento automatizado y probado |
| E2E | No hay suite Playwright/Cypress configurada | Inventario de tests y configuración | Falta completamente |

## Hallazgos críticos que impiden declarar un 100%

### 1. El alta de empresas es un endpoint público sin protección contra abuso

`app/api/tenants/route.ts` permite crear un usuario Firebase y un tenant sin exigir sesión previa. Esto puede ser correcto para registro público, pero actualmente no se observa rate limiting, protección anti-bot, verificación de correo, CAPTCHA, control de intentos, política de contraseñas avanzada ni mecanismo de recuperación operativa ante abuso. El endpoint también crea el tenant usando el UID del usuario como ID, lo que simplifica el modelo, pero limita la evolución futura hacia un usuario perteneciente a varias empresas.

**Criterio de cierre:** registro con protección contra abuso, verificación de correo, recuperación de contraseña, manejo de reintentos y pruebas de concurrencia/duplicación.

### 2. La aplicación usa Firebase Admin SDK en todas las rutas críticas, por lo que las reglas de Firestore no bastan

La propia documentación reconoce que Admin SDK omite las reglas de Firestore. Esto significa que el verdadero perímetro de seguridad está en `requireTenantMember`, `requireTenantPermission` y las validaciones de cada ruta. Las pruebas actuales verifican reglas y permisos puros, pero no prueban suficientemente llamadas HTTP reales a catálogo, inventario, ventas, cobros, finanzas, miembros, superadmin y facturación.

**Criterio de cierre:** pruebas de integración por ruta que verifiquen autenticación ausente, tenant inexistente, tenant cruzado, miembro inactivo, rol insuficiente, payload malformado y errores internos sin filtración de información.

### 3. Falta un límite de consumo por plan

Stripe actualiza `plan` y `subscriptionStatus`, pero no se observa una política transversal que impida que una cuenta starter consuma recursos de growth o scale. No hay evidencia de límites para cantidad de miembros, productos, sucursales, ventas, almacenamiento, reportes o funciones premium.

**Criterio de cierre:** catálogo central de entitlements, middleware reutilizable, respuestas consistentes de límite alcanzado, pantalla de upgrade y pruebas por plan y estado de suscripción.

### 4. El webhook de Stripe necesita idempotencia fuerte y recuperación de eventos fallidos

El webhook registra `event.id` en `billingEvents` y evita duplicados si el documento existe. Sin embargo, el evento se marca al final de una operación que puede incluir varias escrituras y notificaciones. Si una parte intermedia falla, Stripe reintentará, pero el sistema no tiene una cola, estado de procesamiento, contador de reintentos ni panel de eventos fallidos. Además, algunos eventos dependen de `subscription.metadata.tenantId`, mientras que otros buscan por `stripeCustomerId`; conviene unificar y validar ambas rutas.

**Criterio de cierre:** documento de evento con estados `received`, `processing`, `processed`, `failed`; transacción o estrategia de reanudación; pruebas de duplicados, eventos fuera de orden, customer inexistente, firma inválida y fallos de notificación.

### 5. No existe observabilidad operativa

Se usa `console.error` en algunos fallos, pero no hay evidencia de errores agrupados por request, correlation ID, métricas de latencia, tasa de errores, auditoría completa de acciones administrativas, alertas ni endpoint de salud. Para un SaaS multi-tenant, esto impide diagnosticar incidentes y demostrar qué ocurrió con los datos de una empresa.

**Criterio de cierre:** logging estructurado sin secretos, correlation ID, captura de excepciones, métricas mínimas por ruta y tenant, health/readiness checks y alertas para fallos de facturación, autenticación y operaciones críticas.

### 6. No existe un mecanismo de backup y restauración probado

La documentación de migración recomienda realizar una copia de seguridad, pero el repositorio no incluye un proceso de backup automatizado, retención, cifrado, restauración selectiva ni simulacro de recuperación. Esta es una brecha de continuidad operativa, especialmente porque el sistema usa Firestore y cambios administrativos sobre miembros, ventas e inventario.

**Criterio de cierre:** backup programado, política de retención, procedimiento de restauración, prueba documentada de RPO/RTO y control de acceso a las copias.

### 7. La cobertura de pruebas es demasiado pequeña para el alcance actual

Hay pruebas unitarias de permisos y migraciones y una suite de reglas, pero no hay pruebas automatizadas de las rutas API ni de los flujos visibles del usuario. El script raíz tampoco define `npm test`; obliga a conocer scripts separados. Esto reduce la posibilidad de que CI ejecute toda la calidad de forma uniforme.

**Criterio de cierre:** script `test` único, pruebas de integración API, pruebas E2E para onboarding, login, creación de productos, venta con descuento, venta a crédito, movimiento de inventario, cobro, invitación de miembro, cambio de permisos, checkout y portal de facturación.

### 8. No hay pipeline de integración y entrega continua

No se encontró configuración de GitHub Actions ni un gate que ejecute instalación limpia, typecheck, lint, tests, reglas Firestore y build antes de fusionar. El estado “compila en esta máquina” no equivale a una versión publicable.

**Criterio de cierre:** workflow para pull requests, workflow de despliegue con entornos separados, secretos fuera del repositorio, migraciones explícitas y rollback documentado.

### 9. Hay deuda de calidad que debe resolverse antes del lanzamiento

El lint termina sin errores, pero reporta 20 advertencias, principalmente por el uso de `<img>` en lugar de `next/image`, dependencias incompletas en un `useEffect` y una exportación anónima en la configuración de ESLint. No son bloqueos funcionales inmediatos, pero indican que el estándar de calidad todavía no está cerrado.

**Criterio de cierre:** cero errores y cero advertencias nuevas; corregir las advertencias existentes o justificar explícitamente las excepciones.

### 10. El modelo de tenant debe aclararse antes de declarar multi-tenancy completo

El flujo actual crea el tenant con el mismo UID del owner y exige el header `x-tenant-id`. Esto funciona para una empresa por propietario, pero la arquitectura todavía debe demostrar soporte completo para un usuario miembro de varias empresas, selección persistente de tenant, invitaciones, revocación, cambio de empresa activa y prevención de confusión entre sesión y header. El frontend tiene `TenantProvider`, pero esta área necesita pruebas E2E y una decisión explícita de producto.

**Criterio de cierre:** usuario multi-tenant real probado, tenant activo derivado de sesión/contexto de forma segura, invitaciones con expiración y revocación, y pruebas de cambio de empresa.

## Qué tareas de la imagen están realmente completadas

| Tarea de la imagen | Estado real | Qué falta para marcarla como terminada |
|---|---|---|
| Establecer línea base y alcance de cierre | Parcialmente completada | Convertir este diagnóstico en criterios de aceptación medibles y una matriz de release |
| Corregir bloqueos de compilación y calidad | Parcialmente completada | El build pasa; falta resolver 20 warnings y convertir lint/typecheck/test en gates |
| Endurecer autenticación, multi-tenancy y API | Parcialmente completada | Integración API, anti-abuso, rate limiting, verificación de correo y pruebas cross-tenant |
| Completar facturación, onboarding y administración | Parcialmente completada | Entitlements por plan, estados de suscripción, recuperación de webhook, invitaciones y flujos E2E |
| Añadir observabilidad, respaldo y controles operativos | Pendiente | Logging, alertas, health checks, backups y restauración probada |
| Ampliar pruebas, CI/CD y documentación de lanzamiento | Pendiente | Pipeline completo, E2E, matriz de compatibilidad, runbook y rollback |
| Validar criterios de salida y publicar versión estable | Pendiente | Evidencia de staging, smoke tests, seguridad, backup/restore y aprobación de release |

## Hoja de ruta priorizada para llegar al 100%

| Fase | Prioridad | Entregables de cierre | Dependencia |
|---|---:|---|---|
| P0 — Seguridad y datos | Bloqueante | Tests de todas las rutas API, rate limiting, validación de payloads, cross-tenant, invitaciones seguras, backup/restore | Ninguna |
| P1 — Integridad de negocio | Bloqueante | Entitlements por plan, estados de billing completos, idempotencia de webhook, consistencia de inventario, reversos y auditoría | P0 parcial |
| P2 — Calidad automatizada | Alta | `npm test`, CI en pull requests, reglas Firestore en CI, lint sin warnings, build reproducible | P0 |
| P3 — Operación | Alta | Logging estructurado, errores, métricas, health checks, alertas, runbook y rollback | P1 |
| P4 — Experiencia de lanzamiento | Media | Onboarding completo, recuperación de cuenta, estados vacíos/error/loading, accesibilidad, responsive y E2E de journeys | P0–P2 |
| P5 — Release estable | Bloqueante | Staging, smoke test, prueba de carga razonable, revisión de secretos, backup reciente, checklist firmado y despliegue controlado | P0–P4 |

## Definición objetiva de “100% completado”

El SaaS puede declararse listo únicamente cuando se cumplan simultáneamente estas condiciones: el build, typecheck, lint, pruebas unitarias, pruebas de integración, pruebas de reglas y pruebas E2E pasan en CI; ninguna ruta crítica permite acceso sin tenant o entre tenants; todos los planes aplican sus límites; Stripe puede recibir eventos duplicados o fuera de orden sin corromper el estado; existe backup y restauración verificada; los errores críticos generan alertas; se puede identificar quién hizo cada operación sensible; onboarding, recuperación de cuenta y administración funcionan sin intervención manual; y existe un runbook de despliegue, rollback e incidentes.

> **Veredicto:** la aplicación está en un estado de “MVP avanzado / preproducción”, no en estado de “SaaS estable publicado”. El trabajo restante es principalmente de endurecimiento, operación y validación automatizada, no de crear más módulos superficiales.

## Orden recomendado de ejecución

Primero cerraría la superficie de API y los escenarios de aislamiento multi-tenant, porque cualquier mejora de UI sobre una autorización incompleta aumenta el riesgo. Después implementaría entitlements y el ciclo completo de facturación, incluyendo reintentos e idempotencia. En paralelo, establecería CI y una suite de integración mínima para que cada corrección quede protegida. A continuación añadiría observabilidad y backup/restore. Finalmente completaría E2E, documentación de lanzamiento y un staging con criterios de salida firmes.

## Evidencia revisada

- `package.json`: scripts, dependencias y ausencia de un script raíz `test`.
- `lib/tenant.ts`: autenticación por bearer token, tenant activo y permisos.
- `firestore.rules`: aislamiento y roles a nivel de Firestore.
- `app/api/tenants/route.ts`: registro público y creación de empresa.
- `app/api/billing/route.ts`: checkout y portal de Stripe.
- `app/api/billing/webhook/route.ts`: recepción y procesamiento de eventos Stripe.
- `tests/permissions.test.ts`: pruebas de permisos de roles.
- `tests/migrate-user-roles.test.ts`: pruebas de migración de roles.
- `tests/firestore.rules.test.mjs`: plan y suite de aislamiento de reglas.
- `docs/FIRESTORE-ISOLATION-TEST-PLAN.md`: limitación explícita de las reglas frente a Admin SDK.
- `docs/API-ROLES-PERMISSIONS.md`: matriz documentada de roles y API.
- Resultado local: `next build` completado; lint sin errores pero con 20 advertencias.
