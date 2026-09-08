# Implementación fiscal Nicaragua — alcance MVP

La aplicación conserva la moneda base **NIO**, el tipo de documento, numeración, cliente, RUC, dirección, líneas, descuentos, base imponible, exentos, tasa, impuesto, total, medio de pago, vendedor, sucursal, estado y referencias de devolución o nota de crédito dentro de la venta.

La numeración se asigna dentro de la misma transacción que crea la venta mediante `tenants/{tenantId}/settings/fiscal.nextInvoiceSequence`. El prefijo configurable por tenant inicia en `FAC` y la secuencia se almacena con ocho dígitos. Esto evita duplicados por concurrencia y conserva trazabilidad auditable.

La fiscalidad se calcula en backend. La tasa por defecto es 15%, pero el backend valida una tasa entre 0 y 1. La venta persiste `taxableBase`, `exemptAmount`, `taxAmount`, `taxRate`, `currency` y `fiscal.status = pending_adapter`. La aplicación no declara emisión electrónica ante la autoridad fiscal.

## Adaptador electrónico

El campo `fiscal.adapterVersion = preview-2026-01` establece un contrato estable para un proveedor futuro. El adaptador debe recibir un documento normalizado, devolver estado, identificador externo, fecha de envío, XML/JSON de respuesta almacenado de forma segura y un error sanitizado. Debe soportar contingencia, reintentos idempotentes, anulaciones, notas de crédito y retención documental.

Antes de producción fiscal se requiere revisión de un asesor tributario local, validación del proveedor autorizado, pruebas de numeración, contingencia, anulaciones, notas de crédito, retención y conciliación.
