# Análisis profundo de Tienda-SS / ConexiaX

**Repositorio:** `elprofenica505-ai/Tienda-SS`  
**Rama auditada:** `SaaS-MultiTenant-Profesional`  
**Commit auditado:** `17918e2`  
**Fecha:** 9 de septiembre de 2026  
**Autor:** Manus AI

## 1. Conclusión ejecutiva

Tu intuición es correcta en lo esencial: el producto tiene una estructura técnica más sólida que una simple demo visual, pero todavía no tiene la profundidad operativa necesaria para comportarse como un ERP confiable para micro y medianas empresas.

La aplicación ya posee autenticación, aislamiento por tenant, roles, permisos, catálogo, inventario, ventas, preventas, caja de tickets, clientes, proveedores, crédito, compras, entregas, gastos, reportes, billing SaaS, auditoría, límites por plan, API pública, reglas Firestore, pruebas unitarias y un pipeline CI. Esa base es real y valiosa.

El problema principal está en otro lugar. La mayoría de los módulos resuelve solamente el **registro básico de una operación**, pero no el ciclo completo que una empresa necesita controlar. El sistema puede registrar una venta, pero todavía no administra integralmente el trabajo que ocurre antes, durante y después de esa venta. Puede registrar una compra, pero no maneja solicitud, orden, aprobación, recepción parcial, diferencia de costo, cuenta por pagar ni evaluación del proveedor. Puede mostrar un reporte, pero no garantiza que el margen, la caja y los saldos estén calculados desde un modelo contable-operativo suficientemente completo.

Por eso, la evaluación correcta no es “el SaaS está mal hecho”. La evaluación correcta es: **la plataforma tiene un buen esqueleto de producto y seguridad, pero sus músculos operativos todavía son pequeños**.

## 2. Diagnóstico en una frase

> **Tienda-SS es actualmente una plataforma SaaS multi-tenant de operaciones comerciales básicas, con una base técnica de preproducción, pero todavía no es un ERP operativo completo porque carece de profundidad de procesos, automatización, control de sucursales, cierre de caja, compras formales, inteligencia financiera y ejecución E2E autenticada.**

## 3. Nivel actual estimado

Los porcentajes siguientes no son métricas automáticas. Son una evaluación de madurez basada en la estructura del repositorio, el código de las rutas, las pantallas y la evidencia de pruebas.

| Dimensión | Nivel estimado | Interpretación |
|---|---:|---|
| Fundaciones técnicas | 70% | Next.js, Firebase Admin, reglas, middleware, permisos, auditoría y CI existen. |
| Multi-tenancy básico | 65% | El aislamiento por tenant está bien planteado, pero el cambio de tenant, sucursales y alcance de datos aún no están demostrados completamente. |
| Flujo comercial básico | 55% | Hay catálogo, venta, preventa, caja y crédito, pero faltan estados, excepciones y cierres. |
| Inventario y abastecimiento | 40% | Hay movimientos y compras confirmadas, pero faltan costo promedio, reservas completas, conteos, órdenes y proveedores operativos. |
| Finanzas y caja | 30% | Hay gastos y movimientos de caja, pero no existe una caja por turno con apertura, arqueo, cierre y conciliación. |
| CRM y crédito | 35% | Hay clientes, límite y saldo, pero falta historial comercial, cobranza, aging y seguimiento. |
| Reportes gerenciales | 35% | Hay gráficas y agregados, pero existen límites de lectura y el concepto de utilidad no es todavía contabilidad gerencial confiable. |
| Automatización | 20% | Las operaciones son principalmente manuales. Hay notificaciones de billing, pero no un motor de tareas o reglas de negocio. |
| Experiencia por rol | 40% | Los roles existen en backend, pero la interfaz todavía expone una navegación casi universal y no guía el trabajo diario de cada perfil. |
| Calidad de producción | 55% | Typecheck, lint, tests, build y CI están presentes; faltan E2E autenticadas, prueba real de restore y evidencia de producción. |
| Madurez ERP para el mercado objetivo | 35–45% | Puede servir como MVP operativo inicial, pero todavía no debería venderse como ERP completo. |

### Interpretación de “cuánto falta”

Para llegar a un **MVP comercial útil**, falta aproximadamente un 35%–45% de trabajo concentrado en procesos reales, no en pantallas nuevas.

Para llegar a un **ERP SaaS profesional y confiable**, falta aproximadamente un 55%–65%. Ese trabajo incluye sucursales reales, caja formal, compras y cuentas por pagar, inventario profundo, automatización, reportes confiables, controles de auditoría visibles, E2E y operación de producción.

El producto puede parecer más avanzado visualmente de lo que está funcionalmente porque tiene muchas rutas y muchas pantallas. La cantidad de módulos no equivale a la profundidad de cada proceso.

