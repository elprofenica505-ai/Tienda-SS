# ConexiaX — Estado de la hoja de ruta frente al repositorio

**Fecha de auditoría:** 12 de septiembre de 2026
**Repositorio revisado:** `elprofenica505-ai/Tienda-SS`
**Rama y commit:** `SaaS-MultiTenant-Profesional` @ `3b9e408`
**Fuente de alcance:** hoja de ruta adjunta, fechada el 11 de septiembre de 2026

## Conclusión ejecutiva

El repositorio contiene una base funcional real de SaaS multi-tenant operativo, con autenticación, autorización por tenant, catálogo, ventas, preventas, caja, inventario básico, compras simples, crédito, billing Stripe, API pública en preview, CI, health checks y backups programados. Sin embargo, no hay evidencia suficiente para declarar completadas las etapas de seguridad por sucursal/almacén/caja, inventario multi-almacén, contabilidad, fiscalidad, multi-moneda, operación de producción ni certificación E2E completa.

La hoja de ruta marca **36 tareas realizadas y 252 pendientes, de 288 tareas explícitas**. Esta cifra reproduce sus casillas de control; no equivale a una certificación independiente. La propia regla de la hoja exige backend y frontend, autorización server-side, pruebas positivas y negativas, observabilidad, documentación y validación en staging/emulador. Bajo ese estándar, varias tareas marcadas como realizadas requieren evidencia adicional antes de considerarse cerradas para producción.

### Estado global por etapa

| Etapa | Realizadas según la hoja | Pendientes según la hoja | Lectura de auditoría |
|---|---:|---:|---|
| Etapa 0 — Gobierno del proyecto y línea base | 0 | 9 | No iniciada o sin tareas marcadas como cerradas. |
| Etapa 1 — Seguridad y aislamiento multi-tenant | 4 | 25 | Parcial; la base existe, pero faltan controles o ciclo completo. |
| Etapa 2 — Modelo de organización y gobierno empresarial | 3 | 11 | Parcial; la base existe, pero faltan controles o ciclo completo. |
| Etapa 3 — Catálogo y precios profesional | 3 | 12 | Parcial; la base existe, pero faltan controles o ciclo completo. |
| Etapa 4 — Inventario multi-almacén profesional | 0 | 18 | No iniciada o sin tareas marcadas como cerradas. |
| Etapa 5 — Compras y proveedores | 2 | 14 | Parcial; la base existe, pero faltan controles o ciclo completo. |
| Etapa 6 — Ventas, POS, preventas y devoluciones | 6 | 14 | Parcial; la base existe, pero faltan controles o ciclo completo. |
| Etapa 7 — Clientes, crédito, cartera y cuentas por pagar | 5 | 15 | Parcial; la base existe, pero faltan controles o ciclo completo. |
| Etapa 8 — Caja y pagos | 5 | 13 | Parcial; la base existe, pero faltan controles o ciclo completo. |
| Etapa 9 — Moneda NIO/USD y multi-moneda | 0 | 15 | No iniciada o sin tareas marcadas como cerradas. |
| Etapa 10 — Finanzas y contabilidad ERP | 0 | 20 | No iniciada o sin tareas marcadas como cerradas. |
| Etapa 11 — Fiscalidad de Nicaragua | 0 | 14 | No iniciada o sin tareas marcadas como cerradas. |
| Etapa 12 — Billing SaaS y API pública | 4 | 17 | Parcial; la base existe, pero faltan controles o ciclo completo. |
| Etapa 13 — Rendimiento, escalabilidad y experiencia | 0 | 18 | No iniciada o sin tareas marcadas como cerradas. |
| Etapa 14 — Operación, continuidad y compliance | 4 | 17 | Parcial; la base existe, pero faltan controles o ciclo completo. |
| Etapa 15 — Pruebas finales y certificación interna | 0 | 20 | No iniciada o sin tareas marcadas como cerradas. |
| **Total** | **36** | **252** | **Avance declarado: 12.5% de tareas explícitas** |

## Evidencia revisada

