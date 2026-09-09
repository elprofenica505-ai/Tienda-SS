# Roadmap maestro para Tienda-SS / ConexiaX

**Objetivo:** convertir el proyecto actual en un SaaS multi-tenant de alto nivel, orientado a ERP para micro y medianas empresas, con procesos completos, automatización, control financiero, operación por roles y evidencia real de producción.

**Rama de trabajo obligatoria:** `SaaS-MultiTenant-Profesional`  
**Política de ramas:** no crear ramas nuevas. Todas las implementaciones, correcciones y commits deben realizarse directamente sobre la rama actual.

## 1. Propósito del roadmap

El producto no debe crecer como una colección de pantallas aisladas. Debe evolucionar como un sistema operativo empresarial que conecte ventas, inventario, compras, caja, crédito, entregas, reportes y tareas.

El criterio principal de cada etapa será que una empresa pueda completar un proceso real con menos errores y menos trabajo manual. Una etapa no se considerará terminada porque exista una página o un endpoint. Se considerará terminada cuando el proceso esté conectado de extremo a extremo, protegido por permisos, auditado, probado y usable por el rol correspondiente.

> **Definición de ERP operativo:** el sistema debe permitir que una empresa abra su operación, venda, reciba mercancía, controle existencias, cobre, pague, entregue, cierre caja y tome decisiones sin depender de hojas externas para completar el proceso principal.

## 2. Resultado objetivo

Al completar este roadmap, una empresa pequeña o mediana podrá:

1. Configurar empresas, sucursales, almacenes, cajas, usuarios y permisos.
2. Administrar productos, variantes, precios, impuestos, proveedores y clientes.
3. Vender mediante POS, preventa, cotización y pedido.
4. Cobrar en efectivo, tarjeta, transferencia, crédito y pagos mixtos.
5. Abrir, operar, cuadrar y cerrar cajas por usuario y sucursal.
6. Controlar inventario por sucursal y almacén con costo confiable.
7. Comprar mediante solicitudes, órdenes, aprobaciones y recepciones.
8. Administrar cuentas por cobrar y cuentas por pagar.
9. Organizar entregas, incidencias y prueba de entrega.
10. Automatizar alertas, tareas, reorden, cobranza y cierres.
11. Obtener reportes que concilien con los documentos fuente.
12. Operar con seguridad multi-tenant, fiscalidad local, backups y monitoreo.

## 3. Principios de ejecución

### 3.1 Una sola rama

Antes de iniciar cada tarea se debe confirmar que la rama actual es `SaaS-MultiTenant-Profesional`. No se deben crear ramas feature, hotfix, develop ni temporales.

```bash
git branch --show-current
git status --short --branch
```

Cada bloque funcional debe terminar con cambios revisados, pruebas ejecutadas y un commit descriptivo directamente en la rama actual.

### 3.2 Primero procesos, después pantallas

Cada implementación debe comenzar con el proceso, sus estados, reglas, documentos, actores, permisos, eventos y errores. La pantalla se construirá después de definir el comportamiento de negocio.

### 3.3 El backend es la autoridad

Los permisos, límites, tenant, sucursal, precios, impuestos, stock, saldos y estados siempre deben validarse en el servidor. La interfaz puede ocultar acciones, pero nunca debe ser la única barrera.

### 3.4 Un documento debe explicar su historia

Una venta, compra, devolución, pago o movimiento debe conservar actor, fecha, estado, origen, documentos relacionados y cambios relevantes. Las operaciones financieras o de inventario no deben eliminarse físicamente.

### 3.5 Cada etapa debe reducir trabajo manual

La aceptación debe medir pasos eliminados, datos reutilizados, alertas generadas y errores evitados. Una funcionalidad que solo agrega captura de datos no es suficiente si no mejora el proceso completo.

## 4. Orden general de etapas

