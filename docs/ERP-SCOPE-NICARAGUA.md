# Alcance ERP inicial — Nicaragua

## ICP

El primer mercado objetivo es la pequeña y mediana empresa de comercio, distribución y retail con una a cinco sucursales, entre tres y quince usuarios operativos, catálogo de productos, ventas de mostrador, inventario y cuentas por cobrar. El comprador principal es el propietario o gerente general; los usuarios diarios son vendedores, cajeros, bodega y supervisores de sucursal.

## País, moneda e impuestos

La primera versión se orienta a Nicaragua, con moneda base **NIO (córdoba nicaragüense)** y soporte de precios alternativos en USD únicamente como dato de referencia. La configuración fiscal debe conservar tasa, base imponible, exentos y el identificador de comprobante en cada venta; ningún cálculo fiscal debe depender exclusivamente de la interfaz.

## Documentos fiscales

El MVP debe conservar el número de factura, fecha, cliente, líneas, descuentos, impuestos, medios de pago, vendedor, sucursal, estado y referencia de devolución o nota de crédito. La emisión fiscal electrónica y la integración con proveedores autorizados se deja como adaptador versionado, sujeto a validación normativa y contractual antes de producción.

## Módulos del primer mercado

| Módulo | Alcance inicial | Fuera de alcance inicial |
|---|---|---|
| Catálogo e inventario | Productos, variantes, existencias por sucursal, mínimos y ajustes autorizados | Manufactura y MRP |
| Ventas | POS, cotización, venta, cobro, devolución y anulación auditada | Marketplace |
| Crédito | Clientes, límites, cuentas por cobrar, abonos y notas de crédito | Scoring externo |
| Compras | Proveedores, recepción y costo promedio | Compras automáticas |
| Caja | Apertura, cierre, gastos y conciliación básica | Tesorería bancaria avanzada |
| Reportes | Ventas, inventario, margen restringido por rol y cuentas por cobrar | Data warehouse |
| Integraciones | Importación/exportación CSV, API pública versionada y webhooks firmados | Contabilidad bidireccional en tiempo real |

## Decisiones de cumplimiento

Los datos financieros y fiscales quedan restringidos por tenant, sucursal y rol. Las operaciones que alteren inventario, crédito, impuestos o documentos fiscales requieren auditoría inmutable. Antes de declarar producción fiscal se debe completar una revisión local con asesoría tributaria y probar numeración, contingencia, anulaciones y retención documental.

## Estado de implementación al cierre de la Etapa 0

Este documento define el **alcance objetivo del MVP ERP**, no afirma que todas las capacidades estén terminadas en el código actual. La diferencia se controla en `docs/ETAPA-0-PRODUCT-FOUNDATION.md` y `docs/TRACEABILITY-MATRIX.md`.

| Capacidad del alcance objetivo | Estado actual | Comunicación correcta |
|---|---|---|
| Productos, variantes y existencias por sucursal | Parcial; existen productos y movimientos básicos, pero variantes, sucursales y stock por almacén están en roadmap. | Control básico de catálogo y existencias. |
| POS, cotización, venta, cobro, devolución y anulación | Parcial; venta, preventa, cobro, devoluciones y anulaciones tienen APIs, pero no todos los recorridos están cerrados en la UI. | Ventas, preventas y cobros básicos; reversos en consolidación. |
| Clientes, límites, cuentas por cobrar, abonos y notas | Parcial/operativo básico; faltan aging, estados de cuenta y cobranza guiada. | Crédito y cuentas por cobrar básicas. |
| Proveedores, recepción y costo promedio | Parcial; recepción y costo por línea existen, pero el costo promedio completo está pendiente. | Proveedores y recepción de compras. |
| Apertura, cierre, gastos y conciliación básica | Parcial; existen gastos, movimientos y cobro de tickets, pero falta sesión de caja, arqueo y cierre formal. | Control básico de caja y cobros. |
| Reportes de ventas, inventario, margen y cuentas por cobrar | Parcial; existen reportes operativos, pero el margen requiere costo confiable y los agregados deben escalar. | Métricas y reportes operativos iniciales. |
| API pública, CSV y webhooks | Disponible en alcance técnico actual, sujeto a permisos, límites y capacidades documentadas. | API e integraciones para capacidades disponibles. |

La emisión fiscal electrónica, la contabilidad completa, la tesorería bancaria avanzada, la manufactura, el marketplace, las rutas GPS y las automatizaciones generales no deben presentarse como capacidades terminadas hasta que la matriz de trazabilidad las marque como `Actual` y exista evidencia de prueba correspondiente.