| Área | Evidencia observable | Resultado |
|---|---|---|
| Código funcional | 39 rutas API, librerías de tenant, roles, caja, inventario, Stripe y API v1; 31 archivos de pruebas unitarias/contratos y 5 archivos E2E | Base amplia, pero no prueba por sí sola los criterios de salida |
| Seguridad | `lib/tenant.ts`, `lib/permissions.ts`, `lib/data-scope.ts`, reglas Firestore y pruebas de autorización | Tenant básico implementado; el siguiente riesgo declarado es aislamiento por sucursal, almacén y caja |
| E2E | `e2e/catalog.spec.ts`, `login.spec.ts`, `onboarding.spec.ts` y documentación `docs/E2E-EXECUTION-2026-09-07.md` | Smoke de interfaz/perímetro; faltan flujos autenticados de negocio con Firebase staging |
| Operación | CI, SBOM, secret scanning, health, backup y scripts de restore presentes | Backup existe; staging obligatorio, restore real, RPO/RTO, alertas y rollback siguen sin evidencia operativa |
| Alcance comercial | `docs/ANALISIS-PROFUNDO-SAAS-ERP-MULTITENANT.md` y `docs/ERP-SCOPE-NICARAGUA.md` | El propio repositorio reconoce que aún no es ERP contable/fiscal completo |
| Verificación local | `npm ci --ignore-scripts` seguido de `npm test -- --run` | Suite automatizada ejecutada con salida 0; la prueba valida lógica local, no sustituye E2E autenticada ni staging |

## Tareas realizadas según la hoja de ruta

Las siguientes tareas están marcadas con `☑` en el documento fuente. Se presentan como **realizadas declaradas**, sujetas a la regla de evidencia de la propia hoja.

### Etapa 1 — Seguridad y aislamiento multi-tenant

- [x] Validar autenticación Firebase y membresía activa.
- [x] Validar x-tenant-id contra la identidad autenticada.
- [x] Denegar rutas Firestore no declaradas.
- [x] Probar Empresa A contra Empresa B.

### Etapa 2 — Modelo de organización y gobierno empresarial

- [x] Mantener roles y permisos por módulo.
- [x] Mantener invitaciones con token hash, TTL y consumo único.
- [x] Mantener branches, warehouses y cash registers.

### Etapa 3 — Catálogo y precios profesional

- [x] Productos físicos y servicios.
- [x] SKU, categorías, precios, stock inicial y archivado.
- [x] Importación y exportación básica.

### Etapa 5 — Compras y proveedores

- [x] Maestro básico de proveedores.
- [x] Compra simple con líneas y total.

### Etapa 6 — Ventas, POS, preventas y devoluciones

- [x] Venta directa con carrito.
- [x] Validación transaccional de stock y crédito.
- [x] Venta vinculada a caja.
- [x] Preventa y checkout atómico.
- [x] Devolución parcial y completa.
- [x] Anulación con restricciones.

### Etapa 7 — Clientes, crédito, cartera y cuentas por pagar

- [x] CRUD de clientes y proveedores.
- [x] Límite y saldo de crédito.
- [x] Ventas a crédito.
- [x] Abonos transaccionales.
- [x] Endpoint de notas de crédito.

### Etapa 8 — Caja y pagos

- [x] Apertura de turno.
- [x] Fondo inicial.
- [x] Entradas, retiros y arqueo.
- [x] Diferencia y revisión.
- [x] Cierre y aprobación.

### Etapa 12 — Billing SaaS y API pública

- [x] Stripe Checkout básico.
- [x] Stripe Portal básico.
- [x] Webhook firmado.
- [x] Estados de evento y deduplicación básica.

### Etapa 14 — Operación, continuidad y compliance

- [x] CI con typecheck, lint, tests, build y análisis de dependencias.
- [x] SBOM y secret scanning.
- [x] Health liveness/readiness básico.
- [x] Backup diario programado.

## Tareas pendientes

Las siguientes tareas están marcadas con `☐` en el documento fuente. Constituyen el backlog explícito de la hoja de ruta.

### Etapa 0 — Gobierno del proyecto y línea base

- [ ] Mantener este documento como hoja de ruta principal.
- [ ] Crear un registro de cambios por etapa y commit.
- [ ] Mantener una matriz Actual / Parcial / Pendiente / No soportado por módulo.
- [ ] Definir los entornos development, staging y production.
- [ ] Definir los proyectos Firebase y Vercel correspondientes a cada entorno.
- [ ] Definir quién puede ejecutar migraciones, despliegues y cambios de seguridad.
- [ ] Corregir la documentación contradictoria del repositorio.
- [ ] Establecer una regla: ninguna funcionalidad se anuncia como completa sin prueba
- [ ] Registrar los límites de la beta: número de tenants, sucursales, almacenes, usuarios

### Etapa 1 — Seguridad y aislamiento multi-tenant

