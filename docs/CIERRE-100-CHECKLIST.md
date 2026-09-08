# CIERRE 100 — Checklist de preparación y seguridad P0

**Proyecto:** Tienda-SS  
**Rama:** `SaaS-MultiTenant-Profesional`  
**Última actualización:** 2026-09-07 22:37 (hora local de la tarea)

## Estado resumido

La rama está actualizada con `origin/SaaS-MultiTenant-Profesional` y sin cambios locales al iniciar esta etapa. La autorización multi-tenant ya usa `requireTenantMember` y `requireTenantPermission` en las rutas principales, mantiene rate limiting distribuido mediante Firestore y aplica verificación de correo y expiración de sesión. La verificación MFA para roles administrativos está implementada de forma configurable, pero requiere `AUTH_REQUIRE_MFA_ADMIN=true` para ser obligatoria. La protección CAPTCHA/equivalente del registro público aún requiere implementación o configuración de un proveedor.

## ETAPA 0 — Preparación

| Estado | Tarea | Evidencia o pendiente |
|---|---|---|
| [x] | Crear/actualizar este checklist | Este archivo registra el progreso y las pendientes. |
| [x] | Verificar `npm run typecheck`, `npm run lint` y `npm test` sin errores fatales | Validación final correcta: typecheck, lint y suite completa pasan. La suite incluye 11 pruebas P0 nuevas/relacionadas y la matriz de autorización. |
| [x] | Confirmar branch limpia y actualizada | La rama inició alineada con `origin`; se comprobará nuevamente después del commit de esta etapa. |
| [x] | Documentar secretos, variables y Stripe sin exponer valores | `.env.example` declara Firebase Admin, Stripe, Resend y `SUPERADMIN_UIDS`. `.env.local` solo contiene variables públicas Firebase; las claves privadas de Stripe, Firebase Admin y Resend están ausentes localmente. El modo Stripe local no está configurado; Vercel debe revisarse sin revelar valores. |

### ETAPA 0 — Limpieza y verdad del producto

| Estado | Control | Evidencia |
|---|---|---|
| [x] | Producción sin accesos demo | Se eliminaron accesos rápidos, usuarios fake y la clave `1234` de `components/Login.tsx`; la prueba anti-regresión queda en `tests/stage0-product-truth.test.ts`. |
| [x] | Una sola verdad multi-tenant | Las rutas de negocio usan `tenants/{tenantId}/…`; las colecciones globales legacy son rechazadas por reglas y solo aparecen en scripts de migración explícitos. |
| [x] | Tenant nuevo vacío | `app/api/tenants/route.ts` crea tenant y membresía owner sin copiar productos, ventas, clientes ni inventario demo. |
| [x] | Aislamiento documentado | `docs/ETAPA-0-CHECKLIST.md` registra evidencia y `tests/firestore.rules.test.mjs` cubre lecturas/escrituras cruzadas y consultas collection-group. |

### Estado de secretos y Stripe

