# Migración de stock legacy a inventario por almacén

## Propósito

Este procedimiento convierte el stock global legacy almacenado en `products.stock` en registros canónicos de `inventoryStocks` para el almacén principal (`warehouse-main`). La migración no elimina ni modifica el campo legacy. Su objetivo es preparar la transición gradual hacia inventario multi-almacén sin perder información existente.

## Alcance

La migración procesa únicamente los productos de los tenants seleccionados y únicamente el almacén `warehouse-main`. No inventa existencias para otros almacenes. No modifica registros de `inventoryStocks` que ya existan. Las diferencias entre ambas fuentes se reportan para revisión y no se corrigen automáticamente.

## Requisitos previos

Antes de ejecutar el procedimiento se debe confirmar el proyecto Firebase, el entorno —development, staging o production—, el `tenantId`, la existencia del almacén principal y un backup reciente. La cuenta de servicio debe tener permisos de lectura y escritura en Firestore cuando se vaya a aplicar la migración. Las credenciales no deben guardarse en Git ni copiarse en reportes.

## Paso 1: dry-run

El primer paso es siempre una ejecución de solo lectura:

```bash
npm run migrate:inventory-stocks -- \
  --tenant-id=TENANT_ID \
  --report=reports/inventory-stocks-dry-run.json
```

El reporte debe conservarse como evidencia de la ejecución. Incluye los productos revisados, las creaciones planificadas, los registros canónicos ya existentes, las diferencias y las advertencias.

El dry-run no ejecuta `batch.commit()` y no escribe documentos en Firestore.

## Paso 2: revisión del reporte

La aplicación solo puede continuar si el `tenantId` y el proyecto Firebase son correctos, el almacén principal tiene un `branchId` válido, el número de productos coincide con el esperado y las diferencias fueron revisadas. Un número inesperado de diferencias debe detener el procedimiento.

Las diferencias tienen esta forma conceptual:

```json
{
  "tenantId": "empresa-a",
  "productId": "producto-1",
  "warehouseId": "warehouse-main",
  "productStock": 100,
  "canonicalStock": 92,
  "difference": 8
}
```

El script no decide cuál valor es correcto. Esa decisión requiere evidencia del negocio o una reconciliación adicional.

## Paso 3: backup

Antes de aplicar cambios se debe verificar que exista un backup reciente y recuperable. El procedimiento operativo configurado para el repositorio es:

```bash
npm run backup:firestore
```

La ejecución del backup debe registrar proyecto, fecha UTC, destino y resultado. Si el backup falla o es antiguo, la migración debe detenerse.

## Paso 4: aplicación controlada

Después de revisar el reporte y confirmar el backup, se puede ejecutar:

```bash
npm run migrate:inventory-stocks -- \
  --tenant-id=TENANT_ID \
  --apply \
  --confirm=MIGRATE_INVENTORY_STOCKS \
  --report=reports/inventory-stocks-apply.json
```

La confirmación exacta es obligatoria. El script crea documentos con `batch.create`, por lo que una segunda ejecución no debe sobrescribir documentos canónicos existentes. Si una escritura falla, se debe conservar el reporte y revisar el estado antes de reintentar.

## Datos creados

Cada registro creado en `inventoryStocks` contiene `warehouseId`, `branchId`, `productId`, `quantity`, `averageCost`, `migratedFrom`, `migration`, `createdAt` y `updatedAt`. La cantidad inicial proviene de `products.stock`. El costo promedio proviene de `products.averageCost` cuando existe; de lo contrario se inicializa en cero.

## Verificación posterior

Después de aplicar la migración se debe ejecutar un nuevo dry-run. El resultado esperado es que los registros creados aparezcan como existentes y que no se planifiquen nuevas creaciones. Las diferencias no deben aumentar sin una explicación documentada.

También se deben verificar manualmente, como mínimo, un producto con stock positivo, un producto con stock cero, un producto de servicio y un producto que ya tenía `inventoryStocks`. La operación de compra, venta y devolución debe probarse en staging antes de promover cambios.

## Límites conocidos

La migración no resuelve diferencias entre `products.stock` e `inventoryStocks`. Tampoco migra ventas históricas, reservas históricas, costos contables, lotes, series o stock inicial de almacenes secundarios. Esos procesos requieren tareas separadas y evidencia propia.

## Evidencia y autorización

La ejecución de dry-run es una operación de lectura. La ejecución con `--apply` es una operación de escritura sobre Firestore y debe estar autorizada para el entorno seleccionado. El reporte de cada ejecución debe asociarse al tenant, proyecto, commit, operador, fecha UTC y resultado.
