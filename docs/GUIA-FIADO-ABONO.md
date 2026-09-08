# Cómo registrar un fiado y un abono

## Registrar al cliente

Abre **Clientes**, crea el cliente y define su **Límite de crédito**. El saldo inicial es cero. El límite expresa el máximo que puede deber sin autorización especial.

## Registrar el fiado

En **Caja**, agrega los productos y selecciona **Crédito**. Elige el cliente antes de cobrar. El sistema valida que saldo actual más la nueva venta no supere el límite. Si se excede, únicamente el owner o admin puede autorizar un override explícito.

La venta queda con `paymentStatus: pending`, `balanceDue` y vencimiento simple de 30 días. El stock se descuenta al confirmar el cobro, igual que en efectivo o tarjeta.

## Registrar un abono

Abre **Cuentas por cobrar**, busca la venta o el cliente, introduce el monto y confirma el abono. El sistema actualiza en conjunto el saldo de la venta, el saldo agregado del cliente y el movimiento de cartera con quién cobró, fecha y método.

## Revisar vencidos

La cartera muestra el saldo total, lo cobrado y el monto vencido. Contacta al cliente antes de autorizar nuevas ventas. El producto usa saldo plano en v1; no calcula intereses ni cargos por plazo.

> No borres una venta para corregir un fiado. Usa un abono, devolución o el flujo de anulación autorizado para conservar historial y auditoría.