## 4. Qué tiene hoy

### 4.1 Base técnica y seguridad

La aplicación utiliza Next.js con Firebase Authentication, Firebase Admin y Firestore. Las rutas protegidas validan token, tenant y membresía activa mediante `requireTenantMember` y `requireTenantPermission`. El rol se obtiene del documento de membresía del servidor y no del body enviado por el navegador. Esta es una decisión correcta.

El proyecto también tiene una política central de API que bloquea rutas no registradas, reglas Firestore, rate limiting, correlation IDs, logging estructurado, auditoría inmutable para operaciones sensibles y MFA para perfiles administrativos.

El repositorio contiene además un workflow de GitHub Actions que ejecuta instalación limpia, auditoría de dependencias de producción, secret scanning, typecheck, lint, pruebas, build, reglas Firestore y una suite E2E básica. Esto corrige parte de la auditoría antigua que decía que no existía CI.

### 4.2 Modelo SaaS

Existe un modelo de tenant con plan, estado, miembros, configuración de permisos y límites de uso. Starter, Growth y Scale tienen límites diferentes para miembros, productos, ventas mensuales, almacenamiento y API. Stripe sincroniza plan y estado de suscripción mediante webhook con idempotencia y reintentos.

El onboarding crea el tenant sin sembrar datos falsos, permite invitar al equipo, crear el primer producto y registrar la intención de realizar la primera venta. El flag `onboardingCompleted` ya se persiste.

### 4.3 Módulos presentes

| Módulo | Qué existe actualmente | Qué valor real aporta |
|---|---|---|
| Autenticación | Registro, login, recuperación, verificación de correo y MFA parcial. | Protege el acceso y permite separar cuentas empresariales. |
| Tenants | Empresa, membresía owner, plan, estado y configuración. | Proporciona el límite de aislamiento fundamental. |
| Usuarios | Invitaciones, aceptación, roles, activación y desactivación. | Permite distribuir trabajo entre personas. |
| Permisos | Matriz por módulo y acción configurable por tenant. | Permite restringir operaciones sin depender solo del frontend. |
| Catálogo | Productos, categorías, SKU, precios, stock, productos físicos y servicios. | Da una fuente central de artículos vendibles. |
| Inventario | Entradas, salidas, ajustes, mínimos, movimientos y prevención de stock negativo. | Evita que el stock sea solamente un número manual. |
| Ventas / POS | Venta directa, descuento, crédito, cliente, stock transaccional e idempotencia. | Es uno de los flujos más reales del producto. |
| Preventa | Vendedor crea ticket y caja lo busca por código. | Divide venta en piso y cobro, una buena base para negocios con vendedor/cajero. |
| Crédito | Límite, saldo, pagos y notas de crédito. | Permite trabajar con ventas fiadas básicas. |
| Compras | Recepción inmediata de productos y aumento de stock. | Resuelve una entrada simple de mercancía. |
| Finanzas | Gastos y movimientos de caja. | Permite un registro básico de flujo. |
| Reportes | Ingresos, gastos, neto, métodos de pago, productos y crédito. | Da visibilidad inicial al propietario. |
| Entregas | Venta, cliente, dirección, chofer y estado pendiente/entregada. | Cubre un despacho extremadamente simple. |
| Facturación SaaS | Checkout, portal, webhook, límites y suspensión. | Hace posible monetizar la plataforma. |
| Integraciones | CSV, API versionada y webhooks firmados. | Permite una ruta futura hacia ecosistemas externos. |

## 5. Qué está especialmente bien

### 5.1 El aislamiento por tenant está pensado desde el servidor

La mejor decisión arquitectónica del proyecto es que el tenant no depende solamente de la interfaz. Las rutas bajo `tenants/{tenantId}/...` recuperan la membresía desde Firestore y verifican estado y permisos. Esto es más importante que tener una interfaz bonita, porque protege la separación de datos cuando el cliente intenta manipular headers o payloads.

La advertencia importante es que el uso de Firebase Admin significa que las reglas Firestore no sustituyen la autorización de las rutas. El perímetro real sigue siendo el código del servidor. Ese riesgo está reconocido en la documentación y parcialmente protegido por pruebas.

### 5.2 Las operaciones críticas usan transacciones

Ventas, checkout de preventas, ajustes de inventario, compras y abonos utilizan transacciones o lecturas consistentes. El sistema registra `previousStock`, `newStock`, `delta`, actor y motivo en movimientos de inventario. También evita doble cobro de venta mediante idempotency key en la venta directa.

Esto es una base correcta para una aplicación que manipula dinero y existencias.

### 5.3 La invitación de usuarios está mejor resuelta que el promedio de un MVP

