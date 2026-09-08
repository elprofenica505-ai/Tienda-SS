# Etapas 3 y 4 — Crédito v1 y panel dueño

## Crédito / fiado v1

Los clientes viven bajo `tenants/{tenantId}/customers/{customerId}` y conservan `creditLimit` y `creditBalance`. El alta y edición se puede hacer desde Contactos; Caja selecciona un cliente al usar Crédito.

El crédito se mantiene **plano en v1**, sin intereses ni cargos por plazo. Una venta de crédito valida `creditBalance + total <= creditLimit`. Owner y admin pueden enviar un override explícito en una operación autorizada. Las ventas aprobadas guardan `paidAmount: 0`, `balanceDue`, `paymentStatus: pending` y vencimiento simple a 30 días.

Cada cargo y abono crea un documento en `creditMovements`. Los abonos de `/api/receivables` actualizan simultáneamente la venta, el saldo agregado del cliente y la cartera. El resumen expone `balance`, `collected` y `overdue`.

## Panel dueño y reportes

El dashboard usa `stats/daily/days/{fecha}` para ventas del día y carga preventas mediante un listado inicial limitado. El catálogo y contactos conservan carga inicial con `get()`, sin listeners de tiempo real. Los reportes existentes soportan rangos, exportación CSV, métodos de pago y productos; las ventas se consultan con límite/paginación en los endpoints operativos.

## Alcance validado

- Alta rápida de cliente con límite de crédito.
- Crédito desde caja con cliente obligatorio.
- Bloqueo por límite y override de owner/admin.
- Abonos con quién cobró, fecha, método y movimiento de cartera.
- Saldo total por cliente y vencimiento simple.
- Panel de contactos muestra saldo y límite.
- Dashboard conserva lectura diaria desde estadísticas y enlaza cartera/caja.

El interés o cargo por plazo queda explícitamente fuera de v1 y se reserva para v1.1.
