# Matriz de trazabilidad de producto

**Producto:** Tienda-SS / ConexiaX  
**Rama:** `SaaS-MultiTenant-Profesional`  
**Propósito:** relacionar cada capacidad prioritaria con su requisito, API, interfaz y evidencia de prueba.

## Cómo leer la matriz

- **Actual** significa que existe evidencia funcional en el repositorio.
- **Parcial** significa que existe una parte del flujo, pero no el ciclo completo o no hay suficiente evidencia E2E.
- **Roadmap** significa que está definido como capacidad futura y no debe presentarse como funcionalidad terminada.
- **Pendiente** significa que no existe una implementación suficiente.

Una fila no se considerará cerrada hasta que tenga backend protegido, UI usable, prueba apropiada y documentación actualizada.

## 1. Fundamentos de tenant, acceso y organización

| ID | Requisito | Estado | API o backend | UI | Prueba/evidencia | Próximo cierre |
|---|---|---|---|---|---|---|
| TEN-001 | Crear empresa y owner sin datos demo. | Actual | `POST /api/tenants` | `/register`, `/onboarding` | `tests/stage1-onboarding.test.ts`, `e2e/onboarding.spec.ts` | E2E con Firebase real o emulator. |
| TEN-002 | Aislar datos por tenant. | Parcial | `requireTenantPermission`, `lib/tenant.ts` | `TenantProvider` | `tests/firestore.rules.test.mjs`, `tests/api-authorization-matrix.test.ts` | Pruebas HTTP con Admin SDK y cross-tenant. |
| TEN-003 | Invitar y desactivar miembros. | Actual | `/api/invitations`, `/api/members` | `/workspace/members` | `tests/invitations.test.ts` | E2E de invitación y revocación. |
| TEN-004 | Configurar permisos por rol. | Actual | `/api/permissions`, `lib/permissions.ts` | `/workspace/permissions` | `tests/permissions.test.ts` | Añadir alcance por sucursal y documento. |
| TEN-005 | Crear sucursales. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 1, tareas 1.1–1.5. |
| TEN-006 | Crear almacenes y cajas. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 1, tareas 1.2–1.3. |
| TEN-007 | Asignar usuario a sucursales. | Parcial | `branchIds` en modelo existente | No existe selector completo | Pruebas parciales de permisos | Etapa 1, alcance cross-branch. |
| TEN-008 | Seleccionar sucursal activa. | Roadmap | Pendiente | Pendiente | Pendiente | Crear `BranchProvider`. |

## 2. Catálogo y productos

| ID | Requisito | Estado | API o backend | UI | Prueba/evidencia | Próximo cierre |
|---|---|---|---|---|---|---|
| CAT-001 | Crear y editar productos. | Actual | `/api/catalog` | `/workspace/catalog` | `tests/stage0-product-truth.test.ts` | Añadir E2E autenticada completa. |
| CAT-002 | Crear productos físicos y servicios. | Actual | `/api/catalog` | `/workspace/catalog` | Tests de producto y build | Validar unidad, impuesto y costo. |
| CAT-003 | Importar y exportar catálogo. | Actual | `/api/catalog/import`, `/api/catalog/export` | UI parcial | `tests/etapa7-integrations.test.ts` | Vista previa, errores por fila y rollback. |
| CAT-004 | Gestionar variantes. | Roadmap | No completa | No completa | No existe evidencia suficiente | Diseñar variantes, SKU y stock. |
| CAT-005 | Manejar precios por sucursal/lista. | Roadmap | Pendiente | Pendiente | Pendiente | Etapas 1, 3 y 4. |
| CAT-006 | Controlar costo e historial de precio. | Parcial | `unitCost` en compras | UI no completa | `tests/business-integrity.test.ts` | Implementar costo promedio e historial. |
| CAT-007 | Usar código de barras. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 4. |

## 3. Ventas, preventas y POS