El sistema no obliga al dueño a inventar una contraseña para otra persona. Envía una invitación, guarda solo un hash del token, limita el tiempo de vida, tiene cooldown de reenvío, revocación, aceptación única y auditoría. También valida que la identidad que acepta corresponda al correo invitado.

Este diseño reduce errores de seguridad y mejora la experiencia administrativa.

### 5.4 La separación vendedor–caja es una buena decisión de producto

El flujo de preventa en piso y cobro en caja tiene potencial para tiendas donde una persona atiende y otra cobra. La caja busca el ticket, confirma el pago y descuenta stock al cobrar, evitando descontarlo dos veces.

Este es uno de los elementos que puede convertirse en una ventaja comercial si se completa con turnos, arqueo, impresión fiscal, devoluciones y conciliación.

### 5.5 Hay intención de producto local para Nicaragua

El sistema utiliza NIO, IVA configurable, número de factura, RUC, dirección, exentos, notas de crédito y estados fiscales. La moneda por defecto y el formato `C$` son decisiones adecuadas para el mercado objetivo.

No obstante, la capa fiscal actual debe describirse como **adaptador preliminar**. El propio código guarda `provider: 'manual'` y `status: 'pending_adapter'`. Eso es honesto técnicamente, pero significa que la emisión fiscal real todavía no está cerrada.

### 5.6 El proyecto evita algunos errores comunes de un SaaS temprano

Entre las decisiones positivas están la eliminación de datos demo al registrar una empresa, el archivado en lugar del borrado destructivo, la auditoría de acciones sensibles, la restricción de accesos por plan, la protección MFA administrativa y la documentación de backup, restore y release.

## 6. Por qué todavía se siente como “demo para la foto”

La sensación no proviene de que los datos sean falsos. Proviene de que los módulos tienen apariencia de producto terminado, pero sus ciclos de trabajo se cortan muy pronto.

Una demo muestra que se puede crear una venta. Un ERP debe ayudar a evitar errores, recordar pendientes, pedir aprobaciones, detectar excepciones, cerrar el día, reconciliar el dinero, explicar diferencias y producir documentos confiables.

Hoy la aplicación se parece más a una colección coordinada de **CRUDs transaccionales con una capa de dashboard** que a un sistema operativo empresarial. Las pantallas muestran catálogos, formularios, tarjetas y métricas, pero todavía no existe una capa suficientemente fuerte de:

- tareas pendientes asignadas a personas;
- estados y transiciones completas;
- aprobaciones;
- documentos relacionados;
- excepciones y alertas de operación;
- conciliación entre módulos;
- automatización de actividades repetitivas;
- historial visible de cambios;
- configuración guiada por tipo de negocio;
- filtros por sucursal, periodo, responsable y estado;
- recuperación ante errores operativos.

## 7. Brechas por módulo

### 7.1 Dashboard y centro de mando

**Lo bueno:** concentra ventas, gastos, stock bajo, cuentas por cobrar y preventas pendientes.

**Lo que falta:** el dashboard muestra datos, pero no administra el trabajo. Las alertas llevan a módulos generales, no a una cola accionable con responsable, prioridad, fecha límite y resolución. Un dueño necesita ver “qué debe hacerse hoy”, no solamente “qué números existen”.

**Debe agregarse:**

1. bandeja de tareas y excepciones;
2. alertas de stock crítico, créditos vencidos, caja sin cerrar, compras atrasadas y entregas vencidas;
3. filtros por sucursal, usuario, periodo y estado;
4. acciones rápidas contextualizadas;
5. metas y variación contra periodo anterior;
6. indicador de calidad de datos y operaciones incompletas.

### 7.2 Catálogo

**Lo bueno:** productos físicos y servicios, categorías, SKU, precio, stock y archivado.

**Lo que falta:** variantes, unidades de medida, códigos de barras, marca, proveedor preferido, costo, precio por canal, precio por cliente, impuestos por producto, imágenes almacenadas correctamente, historial de precios y productos compuestos.

La landing promete “variantes” y “sucursales”, pero el código operativo revisado no implementa todavía esas capacidades de manera completa. Esto crea una brecha entre marketing y producto.

**Debe agregarse:** ficha de producto completa, importación robusta, lector de código de barras, múltiples listas de precio, control de costo, historial de cambios y reglas de activación.

### 7.3 Inventario

**Lo bueno:** movimientos transaccionales, stock negativo bloqueado, mínimos y paginación de productos.

**Lo que falta:** el inventario es todavía por tenant, no por almacén o sucursal real. Se acepta `branchId` en algunas operaciones, pero no existe un módulo completo de sucursales, almacenes, transferencias, existencias por ubicación ni selección activa de sucursal.

