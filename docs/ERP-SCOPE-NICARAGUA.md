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