| Etapa | Nombre | Prioridad | Resultado principal |
|---|---|---:|---|
| 0 | Producto, alcance y arquitectura de procesos | Bloqueante | Alcance real y modelo común de documentos. |
| 1 | Plataforma multi-tenant y organización empresarial | Bloqueante | Empresas, sucursales, almacenes, cajas y alcance de datos. |
| 2 | Caja profesional y control de efectivo | Bloqueante | Apertura, operación, arqueo y cierre confiables. |
| 3 | Ventas, POS, devoluciones y anulaciones | Bloqueante | Ciclo comercial completo. |
| 4 | Inventario, costos y conteos | Bloqueante | Existencias y costo confiables por ubicación. |
| 5 | Compras, proveedores y cuentas por pagar | Alta | Abastecimiento conectado con inventario y finanzas. |
| 6 | Crédito, cobranza y cuentas por cobrar | Alta | Cartera controlable y cobrable. |
| 7 | Dashboards y experiencia por rol | Alta | Cada persona ve y ejecuta su trabajo. |
| 8 | Automatización, tareas y alertas | Alta | Menos seguimiento manual y más operación por excepciones. |
| 9 | E2E, rendimiento y calidad de release | Bloqueante | Evidencia de que el negocio funciona completo. |
| 10 | Fiscalidad, backup, producción y operación SaaS | Bloqueante | Producto publicable, recuperable y operable. |

## 5. Etapa 0 — Producto, alcance y arquitectura de procesos

**Objetivo:** evitar seguir construyendo módulos superficiales y establecer una definición concreta del ERP inicial.

### Tareas

| ID | Tarea | Entregable |
|---|---|---|
| 0.1 | Definir los segmentos iniciales: retail, distribución y servicios con inventario. | Documento ICP y capacidades por segmento. |
| 0.2 | Elegir el flujo principal que debe resolver cada segmento. | Journey de negocio por segmento. |
| 0.3 | Crear matriz de documentos y estados. | Catálogo de ventas, compras, pagos, entregas, devoluciones y movimientos. |
| 0.4 | Definir actores y alcance de datos. | Matriz rol–acción–sucursal–documento. |
| 0.5 | Definir reglas de dinero, redondeo, moneda, impuestos y fechas. | Contrato financiero común. |
| 0.6 | Separar conceptos de flujo de caja, margen y resultado. | Glosario financiero y nombres correctos de reportes. |
| 0.7 | Revisar la landing y eliminar promesas no disponibles. | Marketing alineado con capacidad real. |
| 0.8 | Crear una matriz de trazabilidad entre requisito, API, UI y prueba. | `docs/TRACEABILITY-MATRIX.md`. |

### Criterios de aceptación

- Existe un flujo principal escrito para cada segmento objetivo.
- Cada documento tiene estados válidos y transiciones autorizadas.
- Cada acción sensible tiene rol, permiso, alcance y auditoría definidos.
- No se inicia una nueva épica sin criterios de aceptación y datos de prueba.
- La documentación distingue MVP, capacidad en desarrollo y capacidad futura.

### Definición de terminado

La etapa termina cuando el equipo puede explicar, sin ambigüedad, cómo una empresa vende, compra, recibe, cobra, entrega y cierra su día dentro del sistema.

## 6. Etapa 1 — Plataforma multi-tenant y organización empresarial

**Objetivo:** evolucionar de tenant aislado a organización empresarial con sucursales, almacenes, cajas y alcance de datos.

### Tareas

| ID | Tarea | Entregable |
|---|---|---|
| 1.1 | Crear entidad `branches` dentro del tenant. | API y UI de sucursales. |
| 1.2 | Crear entidad `warehouses` con sucursal, nombre, tipo y estado. | API y UI de almacenes. |
| 1.3 | Crear entidad `cashRegisters` con sucursal, caja y estado. | Configuración de cajas. |
| 1.4 | Asignar usuarios a una o varias sucursales. | Membresía con `branchIds` validada. |
| 1.5 | Definir sucursal activa y selección persistente. | `BranchProvider` y selector seguro. |
| 1.6 | Aplicar alcance de sucursal a ventas, inventario, compras, caja, reportes y entregas. | Middleware y guardas de alcance. |
| 1.7 | Añadir numeración por sucursal, caja y tipo documental. | Configuración fiscal y comercial. |
| 1.8 | Crear pruebas cross-tenant y cross-branch. | Suite de aislamiento. |
| 1.9 | Actualizar reglas Firestore y API policy. | Reglas revisadas. |
| 1.10 | Añadir migración compatible con tenants existentes. | Script de migración y rollback documental. |

### Reglas de negocio mínimas

- Un usuario solo puede consultar datos de sucursales autorizadas.
- Una venta debe registrar tenant, sucursal, caja y usuario.
- Un movimiento de inventario debe registrar almacén origen o destino.
- Una caja pertenece a una sucursal y no puede operar en dos sucursales simultáneamente.
- El owner puede administrar estructura global, pero las operaciones pueden limitarse por sucursal.

