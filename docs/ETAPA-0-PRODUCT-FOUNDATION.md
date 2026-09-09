# Etapa 0 — Fundamentos de producto y arquitectura de procesos

**Producto:** Tienda-SS / ConexiaX  
**Rama:** `SaaS-MultiTenant-Profesional`  
**Objetivo:** establecer el alcance real del ERP inicial antes de implementar nuevas capacidades.

## 1. Decisión de producto

ConexiaX se enfocará inicialmente en empresas pequeñas y medianas de Nicaragua que venden productos o servicios, manejan existencias, cobran en el momento o a crédito y necesitan coordinar varias personas.

El producto se construirá primero como un **ERP operativo para comercio y distribución ligera**. El segmento de servicios con inventario se atenderá mediante productos de tipo servicio y consumibles, pero no se prometerá todavía un sistema completo de proyectos, agenda, órdenes de trabajo o manufactura.

La plataforma debe resolver el trabajo diario antes de ampliar su alcance. La prioridad no será acumular módulos, sino conectar documentos y reducir la duplicación de datos.

## 2. ICP y segmentos iniciales

ICP significa **perfil de cliente ideal**. Describe el tipo de empresa que recibe mayor valor del producto durante la primera etapa comercial.

### 2.1 Segmento A — Retail y comercio minorista

| Aspecto | Definición |
|---|---|
| Tipo de empresa | Tiendas de barrio ampliadas, ferreterías, tiendas de ropa, farmacias no especializadas, minimarkets y comercios de mostrador. |
| Tamaño | Una a tres sucursales; tres a diez usuarios operativos; hasta cinco mil productos activos en la primera versión. |
| Comprador | Propietario, administrador o gerente. |
| Usuarios diarios | Vendedor, cajero, supervisor y bodega. |
| Problemas principales | Ventas sin control, inventario inexacto, diferencias de caja, crédito informal y poca visibilidad del negocio. |
| Valor esperado | Vender más rápido, saber cuánto efectivo debe existir y reponer productos antes de quedarse sin stock. |
| Capacidades iniciales | Catálogo, POS/preventa, clientes, crédito básico, movimientos de inventario, compras simples, gastos, reportes y usuarios. |
| Capacidades posteriores | Caja por turno, sucursales, reservas, devoluciones completas, reorden y automatizaciones. |
| Fuera de alcance inicial | Manufactura, nómina, contabilidad financiera completa, marketplace y rutas GPS. |

### 2.2 Segmento B — Distribución ligera

| Aspecto | Definición |
|---|---|
| Tipo de empresa | Distribuidores locales de alimentos, bebidas, limpieza, ferretería o productos de consumo. |
| Tamaño | Una a cinco sucursales o bodegas; cinco a quince usuarios; vendedores, bodega, compras y choferes. |
| Comprador | Propietario, gerente general o jefe de operaciones. |
| Usuarios diarios | Vendedor, compras, bodega, despachador, chofer, cobrador y supervisor. |
| Problemas principales | Pedidos dispersos, stock por bodega poco confiable, compras reactivas, entregas sin seguimiento y cartera vencida. |
| Valor esperado | Conectar pedido, preparación, salida, entrega, cobro e inventario. |
| Capacidades iniciales | Clientes, proveedores, preventa, inventario, compras simples, entregas básicas y crédito. |
| Capacidades posteriores | Multi-almacén, transferencias, picking, recepción parcial, cuentas por pagar, prueba de entrega y reorden. |
| Fuera de alcance inicial | Optimización avanzada de rutas, GPS en tiempo real, WMS completo, MRP y logística nacional. |

### 2.3 Segmento C — Servicios con inventario

| Aspecto | Definición |
|---|---|
| Tipo de empresa | Talleres, salones, centros de servicio, instaladores y negocios que consumen materiales o venden servicios junto con productos. |
| Tamaño | Una o dos ubicaciones; dos a diez usuarios. |
| Comprador | Propietario o administrador. |
| Usuarios diarios | Recepción, vendedor, técnico, cajero y bodega. |
| Problemas principales | Mezcla de servicio y producto, cobros sin historial, consumibles sin control y gastos no relacionados con ventas. |
| Valor esperado | Vender servicios y productos juntos, controlar consumibles y mantener historial básico del cliente. |
| Capacidades iniciales | Productos de tipo servicio, catálogo, clientes, ventas, pagos, gastos y reportes básicos. |
| Capacidades posteriores | Órdenes de trabajo, agenda, asignación de técnico, checklist de servicio y consumos por orden. |
| Fuera de alcance inicial | Gestión de proyectos complejos, contratos empresariales, mantenimiento predictivo y nómina. |

