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

### Estado de secretos y Stripe

No se copiaron ni se mostrarán valores secretos. El archivo `.env.example` declara `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, tres precios Stripe, `FIREBASE_SERVICE_ACCOUNT_KEY`, `RESEND_API_KEY` y `SUPERADMIN_UIDS`. En el entorno local inspeccionado solo están presentes las variables `NEXT_PUBLIC_FIREBASE_*`; no están presentes las claves privadas ni los precios Stripe. El modo local Stripe es, por tanto, **no configurado**, no se puede afirmar test o live desde este checkout. En Vercel se debe verificar el entorno **Preview/Development** contra **Production** y confirmar que el prefijo de `STRIPE_SECRET_KEY` sea `sk_test_` o `sk_live_` sin registrar el secreto.

## ETAPA 1 — Seguridad y aislamiento multi-tenant (P0)

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