Tampoco existe un proceso de conteo físico, inventario cíclico, ajuste con aprobación, reservas consistentes para todos los canales, mercancía dañada, devoluciones a proveedor, lotes, vencimientos o trazabilidad por costo.

**Brecha crítica:** el módulo dice “inteligente” en marketing, pero actualmente es un inventario de existencias y movimientos básicos.

### 7.4 Ventas y POS

**Lo bueno:** venta transaccional, descuento, cliente, crédito, stock, impuestos preliminares e idempotencia.

**Lo que falta:** turnos de caja, descuentos por autorización, múltiples listas de precio, cotización, conversión de cotización a venta, pedidos, entregas parciales, devoluciones visibles en UI, anulación guiada, cambios de precio, ventas suspendidas, pagos mixtos, comprobante consistente, impresión local y continuidad ante mala conectividad.

La API tiene rutas de devoluciones y anulación, pero el recorrido de usuario principal revisado no presenta esas operaciones con la misma profundidad que la venta. Esto refuerza la sensación de que algunas capacidades existen en backend pero no están convertidas en producto usable.

### 7.5 Preventas y caja

**Lo bueno:** la división vendedor–cajero es clara y tiene un flujo real.

**Lo que falta:** la caja no es todavía una caja empresarial. No hay apertura de turno, fondo inicial, arqueos parciales, cierre de turno, diferencias, firma o aprobación de cierre, caja por usuario, caja por sucursal, depósitos, retiros, gastos de caja, pagos mixtos ni conciliación por método.

Para un negocio pequeño, esta es probablemente la brecha operativa más importante. El dueño no solo necesita saber cuánto vendió; necesita saber cuánto efectivo debía haber y por qué falta o sobra dinero.

### 7.6 Compras y proveedores

**Lo bueno:** una compra confirmada incrementa stock de forma transaccional y deja evidencia.

**Lo que falta:** el flujo empieza demasiado tarde, en la recepción. No hay solicitud de compra, orden de compra, aprobación, recepción parcial, diferencias contra orden, devolución a proveedor, factura del proveedor, vencimiento, cuenta por pagar, historial de proveedor ni evaluación de costo.

Además, la documentación afirma control de costo promedio, pero la ruta de compras revisada conserva `unitCost` en la compra y no actualiza el costo del producto ni calcula un costo promedio ponderado. Esto es una inconsistencia funcional que puede dañar los reportes de margen.

### 7.7 Clientes y CRM

**Lo bueno:** clientes y proveedores separados, datos básicos, límite y saldo de crédito.

**Lo que falta:** historial de compras en la ficha del cliente, última compra, frecuencia, ticket promedio, segmentación, etiquetas, contacto comercial, seguimiento de cobranza, promesas de pago, estados de cuenta, recordatorios y actividades.

El módulo es un directorio con crédito básico, no todavía un CRM que ayude a vender y cobrar mejor.

### 7.8 Crédito y cuentas por cobrar

**Lo bueno:** saldo, abonos, límite de crédito, vencimiento básico y notas de crédito.

**Lo que falta:** aging por rangos, cartera vencida, estados de cuenta imprimibles, abonos aplicados a documentos, promesas de pago, bloqueo automático por morosidad, recordatorios, cobranza por responsable, historial de gestiones y conciliación de crédito.

También debe definirse con claridad cómo interactúan pagos, devoluciones, notas de crédito y anulaciones. En un ERP, el saldo debe ser explicable línea por línea.

### 7.9 Finanzas y caja

**Lo bueno:** gastos, entradas y salidas manuales, resumen de ingresos, gastos y neto.

**Lo que falta:** la API no implementa una contabilidad ni siquiera una caja operativa completa. El ingreso se calcula desde ventas recientes y los gastos desde registros recientes. No existe cierre por periodo, conciliación bancaria, cuentas por pagar, cuentas por cobrar integradas a reportes, centros de costo, categorías configurables, comprobantes, aprobación de gastos ni libro de movimientos auditado desde la interfaz.

Llamar “utilidad neta” a `ingresos - gastos + ajustes` es demasiado fuerte si no se descuentan costo de mercancía, devoluciones, notas de crédito, impuestos y otros movimientos. El nombre debe cambiar a “flujo neto operativo” hasta que exista un modelo financiero más completo.

### 7.10 Reportes

**Lo bueno:** rango de 7 a 365 días, tendencia diaria, métodos de pago, productos más vendidos, gastos y crédito.

**Lo que falta:** reportes por sucursal, vendedor, cajero, producto, categoría, margen, costo, impuestos, devoluciones, ticket promedio por canal, clientes, proveedores y cartera vencida.

La ruta lee hasta 500 documentos por colección y luego filtra fechas en memoria. Esto puede funcionar con pocos datos, pero puede volverse incompleto o costoso al crecer. Los reportes deben consultar por rango en Firestore o utilizar agregados diarios/materializados.

