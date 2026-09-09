# Etapa 2 — Caja profesional

**Rama:** `SaaS-MultiTenant-Profesional`  
**Estado:** implementada y validada en código; requiere desplegar índices antes de usarla en producción.

## Capacidades implementadas

- Una sesión de caja por caja y sucursal activa.
- Apertura con fondo inicial separado por efectivo, tarjeta y transferencia.
- Asociación de ventas directas y cobros de preventas a la sesión abierta.
- Bloqueo de cobros de contado cuando no existe un turno abierto.
- Entradas y retiros extraordinarios con descripción, método, usuario y fecha.
- Arqueo por método de pago.
- Cálculo del efectivo esperado a partir del fondo inicial, cobros y movimientos.
- Diferencia firmada: sobrante positivo, faltante negativo.
- Estado `pending_review` después del arqueo.
- Cierre normal cuando no existe diferencia.
- Aprobación y cierre de diferencias por owner, admin, gerente o jefe.
- Historial de sesiones por sucursal.
- Auditoría inmutable para apertura, movimientos, arqueo, cierre y aprobación.
- Selector de caja y sucursal activa en la interfaz.

## Estados

| Estado | Significado |
|---|---|
| `open` | El cajero puede cobrar y registrar movimientos. |
| `pending_review` | El turno fue contado y espera cierre o aprobación. |
| `closed` | El turno está cerrado y no se modifica. |

## Flujo operativo

1. El cajero selecciona una caja y registra el fondo inicial.
2. El sistema abre el turno en la sucursal activa.
3. Las ventas de contado y cobros de preventas quedan ligadas a `cashSessionId`.
4. Los retiros y entradas se registran como movimientos independientes; no se borran.
5. Al terminar, el cajero registra el conteo por método.
6. El sistema calcula el esperado, el contado y la diferencia.
7. Sin diferencia, el turno se puede cerrar.
8. Con diferencia, un responsable debe aprobarla antes del cierre.

## Índices y despliegue

Antes de activar esta etapa en producción:

```bash
firebase deploy --only firestore:indexes
```

Se requieren índices para `cashSessions` por sucursal/estado/fecha y para consultar ventas y movimientos por `cashSessionId`.

## Límites conocidos

- La caja controla métodos `cash`, `card` y `transfer`; las ventas a crédito actualizan cartera, pero no representan efectivo recibido.
- La aprobación no registra todavía un catálogo formal de motivos de diferencia ni adjuntos de evidencia.
- No hay conciliación bancaria de tarjeta o transferencia.
- No hay impresión fiscal electrónica; el comprobante continúa dependiendo del adaptador fiscal pendiente.
- Los gastos creados desde rutas antiguas aún deben migrarse completamente al flujo de sesión para que afecten el esperado de caja.
- El despliegue real de índices y la validación E2E con Firebase corresponden al checklist de producción.