### Criterios de aceptación

- Dos sucursales del mismo tenant no mezclan stock, caja ni reportes restringidos.
- Un usuario de sucursal A no puede leer ni modificar documentos de sucursal B.
- El owner puede consolidar resultados de todas las sucursales.
- Los documentos antiguos continúan funcionando mediante una migración segura.

## 7. Etapa 2 — Caja profesional y control de efectivo

**Objetivo:** que una empresa pueda abrir, operar, cuadrar y cerrar una caja sin usar hojas externas.

### Tareas

| ID | Tarea | Entregable |
|---|---|---|
| 2.1 | Crear entidad `cashSessions`. | Turno de caja con estado y responsable. |
| 2.2 | Implementar apertura con fondo inicial. | Endpoint y pantalla de apertura. |
| 2.3 | Asociar ventas y pagos a turno y caja. | Trazabilidad completa. |
| 2.4 | Implementar entradas, retiros y gastos de caja. | Movimientos clasificados. |
| 2.5 | Implementar pagos mixtos. | Distribución por método de pago. |
| 2.6 | Implementar arqueo por efectivo, tarjeta y transferencia. | Formulario de conteo. |
| 2.7 | Calcular esperado, contado y diferencia. | Cierre determinístico. |
| 2.8 | Requerir aprobación para diferencias superiores a umbral. | Workflow de aprobación. |
| 2.9 | Bloquear una segunda apertura simultánea de la misma caja. | Regla transaccional. |
| 2.10 | Crear cierre diario y resumen al owner. | Reporte de cierre. |
| 2.11 | Imprimir o exportar comprobante de cierre. | Documento de caja. |
| 2.12 | Auditar apertura, movimientos, arqueo y cierre. | Eventos inmutables. |

### Criterios de aceptación

- Un cajero puede abrir turno con fondo inicial.
- Cada venta queda asociada a un turno.
- El sistema calcula cuánto dinero debería existir.
- El cajero registra el dinero contado por método.
- El sistema muestra sobrante o faltante y exige justificación.
- El turno cerrado no acepta nuevas operaciones.
- El supervisor puede revisar y aprobar diferencias.
- El cierre reconcilia ventas, pagos, retiros y gastos.

### Pruebas obligatorias

- Apertura duplicada.
- Venta con pago mixto.
- Cierre con diferencia.
- Cierre concurrente.
- Cajero intentando cerrar caja ajena.
- Caja de sucursal incorrecta.
- Reversión de una venta después del cierre.

## 8. Etapa 3 — Ventas, POS, devoluciones y anulaciones

**Objetivo:** cerrar el ciclo comercial desde cotización hasta cobro, devolución o anulación.

### Tareas

| ID | Tarea | Entregable |
|---|---|---|
| 3.1 | Revisar modelo de estados de venta. | Máquina de estados documentada. |
| 3.2 | Crear cotizaciones. | Cotización con vigencia y estado. |
| 3.3 | Convertir cotización en pedido o venta. | Conversión sin redigitación. |
| 3.4 | Mejorar preventa con reserva de stock y expiración. | Ticket controlado. |
| 3.5 | Implementar descuentos por rol y umbral. | Autorización de descuento. |
| 3.6 | Implementar pagos mixtos y saldo restante. | Pago distribuido. |
| 3.7 | Implementar devolución total y parcial desde la UI. | Devolución documentada. |
| 3.8 | Implementar anulación con motivo y autorización. | Anulación auditable. |
| 3.9 | Conectar devolución con stock, caja, crédito y reportes. | Reversión integral. |
| 3.10 | Crear detalle de venta con documentos relacionados. | Vista de trazabilidad. |
| 3.11 | Crear comprobante imprimible y descargable. | Ticket/factura consistente. |
| 3.12 | Añadir búsqueda global por número, cliente, fecha y estado. | Recuperación operativa. |

### Criterios de aceptación

- Una cotización puede convertirse en venta sin copiar líneas manualmente.
- Una venta no puede cobrarse dos veces.
- Una devolución parcial devuelve solamente las unidades y montos autorizados.
- Una anulación no elimina la venta; genera reversos y auditoría.
- El stock, caja, crédito y reportes reflejan la operación posterior.
- Los descuentos superiores al límite requieren aprobación.