- [ ] Crear pruebas HTTP reales para todas las APIs críticas contra otro tenant.
- [ ] Validar que Storage, caché, tareas asíncronas y webhooks también incluyan tenant
- [ ] Prohibir que un identificador enviado por el cliente sea la única autorización.
- [ ] Crear una política única assertBranchAccess y assertWarehouseAccess.
- [ ] Aplicarla en ventas, preventas, caja, inventario, compras, cartera, finanzas,
- [ ] Exigir branchId en toda operación que no sea explícitamente global.
- [ ] Exigir warehouseId en compras, transferencias, recepciones, ajustes y ventas de
- [ ] Exigir registerId y cashSessionId en cobros y movimientos de caja.
- [ ] Filtrar server-side todos los listados por branchIds autorizados.
- [ ] Revisar Firestore Rules para no autorizar lectura tenant-wide cuando el dato sea de
- [ ] Probar usuario de Sucursal A contra Sucursal B con cada rol.
- [ ] Probar usuario de Almacén A contra Almacén B.
- [ ] Probar cajero de Caja A contra Caja B.
- [ ] Corregir escalada de roles en members PATCH.
- [ ] Crear canManageRole(actor, target, newRole) server-side.
- [ ] Impedir que un supervisor promueva a administrador o gerente.
- [ ] Impedir que un administrador cree o promueva superadministradores.
- [ ] Aplicar la jerarquía también a invitaciones.
- [ ] Invalidar sesiones o tokens al desactivar o degradar un miembro.
- [ ] Hacer MFA obligatorio para owner, admin y superadmin en producción.
- [ ] Definir expiración, renovación y revocación de sesiones.
- [ ] Reactivar el rate limit específico de login.
- [ ] Responder con Retry-After y registrar métricas de abuso.
- [ ] Validar esquemas, campos inmutables, estados y ownership en cada API.
- [ ] Crear auditoría append-only para cambios de permisos y miembros.

### Etapa 2 — Modelo de organización y gobierno empresarial

- [ ] Completar UI de invitaciones pendientes.
- [ ] Permitir reenviar y revocar invitaciones desde la UI.
- [ ] Mostrar expiración y estado de entrega.
- [ ] Crear cola durable para correos de invitación.
- [ ] Registrar estados queued, sent, failed, retrying y delivered.
- [ ] Reducir el directorio visible según rol y sucursal.
- [ ] Implementar aprobación para altas de usuarios sensibles.
- [ ] Crear segregación de funciones para ventas, caja, inventario, compras y finanzas.
- [ ] Completar migración de roles legacy.
- [ ] Añadir historial de cambios de rol y asignación de sucursal.
- [ ] Añadir límites por plan de usuarios, sucursales, almacenes y cajas.

### Etapa 3 — Catálogo y precios profesional

- [ ] Añadir unidades de medida y conversiones.
- [ ] Añadir variantes, atributos y códigos alternativos.
- [ ] Añadir listas de precio por cliente, sucursal o canal.
- [ ] Añadir precios mayoristas y promociones con vigencia.
- [ ] Añadir impuestos por producto y categoría.
- [ ] Añadir costo estándar, costo promedio y margen.
- [ ] Añadir historial de cambios de precio.
- [ ] Añadir imágenes reales mediante Firebase Storage.
- [ ] Validar MIME, tamaño, permisos y eliminación de imágenes.
- [ ] Añadir búsqueda server-side y paginación por cursor.
- [ ] Añadir importación con preview, errores por fila, rollback e idempotencia.
- [ ] Añadir exportación completa con filtros y trazabilidad.

### Etapa 4 — Inventario multi-almacén profesional

- [ ] Declarar inventoryStocks como fuente canónica.
- [ ] Inventariar todos los documentos que usan products.stock.
- [ ] Crear migración de datos legacy.
- [ ] Conciliar products.stock contra la suma de stocks por almacén.
- [ ] Decidir estrategia de compatibilidad y fecha de retiro del stock legacy.
- [ ] Exigir branchId y warehouseId en movimientos.
- [ ] Implementar transferencia atómica entre almacenes.
- [ ] Crear estados draft, requested, approved, in_transit, received, cancelled.
- [ ] Registrar débito en origen y crédito en destino en una operación idempotente.
- [ ] Implementar recepción parcial y diferencias de transferencia.
- [ ] Integrar reservas con ventas y preventas.
- [ ] Integrar devoluciones con inventario por almacén.
- [ ] Implementar conteo físico con aprobación y ajuste auditado.
- [ ] Añadir lotes, series, caducidad y ubicaciones cuando el segmento lo requiera.
- [ ] Implementar valoración de inventario.
- [ ] Implementar COGS conectado a ventas y contabilidad.
- [ ] Crear reconciliación programada y alertas de diferencias.
- [ ] Crear pruebas de dos sucursales y dos almacenes con stock diferente.