### 7.11 Entregas

**Lo bueno:** existe un objeto de entrega ligado a venta, cliente y chofer.

**Lo que falta:** el módulo solo maneja `pending` y `delivered`. No hay preparación, asignación formal, en ruta, fallida, reprogramada, prueba de entrega, firma, foto, costo de envío, zona, ventana horaria ni comunicación con cliente.

Por su tamaño actual, debe presentarse como “seguimiento básico de entregas”, no como logística.

### 7.12 Usuarios, roles y permisos

**Lo bueno:** el backend tiene una matriz extensa, roles diferenciados y permisos configurables.

**Lo que falta:** la interfaz lateral muestra casi todos los módulos para todos los roles. El servidor termina bloqueando operaciones, pero el usuario descubre sus restricciones después de hacer clic. Esto no es una experiencia profesional.

También faltan permisos más específicos: ver costo, aprobar descuentos, aprobar compras, anular ventas, emitir notas de crédito, abrir/cerrar caja, ver salarios, exportar datos sensibles, administrar sucursales y ver datos de otras sucursales.

La matriz actual está organizada por módulo y acción. Un ERP real necesita además **alcance de datos**: propia sucursal, todas las sucursales, propios documentos o todos los documentos.

### 7.13 Billing SaaS

**Lo bueno:** checkout, portal, webhook, idempotencia, estados de suscripción y límites.

**Lo que falta:** recuperación operativa de eventos fallidos desde la UI de superadmin, historial de cambios de plan, prorrateos visibles, facturas descargables, control de cancelación, comunicación de grace period, métricas de conversión y soporte.

El billing de la plataforma es más maduro que varios módulos del ERP, pero sigue siendo una capacidad de monetización, no una ventaja operativa para el cliente final.

## 8. Problemas transversales que afectan todo el producto

### 8.1 Multi-tenant sí, multi-sucursal todavía no

El tenant está bien identificado, pero la sucursal no es una entidad operativa completa. Hay referencias opcionales a `branchId` y `branchIds`, pero no se observa un módulo de sucursales con configuración, usuarios asignados, almacenes, cajas, inventario, numeración ni reportes por sucursal.

Esto significa que el producto es actualmente **multi-tenant básico**, no multi-sucursal ERP completo.

### 8.2 El sistema registra operaciones, pero no orquesta procesos

Las rutas crean documentos, pero todavía falta un motor de estados y automatizaciones. Por ejemplo, una venta debería poder recorrer cotizada, confirmada, preparada, entregada, cobrada, devuelta o anulada. Una compra debería recorrer solicitada, aprobada, ordenada, recibida parcialmente, recibida y conciliada.

Sin esos estados, el sistema no ayuda a coordinar personas. Solo guarda el resultado final de algunas acciones.

### 8.3 Existe una diferencia entre backend y experiencia

Hay endpoints para devoluciones, anulaciones, notas de crédito, exportaciones, reservas e integraciones, pero muchas de esas acciones no tienen una experiencia de usuario equivalente, visible y guiada.

Un producto profesional no se mide por la cantidad de endpoints. Se mide por si una persona puede completar el trabajo sin conocer la arquitectura interna.

### 8.4 La navegación no está suficientemente adaptada al rol

El sidebar presenta ventas, compras, entregas, finanzas, permisos y billing de manera general. El backend protege, pero la UI debería presentar el espacio de trabajo correspondiente a cada rol.

Un vendedor debería abrir directamente su cola de ventas, clientes y preventas. Un cajero debería abrir su turno, pendientes de cobro y cierre. Bodega debería abrir reposición, recepciones, transferencias y conteos. El owner debería abrir excepciones, rentabilidad, cartera, caja y decisiones.

### 8.5 Hay mensajes y formatos monetarios inconsistentes

Aunque se agregó NIO para varias pantallas, todavía existen componentes y pantallas que muestran `$` directamente, especialmente caja, compras, finanzas, reportes y elementos de marketing. El `$` es correcto para la suscripción SaaS si los precios están definidos en USD, pero no debe aparecer como moneda de operación local cuando el tenant usa NIO.

La moneda debe provenir de una única configuración y aplicarse también a tickets, impresiones, exportaciones, reportes, mensajes de error y notificaciones.

### 8.6 Lecturas no escalables

Hay endpoints que hacen lecturas amplias o filtran en memoria. Contactos utiliza una consulta ordenada sin paginación. Finanzas y reportes leen lotes recientes fijos. Reportes lee hasta 500 documentos y después calcula. Esto puede dar resultados incompletos cuando la empresa crezca.

El ERP debe migrar pronto a consultas por rango, paginación, agregados diarios y materializaciones.