| ID | Requisito | Estado | API o backend | UI | Prueba/evidencia | Próximo cierre |
|---|---|---|---|---|---|---|
| SAL-001 | Crear venta con stock transaccional. | Actual | `POST /api/sales` | `/workspace/sales` | `tests/business-integrity.test.ts`, `tests/stage2-presales.test.ts` | E2E vendedor a cobro. |
| SAL-002 | Prevenir doble venta con idempotencia. | Actual | `Idempotency-Key` en `/api/sales` | POS | `tests/business-integrity.test.ts` | Añadir prueba concurrente. |
| SAL-003 | Crear preventa y enviarla a caja. | Actual | `/api/presales` | `/workspace/presales`, `/workspace/cashier` | `tests/stage2-presales.test.ts` | E2E autenticada con dos roles. |
| SAL-004 | Cobrar ticket en caja. | Actual | `/api/presales/checkout` | `/workspace/cashier` | `tests/stage2-presales.test.ts` | Asociar a sesión de caja. |
| SAL-005 | Aplicar crédito y límite. | Parcial | `/api/sales`, `/api/receivables` | POS y crédito | `tests/stage3-4-credit-dashboard.test.ts` | Aging y estado de cuenta. |
| SAL-006 | Crear cotización. | Roadmap | No existe flujo completo | No existe pantalla completa | Pendiente | Etapa 3. |
| SAL-007 | Crear pedido y estados. | Parcial | Entregas y preventas simples | UI parcial | Evidencia parcial | Etapa 3. |
| SAL-008 | Aplicar pagos mixtos. | Roadmap | No existe desglose completo | No existe selector completo | Pendiente | Etapa 2–3. |
| SAL-009 | Procesar devolución total/parcial. | Parcial | `/api/sales/returns` | Experiencia incompleta | Rutas y auditoría existentes | E2E de stock, caja y crédito. |
| SAL-010 | Anular venta con autorización. | Parcial | `/api/sales/void` | Experiencia incompleta | API existente | Etapa 3. |
| SAL-011 | Imprimir comprobante consistente. | Parcial | Campos fiscales en venta | Ticket en caja | `tests/stage7-product-polish.test.ts` | Unificar moneda y documentos. |

## 4. Caja y pagos

| ID | Requisito | Estado | API o backend | UI | Prueba/evidencia | Próximo cierre |
|---|---|---|---|---|---|---|
| CASH-001 | Registrar gastos y movimientos básicos. | Actual | `/api/finance` | `/workspace/finance` | `tests/business-integrity.test.ts` | Reemplazar por movimientos ligados a sesión. |
| CASH-002 | Abrir caja con fondo inicial. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 2. |
| CASH-003 | Asociar ventas a caja y turno. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 2. |
| CASH-004 | Arqueo por método de pago. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 2. |
| CASH-005 | Calcular diferencia de caja. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 2. |
| CASH-006 | Cerrar y aprobar turno. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 2. |
| CASH-007 | Reabrir caja con autorización. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 2. |

## 5. Inventario, almacenes y costos

| ID | Requisito | Estado | API o backend | UI | Prueba/evidencia | Próximo cierre |
|---|---|---|---|---|---|---|
| INV-001 | Registrar entradas, salidas y ajustes. | Actual | `/api/inventory` | `/workspace/inventory` | `tests/stage5-6-inventory-billing.test.ts` | Alcance por almacén. |
| INV-002 | Bloquear stock negativo. | Actual | Transacción de inventario y ventas | Inventario/POS | `tests/business-integrity.test.ts` | Añadir prueba concurrente. |
| INV-003 | Mantener historial de movimientos. | Actual | `inventoryMovements` | Historial básico | Tests de integridad | Añadir filtros y detalle. |
| INV-004 | Reservar stock para pedidos/preventas. | Parcial | `/api/inventory/reservations` | UI limitada | Tests de integración parciales | Integrar reserva con estados. |
| INV-005 | Controlar stock por sucursal/almacén. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 1 y 4. |
| INV-006 | Transferir entre almacenes. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 4. |
| INV-007 | Calcular costo promedio ponderado. | Roadmap | Compras guarda costo, no actualiza promedio completo | No existe vista completa | Pendiente | Etapa 4–5. |
| INV-008 | Ejecutar conteos físicos aprobados. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 4. |
| INV-009 | Alertar mínimos y reorden. | Parcial | Mínimos y `lowStock` | Dashboard muestra alertas | Evidencia de dashboard | Automatizar tarea de compra en Etapa 8. |

## 6. Compras y cuentas por pagar

