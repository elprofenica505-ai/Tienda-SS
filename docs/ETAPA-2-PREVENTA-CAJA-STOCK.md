# Etapa 2 — Preventa → Caja → Stock

## Regla operativa

La preventa **no descuenta inventario**. El stock baja una sola vez, dentro de la transacción de `POST /api/presales/checkout`, cuando caja cobra un ticket en estado `sent_to_cashier`. La misma transacción crea `tenants/{tenantId}/sales/{saleId}`, actualiza `presales/{presaleId}` a `paid`, crea el movimiento de inventario y actualiza `stats/daily/days/{fecha}`.

Si el ticket ya está `paid`, el checkout devuelve la venta existente sin ejecutar un segundo descuento. Si el stock es insuficiente, la transacción se rechaza y no se crea la venta.

## Recorrido

El vendedor entra a `/workspace/presales`, busca por nombre o SKU, agrega cantidades, puede adjuntar una referencia liviana de cámara/galería y pulsa **Enviar a caja**. El backend crea un código `P-YYYYMMDD-XXXXXX`, guarda líneas con producto, nombre, SKU, cantidad, precio y total, registra `vendedorUid` y deja el estado `sent_to_cashier`.

El cajero entra a `/workspace/cashier`, escribe o escanea el código del ticket, revisa todos los artículos, selecciona efectivo, tarjeta o crédito y cobra. Crédito exige un cliente guardado. El endpoint valida el tenant desde la sesión y el encabezado, por lo que un ticket de otra empresa no es localizable ni cobrable.

## Evidencia técnica

- `app/api/presales/route.ts`: creación, búsqueda por código, estados y paginación de 20 elementos.
- `app/api/presales/checkout/route.ts`: cobro atómico, stock, venta, estadísticas, fiscalidad e idempotencia por estado.
- `app/workspace/presales/page.tsx`: panel vendedor.
- `app/workspace/cashier/page.tsx`: panel caja.
- `firestore.rules`: aislamiento de la subcolección `presales` y prohibición de borrar documentos.
- `tests/stage2-presales.test.ts`: contrato automatizado del flujo.

## Validación local

```bash
npm run typecheck
npm run lint
npm test
npm run test:rules
npm run build
```

El escenario manual de staging es: crear producto con stock `N`, vendedor crea preventa de cantidad `Q`, envía el código a caja, cajero cobra y se verifica que el producto termina con `N-Q`, existe una venta enlazada por `presaleId`, la preventa queda `paid` y existe un movimiento de tipo `sale`.