## 3. Segmento prioritario para la primera entrega ERP

El segmento prioritario será **retail y comercio minorista con una a tres sucursales**. Es el segmento con menor complejidad logística y mayor coincidencia con las capacidades actuales de catálogo, ventas, preventa, clientes, inventario, crédito y reportes.

El segundo segmento será **distribución ligera**, una vez que existan almacenes, transferencias, compras formales, entregas y cuentas por pagar.

El segmento de servicios con inventario se habilitará sobre el mismo núcleo de productos, clientes, ventas y caja. No se anunciará como un sistema de gestión de servicios completo hasta implementar órdenes de trabajo y agenda.

## 4. Jornadas principales por segmento

### 4.1 Journey retail — abrir, vender, cobrar y cerrar el día

| Paso | Actor | Acción | Documento o evento | Resultado |
|---:|---|---|---|---|
| 1 | Owner | Configura empresa, sucursal, caja, catálogo y usuarios. | Tenant, branch, register, product, member. | La empresa puede operar. |
| 2 | Supervisor | Revisa stock bajo y pendientes. | Inventory alert, task. | Prioriza reposición. |
| 3 | Vendedor | Selecciona productos y cliente. | Pre-sale o sale draft. | Se prepara la venta sin repetir datos. |
| 4 | Cajero | Busca ticket, valida método y cobra. | Payment, cash session. | La venta queda cobrada. |
| 5 | Sistema | Actualiza stock, caja, venta y crédito. | Inventory movement, sale, credit movement. | Los módulos permanecen consistentes. |
| 6 | Cajero | Registra retiros y gastos autorizados. | Cash movement, expense. | El efectivo esperado queda explicado. |
| 7 | Cajero | Cuenta dinero y cierra turno. | Cash count, cash session close. | Se conoce sobrante o faltante. |
| 8 | Owner | Revisa ventas, flujo, cartera y alertas. | Daily summary, report. | Toma decisiones con datos conciliados. |

### 4.2 Journey distribución — pedido, preparación, entrega y cobro

| Paso | Actor | Acción | Documento o evento | Resultado |
|---:|---|---|---|---|
| 1 | Vendedor | Crea pedido o preventa con cliente y dirección. | Order o pre-sale. | El compromiso comercial queda registrado. |
| 2 | Supervisor | Confirma disponibilidad y condiciones. | Allocation, approval. | Se evita vender stock inexistente. |
| 3 | Despachador | Prepara productos desde el almacén. | Picking, inventory reservation. | El pedido queda listo. |
| 4 | Chofer | Recibe ruta o entrega asignada. | Delivery. | La responsabilidad queda asignada. |
| 5 | Chofer | Registra entrega, incidencia o reprogramación. | Delivery status, proof of delivery. | La entrega tiene resultado. |
| 6 | Cajero o cobrador | Registra pago o crédito. | Payment, receivable. | La cartera se actualiza. |
| 7 | Compras | Revisa mínimos y demanda. | Purchase request. | Se genera reposición con criterio. |
| 8 | Owner | Revisa margen, cartera y cumplimiento. | Reports, tasks. | Puede actuar sobre excepciones. |

### 4.3 Journey servicios con inventario — cotizar, prestar y cobrar

| Paso | Actor | Acción | Documento o evento | Resultado |
|---:|---|---|---|---|
| 1 | Recepción | Registra cliente y necesidad. | Customer, service request. | Se identifica el trabajo. |
| 2 | Vendedor o técnico | Selecciona servicio y consumibles. | Quote o work order futura. | Se define alcance y precio. |
| 3 | Responsable | Ejecuta el servicio y registra consumos. | Service execution, inventory movement futuro. | El costo queda relacionado. |
| 4 | Cajero | Cobra el servicio y productos. | Sale, payment. | El cliente recibe comprobante. |
| 5 | Sistema | Actualiza cliente, stock, caja y reporte. | Related documents. | Se conserva historial. |
| 6 | Owner | Revisa servicios vendidos y margen disponible. | Report. | Puede decidir sobre precios y consumos. |