| ID | Requisito | Estado | API o backend | UI | Prueba/evidencia | Próximo cierre |
|---|---|---|---|---|---|---|
| PUR-001 | Registrar recepción simple. | Actual | `/api/purchases` | `/workspace/purchases` | `tests/stage5-6-inventory-billing.test.ts` | Conectar a orden. |
| PUR-002 | Gestionar proveedor básico. | Actual | `/api/contacts?type=supplier` | `/workspace/contacts` | Tests de integridad | Añadir condiciones comerciales. |
| PUR-003 | Crear solicitud de compra. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 5. |
| PUR-004 | Crear y aprobar orden de compra. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 5. |
| PUR-005 | Recibir parcialmente y registrar diferencias. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 5. |
| PUR-006 | Crear cuenta por pagar. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 5. |
| PUR-007 | Registrar pago a proveedor. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 5. |
| PUR-008 | Devolver a proveedor. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 5. |

## 7. Crédito y cobranza

| ID | Requisito | Estado | API o backend | UI | Prueba/evidencia | Próximo cierre |
|---|---|---|---|---|---|---|
| AR-001 | Crear cliente con límite de crédito. | Actual | `/api/contacts` | `/workspace/contacts` | `tests/business-integrity.test.ts` | Historial y políticas. |
| AR-002 | Vender a crédito con límite. | Actual | `/api/sales` y checkout | POS/caja | `tests/stage3-4-credit-dashboard.test.ts` | E2E de límite y aprobación. |
| AR-003 | Registrar abono. | Actual | `/api/receivables` | `/workspace/receivables` | `tests/stage3-4-credit-dashboard.test.ts` | Aplicación por documento. |
| AR-004 | Crear nota de crédito. | Actual | `/api/receivables/credit-notes` | UI parcial | Evidencia de API | E2E de saldo e inventario. |
| AR-005 | Mostrar aging por rangos. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 6. |
| AR-006 | Crear estado de cuenta. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 6. |
| AR-007 | Registrar promesa y gestión de cobro. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 6. |
| AR-008 | Automatizar recordatorio vencido. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 8. |

## 8. Entregas

| ID | Requisito | Estado | API o backend | UI | Prueba/evidencia | Próximo cierre |
|---|---|---|---|---|---|---|
| DEL-001 | Listar entregas del tenant. | Actual | `GET /api/deliveries` | `/workspace/deliveries` | `tests/api-authorization-matrix.test.ts` | Alcance por sucursal. |
| DEL-002 | Marcar entrega pendiente/entregada. | Actual | `PATCH /api/deliveries` | Pantalla de entregas | Evidencia de ruta | Estados completos e incidencias. |
| DEL-003 | Asignar chofer y despacho. | Parcial | Campos básicos | UI simple | Evidencia parcial | Etapa 3 y distribución. |
| DEL-004 | Registrar prueba de entrega. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 5/10. |
| DEL-005 | Reprogramar entrega fallida. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 8. |

## 9. Finanzas, reportes y conceptos contables

| ID | Requisito | Estado | API o backend | UI | Prueba/evidencia | Próximo cierre |
|---|---|---|---|---|---|---|
| FIN-001 | Registrar gastos y movimientos. | Actual | `/api/finance` | `/workspace/finance` | `tests/business-integrity.test.ts` | Ligarlos a caja y periodo. |
| FIN-002 | Mostrar flujo neto operativo. | Parcial | `/api/reports`, `/api/finance` | Dashboard/reportes | Tests de dashboard | Corregir nombre y conciliación. |
| FIN-003 | Calcular margen bruto con costo real. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 4. |
| FIN-004 | Mostrar resultado operativo. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 6/10. |
| FIN-005 | Reportar por sucursal, usuario y periodo. | Parcial | Reportes por tenant | `/workspace/reports` | Tests de dashboard | Etapas 1 y 7. |
| FIN-006 | Exportar reportes. | Actual | `/api/reports/export` | UI parcial | `tests/etapa7-integrations.test.ts` | Validar permisos y filtros. |
| FIN-007 | Evitar lecturas fijas incompletas. | Parcial | Lotes de 500 y filtros en memoria | Reportes | Revisión técnica | Agregados y consultas por rango. |

## 10. Fiscalidad y moneda