### Etapa 5 — Compras y proveedores

- [ ] Orden de compra en estado borrador.
- [ ] Flujo de aprobación de compra.
- [ ] Recepción total y parcial.
- [ ] Recepción por sucursal y almacén.
- [ ] Diferencias entre orden y recepción.
- [ ] Devoluciones a proveedor.
- [ ] Costos, impuestos, descuentos y moneda de compra.
- [ ] Evidencia documental real en Storage.
- [ ] Historial de precios y proveedores por producto.
- [ ] Plazos y condiciones de pago.
- [ ] Cuenta por pagar asociada a la compra.
- [ ] Pagos parciales y saldo pendiente.
- [ ] Reporte de compras por proveedor, sucursal, almacén y periodo.
- [ ] Pruebas de idempotencia, concurrencia y rollback.

### Etapa 6 — Ventas, POS, preventas y devoluciones

- [ ] Añadir branchId, warehouseId, registerId y cashSessionId a preventas.
- [ ] Filtrar búsqueda de tickets por sucursal autorizada.
- [ ] Sustituir evidence:// por Storage real.
- [ ] Añadir comprobante descargable e impresión térmica.
- [ ] Añadir búsqueda histórica por número, cliente, fecha y estado.
- [ ] Añadir aprobación para devoluciones de alto valor.
- [ ] Añadir motivos obligatorios y evidencia de devolución.
- [ ] Añadir pagos mixtos.
- [ ] Añadir reintentos seguros e idempotencia para todos los cobros.
- [ ] Separar pago declarado de pago confirmado.
- [ ] Añadir integración con adquirente o banco.
- [ ] Añadir conciliación de tarjeta y transferencia.
- [ ] Crear pruebas de doble checkout y stock insuficiente concurrente.
- [ ] Crear pruebas de devolución parcial repetida y límites de reembolso.

### Etapa 7 — Clientes, crédito, cartera y cuentas por pagar

- [ ] Filtrar cartera por sucursal y usuario autorizado.
- [ ] Validar sucursal en cada abono.
- [ ] Hacer abonos idempotentes.
- [ ] Crear reconciliación de creditBalance.
- [ ] Añadir UI de movimientos de crédito.
- [ ] Añadir UI de notas de crédito.
- [ ] Añadir aging 0–30, 31–60, 61–90 y más de 90 días.
- [ ] Añadir aplicación de un pago a varios documentos.
- [ ] Añadir promesas y gestiones de cobro.
- [ ] Añadir recordatorios configurables.
- [ ] Añadir bloqueo de crédito vencido.
- [ ] Añadir aprobación de excepciones de límite.
- [ ] Integrar proveedores con cuentas por pagar.
- [ ] Añadir vencimientos, pagos parciales y conciliación de proveedores.
- [ ] Crear reportes de recuperación y morosidad.

### Etapa 8 — Caja y pagos

- [ ] Exigir registerId en cada operación.
- [ ] Exigir cashSessionId en gastos y retiros aplicables.
- [ ] Impedir ventas contra una sesión ambigua.
- [ ] Soportar varias cajas abiertas con selección explícita.
- [ ] Añadir pagos mixtos.
- [ ] Añadir depósitos bancarios.
- [ ] Añadir conciliación con banco y adquirente.
- [ ] Añadir aprobación de gastos y retiros de alto monto.
- [ ] Añadir motivo, evidencia y aprobador de diferencias.
- [ ] Añadir cierre parcial y cierre diario.
- [ ] Añadir auditoría a gastos y movimientos financieros.
- [ ] Separar flujo de caja, ingreso, margen y resultado contable.
- [ ] Crear pruebas con dos cajas, dos cajeros y dos sucursales.

### Etapa 9 — Moneda NIO/USD y multi-moneda