## 5. Catálogo común de documentos y estados

Los estados son controlados por el servidor. La interfaz no puede cambiar un documento directamente de un estado a otro si la transición no está autorizada.

### 5.1 Venta y preventa

| Documento | Estados iniciales | Estados operativos | Estados finales |
|---|---|---|---|
| Cotización | `draft` | `sent`, `accepted`, `rejected`, `expired` | `converted`, `cancelled` |
| Pedido | `draft` | `confirmed`, `reserved`, `preparing`, `ready`, `delivering` | `delivered`, `cancelled` |
| Preventa | `draft` | `sent_to_cashier` | `paid`, `expired`, `cancelled` |
| Venta | `draft` | `completed`, `partial_return` | `paid`, `partial`, `void`, `returned` |
| Pago de venta | `pending` | `authorized`, `received` | `settled`, `reversed`, `failed` |
| Devolución | `requested` | `approved`, `processed` | `completed`, `rejected`, `cancelled` |
| Anulación | `requested` | `approved`, `processed` | `completed`, `rejected` |

### 5.2 Compras y proveedores

| Documento | Estados iniciales | Estados operativos | Estados finales |
|---|---|---|---|
| Solicitud de compra | `draft` | `submitted`, `under_review`, `approved`, `rejected` | `converted`, `cancelled` |
| Orden de compra | `draft` | `sent`, `partially_received`, `received` | `closed`, `cancelled` |
| Recepción | `draft` | `in_progress`, `received_with_difference` | `received`, `cancelled` |
| Factura de proveedor | `draft` | `received`, `approved`, `partially_paid` | `paid`, `void`, `disputed` |
| Pago a proveedor | `pending` | `approved`, `processed` | `settled`, `reversed`, `failed` |
| Devolución a proveedor | `requested` | `approved`, `in_transit` | `received_by_supplier`, `credited`, `cancelled` |

### 5.3 Inventario y movimientos

| Documento | Estados iniciales | Estados operativos | Estados finales |
|---|---|---|---|
| Reserva | `requested` | `reserved`, `partially_reserved` | `released`, `consumed`, `expired`, `cancelled` |
| Transferencia | `draft` | `approved`, `in_transit`, `received_with_difference` | `received`, `cancelled` |
| Conteo | `draft` | `counting`, `under_review` | `approved`, `rejected`, `cancelled` |
| Ajuste | `requested` | `under_review`, `approved` | `posted`, `rejected`, `reversed` |
| Movimiento | `pending` | `posted` | `reversed` |

### 5.4 Caja, crédito y entregas

| Documento | Estados iniciales | Estados operativos | Estados finales |
|---|---|---|---|
| Sesión de caja | `closed` | `open`, `counting`, `pending_review` | `closed`, `reopened_by_authorization` |
| Movimiento de caja | `draft` | `approved`, `posted` | `reversed` |
| Cuenta por cobrar | `open` | `partial`, `overdue`, `disputed` | `paid`, `written_off`, `cancelled` |
| Promesa de pago | `planned` | `reminded`, `partially_fulfilled` | `fulfilled`, `broken`, `cancelled` |
| Entrega | `pending` | `assigned`, `preparing`, `in_transit`, `failed` | `delivered`, `rescheduled`, `cancelled` |

## 6. Actores, acciones y alcance de datos

El rol define la responsabilidad general. El alcance define qué datos puede consultar o modificar. Ambos deben validarse en el servidor.