### 8.7 Falta evidencia E2E autenticada

El CI instala Playwright y ejecuta E2E, pero la evidencia disponible indica que no existen credenciales Firebase de staging ni una suite autenticada completa. Por eso aún no está demostrado que un usuario real pueda completar login, onboarding, venta, cobro, invitación, cambio de permisos, crédito y billing en conjunto.

Esta es una diferencia entre “la ruta carga” y “el negocio funciona”.

## 9. Evaluación por rol

| Rol | Lo que puede hacer hoy | Lo que necesita para ser profesional |
|---|---|---|
| Owner | Ver y administrar casi todo, usuarios, permisos, billing y operación. | Centro de decisiones, rentabilidad real, sucursales, caja consolidada, alertas, aprobaciones y control de auditoría visible. |
| Admin | Administración amplia del tenant. | Separación de funciones, límites claros frente al owner y registro de acciones administrativas. |
| Gerente | Supervisión amplia, finanzas y reportes. | Metas, comparación por sucursal, rendimiento de equipo, aprobaciones y excepciones. |
| Supervisor de sucursal | Operación de catálogo, inventario, ventas, contactos, crédito, finanzas y miembros. | Alcance estricto a su sucursal, caja de sucursal, transferencias y cierre diario. |
| Vendedor | Ventas, clientes, crédito y consulta de catálogo. | Cola de clientes, cotizaciones, seguimiento, metas, comisiones y tareas de cobranza. |
| Cajero | POS, cobros, clientes, crédito y caja básica. | Apertura/cierre, arqueo, diferencias, pagos mixtos, devoluciones autorizadas y comprobantes. |
| Bodega | Catálogo, inventario y movimientos. | Recepciones, transferencias, conteos, ubicaciones, lotes, reposición y picking. |
| Compras | Proveedores, compras, catálogo, inventario y gastos. | Solicitudes, órdenes, aprobaciones, costos, vencimientos y cuentas por pagar. |
| Chofer | Consulta y actualización simple de entregas. | Ruta, secuencia, prueba de entrega, incidencias, reintentos y comunicación. |
| Despachador | Inventario, ventas, entregas y preparación básica. | Picking, packing, estados de pedido y control de despacho. |
| Solo lectura | Consulta y exportación según matriz. | Vistas seguras por alcance, reportes y protección de datos sensibles. |

## 10. Qué debe crearse o agregarse

### Prioridad P0: convertir operaciones críticas en procesos cerrados

1. **Sucursales y almacenes reales.** Crear entidades, membresía por sucursal, almacenes, cajas, numeración y filtros por alcance.
2. **Caja por turno.** Implementar apertura, fondo inicial, ventas por método, entradas, retiros, gastos, arqueo, diferencia, cierre y aprobación.
3. **Compras completas.** Agregar solicitud, orden de compra, aprobación, recepción parcial, devolución, factura del proveedor, vencimiento y cuenta por pagar.
4. **Costo e inventario.** Implementar costo promedio ponderado o costo definido, reservas, transferencias, conteo físico y ajuste aprobado.
5. **Ventas completas.** Agregar cotización, pedido, devolución, anulación, pagos mixtos, descuentos autorizados y documentos imprimibles.
6. **Crédito real.** Agregar aging, estados de cuenta, promesas de pago, cobranza y bloqueo por morosidad.
7. **E2E autenticada.** Crear un entorno controlado con Firebase Emulator Suite o staging dedicado y cubrir los journeys núcleo.

### Prioridad P1: automatización que ahorra trabajo

1. Reorden automático por mínimo, ventas promedio y tiempo de reposición.
2. Alertas de crédito vencido y recordatorios de pago.
3. Tareas asignadas para caja sin cerrar, entregas pendientes, compras atrasadas y productos bajo mínimo.
4. Aprobaciones para descuentos, compras, gastos, devoluciones y notas de crédito.
5. Reglas configurables por tenant.
6. Notificaciones por correo, dentro de la aplicación y eventualmente WhatsApp mediante integración autorizada.
7. Cierres diarios automáticos con resumen para owner y gerente.
8. Importadores con validación, vista previa, errores por fila y rollback.

### Prioridad P1: confianza financiera y fiscal

1. Separar flujo de caja, margen operativo y resultado gerencial.
2. Incorporar costo de mercancía, devoluciones y notas de crédito a los reportes.
3. Materializar agregados diarios para reportes escalables.
4. Centralizar la moneda y el formato de operación.
5. Definir adapter fiscal real para Nicaragua, con numeración, contingencia, anulaciones, retención documental y validación legal.
6. Emitir comprobantes consistentes desde POS, preventa, caja y devoluciones.

### Prioridad P2: experiencia profesional por rol