## 9. Etapa 4 — Inventario, costos y conteos

**Objetivo:** que el inventario represente existencias y costos confiables por ubicación.

### Tareas

| ID | Tarea | Entregable |
|---|---|---|
| 4.1 | Migrar stock de producto global a stock por almacén. | Modelo de existencias por ubicación. |
| 4.2 | Crear movimientos de transferencia entre almacenes. | Transferencias auditadas. |
| 4.3 | Implementar reservas para preventas y pedidos. | Stock disponible y reservado. |
| 4.4 | Implementar costo promedio ponderado. | Costo actualizado por recepción. |
| 4.5 | Guardar historial de costo. | Kardex valorizado. |
| 4.6 | Implementar conteo físico y conteo cíclico. | Sesión de conteo. |
| 4.7 | Requerir aprobación de diferencias de conteo. | Ajuste controlado. |
| 4.8 | Implementar mercancía dañada, vencida y en cuarentena. | Estados de stock. |
| 4.9 | Implementar mínimos, máximos y punto de reorden. | Parámetros de reposición. |
| 4.10 | Incorporar unidades de medida y conversiones. | Inventario por unidad. |
| 4.11 | Añadir códigos de barras y lector. | Operación rápida de bodega. |
| 4.12 | Crear reporte de rotación, valorización y stock negativo bloqueado. | Reportes de inventario. |

### Criterios de aceptación

- El stock de una sucursal no se confunde con el de otra.
- Cada entrada, salida, transferencia o ajuste tiene origen y destino.
- El costo promedio se actualiza al recibir compras.
- Los reportes de margen usan el costo correcto.
- Un conteo físico no modifica existencias sin aprobación.
- Las reservas no permiten vender dos veces la misma existencia.

## 10. Etapa 5 — Compras, proveedores y cuentas por pagar

**Objetivo:** convertir la recepción simple actual en un ciclo de abastecimiento controlado.

### Tareas

| ID | Tarea | Entregable |
|---|---|---|
| 5.1 | Ampliar ficha de proveedor. | Condiciones, contacto, crédito y datos fiscales. |
| 5.2 | Crear solicitudes internas de compra. | Solicitud por usuario o sucursal. |
| 5.3 | Crear órdenes de compra. | Orden con estados y aprobación. |
| 5.4 | Implementar aprobación por monto. | Política configurable. |
| 5.5 | Implementar recepción parcial. | Recepción contra orden. |
| 5.6 | Registrar diferencias de cantidad y costo. | Incidencia de recepción. |
| 5.7 | Implementar devolución a proveedor. | Reversión de stock y deuda. |
| 5.8 | Crear factura de proveedor. | Documento de cuenta por pagar. |
| 5.9 | Crear vencimientos y pagos a proveedor. | Cartera de proveedores. |
| 5.10 | Conectar recepción con costo promedio. | Integridad de inventario. |
| 5.11 | Crear historial de precios y desempeño. | Evaluación de proveedor. |
| 5.12 | Crear reporte de compras comprometidas y pendientes. | Control de abastecimiento. |

### Criterios de aceptación

- Una compra puede solicitarse, aprobarse, ordenarse, recibirse y pagarse.
- La recepción parcial deja saldo pendiente.
- Una diferencia no altera silenciosamente la orden original.
- El pago de proveedor actualiza la cuenta por pagar.
- El costo de inventario proviene de recepciones reales.
- Una compra cancelada no deja stock ni deuda incorrecta.

## 11. Etapa 6 — Crédito, cobranza y cuentas por cobrar

**Objetivo:** que el negocio pueda vender a crédito y recuperar el dinero con control.

### Tareas

| ID | Tarea | Entregable |
|---|---|---|
| 6.1 | Crear estados de cuenta por cliente. | Documento y exportación. |
| 6.2 | Implementar aging por rangos. | 0–30, 31–60, 61–90 y más de 90 días. |
| 6.3 | Registrar promesas de pago. | Compromiso con fecha y responsable. |
| 6.4 | Crear actividades de cobranza. | Historial de llamadas y gestiones. |
| 6.5 | Enviar recordatorios configurables. | Automatización de cobranza. |
| 6.6 | Aplicar pagos a documentos específicos. | Distribución de abonos. |
| 6.7 | Bloquear o limitar crédito vencido. | Política de riesgo. |
| 6.8 | Mejorar notas de crédito y devoluciones. | Saldo explicable. |
| 6.9 | Crear límite por cliente y por sucursal. | Control comercial. |
| 6.10 | Reportar cartera, vencimiento y recuperación. | Dashboard de cobranza. |