| ID | Requisito | Estado | API o backend | UI | Prueba/evidencia | Próximo cierre |
|---|---|---|---|---|---|---|
| FIS-001 | Calcular IVA y base en backend. | Actual | `lib/fiscal-ni.ts` | POS | `tests/business-integrity.test.ts` | Añadir escenarios exentos. |
| FIS-002 | Generar numeración transaccional. | Actual | `settings/fiscal` | Ticket | `docs/FISCAL-NICARAGUA-IMPLEMENTATION.md` | Validar concurrencia E2E. |
| FIS-003 | Persistir NIO por documento. | Actual | Venta y tenant | Varias pantallas | `tests/production-readiness.test.ts` | Eliminar `$` operativo restante. |
| FIS-004 | Emitir fiscalmente ante proveedor autorizado. | Roadmap | Adaptador preliminar | Pendiente | Pendiente | Etapa 10 y validación local. |
| FIS-005 | Soportar contingencia y reintentos fiscales. | Roadmap | Pendiente | Pendiente | Pendiente | Etapa 10. |

## 11. Seguridad, auditoría y operación

| ID | Requisito | Estado | API o backend | UI | Prueba/evidencia | Próximo cierre |
|---|---|---|---|---|---|---|
| OPS-001 | Auditar cambios sensibles. | Actual | `writeImmutableAudit` | UI limitada | `tests/p0-security.test.ts` | Visor de auditoría por documento. |
| OPS-002 | Rate limit de registro e invitaciones. | Actual | `lib/rate-limit.ts` | Mensajes de error | `tests/rate-limit.test.ts`, `tests/invitations.test.ts` | Rate limiter distribuido. |
| OPS-003 | Health/readiness. | Actual | `/api/health` | Operación | `tests/health.test.ts` | Alertas externas. |
| OPS-004 | Backup Firestore. | Parcial | `scripts/backup-firestore.sh` | Runbook | CI valida script | Ejecutar backup programado. |
| OPS-005 | Restore probado. | Pendiente | Procedimiento documental | Pendiente | Sin evidencia de simulacro | Etapa 10. |
| OPS-006 | CI de calidad. | Actual | `.github/workflows/ci.yml` | N/A | Workflow existente | Añadir E2E autenticada y gates. |
| OPS-007 | E2E autenticada de negocio. | Pendiente | N/A | Playwright parcial | E2E pública/smoke | Etapa 9. |

## 12. Requisitos de marketing y verdad del producto

| ID | Promesa actual | Estado real | Acción |
|---|---|---|---|
| MKT-001 | Cotizaciones, pedidos, cobros y devoluciones en un flujo simple. | Cobros y algunas devoluciones existen; cotizaciones/pedidos completos no. | Cambiar a ventas, preventas y cobros; mencionar cotizaciones como evolución. |
| MKT-002 | Inventario con sucursales y variantes. | Stock y movimientos básicos; sucursales/variantes no completas. | Eliminar “sucursales y variantes” de capacidad actual. |
| MKT-003 | Clientes y CRM con oportunidades. | Clientes y crédito básico; CRM/oportunidades no. | Cambiar a clientes, historial progresivo y crédito básico. |
| MKT-004 | Compras, recepción y control de costos. | Recepción simple; costo promedio no completo. | No prometer costo avanzado todavía. |
| MKT-005 | Aperturas y cierres de caja. | Movimientos y cobro de tickets; turnos no completos. | Cambiar a control básico de caja y cobros. |
| MKT-006 | Reportes accionables. | Reportes básicos con límites. | Cambiar a métricas y reportes operativos iniciales. |
| MKT-007 | Automatiza tareas. | Automatización general no disponible. | Cambiar a “preparado para automatizar” o eliminar. |
| MKT-008 | Plan Growth con sucursales/reportes avanzados. | Capacidades aún en roadmap. | Etiquetar como “en evolución” o ajustar features. |
| MKT-009 | Plan Scale con automatizaciones/API/soporte prioritario. | API existe; automatizaciones y soporte no están plenamente operativos. | Ajustar promesa y definir soporte antes de comercializar. |

## 13. Regla de actualización

Cada nuevo requisito debe añadir una fila antes de implementarse. Cada cambio de API, UI o prueba debe actualizar esta matriz en el mismo commit funcional.

Una fila puede pasar de **Roadmap** a **Parcial** únicamente cuando exista código verificable. Puede pasar de **Parcial** a **Actual** cuando el proceso esté integrado, protegido, probado y documentado.

La matriz debe revisarse en cada release y formar parte del checklist de producción.
