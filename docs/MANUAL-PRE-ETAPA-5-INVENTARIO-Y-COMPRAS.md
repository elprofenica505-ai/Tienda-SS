# Manual de preparación antes de la Etapa 5

**Producto:** Tienda-SS / ConexiaX  
**Rama obligatoria:** `SaaS-MultiTenant-Profesional`  
**Propósito:** preparar, verificar y cerrar correctamente la Etapa 4 antes de construir compras, proveedores y cuentas por pagar.

> **Decisión recomendada:** no iniciar la Etapa 5 como una etapa de producción hasta completar la integración de ventas y compras con existencias por almacén. La Etapa 4 ya creó el modelo `inventoryStocks`, pero el checkout todavía utiliza `products.stock` y la API de compras todavía actualiza principalmente el stock legacy. Avanzar sin resolver esta diferencia produciría dos fuentes de verdad para el inventario.

## 1. Resultado que debe lograrse

Antes de iniciar la Etapa 5, la empresa debe poder responder una pregunta sencilla: **¿cuántas unidades de cada producto existen en cada almacén, cuál es su costo y qué documento explica cada cambio?**

La respuesta debe provenir de `inventoryStocks`, `inventoryMovements`, `inventoryTransfers` e `inventoryCounts`. El campo `products.stock` debe quedar como compatibilidad temporal del almacén principal, no como la fuente de verdad para nuevas operaciones.

La siguiente tabla define el estado esperado.

| Área | Estado mínimo antes de Etapa 5 | Evidencia requerida |
|---|---|---|
| Organización | Cada sucursal tiene sus almacenes activos y correctamente relacionados. | Captura o exportación de `/workspace/organization`. |
| Existencias | Cada producto físico tiene existencia por almacén o una decisión documentada de inventario cero. | Reporte de conciliación. |
| Costos | Cada producto recibido tiene costo promedio válido. | Reporte de costo y movimientos de recepción. |
| Ventas | El POS descuenta del almacén seleccionado o existe una limitación explícita a almacén principal. | Prueba de venta con dos almacenes. |
| Compras | La recepción identifica almacén, costo unitario y documento de origen. | Prueba de recepción y movimiento. |
| Transferencias | Una transferencia cambia origen y destino en una sola transacción. | ID de transferencia y dos movimientos. |
| Conteos | Un conteo pendiente no altera existencias y uno aprobado sí las altera. | Documento `inventoryCounts` y auditoría. |
| Seguridad | Un usuario no puede operar un almacén de otra sucursal. | Prueba negativa por rol y sucursal. |
| Producción | Índices, backup y rollback están preparados. | Evidencia de despliegue y restauración de prueba. |

## 2. Qué no debe hacerse todavía

No se debe borrar `products.stock`. El POS existente todavía depende de ese campo en algunos flujos.

No se debe copiar manualmente el stock a `inventoryStocks` varias veces. Una segunda migración sin control duplicaría unidades y produciría costos incorrectos.

No se debe recibir una compra en el sistema sin indicar almacén y costo. Una recepción sin ubicación no puede alimentar correctamente el inventario multi-almacén.

No se deben corregir diferencias editando documentos directamente en Firestore. Toda corrección debe generar un movimiento, motivo, actor y auditoría.

No se debe desplegar la migración directamente sobre producción sin realizar primero una prueba con una copia o un tenant de staging.

## 3. Preparar el entorno de trabajo

Ejecuta estos comandos desde la copia local del repositorio. Debes permanecer en la rama actual y no crear ramas nuevas.

```bash
cd /home/ubuntu/Tienda-SS
git status --short --branch
git branch --show-current
git fetch origin SaaS-MultiTenant-Profesional
git log -1 --oneline
```

El resultado esperado es una rama limpia o con cambios previamente identificados:

```text
SaaS-MultiTenant-Profesional...origin/SaaS-MultiTenant-Profesional
```

