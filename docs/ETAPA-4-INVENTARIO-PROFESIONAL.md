# Etapa 4 — Inventario profesional por almacén

**Rama:** `SaaS-MultiTenant-Profesional`  
**Estado:** implementada y validada en código.

## Capacidades implementadas

La nueva API `/api/inventory/warehouses` introduce existencias por almacén mediante `inventoryStocks`. Cada registro conserva el almacén, sucursal, producto, cantidad y costo promedio ponderado.

El sistema permite recibir inventario con costo unitario, retirar existencias, transferir productos entre almacenes y enviar conteos físicos a revisión. Los conteos no alteran existencias hasta que un responsable los aprueba. Cada operación genera movimientos inmutables y auditoría.

El almacén principal mantiene sincronización con el campo legacy `products.stock` para no romper ventas y módulos anteriores mientras el resto del ERP migra al modelo por almacén.

La pantalla `/workspace/warehouse-inventory` permite seleccionar almacén, consultar unidades y costo promedio, recibir mercancía, transferir entre almacenes y enviar conteos físicos.

## Reglas de negocio

Una transferencia descuenta primero el almacén origen y solo se confirma si existe cantidad suficiente. El almacén destino recibe la cantidad en la misma transacción. El costo se conserva desde el origen cuando el destino todavía no tiene costo.

Una recepción recalcula costo promedio ponderado. Un retiro conserva el costo vigente. Ninguna transacción permite inventario negativo.

Un conteo físico captura la cantidad observada y la diferencia respecto al sistema. El ajuste se aplica únicamente cuando un responsable lo aprueba.

## Compatibilidad y migración

Los productos existentes continúan teniendo `stock`. El almacén principal usa ese valor como semilla cuando todavía no existe `inventoryStocks`. Las nuevas recepciones y retiros del almacén principal actualizan ambos modelos para mantener compatibilidad.

La separación completa de ventas por almacén todavía requiere migrar el checkout para reservar y descontar `inventoryStocks` en vez del campo legacy. Esa migración debe ejecutarse después de validar datos históricos y reglas de costo.

## Producción

Antes de activar consultas por almacén se deben desplegar los índices:

```bash
firebase deploy --only firestore:indexes
```

## Límites conocidos

- El API de compras aún actualiza principalmente el stock legacy; debe migrarse para recibir directamente en un almacén y actualizar costos.
- El checkout de ventas todavía consume `products.stock`; el almacén principal queda sincronizado, pero las ventas de otros almacenes requieren la siguiente integración.
- El conteo implementado es por producto; un documento de conteo masivo y hojas de conteo pertenecen a una mejora posterior.
- No existe todavía costeo FIFO o por lote, números de serie, caducidad ni valoración contable completa.