1. Sidebar filtrado por permiso real.
2. Página inicial diferente para owner, vendedor, cajero, bodega, compras y chofer.
3. Acciones bloqueadas con explicación y alternativa, no solo error después del clic.
4. Colas de trabajo por rol.
5. Búsqueda global de productos, clientes, ventas y documentos.
6. Filtros persistentes y paginación en todos los módulos.
7. Auditoría visible en cada documento.
8. Atajos de teclado y lector de códigos en POS y bodega.
9. Estados vacíos que enseñen qué hacer.
10. Confirmaciones claras para acciones irreversibles o sensibles.

## 11. Cómo hacer que el SaaS minimice tareas empresariales

La reducción de trabajo no se logra agregando más botones. Se logra diseñando el sistema alrededor de eventos y excepciones.

### Principio 1: capturar una vez, reutilizar en todas partes

El producto, cliente, proveedor, sucursal, impuesto, precio y documento deben registrarse una sola vez. La venta debe reutilizar esos datos para inventario, caja, crédito, reportes, fiscalidad y notificaciones.

### Principio 2: el sistema debe proponer la siguiente acción

Después de una venta a crédito, el sistema debe mostrar la fecha de vencimiento y programar seguimiento. Después de una compra, debe actualizar costo y sugerir reposición. Después de un cierre de caja, debe mostrar diferencias. Después de una entrega fallida, debe crear una tarea de reprogramación.

### Principio 3: trabajar por excepciones

El usuario no debería revisar todos los registros cada día. Debe atender solamente lo que requiere decisión: stock crítico, diferencia de caja, crédito vencido, margen anormal, compra atrasada, entrega fallida o documento incompleto.

### Principio 4: eliminar doble digitación

La preventa debe convertirse en venta sin volver a escribir líneas. La venta debe convertirse en entrega sin copiar dirección. El pedido de compra debe convertirse en recepción sin volver a seleccionar productos. El pago debe actualizar automáticamente la cartera y el estado del cliente.

### Principio 5: el sistema debe cerrar ciclos

Toda operación importante necesita inicio, ejecución, resultado y cierre. Registrar solamente el inicio o el resultado no es suficiente para controlar una empresa.

## 12. Cómo hacerlo más profesional sin una reescritura total

No recomiendo una reescritura grande de UI. Recomiendo una evolución por capas.

### Capa 1: consistencia visual y semántica

Centralizar componentes de tabla, formulario, modal, estado, moneda, fechas, permisos y errores. Reducir páginas comprimidas en una sola línea y componentes monolíticos. Esto no es solamente estética: el código legible reduce errores en procesos financieros.

### Capa 2: navegación contextual

El sidebar debe depender de permisos y rol. La primera pantalla debe mostrar el trabajo pendiente del usuario. Los módulos secundarios deben quedar fuera del camino de los perfiles que no los necesitan.

### Capa 3: documentos y estados

Cada venta, compra, entrega, pago y movimiento debe tener un detalle navegable, historial de estados, documentos relacionados y acciones permitidas.

### Capa 4: automatización

Agregar un sistema de eventos de negocio y tareas. No hace falta comenzar con una plataforma compleja. Firestore puede almacenar eventos, tareas, reglas y estados; Cloud Scheduler o Cloud Tasks puede ejecutar recordatorios y trabajos periódicos.

### Capa 5: confiabilidad

Agregar pruebas de integración con Firebase Emulator, pruebas E2E autenticadas, datos de staging, restore periódico y monitores de endpoints críticos.

## 13. Roadmap recomendado

### Fase 0 — Producto verdadero y control de alcance

**Duración estimada:** 1–2 semanas.

Definir dos o tres tipos de negocio iniciales, por ejemplo tienda minorista, distribuidora pequeña y negocio de servicios con inventario. Elegir un flujo principal por tipo. Corregir marketing para que no prometa variantes, sucursales, automatizaciones o pedidos completos si todavía no están disponibles.

**Salida:** matriz de capacidades reales, criterios de aceptación y journeys de negocio.

### Fase 1 — Caja, ventas y documentos

**Duración estimada:** 3–5 semanas.

Cerrar apertura y cierre de caja, pagos mixtos, devoluciones, anulaciones, comprobantes, descuentos autorizados y estados de venta. Agregar E2E autenticada del recorrido vendedor → cajero → inventario → reporte.

**Salida:** un negocio puede operar un día completo y cuadrar su caja.

### Fase 2 — Inventario, compras y proveedores

**Duración estimada:** 4–6 semanas.

Crear sucursales y almacenes mínimos, transferencias, conteos, reservas, costo promedio, órdenes de compra, recepción parcial y devoluciones a proveedor.

**Salida:** el stock y el costo son confiables, no solo editables.

### Fase 3 — Crédito, cobranza y finanzas operativas