Instala dependencias y ejecuta la validación base:

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npm test
```

Si cualquiera de estos comandos falla, corrige primero la causa. No continúes con migraciones ni con despliegues de índices mientras la base de código no esté estable.

## 4. Crear un respaldo antes de tocar datos

Antes de migrar existencias se debe crear un respaldo de Firestore. El repositorio incluye el comando:

```bash
npm run backup:firestore
```

Verifica que el respaldo genere archivos con fecha, tenant identificable y tamaño mayor que cero. Conserva el respaldo fuera del directorio temporal de trabajo. Registra lo siguiente en el acta de cambio:

| Dato | Valor que debes completar |
|---|---|
| Fecha y hora | Fecha local y UTC |
| Responsable | Nombre del operador |
| Entorno | Staging o producción |
| Tenant afectado | ID del tenant |
| Ruta del backup | Ruta exacta o ubicación segura |
| Tamaño | Tamaño de archivos generados |
| Prueba de lectura | Resultado de inspección |

El respaldo no se considera válido solamente porque el comando terminó sin error. Debes comprobar que sea legible y que contenga las colecciones esperadas: `tenants`, `products`, `sales`, `purchases`, `inventoryMovements`, `branches`, `warehouses` y `members`.

## 5. Confirmar la organización de cada tenant

Para cada tenant de prueba, abre la administración organizativa y verifica:

1. Existe al menos una sucursal activa.
2. Existe un almacén principal relacionado con la sucursal correcta.
3. El almacén tiene nombre y código únicos dentro del tenant.
4. Los usuarios operativos tienen asignadas las sucursales correctas.
5. Un usuario de bodega no puede seleccionar una sucursal que no tiene asignada.
6. Los almacenes inactivos no aparecen para operaciones nuevas.

En el tenant creado por el sistema se espera encontrar los identificadores iniciales:

```text
branch-main
warehouse-main
register-main
```

No asumas que todos los tenants históricos tienen estos documentos. Los tenants existentes deben revisarse y, si es necesario, pasar por la migración organizativa existente:

```bash
npm run migrate:organization
```

Ejecuta el script únicamente después de revisar el entorno y el respaldo. La migración debe ser idempotente: ejecutarla dos veces no debe crear sucursales ni almacenes duplicados.

## 6. Levantar el inventario actual antes de migrar

Debes crear una fotografía del inventario legacy antes de crear existencias por almacén. Como mínimo, registra por producto:

| Campo | Descripción |
|---|---|
| `productId` | Identificador estable del producto. |
| `sku` | Código comercial. |
| `name` | Nombre visible. |
| `itemType` | Debe excluir servicios del inventario físico. |
| `stock` | Existencia legacy actual. |
| `cost` | Costo legacy, si existe. |
| `averageCost` | Costo promedio nuevo, si existe. |
| `minStock` | Punto mínimo configurado. |
| `active` | Estado del producto. |

Clasifica cada producto en una de estas categorías:

| Categoría | Acción |
|---|---|
| Producto físico con stock válido | Migrar al almacén principal. |
| Producto físico con stock cero | Crear registro en cero o dejarlo explícitamente documentado. |
| Servicio | No crear existencia física. |
| Producto archivado | No incluir en nuevas operaciones; conservar historial. |
| Producto con costo desconocido | Bloquear recepción automática hasta definir costo. |
| Producto duplicado | Resolver antes de migrar. |

El repositorio actual todavía no incluye un comando dedicado de migración de `products.stock` a `inventoryStocks`. Por eso, **no debes improvisar un script temporal en producción**. La creación de ese script debe ser una tarea obligatoria de preparación si existen datos reales.

El script definitivo debe cumplir estas condiciones:

- Usar `tenantId`, `warehouseId` y `productId` como claves explícitas.
- Ser idempotente.
- No sumar dos veces el stock si ya existe el registro destino.
- Guardar `migrationId` y `migratedAt`.
- Crear un movimiento de tipo `migration_opening`.
- Conservar el valor original de `products.stock`.
- Generar un reporte de productos omitidos y errores.
- Ejecutarse primero en modo `dry-run`.

## 7. Definir la regla de migración

La regla recomendada para el primer corte es:

> El valor actual de `products.stock` se considera existencia inicial del `warehouse-main`, salvo que la empresa entregue una distribución física distinta por almacén.

La migración no debe inventar una distribución entre sucursales. Si el negocio conoce la distribución real, debe proporcionar una tabla como la siguiente:

| `productId` | `warehouseId` | `quantity` | `averageCost` | Evidencia |
|---|---|---:|---:|---|
| `prod-001` | `warehouse-main` | 100 | 25.50 | Conteo físico |
| `prod-001` | `warehouse-secondary` | 40 | 25.50 | Conteo físico |

La suma de cantidades por producto debe conciliar con el stock físico autorizado. Si la suma no coincide, la diferencia debe registrarse como ajuste de apertura con motivo, no ocultarse modificando el número inicial.

## 8. Desplegar los índices de Firestore

La Etapa 4 agregó el índice para consultar `inventoryStocks` por almacén y fecha de actualización. Despliégalo antes de activar operaciones en un entorno compartido:

```bash
firebase deploy --only firestore:indexes
```

Después del despliegue, verifica que no exista un índice en estado pendiente o error. Si el proyecto tiene varios entornos, confirma que el comando apunta al proyecto correcto antes de ejecutarlo.

La evidencia mínima debe incluir:

- Proyecto Firebase utilizado.
- Hora de despliegue.
- Resultado del comando.
- Índice creado o actualizado.
- Confirmación de que el entorno no es el proyecto equivocado.

## 9. Validar recepción y costo promedio

Usa un producto de prueba con una cantidad conocida. Ejecuta esta secuencia:

1. Registra 10 unidades a costo 100.
2. Confirma que el stock del almacén sea 10 y el costo promedio sea 100.
3. Registra 10 unidades a costo 140.
4. Confirma que el stock sea 20 y el costo promedio sea 120.
5. Registra una salida de 5 unidades.
6. Confirma que el stock sea 15 y el costo promedio siga siendo 120.
7. Verifica que existan movimientos separados para recepción y salida.
8. Verifica que cada movimiento tenga actor, fecha, almacén, producto, delta y motivo.

El sistema no debe aceptar una salida que deje el almacén en negativo. El rechazo debe ser transaccional: no debe quedar movimiento parcial ni cambio de costo incompleto.

## 10. Validar transferencias entre almacenes

Prepara dos almacenes de la misma sucursal y un producto con al menos 20 unidades en el origen.

Ejecuta la siguiente prueba:

1. Transfiere 5 unidades del origen al destino.
2. Confirma que el origen disminuya en 5.
3. Confirma que el destino aumente en 5.
4. Confirma que se cree un documento en `inventoryTransfers`.
5. Confirma que exista un movimiento `transfer_out`.
6. Confirma que exista un movimiento `transfer_in`.
7. Intenta transferir una cantidad superior al origen.
8. Confirma que ninguna de las dos existencias cambie.
9. Intenta transferir entre sucursales fuera del alcance del usuario.
10. Confirma que la API rechace la operación.

Esta prueba es un bloqueo de salida. Una transferencia que actualiza solo el origen o solo el destino destruye la confiabilidad del inventario.

## 11. Validar conteos físicos

Realiza una prueba con una existencia conocida de 20 unidades:

1. Envía un conteo físico de 17 unidades.
2. Confirma que el documento quede en `pending_review`.
3. Confirma que el stock siga en 20.
4. Aprueba el conteo con un rol autorizado.
5. Confirma que el stock cambie a 17.
6. Confirma que se cree un movimiento `count_adjustment` con delta `-3`.
7. Intenta aprobar el mismo conteo otra vez.
8. Confirma que no se aplique un segundo ajuste.
9. Intenta aprobar con un usuario sin permiso.
10. Confirma que la API responda con rechazo de autorización.

Los conteos de alto impacto deben conservar evidencia física según la política de la empresa. La aplicación actual registra motivo y actor, pero todavía no adjunta fotografía ni documento de conteo masivo.

## 12. Resolver la integración con ventas

Esta es la verificación más importante antes de Etapa 5.

El POS actual todavía descuenta `products.stock`. La compatibilidad funciona correctamente para `warehouse-main`, pero no demuestra que una venta desde otro almacén descuente la existencia correcta.

Antes de avanzar, debes decidir una de estas dos opciones:

| Opción | Uso | Recomendación |
|---|---|---|
| A. Operación limitada | Todas las ventas se realizan únicamente desde `warehouse-main`. | Aceptable solo para piloto controlado. |
| B. Integración completa | El POS recibe `warehouseId`, valida disponibilidad en `inventoryStocks` y descuenta ese almacén. | Recomendado para ERP multi-almacén. |

La opción B debe incluir reserva o bloqueo transaccional para evitar doble venta. También debe actualizar movimientos, caja, sucursal y auditoría en la misma operación.

La prueba de aceptación debe usar dos almacenes con existencias diferentes del mismo producto. Una venta en el almacén A no debe alterar el almacén B.

## 13. Resolver la integración con compras

La API de compras actual aumenta principalmente el stock legacy. Antes de construir la Etapa 5, la recepción debe conocer:

- Proveedor.
- Orden de compra, cuando exista.
- Sucursal.
- Almacén de recepción.
- Producto.
- Cantidad recibida.
- Costo unitario.
- Diferencia contra lo ordenado.
- Evidencia de recepción.
- Usuario responsable.

La recepción debe actualizar `inventoryStocks`, `averageCost` e `inventoryMovements`. La actualización de `products.stock` debe quedar limitada a la compatibilidad del almacén principal.

Si se implementa primero la Etapa 5 sin esta integración, se podrán crear órdenes de compra que no impacten correctamente el stock. Eso produciría compras aparentemente exitosas con inventario incorrecto.

## 14. Ejecutar pruebas de autorización

Cada rol debe probarse con una sucursal y un almacén dentro de su alcance, y luego con un recurso fuera de su alcance.

| Rol | Puede consultar | Puede operar | Debe quedar bloqueado |
|---|---|---|---|
| Owner | Todos los almacenes del tenant. | Todas las operaciones autorizadas. | Otro tenant. |
| Admin | Todos los almacenes del tenant. | Operaciones administrativas. | Otro tenant. |
| Jefe o gerente | Almacenes permitidos por política. | Ajustes y aprobaciones. | Recursos externos. |
| Bodega | Almacén de sus sucursales. | Recepción, salida, conteo y transferencia autorizada. | Otra sucursal y aprobación no permitida. |
| Vendedor | Consulta necesaria para vender. | No debe ajustar inventario manualmente. | Ajustes, costos y aprobación. |
| Cajero | Consulta operativa necesaria. | No debe cambiar costos ni existencias manualmente. | Conteos y transferencias no autorizadas. |

Ejecuta las pruebas automatizadas y revisa específicamente la nueva ruta:

```bash
npm run typecheck
npm run lint
node --import tsx --test tests/stage4-inventory.test.ts
```

La suite completa se ejecuta con:

```bash
npm test
```

## 15. Ejecutar pruebas de producción

Antes de considerar cerrada la preparación, ejecuta:

```bash
npm run build
npm run test:all
npm run check:production-env
```

Si el entorno no tiene Firebase Emulator configurado, documenta el bloqueo y ejecuta como mínimo:

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

La ausencia del test de reglas no debe ocultarse. Debe quedar registrada como riesgo operativo pendiente.

## 16. Plan de rollback

Si la migración produce diferencias, detén nuevas operaciones de inventario y conserva el backup original. No elimines documentos manualmente.

El rollback debe seguir este orden:

1. Desactivar temporalmente la operación multi-almacén en el frontend.
2. Bloquear nuevas recepciones, transferencias y conteos.
3. Exportar movimientos creados durante la ventana de cambio.
4. Comparar `inventoryStocks` contra la fotografía inicial.
5. Restaurar primero en staging.
6. Ejecutar conciliación de productos, ventas y compras.
7. Repetir en producción únicamente después de aprobar la prueba.
8. Mantener los movimientos de auditoría del incidente.

No se debe revertir stock editando directamente `products.stock` sin crear una explicación documental. Un rollback contable sin trazabilidad deja el sistema en un estado difícil de auditar.

## 17. Criterios de salida para iniciar Etapa 5

La Etapa 5 puede comenzar cuando todas las condiciones obligatorias estén en estado aprobado.

| Criterio | Obligatorio | Estado |
|---|---|---|
| Backup verificable creado. | Sí | Pendiente de ejecutar por el operador. |
| Índice `inventoryStocks` desplegado. | Sí | Pendiente de verificar en Firebase. |
| Almacenes relacionados con sucursales. | Sí | Debe verificarse por tenant. |
| Migración o conciliación de stock definida. | Sí | Requiere script idempotente o acta de excepción. |
| Costo promedio probado. | Sí | Debe existir evidencia de recepción. |
| Transferencia atómica probada. | Sí | Debe existir evidencia de origen y destino. |
| Conteo pendiente/aprobado probado. | Sí | Debe existir evidencia de ambos estados. |
| Ventas por almacén integradas. | Sí para ERP multi-almacén | Bloqueador actual. |
| Compras por almacén integradas. | Sí para Etapa 5 completa | Bloqueador recomendado. |
| Suite TypeScript, lint, build y tests aprobada. | Sí | Debe ejecutarse en el commit final. |
| Plan de rollback aprobado. | Sí | Debe estar disponible para el responsable. |

## 18. Acta de aprobación

Completa esta sección antes de iniciar la Etapa 5.

| Responsable | Fecha | Decisión | Observaciones |
|---|---|---|---|
|  |  | Aprobado / Bloqueado |  |

**Decisión técnica recomendada:** iniciar la Etapa 5 solamente después de completar la integración de recepción de compras con `inventoryStocks` y de definir la fuente de stock del POS. Si la empresa decide avanzar antes, debe aceptar formalmente que la operación queda limitada al almacén principal y que todavía no representa un ERP multi-almacén completo.

## Referencias

[1]: ./ETAPA-4-INVENTARIO-PROFESIONAL.md "Etapa 4 — Inventario profesional por almacén"
[2]: ./ROADMAP-ERP-SAAS-MULTITENANT-ALTO-NIVEL.md "Roadmap maestro para Tienda-SS / ConexiaX"
[3]: ./ETAPA-1-ORGANIZACION-MULTISUCURSAL.md "Etapa 1 — Organización multi-sucursal"
[4]: ./OPERATIONS-RUNBOOK.md "Runbook operativo de Tienda-SS"