### Criterios de aceptación

- El saldo de un cliente se explica por ventas, pagos, devoluciones y notas.
- Los pagos se aplican sin duplicidad.
- El sistema identifica cartera vencida por rango.
- Un cliente puede tener promesa de pago y seguimiento.
- Las reglas de crédito se aplican al vender.
- El owner puede ver recuperación por vendedor y periodo.

## 12. Etapa 7 — Dashboards y navegación específicos por rol

**Objetivo:** hacer que cada usuario vea primero el trabajo que realmente debe ejecutar.

### Tareas

| ID | Tarea | Entregable |
|---|---|---|
| 7.1 | Filtrar sidebar por permisos reales. | Navegación contextual. |
| 7.2 | Crear inicio de owner. | Excepciones, rentabilidad, caja y cartera. |
| 7.3 | Crear inicio de gerente. | Comparación de sucursales, metas y aprobaciones. |
| 7.4 | Crear inicio de supervisor. | Operación de su sucursal y pendientes. |
| 7.5 | Crear inicio de vendedor. | Preventas, clientes, cotizaciones y metas. |
| 7.6 | Crear inicio de cajero. | Turno, tickets pendientes, cobros y cierre. |
| 7.7 | Crear inicio de bodega. | Recepciones, reposición, transferencias y conteos. |
| 7.8 | Crear inicio de compras. | Solicitudes, órdenes y vencimientos. |
| 7.9 | Crear inicio de chofer/despachador. | Entregas, preparación e incidencias. |
| 7.10 | Crear centro de documentos y búsqueda global. | Recuperación rápida de información. |
| 7.11 | Añadir filtros persistentes por sucursal, fecha y estado. | Contexto de trabajo estable. |
| 7.12 | Revisar accesibilidad, móvil y estados vacíos. | Experiencia usable. |

### Criterios de aceptación

- Un usuario no ve módulos que no puede usar.
- El primer panel muestra pendientes accionables, no solo métricas.
- Cada rol puede completar sus tareas principales sin navegar por módulos irrelevantes.
- El sistema muestra explicación y alternativa cuando una acción está restringida.

## 13. Etapa 8 — Automatización, tareas y alertas

**Objetivo:** reducir seguimiento manual y hacer que el sistema trabaje por excepciones.

### Tareas

| ID | Tarea | Entregable |
|---|---|---|
| 8.1 | Crear colección de eventos de negocio. | Eventos idempotentes. |
| 8.2 | Crear colección de tareas. | Responsable, fecha, prioridad y estado. |
| 8.3 | Crear reglas de alertas por tenant. | Configuración empresarial. |
| 8.4 | Automatizar alerta de stock bajo. | Tarea o sugerencia de compra. |
| 8.5 | Automatizar alerta de caja sin cerrar. | Recordatorio y escalamiento. |
| 8.6 | Automatizar cobranza vencida. | Tareas y notificaciones. |
| 8.7 | Automatizar entregas fallidas o atrasadas. | Reprogramación. |
| 8.8 | Crear aprobaciones para descuentos, gastos, compras y devoluciones. | Bandeja de aprobaciones. |
| 8.9 | Automatizar resumen diario. | Notificación ejecutiva. |
| 8.10 | Crear reintentos y dead-letter para procesos. | Recuperación operativa. |
| 8.11 | Añadir scheduler seguro. | Trabajos periódicos controlados. |
| 8.12 | Medir tareas creadas, resueltas y vencidas. | Métricas de automatización. |

### Criterios de aceptación

- Un evento no crea tareas duplicadas.
- Cada tarea tiene responsable, prioridad y fecha.
- Las alertas son configurables y respetan tenant y sucursal.
- Un proceso fallido puede reintentarse sin duplicar dinero, stock o notificaciones.
- El owner puede ver excepciones abiertas y tiempo de resolución.

## 14. Etapa 9 — E2E autenticada, rendimiento y calidad

**Objetivo:** demostrar que el producto funciona como negocio completo, no solo como páginas individuales.

### Tareas