- [ ] Definir moneda base por tenant o entidad legal.
- [ ] Permitir elegir NIO o USD en configuración del tenant.
- [ ] Definir moneda de cada operación.
- [ ] Guardar amount, currency, baseAmount, baseCurrency y exchangeRate.
- [ ] Definir fuente y fecha del tipo de cambio.
- [ ] Definir reglas de redondeo y precisión.
- [ ] Definir moneda de caja, banco, compra y venta.
- [ ] Añadir tipo de cambio manual y, si se requiere, fuente automática.
- [ ] Eliminar currency: 'NIO' hardcodeado.
- [ ] Eliminar símbolos $ hardcodeados.
- [ ] Actualizar formato de catálogo, ventas, caja, reportes y exportaciones.
- [ ] Definir tratamiento de diferencias cambiarias.
- [ ] Definir revaluación y cierre multi-moneda.
- [ ] Crear pruebas completas NIO y USD.
- [ ] Impedir sumar montos con monedas distintas sin conversión explícita.

### Etapa 10 — Finanzas y contabilidad ERP

- [ ] Definir plan de cuentas configurable.
- [ ] Implementar partida doble.
- [ ] Crear diario contable.
- [ ] Crear libro mayor.
- [ ] Crear dimensiones: sucursal, centro de costo, proyecto y departamento.
- [ ] Generar asientos desde ventas, compras, caja, inventario, crédito y pagos.
- [ ] Implementar periodos contables.
- [ ] Implementar cierre y reapertura autorizada.
- [ ] Implementar reversas contables.
- [ ] Implementar conciliación bancaria.
- [ ] Implementar cuentas por cobrar y por pagar conectadas al mayor.
- [ ] Implementar costo de ventas e inventario valorizado.
- [ ] Implementar impuestos y retenciones.
- [ ] Crear balance de comprobación.
- [ ] Crear estado de resultados.
- [ ] Crear balance general.
- [ ] Crear flujo de efectivo.
- [ ] Crear reportes por sucursal y centro de costo.
- [ ] Crear auditoría de asientos y cambios.
- [ ] Impedir borrar asientos contabilizados.

### Etapa 11 — Fiscalidad de Nicaragua

- [ ] Confirmar requisitos tributarios aplicables con asesoría local.
- [ ] Elegir proveedor o integración autorizada.
- [ ] Implementar numeración segura.
- [ ] Implementar emisión electrónica.
- [ ] Implementar estados de aceptación y rechazo.
- [ ] Implementar reintentos idempotentes.
- [ ] Implementar contingencia offline o de proveedor caído.
- [ ] Implementar anulación fiscal.
- [ ] Implementar notas de crédito fiscales.
- [ ] Implementar almacenamiento de XML/JSON/PDF y metadatos.
- [ ] Implementar consulta y descarga del comprobante.
- [ ] Implementar conciliación de documento interno versus documento fiscal.
- [ ] Crear pruebas de rechazo, reintento, duplicado y contingencia.
- [ ] Revisar legalmente el alcance antes de anunciar “facturación electrónica”.

### Etapa 12 — Billing SaaS y API pública

- [ ] Aplicar assertApiAccess a todas las rutas v1.
- [ ] Consumir cuota API por plan.
- [ ] Añadir respuestas 402/429 consistentes.
- [ ] Crear listado, revocación y rotación de API keys.
- [ ] Añadir scopes por key.
- [ ] Añadir expiración de keys.
- [ ] Añadir OpenAPI versionado.
- [ ] Añadir paginación por cursor.
- [ ] Añadir idempotencia server-side para checkout.
- [ ] Procesar eventos de pago exitoso y fallido de forma completa.
- [ ] Crear reconciliación periódica con Stripe.
- [ ] Añadir historial de invoices.
- [ ] Añadir cambios de plan, prorrateo, cancelación y reactivación.
- [ ] Añadir refund y dispute cuando corresponda.
- [ ] Crear panel de billing events fallidos.
- [ ] Crear outbox durable para correo y notificaciones.
- [ ] Crear pruebas reales con Stripe test mode.

### Etapa 13 — Rendimiento, escalabilidad y experiencia

