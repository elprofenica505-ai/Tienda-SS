# Etapa 3 — Ventas, devoluciones, anulaciones y documentos comerciales

**Rama:** `SaaS-MultiTenant-Profesional`  
**Estado:** implementada y validada en código.

## Capacidades implementadas

- Devoluciones parciales o completas por línea.
- Control de cantidades ya devueltas para evitar duplicidad.
- Reposición de inventario mediante movimientos inmutables.
- Reembolso con efectivo, tarjeta o transferencia.
- Reembolso ligado a una sesión de caja abierta.
- Aplicación de devolución a crédito del cliente.
- Bloqueo de reembolso por encima de lo efectivamente pagado.
- Anulación de ventas no pagadas.
- Reposición de inventario al anular.
- Reversión de saldo de crédito pendiente al anular.
- Bloqueo de anulación para ventas con pagos registrados.
- Notas de crédito con monto máximo disponible.
- Notas de crédito aplicadas a cartera cuando la venta fue a crédito.
- Validación de sucursal activa en todas las operaciones.
- Auditoría inmutable de devolución, anulación y nota de crédito.
- Pantalla `/workspace/returns` para operar los tres flujos.

## Reglas de negocio

Una devolución no elimina la venta original. Crea un documento en `salesReturns`, actualiza cantidades devueltas, genera movimientos de inventario y, cuando corresponde, genera un movimiento de salida de caja o de cartera.

Una anulación solo se permite para documentos sin pagos registrados. Si la venta ya recibió dinero, se debe utilizar una devolución o nota de crédito, según el caso.

Una nota de crédito no supera el total disponible de la venta. Las ventas a crédito reducen el saldo de cartera del cliente y generan trazabilidad en `creditMovements`.

## Seguridad

Las colecciones `salesReturns` y `creditNotes` se pueden leer por miembros del tenant, pero no se pueden crear ni modificar directamente desde el cliente. Las escrituras pasan por las APIs protegidas y el Admin SDK.

## Límites conocidos

- La integración fiscal todavía es un adaptador preliminar; la nota de crédito fiscal electrónica requiere integración con el proveedor autorizado.
- No existe todavía flujo de aprobación multinivel para devoluciones de alto monto.
- Las devoluciones de tarjeta y transferencia registran el egreso operativo, pero no concilian con el banco o adquirente.
- Las ventas históricas sin `branchId` siguen siendo compatibles; no se deben declarar completamente aisladas hasta migrar datos legacy.
- La interfaz selecciona ventas recientes; la búsqueda avanzada por número, cliente y fecha pertenece a la etapa de productividad y reportes.