| Actor | Acciones principales | Alcance inicial | Acciones restringidas |
|---|---|---|---|
| Owner | Configuración, personas, operaciones, reportes y billing. | Todas las sucursales del tenant. | No debe eliminar documentos financieros físicamente. |
| Admin | Administración y operación integral. | Todas las sucursales autorizadas. | No debe cambiar ownership sin flujo especial. |
| Gerente | Decisiones, aprobaciones, reportes y operación. | Todas o sucursales asignadas. | Acciones de plataforma y ownership. |
| Supervisor | Supervisión de una sucursal, caja, stock y equipo operativo. | Sucursales asignadas. | No puede administrar otro tenant ni roles globales. |
| Vendedor | Cotizar, vender, atender clientes y consultar productos. | Propia sucursal y documentos propios o asignados. | Costos, anulaciones y descuentos sobre umbral. |
| Cajero | Abrir caja, cobrar, registrar movimientos y cerrar. | Caja y sucursal asignadas. | Modificar catálogo o aprobar sus propias diferencias. |
| Bodega | Recibir, contar, mover y ajustar stock autorizado. | Almacenes asignados. | Precio de venta, caja y crédito. |
| Compras | Solicitar, ordenar, recibir y evaluar proveedores. | Sucursales y almacenes asignados. | Cobrar ventas y modificar permisos. |
| Chofer | Consultar y actualizar entregas asignadas. | Entregas propias. | Ver finanzas, costos o cartera completa. |
| Despachador | Preparar pedidos y transferencias. | Almacenes asignados. | Aprobar devoluciones o gastos. |
| Solo lectura | Consultar y exportar según autorización. | Alcance definido por tenant/sucursal. | Cualquier escritura. |

### 6.1 Acciones que requieren aprobación

- Descuento superior al límite del rol.
- Anulación de venta cobrada.
- Devolución fuera del plazo configurado.
- Nota de crédito sobre el umbral definido.
- Ajuste de inventario que supera tolerancia.
- Compra por encima del monto de aprobación.
- Gasto extraordinario.
- Reapertura de una caja cerrada.
- Reactivación de una cuenta por cobrar castigada.

## 7. Contrato financiero común

### 7.1 Moneda

La moneda operativa inicial del tenant es **NIO**, representada internamente como `NIO`. El tenant puede conservar precios de referencia en USD, pero una operación no puede mezclar monedas sin una tasa explícita y persistida.

La moneda debe almacenarse en cada documento monetario. No se debe inferir únicamente desde la interfaz o desde la configuración actual del tenant.

### 7.2 Representación y redondeo

- Los importes se reciben como números finitos y no negativos cuando la operación es positiva.
- El backend redondea a dos decimales al persistir importes monetarios.
- Los cálculos de líneas, descuentos, impuestos y totales se realizan en backend.
- El total persistido debe ser igual a la suma de líneas, menos descuentos, más impuestos y otros cargos explícitos.
- Los porcentajes de impuesto se almacenan como decimal entre `0` y `1`.
- Las cantidades de productos físicos son enteros en la primera versión.
- Los servicios pueden admitir cantidades decimales únicamente cuando el módulo lo autorice explícitamente.
- No se deben comparar importes mediante igualdad de punto flotante sin normalización.

### 7.3 Impuestos

La configuración fiscal del tenant debe conservar tasa, base imponible, monto exento, impuesto calculado, tipo de documento, número fiscal, cliente y referencia de devolución o nota.

La tasa por defecto para Nicaragua es 15%, pero puede haber productos o clientes exentos. La exención no debe representarse como un impuesto negativo. Debe persistir como un componente fiscal separado.

La emisión electrónica queda fuera del cierre actual de la Etapa 0. El producto debe mostrar la fiscalidad actual como **adaptador preliminar pendiente de validación local**, no como emisión fiscal oficial.

### 7.4 Fechas y zonas horarias

- Los timestamps de auditoría se almacenan en UTC.
- Cada tenant debe tener una zona horaria configurada para sus periodos operativos.
- Los reportes diarios se agrupan usando la zona horaria del tenant, no la del navegador.
- La fecha de negocio se separa del timestamp técnico.
- Los vencimientos de crédito y cuentas por pagar deben conservar fecha y zona horaria de negocio.

### 7.5 Pagos y saldos

- Un pago registrado debe tener documento origen, monto, moneda, método, actor y fecha.
- El saldo no debe modificarse manualmente sin un movimiento relacionado.
- Un pago parcial debe conservar el saldo anterior, monto aplicado y saldo posterior.
- Un reverso genera un movimiento compensatorio; no se borra el pago original.
- Los métodos iniciales son efectivo, tarjeta, transferencia y crédito.
- Los pagos mixtos deben guardar el desglose por método y la suma debe coincidir con el total aplicado.

## 8. Glosario financiero y nombres de reportes