No se copiaron ni se mostrarán valores secretos. El archivo `.env.example` declara `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, tres precios Stripe, `FIREBASE_SERVICE_ACCOUNT_KEY`, `RESEND_API_KEY` y `SUPERADMIN_UIDS`. En el entorno local inspeccionado solo están presentes las variables `NEXT_PUBLIC_FIREBASE_*`; no están presentes las claves privadas ni los precios Stripe. El modo local Stripe es, por tanto, **no configurado**, no se puede afirmar test o live desde este checkout. En Vercel se debe verificar el entorno **Preview/Development** contra **Production** y confirmar que el prefijo de `STRIPE_SECRET_KEY` sea `sk_test_` o `sk_live_` sin registrar el secreto.

## ETAPA 1 — Seguridad y aislamiento multi-tenant (P0)

### ETAPA 1 — Onboarding del dueño y equipo (día 1)

| Estado | Control | Evidencia |
|---|---|---|
| [x] | Crear empresa de punta a punta | `POST /api/tenants` crea tenant y owner; el acceso posterior pasa por verificación de correo y `/onboarding`. |
| [x] | Wizard de máximo cuatro pantallas | Negocio, invitación opcional, primer producto y primera venta, con textos en español. |
| [x] | Invitaciones por email y rol | `/api/invitations` y `/accept-invitation` crean y aceptan membresías activas dentro del tenant. |
| [x] | Desactivación sin borrar historial | `/api/members` cambia a `disabled` y conserva documento y auditoría. |
| [x] | Límites Starter/Growth | Backend aplica límites de miembros y productos y devuelve mensajes de actualización claros. |

La evidencia detallada está en `docs/ETAPA-1-ONBOARDING-CHECKLIST.md`.

### ETAPA 2 — Núcleo que vende: preventa → caja → stock

| Estado | Control | Evidencia |
|---|---|---|
| [x] | Modelo de preventa multi-tenant | `tenants/{tenantId}/presales/{presaleId}` guarda ticket, líneas, vendedor, estado, evidencia liviana y timestamps. |
| [x] | Panel vendedor | `/workspace/presales` busca productos, calcula total, adjunta referencias de evidencia y envía a caja. |
| [x] | Panel cajero | `/workspace/cashier` busca por código, muestra líneas y cobra efectivo, tarjeta o crédito. |
| [x] | Stock coherente | El stock baja únicamente en `POST /api/presales/checkout`, dentro de la transacción que crea venta y estadística diaria. |
| [x] | No doble cobro | Un ticket `paid` devuelve la venta existente y no vuelve a descontar stock. |
| [x] | Aislamiento y paginación | API y reglas preservan el tenant; el listado inicial usa `get()` con límite de 20 más cursor. |

La evidencia detallada está en `docs/ETAPA-2-PREVENTA-CAJA-STOCK.md`.

### ETAPA 3 — Crédito / fiado v1

| Estado | Control | Evidencia |
|---|---|---|
| [x] | Clientes con límite y saldo | Contactos guarda `creditLimit` y `creditBalance` dentro del tenant. |
| [x] | Venta a crédito | Caja exige cliente, valida límite y permite override únicamente a owner/admin. |
| [x] | Cartera y abonos | Ventas guardan saldo, vencimiento simple a 30 días; abonos actualizan venta, cliente y `creditMovements`. |
| [x] | Pantalla de control | Contactos muestra límite/saldo y Receivables expone saldo, clientes y vencidos. |
| [x] | Interés/cargo | Se mantiene saldo plano v1; intereses quedan para v1.1. |

### ETAPA 4 — Panel dueño y reportes

| Estado | Control | Evidencia |
|---|---|---|
| [x] | Ventas de hoy | Dashboard usa `/api/stats/daily` y no barre ventas para el KPI diario. |
| [x] | Tickets pendientes y cartera | Dashboard carga preventas limitadas y clientes con saldo agregado. |
| [x] | Stock bajo | Dashboard filtra productos activos bajo mínimo y enlaza Inventario. |
| [x] | Reportes mínimos | Reportes existentes soportan rangos, métodos, vendedor/productos y exportación CSV limitada. |
| [x] | Control de equipo | Navegación y módulos reutilizan miembros y permisos tenant existentes. |

La evidencia detallada está en `docs/ETAPA-3-4-CREDITO-DASHBOARD.md`.

| Estado | Tarea | Evidencia o pendiente |
|---|---|---|
| [ ] | Completar autorización por campo, sucursal y sensibilidad | Se reforzó catálogo: usuarios no administrativos no reciben ni escriben `cost`; ventas valida sucursal. Aún falta aplicar la misma revisión explícita a todos los módulos con datos de sucursal antes de marcarla completa. |
| [x] | Revisar rutas Admin SDK con guardas tenant | Las rutas de negocio revisadas usan `requireTenantMember` o `requireTenantPermission`; superadmin usa `requireSuperadmin`; webhooks Stripe y alta pública son excepciones documentadas y validan su propia autenticidad. |
| [x] | Rate limiting distribuido para registro, invitaciones y escrituras críticas | `consumeDistributedRateLimits` usa transacciones Firestore; registro e invitaciones tienen límites específicos y `requireTenantMember` aplica límites por IP, UID, tenant, endpoint y composición. |
| [x] | Rate limiting distribuido para login | Se añadió `POST /api/auth/login-attempt`, que aplica límites distribuidos por IP, correo anonimizado y combinación antes de ejecutar el login Firebase Client SDK. |
| [ ] | CAPTCHA/equivalente en alta pública | Se añadió honeypot `website` y límites distribuidos como defensa complementaria, pero todavía falta integrar CAPTCHA o un desafío equivalente criptográficamente verificable. |
| [x] | Verificación de correo obligatoria para uso del tenant | Registro envía verificación y login bloquea usuarios no verificados; `assertTokenSessionPolicy` también exige `email_verified` por defecto. |
| [ ] | MFA obligatorio para owner/admin | La política está implementada, pero depende de `AUTH_REQUIRE_MFA_ADMIN=true`; falta confirmar esta variable en Vercel y completar enrolamiento de usuarios administrativos. |
| [x] | Pruebas de token ausente/inválido y tenant cruzado | La matriz API y las pruebas de permisos cubren autenticación, tenant y autorización; ampliar casos de payload y errores internos en el cierre. |
| [x] | Pruebas de miembro inactivo, rol insuficiente y payload malformado | La matriz global, las pruebas de permisos, invitaciones y `tests/p0-security.test.ts` cubren los rechazos principales. |
| [x] | Pruebas de errores internos sin secretos | `tests/p0-security.test.ts` verifica que respuestas genéricas no incluyan mensajes de Firebase, Stripe o secretos. |

## Checkpoint P0

- [x] Ninguna ruta crítica permite acceso cross-tenant.
- [x] Ninguna ruta crítica permite modificaciones con rol insuficiente.
- [x] El miembro inactivo recibe rechazo.
- [ ] El registro público tiene protección anti-abuso más allá del límite IP.
- [x] Login, invitaciones y escrituras críticas tienen límites distribuidos verificables.
- [ ] Owner/admin requieren MFA en el entorno de producción.
- [x] Los tests P0 pasan y la rama queda limpia al publicar.

## Archivos esperados de esta etapa

- `docs/CIERRE-100-CHECKLIST.md`
- `lib/tenant.ts`
- `lib/rate-limit.ts`
- `lib/auth-policy.ts`
- `app/api/tenants/route.ts`
- `app/api/*/route.ts` que resulte necesario endurecer
- `tests/*` de autorización, aislamiento y anti-abuso

## Regla de secretos

Nunca registrar en este documento valores de `.env.local`, claves Stripe, claves de servicio Firebase, tokens de sesión, cookies, códigos MFA o respuestas completas de proveedores externos. Solo se documenta presencia, ausencia, prefijo no sensible y entorno.

## ETAPA 2 — Integridad de negocio y auditoría (P0/P1)

| Estado | Tarea | Evidencia o pendiente |
|---|---|---|
| [x] | Devoluciones | `POST /api/sales/returns` revierte stock en una transacción, limita cantidades devueltas y crea `salesReturns`. |
| [x] | Anulaciones | `POST /api/sales/void` revierte stock en una transacción; una venta con pagos no se anula y debe usar nota de crédito. |
| [x] | Notas de crédito | `POST /api/receivables/credit-notes` actualiza saldo y total acreditado atómicamente. |
| [x] | Ajustes de inventario autorizados | `POST /api/inventory` ya usa transacción, valida permisos y no permite stock negativo. |
| [x] | Reservas de stock | `POST/DELETE /api/inventory/reservations` descuenta o libera stock dentro de transacciones y registra movimientos. |
| [x] | Auditoría inmutable | `writeImmutableAudit` usa secuencia, hash encadenado, `actorUid`, `actorRole`, tenant, entidad, antes/después, timestamp y requestId dentro de una transacción. |
| [x] | Auditoría de venta y movimientos existentes | Ventas, pagos, ajustes, devoluciones, anulaciones, notas y reservas registran eventos auditables. |
| [ ] | Pruebas completas con Firebase Emulator | La matriz y las pruebas unitarias pasan; falta ejecutar escenarios multioperación contra el emulador con datos de venta y stock. |

### Checkpoint Etapa 2

- [x] Una venta existente descuenta stock y crea movimiento/auditoría dentro de una transacción.
- [x] Una devolución restituye stock y crea movimiento/auditoría.
- [x] Un ajuste autorizado no deja stock negativo y crea auditoría.
- [x] Una nota de crédito actualiza el saldo de forma atómica.
- [ ] Los escenarios integrales con datos reales o Emulator Suite se ejecutan y quedan archivados.

## ETAPA 3 — Facturación SaaS y límites por plan (P1)

| Estado | Tarea | Evidencia o pendiente |
|---|---|---|
| [x] | Catálogo central Starter/Growth/Scale | `lib/entitlements.ts` define usuarios, sucursales, productos, ventas/mes, exportaciones, acceso API, solicitudes API y módulos premium. |
| [x] | Guard backend reutilizable | `lib/entitlement-guard.ts` centraliza `assertPlanCapacity`, errores 402, acceso API, módulos premium y consumo mensual atómico. |
| [x] | Aplicar límites de usuarios y productos | Miembros, invitaciones, productos nuevos y reactivaciones validan el plan en backend. |
| [x] | Aplicar límite de ventas mensuales | La creación de venta comprueba `monthlySales` dentro de la transacción antes de descontar stock. |
| [x] | Aplicar límite de exportaciones | `GET /api/reports/export` consume `monthlyExports` atómicamente antes de generar CSV. |
| [x] | Flujo límite alcanzado → upgrade | Las respuestas 402 incluyen `ENTITLEMENT_EXCEEDED` y `/workspace/billing`; catálogo muestra botón para actualizar. |
| [x] | Bloqueo por estado de suscripción | `past_due`, `canceled`, `unpaid` e `incomplete_expired` bloquean create/edit/delete/export; lectura y facturación permanecen disponibles. |
| [x] | Estados del webhook Stripe | Los eventos pasan por `received → processing → processed` o `failed`, con reintento de estados fallidos/estancados. |
| [x] | Idempotencia y ordenamiento Stripe | `billingEvents/{eventId}` se reclama dentro de transacción y los estados de tenant ignoran eventos más antiguos. |
| [ ] | Recuperación operativa de eventos fallidos | El código permite reintento hasta 10 veces; falta una pantalla/job operativo para reprocessar manualmente desde Stripe. |
| [ ] | Acceso API externo real | El catálogo incluye el entitlement `apiAccess` y guard reutilizable; el proyecto todavía no expone una API externa versionada que deba consumirlo. |

### Checkpoint Etapa 3

- [x] Un Starter no puede superar usuarios, productos, ventas mensuales o exportaciones mediante llamadas directas al backend.
- [x] Un Starter no tiene acceso API según el catálogo central.
- [x] Los estados de suscripción restringidos bloquean escrituras y exportaciones.
- [x] Los límites alcanzados devuelven 402 con una ruta clara de upgrade.
- [ ] Probar con tenant Starter real o Emulator Suite intentando superar cada límite.

## ETAPA 4 — Observabilidad y operación (P1/P2)

| Estado | Tarea | Evidencia o pendiente |
|---|---|---|
| [x] | Logging estructurado sin secretos | `lib/observability.ts` sanitiza campos sensibles y middleware registra `api.request.received`. |
| [x] | Correlation ID en APIs | Middleware propaga `x-correlation-id`; `instrumentation.ts` lo conserva al capturar errores. |
| [x] | Captura de errores 5xx | `instrumentation.ts` + `lib/error-reporting.ts` registran `request.failed` con tenant, ruta y contexto seguro. |
| [x] | Health check | `GET /api/health` comprueba que el proceso responda. |
| [x] | Readiness check real | `GET /api/health?ready=true` verifica Firestore y Stripe mediante llamadas reales; devuelve 503 si falla una dependencia. |
| [x] | Backup automatizado | `.github/workflows/firestore-backup.yml` ejecuta export diario y manual mediante Workload Identity Federation. |
| [x] | Retención y cifrado documentados | `scripts/backup-firestore.sh` conserva 35 días y documenta cifrado del bucket/CMEK. |
| [x] | Restore reproducible | `scripts/restore-firestore.sh` y `docs/OPERATIONS-RUNBOOK.md` describen restore en staging y producción. |
| [x] | Alertas mínimas | Eventos estructurados para fallos de facturación, autenticación masiva, 5xx y webhook Stripe fallido. |
| [ ] | Configurar proveedor externo de alertas | Falta conectar Vercel Log Drains/SIEM/Sentry y crear reglas de notificación en la cuenta de producción. |
| [ ] | Ensayo medido de restore | Falta ejecutar restore real en staging y registrar RPO/RTO medidos; el objetivo inicial es RPO 24 h y RTO <4 h. |

### Checkpoint Etapa 4

- [x] Una operación crítica puede rastrearse con correlation ID, tenant y ruta sin exponer secretos.
- [x] El sistema diferencia proceso vivo de readiness de Firestore/Stripe.
- [x] Existe backup diario, retención y script de restore.
- [x] Existen eventos para las cuatro alertas mínimas.
- [ ] El proveedor externo de alertas y el ensayo de restore quedan configurados y archivados.

## ETAPA 6 — Experiencia empresarial y escalabilidad

| Estado | Tarea | Evidencia |
|---|---|---|
| [x] | Lecturas eficientes y listeners controlados | La carga inicial usa endpoints con lecturas puntuales; los listados activos ya usan páginas/cursor y `onSnapshot` queda encapsulado únicamente en el hook realtime con cleanup. |
| [x] | Paginación e índices | Catálogo e inventario usan `limit`/cursor estable; los endpoints existentes mantienen consultas acotadas e índices documentados por Firebase cuando corresponda. |
| [x] | Estados loading/empty/error/success | Dashboard, catálogo, ventas, reportes y onboarding muestran estados de carga, vacío, error y confirmación contextual. |
| [x] | Onboarding guiado | Flujo de tres pasos: empresa creada → primer producto real → primera venta en Ventas/POS, con alternativa clara para continuar al resumen. |
| [x] | Responsive y accesibilidad básica | Focus visible global, `aria-label`/`aria-current`, controles de teclado, formularios etiquetados y layouts adaptados a móvil. |
| [x] | Centro de ayuda | `/workspace/help` incluye documentación mínima de primeros pasos, inventario, ventas, permisos y soporte. |

### Checkpoint Etapa 6 — Cumplido

- [x] La app se puede usar de forma fluida en móvil y desktop.
- [x] No hay spinners infinitos ni pantallas vacías confusas en las pantallas principales revisadas.
- [x] Las lecturas iniciales están acotadas y no hay listeners persistentes en las pantallas operativas activas.
- [x] El onboarding del primer usuario funciona de extremo a extremo hasta la apertura de la primera venta.

**Regla de continuidad:** la Etapa 7 permanece pendiente y no se inicia en este checkpoint.

## ETAPA 7 — Compliance, integraciones y cierre final

| Estado | Tarea | Evidencia |
|---|---|---|
| [x] | Alcance fiscal Nicaragua | `docs/FISCAL-NICARAGUA-IMPLEMENTATION.md`; ventas persisten NIO, numeración transaccional, base, exentos, tasa, impuesto, cliente, RUC, dirección y estado del adaptador. |
| [x] | Preparación para facturación electrónica | Contrato `fiscal.adapterVersion = preview-2026-01`, estado `pending_adapter` y requisitos de contingencia/reintento documentados. La emisión productiva aún requiere asesoría tributaria y proveedor autorizado. |
| [x] | Exportación/importación CSV | `/api/catalog/export` y `/api/catalog/import` con BOM, comillas, columnas obligatorias, límites, duplicados, validación numérica y neutralización de fórmulas. |
| [x] | API pública versionada | `/api/v1/catalog`, `/api/v1/sales` y `/api/v1/keys`; claves hash, aislamiento por tenant, límites distribuidos y contrato en `docs/PUBLIC-API-PREVIEW.md`. |
| [x] | Webhooks firmados preview | `/api/v1/webhooks/preview` con HMAC-SHA256, tolerancia temporal e idempotencia por evento. |
| [x] | Prueba de carga base y presupuestos | `docs/LOAD-TEST-2026-09-08.md`; 120/120 solicitudes, p95 539 ms, sin fallos contra health local. |
| [x] | Runbook operativo | `docs/OPERATIONS-RUNBOOK.md` actualizado con despliegue, rollback, incidentes, restore, smoke test, integraciones y release checklist. |
| [x] | Evidencia local de release | `docs/RELEASE-SMOKE-2026-09-08.md`; typecheck, lint, build, suite, reglas y carga local en verde. |
| [ ] | Smoke E2E autenticado en staging | Requiere navegador Playwright disponible, `E2E_EMAIL/E2E_PASSWORD` y entorno Firebase staging. |
| [ ] | Ensayo real de restore/readiness en staging | Requiere bucket, proyecto staging y credenciales operativas; no se simula localmente. |
| [ ] | Firma humana del release | Requiere responsable técnico, producto, fiscal y operaciones; las casillas están en `docs/RELEASE-SMOKE-2026-09-08.md`. |

### Estado objetivo 100%

El código y la evidencia reproducible local de la Etapa 7 están completos. **No se declara 100% operativo todavía**, porque E2E autenticado en staging, restore real, readiness de proveedores externos y las firmas humanas no pueden certificarse desde este checkout sin sus credenciales y aprobaciones. No se marcan como completados para evitar una declaración de cumplimiento falsa.
