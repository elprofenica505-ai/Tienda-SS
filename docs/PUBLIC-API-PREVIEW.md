# API pública versionada — Preview

La integración pública de Tienda-SS usa el prefijo `/api/v1` y el contrato `2026-01`. Esta superficie está diseñada para integraciones de lectura y pruebas controladas. No debe considerarse una API fiscal de producción hasta completar revisión contractual, límites comerciales y pruebas de staging.

## Autenticación y aislamiento

Cada solicitud pública debe enviar `X-API-Key`. Las claves se guardan únicamente como hash dentro de `tenants/{tenantId}/apiKeys`; una clave no puede resolver otro tenant. La clave de texto plano se entrega una sola vez al crearla desde `POST /api/v1/keys` con sesión Firebase y permiso de administración.

| Método | Ruta | Resultado |
|---|---|---|
| `POST` | `/api/v1/keys` | Emite una clave de preview una sola vez. Requiere Bearer Firebase y `x-tenant-id`. |
| `GET` | `/api/v1/catalog` | Devuelve productos activos sin costo, secretos ni stock sensible. |
| `GET` | `/api/v1/sales?limit=50` | Devuelve un resumen paginado por límite de ventas recientes. |
| `POST` | `/api/v1/webhooks/preview` | Recibe un evento firmado e idempotente para validar integraciones. |

Las solicitudes públicas tienen límites distribuidos de 60 solicitudes por IP, 600 por tenant y 300 por endpoint durante una ventana de 60 segundos. Las respuestas de error no revelan la existencia de tenants ni claves.

## Webhooks firmados

El emisor y receptor comparten `PUBLIC_WEBHOOK_PREVIEW_SECRET` en el entorno de preview. La firma usa HMAC-SHA256 sobre `${timestamp}.${payload}` y se envía como:

```text
X-Webhook-Signature: t=1710000000,v1=hexadecimal
```

El receptor rechaza timestamps con más de cinco minutos de diferencia, firmas con longitud incorrecta y JSON inválido. `event.id` funciona como clave idempotente dentro del tenant y un reintento devuelve `duplicate: true` sin crear otro evento.

La versión de envelope es `2026-01`:

```json
{
  "id": "evt_123",
  "version": "2026-01",
  "type": "sale.created",
  "tenantId": "tenant_abc",
  "occurredAt": "2026-09-08T00:00:00.000Z",
  "data": { "saleId": "sale_123" }
}
```

## Compatibilidad y producción

Los consumidores deben tolerar campos adicionales, conservar el `id` de evento y reintentar respuestas `429` o `5xx` con backoff. La integración de facturación electrónica permanece como adaptador `preview-2026-01`; la habilitación fiscal productiva requiere validación tributaria local y contractual.