| ID | Tarea | Entregable |
|---|---|---|
| 9.1 | Crear entorno Firebase Emulator o staging aislado. | Datos reproducibles. |
| 9.2 | Crear usuarios de prueba por rol. | Fixtures autenticadas. |
| 9.3 | Crear tenant con dos sucursales. | Fixture multi-tenant y multi-sucursal. |
| 9.4 | Automatizar registro, verificación y onboarding. | E2E de alta. |
| 9.5 | Automatizar venta vendedor–cajero. | E2E comercial. |
| 9.6 | Automatizar caja completa. | E2E de apertura a cierre. |
| 9.7 | Automatizar compra y recepción. | E2E de abastecimiento. |
| 9.8 | Automatizar conteo y transferencia. | E2E de inventario. |
| 9.9 | Automatizar crédito, abono y cobranza. | E2E de cartera. |
| 9.10 | Automatizar invitación y permisos. | E2E administrativa. |
| 9.11 | Automatizar devolución y anulación. | E2E de reversos. |
| 9.12 | Ejecutar pruebas de carga de rutas críticas. | Informe de rendimiento. |
| 9.13 | Verificar aislamiento cross-tenant y cross-branch. | Evidencia de seguridad. |
| 9.14 | Añadir pruebas de regresión de reportes. | Conciliación automatizada. |

### Criterios de aceptación

- Los journeys críticos funcionan en CI con datos controlados.
- Las pruebas fallan si se mezclan tenants o sucursales.
- Las pruebas validan respuestas, base de datos, stock, caja, crédito y auditoría.
- La suite puede reiniciarse y producir el mismo resultado.
- El rendimiento de las rutas críticas tiene umbrales definidos.

## 15. Etapa 10 — Fiscalidad, respaldo, producción y operación SaaS

**Objetivo:** llevar el producto de MVP técnico a servicio operable y recuperable.

### Tareas

| ID | Tarea | Entregable |
|---|---|---|
| 10.1 | Validar requisitos fiscales de Nicaragua con asesoría local. | Matriz normativa aprobada. |
| 10.2 | Implementar adapter fiscal versionado. | Proveedor y contrato interno. |
| 10.3 | Implementar numeración, contingencia y anulaciones. | Flujo fiscal completo. |
| 10.4 | Proteger documentos fiscales y retención. | Política documental. |
| 10.5 | Centralizar moneda y formato en toda la aplicación. | Utilidad única de moneda. |
| 10.6 | Automatizar backup Firestore. | Programación y manifiesto. |
| 10.7 | Definir retención, cifrado y acceso a backups. | Política de continuidad. |
| 10.8 | Probar restauración completa y selectiva. | Evidencia de restore. |
| 10.9 | Definir RPO y RTO. | Objetivos operativos. |
| 10.10 | Completar health, readiness, métricas y alertas. | Observabilidad. |
| 10.11 | Crear runbook de incidentes y rollback. | Manual operativo. |
| 10.12 | Preparar staging y smoke test de release. | Checklist de publicación. |
| 10.13 | Validar billing, grace period y suspensión. | Ciclo SaaS completo. |
| 10.14 | Crear exportación y portabilidad de datos del tenant. | Salida segura de datos. |
| 10.15 | Definir soporte, SLA y proceso de incidentes. | Operación comercial. |

### Criterios de aceptación

- Un documento fiscal puede emitirse, anularse y conservarse según la normativa aplicable.
- Un backup reciente puede restaurarse en un entorno controlado.
- Se conoce el tiempo máximo aceptable de pérdida de datos y recuperación.
- Los errores críticos generan alertas accionables.
- Existe rollback documentado y probado.
- Un tenant puede exportar sus datos sin exponer información de otros tenants.
- Billing puede recibir eventos duplicados, fuera de orden o fallidos sin corromper el tenant.

## 16. Dependencias entre etapas

| Dependencia | Razón |
|---|---|
| Etapa 0 antes de todas | Evita construir capacidades incompatibles y define estados comunes. |
| Etapa 1 antes de caja e inventario | Caja y existencias necesitan sucursal, almacén y alcance. |
| Etapa 2 antes del cierre de ventas | Las ventas deben quedar asociadas a una sesión de caja. |
| Etapa 3 antes de crédito y reportes finales | Crédito y reportes dependen de estados correctos de ventas y reversos. |
| Etapa 4 antes de compras completas | Compras debe actualizar existencia y costo por ubicación. |
| Etapa 5 antes de automatizar reorden | El sistema necesita costo, mínimos y flujo de abastecimiento. |
| Etapas 2–6 antes de dashboards ejecutivos | Un dashboard es confiable solo si los procesos fuente concilian. |
| Etapas 1–8 antes de E2E final | Las pruebas deben cubrir el producto objetivo, no una versión incompleta. |
| Etapas 0–9 antes de producción fiscal | Fiscalidad y release requieren procesos y evidencia verificables. |

