# Backlog de cierre SaaS multi-tenant

**Rama:** `SaaS-MultiTenant-Profesional`  
**Estado inicial:** 56% de madurez estimada  
**Regla de ejecución:** una tarea por ciclo, con verificación y checkpoint antes de pasar a la siguiente. **Progreso actual: 4/21 tareas cerradas.** **Stripe, planes y pagos empresariales quedan para la tarea 21.**

## Tareas pendientes

- [x] **1. P0.1 — Consolidar autorización multi-tenant y membresías.** Eliminar caminos administrativos duplicados, centralizar la guardia de tenant/permisos y garantizar que todas las rutas críticas usan el mismo contexto verificado.
- [x] **2. P0.2 — Crear matriz de pruebas de autorización API.** Cubrir 401, tenant ausente, tenant cruzado, miembro inactivo, rol insuficiente, payload inválido y errores internos en las 19 rutas.
- [x] **3. P0.3 — Implementar invitaciones empresariales seguras.** Tokens de un solo uso, expiración, aceptación, revocación, reenvío y auditoría.
- [x] **4. P0.4 — Endurecer identidad y autenticación.** Verificación de correo, recuperación probada, MFA para administradores y política de sesiones.
- [ ] **5. P0.5 — Convertir rate limiting en distribuido.** Límites por IP, UID, tenant y endpoint con almacenamiento compartido y pruebas anti-abuso.
- [ ] **6. P0.6 — Aplicar autorización por campo, sucursal y sensibilidad.** Evitar que roles operativos lean o modifiquen información fuera de su ámbito.
- [ ] **7. P1.1 — Ampliar entitlements por plan.** Limitar sucursales, ventas, almacenamiento, exportaciones, API y funcionalidades premium desde backend.
- [ ] **8. P1.2 — Robustecer procesamiento de Stripe.** Idempotencia transaccional, eventos fuera de orden, replay, timeout y recuperación de eventos fallidos.
- [ ] **9. P1.3 — Completar integridad de ventas e inventario.** Devoluciones, anulaciones, notas de crédito, ajustes autorizados, reservas, costos y auditoría.
- [ ] **10. P1.4 — Crear auditoría inmutable.** Registrar actor, tenant, entidad, antes/después, timestamp, request y resultado en operaciones sensibles.
- [ ] **11. P1.5 — Definir el alcance ERP por vertical.** Fijar ICP, país, impuestos, documentos fiscales y módulos del primer mercado objetivo.
- [ ] **12. P2.1 — Implementar pruebas de integración y E2E.** Onboarding, login, cambio de tenant, producto, venta, crédito, cobro, miembros y facturación.
- [ ] **13. P2.2 — Completar CI/CD empresarial.** Secret scanning, dependencias, SBOM, staging, preview, migraciones y smoke tests.
- [ ] **14. P2.3 — Eliminar deuda de calidad.** Cero warnings, menos `any`, schemas de validación y estándares consistentes.
- [ ] **15. P3.1 — Implementar observabilidad de producción.** Logs estructurados, correlation ID, métricas, tracing, alertas y dashboard.
- [ ] **16. P3.2 — Crear health/readiness real.** Comprobar proceso, Firestore y proveedores externos sin exponer secretos.
- [ ] **17. P3.3 — Completar backup y recuperación.** Programación, retención, cifrado, restore en staging y RPO/RTO medidos.
- [ ] **18. P3.4 — Preparar escalabilidad.** Paginación, índices, contadores, límites por tenant, pruebas de carga y presupuesto de lecturas.
- [ ] **19. P4.1 — Completar experiencia empresarial.** Accesibilidad, estados de carga/error/vacío, responsive, onboarding y centro de ayuda.
- [ ] **20. P4.2 — Implementar integraciones empresariales.** Importación/exportación, API pública versionada, webhooks, contabilidad y almacenamiento seguro.
- [ ] **21. P5.1 — Configurar Stripe y planes de pago empresariales.** Productos, precios, checkout, portal, webhook, estados de suscripción, límites por plan, pruebas y operación en producción. **Última tarea.**

## Criterio global de 100%

El sistema solo se declarará cerrado cuando typecheck, lint, tests unitarios, integración, reglas Firestore, E2E y build pasen en CI; no exista acceso cross-tenant; los límites funcionen; las operaciones críticas sean auditables; existan observabilidad y restore probado; y Stripe pueda manejar duplicados, fallos y estados de suscripción sin corrupción.

### Desglose de la tarea 2 — matriz de autorización API

- [x] Caso global: cada ruta protegida rechaza Authorization ausente con 401.
- [x] Caso global: cada ruta protegida rechaza x-tenant-id ausente o inválido con 400.
- [x] Caso global: token inválido o membresía inexistente/inactiva no obtiene acceso.
- [x] Caso global: usuario autenticado en tenant A no puede leer ni mutar tenant B.
- [x] Caso global: rol sin permiso recibe 403 aunque manipule el body.
- [x] Caso global: payload JSON inválido o incompleto recibe 400 sin escribir datos.
- [x] Caso global: errores internos no filtran secretos ni trazas al cliente.
- [x] Caso por método: GET/POST/PATCH/DELETE respeta la acción de permisos correspondiente.
- [x] Caso legacy: `/api/usuarios` conserva compatibilidad pero usa exactamente la misma guardia que `/api/members`.

### Desglose de la tarea 3 — invitaciones empresariales seguras

- [x] Diseñar colección `tenantInvitations` y máquina de estados `pending/accepted/revoked/expired`.
- [x] Generar token aleatorio de alta entropía y guardar únicamente su hash.
- [x] Crear endpoint autenticado para invitar miembros con límite por plan y permisos.
- [x] Crear endpoint público para consultar una invitación sin revelar secretos.
- [x] Crear endpoint de aceptación de un solo uso con transacción y vinculación al tenant.
- [x] Crear endpoints de revocación y reenvío controlado.
- [x] Aplicar expiración, normalización de email, prevención de escalamiento de rol y rate limiting.
- [x] Registrar auditoría de creación, aceptación, revocación, reenvío y expiración.
- [x] Añadir pruebas de token inválido, replay, expiración, tenant cruzado y abuso.