- [ ] Migrar listados a cursores server-side.
- [ ] Eliminar filtrado en memoria de cartera, reportes, finanzas, compras y
- [ ] Revisar y documentar todos los índices Firestore.
- [ ] Crear agregados diarios o materializados para reportes.
- [ ] Medir lecturas y escrituras por tenant.
- [ ] Medir p50, p95 y p99 por endpoint.
- [ ] Ejecutar pruebas de carga con múltiples tenants.
- [ ] Ejecutar pruebas con más de 500, 10,000 y 100,000 registros.
- [ ] Evaluar rate limiting fuera de Firestore si genera contención o coste excesivo.
- [ ] Reducir First Load JS por ruta.
- [ ] Dividir componentes legacy y Firebase por módulo.
- [ ] Reducir CSS global.
- [ ] Establecer presupuestos de Web Vitals.
- [ ] Añadir AppErrorBoundary global.
- [ ] Estandarizar loading, empty, error, retry, success y offline.
- [ ] Añadir accesibilidad WCAG 2.2 AA.
- [ ] Probar teclado, foco, lectores de pantalla, contraste y objetivos táctiles.
- [ ] Validar móviles de 320, 375, 768 y 1024 px.

### Etapa 14 — Operación, continuidad y compliance

- [ ] Añadir staging obligatorio.
- [ ] Promover el mismo artefacto de staging a producción.
- [ ] Añadir migraciones versionadas.
- [ ] Añadir aprobación de despliegue.
- [ ] Añadir smoke tests post-deploy.
- [ ] Añadir rollback documentado y probado.
- [ ] Ejecutar restore real en staging.
- [ ] Validar manifest, permisos y proyecto de destino.
- [ ] Medir RPO y RTO reales.
- [ ] Añadir alertas de backup fallido o antiguo.
- [ ] Añadir métricas de errores, latencia, auth, billing, correo y webhooks.
- [ ] Añadir tracing con correlation ID.
- [ ] Crear runbooks de incidentes.
- [ ] Crear política de privacidad y retención.
- [ ] Crear procedimiento de respuesta a incidentes.
- [ ] Crear revisión independiente de seguridad.
- [ ] Actualizar dependencias y ejecutar pruebas de regresión.

### Etapa 15 — Pruebas finales y certificación interna

- [ ] Crear suite E2E autenticada de registro y verificación.
- [ ] Crear suite E2E de onboarding.
- [ ] Crear suite E2E de producto y categoría.
- [ ] Crear suite E2E de venta contado.
- [ ] Crear suite E2E de venta crédito y abono.
- [ ] Crear suite E2E de preventa y checkout.
- [ ] Crear suite E2E de caja y arqueo.
- [ ] Crear suite E2E de devolución y anulación.
- [ ] Crear suite E2E de compra y recepción.
- [ ] Crear suite E2E de transferencia entre almacenes.
- [ ] Crear suite E2E de dos sucursales aisladas.
- [ ] Crear suite E2E de roles y permisos.
- [ ] Crear suite E2E de billing y webhook Stripe.
- [ ] Crear pruebas de concurrencia.
- [ ] Crear pruebas de rate limit y abuso.
- [ ] Crear pruebas de restore.
- [ ] Crear pruebas de accesibilidad.
- [ ] Crear pruebas de rendimiento.
- [ ] Crear pruebas de migración y rollback.
- [ ] Mantener la suite de readiness completamente verde.

## Prioridad recomendada

1. **Etapa 1:** cerrar primero autorización server-side por sucursal, almacén y caja; corregir la jerarquía de roles en `members PATCH`; añadir pruebas HTTP negativas reales y MFA/sesiones observables.
2. **Etapa 15 en paralelo controlado:** habilitar Firebase de staging y completar E2E autenticada del flujo onboarding–catálogo–venta–caja–devolución, más dos sucursales aisladas.
3. **Etapas 4, 5, 7 y 8:** consolidar el modelo canónico de inventario, compras/recepciones, cartera y caja antes de ampliar la superficie comercial.
4. **Etapa 14:** ejecutar restore real en staging, medir RPO/RTO y documentar promoción/rollback antes de un piloto comercial.
5. **Etapas 9–11:** no anunciar multi-moneda completa, contabilidad ERP ni facturación electrónica hasta implementar y probar sus modelos de datos y dependencias externas.

## Limitaciones de esta auditoría

No se afirmó que una función estuviera completa únicamente por la existencia de una pantalla, endpoint, colección Firestore o prueba estática. No se usaron credenciales de Firebase/Stripe ni se simuló un restore productivo. La evidencia de entorno desplegado, staging, producción, métricas reales, cuentas autenticadas y firmas operativas queda fuera del clon local.

## Referencias

[1]: https://github.com/elprofenica505-ai/Tienda-SS "Repositorio revisado de ConexiaX / Tienda-SS"
[2]: https://firebase.google.com/docs/firestore/security/rules-conditions "Firestore Security Rules conditions"
[3]: https://playwright.dev/docs/test-intro "Playwright Test documentation"