## 17. Orden recomendado de implementación inmediata

El siguiente bloque de trabajo debe ejecutarse en este orden:

1. Definir modelo de sucursal, almacén, caja y alcance.
2. Implementar caja por turno.
3. Asociar ventas y pagos a caja.
4. Completar devoluciones y anulaciones desde la UI.
5. Migrar inventario a existencias por almacén.
6. Implementar costo promedio y conteos.
7. Crear órdenes de compra y recepción parcial.
8. Crear cuentas por pagar.
9. Crear aging y estados de cuenta.
10. Filtrar dashboard y sidebar por rol.
11. Crear tareas y alertas de excepciones.
12. Montar E2E autenticada con dos sucursales.
13. Probar backup y restore.
14. Cerrar fiscalidad y checklist de producción.

## 18. Definición global de terminado

El proyecto podrá considerarse un ERP SaaS multi-tenant de alto nivel cuando se cumplan simultáneamente estas condiciones:

- Una empresa puede operar un día completo sin hojas externas para su proceso principal.
- La caja abre, registra, concilia y cierra con diferencias explicables.
- Las ventas, devoluciones y anulaciones afectan correctamente inventario, caja, crédito y reportes.
- El inventario se controla por sucursal y almacén con costo confiable.
- Las compras conectan solicitud, aprobación, recepción, costo y cuenta por pagar.
- El crédito muestra saldos, vencimientos, pagos y gestiones de cobranza.
- Cada rol ve una experiencia orientada a su trabajo.
- Las alertas y tareas reducen seguimiento manual.
- Los reportes concilian con documentos fuente.
- Los tests E2E autenticados cubren journeys completos.
- La separación entre tenants y sucursales está probada.
- Existe backup, restore, monitoreo, rollback y soporte operativo.
- La fiscalidad está validada para el mercado objetivo.
- La documentación y la landing reflejan capacidades reales.

## 19. Regla de trabajo para cada implementación

Cada tarea futura debe seguir este ciclo:

1. Confirmar rama actual.
2. Revisar el modelo y código existente.
3. Definir contrato de datos y reglas de negocio.
4. Implementar backend y validaciones.
5. Implementar experiencia del rol correspondiente.
6. Añadir auditoría y permisos.
7. Añadir prueba unitaria o de integración.
8. Añadir o actualizar prueba E2E si el flujo es visible.
9. Ejecutar typecheck, lint, tests y build.
10. Revisar `git diff --check`.
11. Committear directamente en `SaaS-MultiTenant-Profesional`.
12. Publicar la rama actual y documentar el resultado.

No se debe marcar una tarea como completa si únicamente existe el endpoint, la página o una prueba aislada. La tarea se completa cuando el proceso funciona de extremo a extremo y sus datos quedan correctamente relacionados.

## 20. Próximo bloque de trabajo

La siguiente implementación recomendada es la **Etapa 1, tareas 1.1 a 1.6**, seguida inmediatamente por la **Etapa 2 de caja profesional**. Sin sucursales, almacenes y cajas reales, los módulos de inventario, ventas, reportes y permisos no pueden alcanzar madurez ERP.

La primera meta verificable debe ser:

> **Dos sucursales, dos cajas, dos usuarios operativos y un owner pueden vender, cobrar, consultar stock y cerrar cada caja sin mezclar datos ni utilizar hojas externas.**

Ese será el primer punto donde el proyecto dejará de ser solamente una plataforma de demostración y comenzará a funcionar como sistema operativo empresarial.

## Referencias

[1]: https://firebase.google.com/docs/firestore/security/rules-conditions "Firestore Security Rules conditions"

[2]: https://firebase.google.com/docs/firestore/manage-data/transactions "Firestore transactions and batched writes"

[3]: https://stripe.com/docs/webhooks "Stripe webhooks documentation"

[4]: https://playwright.dev/docs/test-intro "Playwright Test documentation"

[5]: https://docs.github.com/en/actions "GitHub Actions documentation"
