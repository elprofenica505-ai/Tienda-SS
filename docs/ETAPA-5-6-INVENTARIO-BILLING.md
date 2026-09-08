# Etapas 5 y 6 — Inventario real y cobro SaaS

## Inventario y compras

El inventario conserva catálogo multi-tenant, paginación bajo demanda de 25 elementos y ajustes transaccionales con `previousStock`, `newStock`, `delta`, actor, motivo y timestamp. Las compras se registran en `tenants/{tenantId}/purchases/{purchaseId}` con proveedor, líneas, costo unitario, total, referencia de comprobante y estado `confirmed`.

Al confirmar una compra, una transacción actualiza cada producto, crea el movimiento `purchase` y persiste la compra. Si algún producto no existe o está archivado, la transacción falla completa. Esto mantiene la regla: el stock entra por compra y sale por venta cobrada.

Bodega y Compras usan los permisos existentes de inventario. Los productos siguen ocultando costo a roles no autorizados.

## Entregas

La logística de esta etapa es deliberadamente simple. `tenants/{tenantId}/deliveries/{deliveryId}` enlaza una venta, cliente, dirección, chofer y estado `pending` o `delivered`. El chofer solo consulta y actualiza sus propias entregas; despachador y roles de supervisión pueden operar el módulo. No se implementan rutas GPS.

## Cobro SaaS

Stripe ya dispone de checkout de suscripción, portal de cliente, idempotencia de checkout y webhook para sincronizar estado y plan del tenant. La guardia de tenant suspende acceso cuando `platformStatus` es `suspended`; la guardia de operaciones restringe escrituras cuando la suscripción está `past_due`, `canceled`, `unpaid` o `incomplete_expired`, devolviendo un mensaje accionable hacia Billing.

Billing ahora muestra al owner el plan, sus límites y el uso actual de miembros activos y productos activos. Superadmin conserva listado de tenants, suspensión/activación y cambio de plan sin mezclar datos comerciales.