**Duración estimada:** 3–5 semanas.

Agregar aging, estados de cuenta, recordatorios, promesas de pago, cuentas por pagar, centros de costo y cierres financieros básicos.

**Salida:** el dueño entiende qué le deben, qué debe pagar y cuánto efectivo tiene.

### Fase 4 — Automatización y roles

**Duración estimada:** 3–5 semanas.

Agregar tareas, alertas, aprobaciones, dashboards por rol, navegación contextual, reglas de reorden y cierres diarios automáticos.

**Salida:** la plataforma comienza a ahorrar tiempo en lugar de solo registrar trabajo.

### Fase 5 — Producción y fiscalidad

**Duración estimada:** 4–8 semanas, dependiendo del proveedor fiscal y requisitos locales.

Completar adapter fiscal, pruebas de contingencia, auditoría visible, restore real, E2E de staging, monitoreo, políticas de soporte, exportación de datos y procedimiento de incidentes.

**Salida:** producto vendible con evidencia operativa.

## 14. Definición de “ERP listo” para este proyecto

No declararía el producto como ERP profesional hasta cumplir, como mínimo, lo siguiente:

| Criterio | Condición de cierre |
|---|---|
| Operación diaria | Una empresa puede abrir caja, vender, recibir compras, entregar, cobrar crédito y cerrar caja sin hojas externas. |
| Inventario | Existencias por sucursal/almacén, movimientos auditados, transferencias, conteos y costo confiable. |
| Compras | Solicitud, aprobación, orden, recepción y cuenta por pagar conectadas. |
| Crédito | Límite, saldo, aging, pagos, notas de crédito y cobranza explicable. |
| Roles | Cada rol ve su trabajo y el alcance de datos correspondiente. |
| Reportes | Ventas, caja, inventario, margen, crédito y compras concilian con los documentos fuente. |
| Automatización | El sistema crea alertas y tareas por eventos relevantes. |
| Multi-tenancy | Tenant y sucursal se validan en servidor, con pruebas cross-tenant y cross-branch. |
| Fiscalidad | Los documentos locales tienen adapter, contingencia, numeración y validación legal. |
| Calidad | CI verde, E2E autenticada, reglas, integración API, load test y restore comprobado. |
| Operación SaaS | Billing, suspensión, grace period, soporte, exportación y recuperación de datos documentados. |

## 15. Prioridad práctica para las próximas 10 tareas

1. Crear el modelo y UI de sucursales, almacenes y alcance por sucursal.
2. Implementar apertura, arqueo y cierre de caja.
3. Cerrar devoluciones y anulaciones desde la UI.
4. Corregir costo promedio y reportes de margen.
5. Crear orden de compra, recepción parcial y cuentas por pagar.
6. Implementar aging y estados de cuenta de crédito.
7. Crear navegación y dashboard por rol.
8. Agregar tareas, alertas y aprobaciones.
9. Crear E2E autenticada con datos controlados.
10. Alinear marketing, documentación y precios con capacidades realmente disponibles.

## 16. Veredicto final

Tu proyecto no está en cero y no conviene tirarlo para reescribirlo. La base de seguridad, tenant, roles, transacciones y módulos principales permite seguir construyendo sobre ella.

Tampoco conviene continuar agregando módulos superficiales. El siguiente salto de valor no consiste en crear otra pantalla. Consiste en **cerrar los ciclos operativos que ya empezaste**.

La prioridad debe ser pasar de:

> “Puedo registrar una venta, una compra, un gasto o una entrega.”

a:

> “Puedo operar un día completo de mi empresa, controlar el dinero, entender el inventario, cobrar lo pendiente, delegar tareas y saber qué requiere atención sin usar hojas externas.”

Cuando el sistema logre eso para uno o dos tipos de negocio concretos, dejará de sentirse como demo. En ese punto ya no será necesario convencer al usuario con tarjetas y gráficas: el valor se demostrará porque la empresa podrá trabajar mejor con menos pasos y menos errores.

**Evaluación final:** base técnica sólida de MVP avanzado; profundidad funcional insuficiente para ERP completo; camino viable sin reescritura, pero con necesidad de concentrar el próximo ciclo en caja, compras, inventario, crédito, sucursales, automatización y pruebas E2E reales.

## Referencias

[1]: https://firebase.google.com/docs/firestore/security/rules-conditions "Firestore Security Rules conditions"

[2]: https://firebase.google.com/docs/firestore/manage-data/transactions "Firestore transactions and batched writes"

[3]: https://stripe.com/docs/webhooks "Stripe webhooks documentation"

[4]: https://docs.github.com/en/actions "GitHub Actions documentation"

[5]: https://playwright.dev/docs/test-intro "Playwright Test documentation"