| Concepto | Definición | Nombre recomendado en UI |
|---|---|---|
| Venta | Documento comercial que registra productos/servicios vendidos. | Ventas |
| Cobro | Pago recibido de una venta o cuenta por cobrar. | Cobros recibidos |
| Ingreso de caja | Entrada física o registrada de dinero. | Entradas de caja |
| Gasto | Salida operativa registrada por la empresa. | Gastos |
| Flujo neto | Cobros e ingresos menos gastos y salidas del periodo. | Flujo neto operativo |
| Costo de mercancía | Costo atribuido a los productos vendidos. | Costo de ventas |
| Margen bruto | Ventas netas menos costo de ventas. | Margen bruto |
| Resultado operativo | Margen bruto menos gastos operativos. | Resultado operativo |
| Cuenta por cobrar | Saldo que un cliente debe pagar. | Por cobrar |
| Cuenta por pagar | Saldo que la empresa debe pagar a un proveedor. | Por pagar |
| Venta a crédito | Venta cuyo pago queda pendiente. | Ventas a crédito |
| Saldo vencido | Cuenta cuyo vencimiento ya pasó. | Cartera vencida |
| Movimiento de inventario | Entrada, salida, reserva, transferencia o ajuste. | Movimientos de inventario |
| Diferencia de caja | Contado real menos efectivo esperado. | Diferencia de caja |

### 8.1 Correcciones de nomenclatura

Mientras no exista costo de mercancía completo, el dashboard no debe llamar **“utilidad neta”** al cálculo de ingresos menos gastos. Debe llamarlo **“flujo neto operativo”**.

Mientras no exista cierre de caja por turno, el módulo no debe presentarse como conciliación completa. Debe describirse como **movimientos y control básico de caja**.

Mientras no exista emisión electrónica validada, los documentos deben mostrar **comprobante preliminar** o el estado fiscal correspondiente, no “factura electrónica emitida”.

## 9. Capacidades disponibles y futuras

| Capacidad | Estado al cierre de Etapa 0 | Comunicación correcta |
|---|---|---|
| Multi-tenant | Disponible como aislamiento por empresa. | “Datos aislados por empresa.” |
| Roles y permisos | Disponible con matriz configurable. | “Permisos por rol y empresa.” |
| Catálogo | Disponible en alcance básico. | “Productos, servicios, SKU y precios básicos.” |
| Inventario | Disponible como movimientos y stock básico. | “Control básico de existencias y movimientos.” |
| Sucursales | En diseño/roadmap. | “Preparado para crecer a sucursales.” |
| Variantes | No completa en operación actual. | No prometer como capacidad disponible. |
| Ventas/POS | Disponible en flujo básico y preventa. | “Ventas, preventa y cobro básico.” |
| Cotizaciones | Definidas para roadmap; no anunciar como completas. | “Cotizaciones en evolución.” |
| Devoluciones/anulaciones | API parcial; experiencia aún por completar. | “Reversos auditados en proceso de consolidación.” |
| Compras | Recepción simple disponible. | “Recepción de compras y actualización de stock.” |
| Cuentas por pagar | No completa. | No anunciar como módulo terminado. |
| Caja | Movimientos y cobro de tickets disponibles. | “Control básico de caja y cobros.” |
| Cierres de caja | En roadmap. | No prometer como disponible. |
| Crédito | Crédito básico, abonos y notas disponible. | “Crédito y cuentas por cobrar básicas.” |
| Entregas | Seguimiento simple. | “Entregas básicas por estado.” |
| Automatización | Limitada a eventos y notificaciones existentes. | No prometer automatización general. |
| API e integraciones | API versionada, CSV y webhooks en alcance técnico. | “API e integraciones para capacidades disponibles.” |
| Fiscalidad | Cálculo preliminar NIO/IVA y numeración. | “Preparación fiscal; emisión electrónica pendiente de validación.” |

## 10. Criterios de salida de la Etapa 0

La Etapa 0 queda cerrada cuando:

- Los tres ICP están documentados.
- El segmento prioritario está elegido.
- Existe un journey completo para cada segmento.
- Los documentos y estados tienen transiciones definidas.
- Los roles tienen acciones y alcance de datos documentados.
- El contrato financiero define moneda, redondeo, impuestos, pagos y fechas.
- Los reportes distinguen flujo, margen y resultado.
- La landing no presenta capacidades futuras como capacidades actuales.
- La matriz de trazabilidad enlaza requisitos con API, UI y pruebas.
- Las decisiones quedan versionadas en la rama `SaaS-MultiTenant-Profesional`.
