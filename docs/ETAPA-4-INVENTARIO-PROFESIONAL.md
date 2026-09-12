# Etapa 4 — Inventario profesional por almacén

**Rama:** `SaaS-MultiTenant-Profesional`
**Estado:** implementada y validada en código; migración y reconciliación preparadas.

## Capacidades implementadas

La nueva API `/api/inventory/warehouses` introduce existencias por almacén mediante `inventoryStocks`. Cada registro conserva el almacén, sucursal, producto, cantidad y costo promedio ponderado.

El sistema permite recibir inventario con costo unitario, retirar existencias, transferir productos entre almacenes y enviar conteos físicos a revisión. Los conteos no alteran existencias hasta que un responsable los aprueba. Cada operación genera movimientos inmutables y auditoría.

El almacén principal mantiene sincronización con el campo legacy `products.stock` para no romper ventas y módulos anteriores mientras el resto del ERP migra al modelo por almacén.

La pantalla `/workspace/warehouse-inventory` permite seleccionar almacén, consultar unidades y costo promedio, recibir mercancía, transferir entre almacenes y enviar conteos físicos.

## Reglas de negocio

Una transferencia descuenta primero el almacén origen y solo se confirma si existe cantidad suficiente. El almacén destino recibe la cantidad en la misma transacción. El costo se conserva desde el origen cuando el destino todavía no tiene costo.

Las transferencias controladas siguen los estados `draft`, `approved`, `in_transit`, `received` y `cancelled`. Una transferencia se crea como borrador, requiere aprobación de un responsable, descuenta el origen al despacharse y permite una o varias recepciones parciales en el destino. La última recepción cambia el estado a `received`; una transferencia no despachada puede cancelarse.

Una recepción recalcula costo promedio ponderado. Un retiro conserva el costo vigente. Ninguna transacción permite inventario negativo.

Un conteo físico captura la cantidad observada y la diferencia respecto al sistema. El ajuste se aplica únicamente cuando un responsable lo aprueba.

## Compatibilidad y migración

Los productos existentes continúan teniendo `stock`. El script `scripts/migrate-inventory-stocks.ts` genera un dry-run, reporta diferencias contra la suma de todos los almacenes y, con confirmación explícita, crea únicamente registros faltantes para `warehouse-main`. Las nuevas recepciones, compras, ventas, devoluciones y reservas actualizan el modelo canónico; el almacén principal mantiene sincronización legacy para compatibilidad.

La migración de código del checkout, preventas, devoluciones y reservas ya está implementada. La migración de datos históricos debe ejecutarse después de revisar el dry-run real de cada tenant y confirmar el backup correspondiente.

## Producción

Antes de activar consultas por almacén se deben desplegar los índices:

```bash
firebase deploy --only firestore:indexes
```

## Límites conocidos

- La aplicación de la migración histórica requiere credenciales administrativas, tenant confirmado, backup y revisión de diferencias.
- La acción legacy `transfer` permanece disponible para compatibilidad; las nuevas integraciones deben usar `create-transfer`, `approve-transfer`, `dispatch-transfer`, `receive-transfer` y `cancel-transfer`.
- No existe todavía costeo FIFO o por lote, números de serie, caducidad ni valoración contable completa.
- El conteo implementado es por producto; un documento de conteo masivo y hojas de conteo pertenecen a una mejora posterior.
