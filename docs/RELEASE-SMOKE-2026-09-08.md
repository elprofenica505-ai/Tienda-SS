# Evidencia de release — 2026-09-08

## Resultado técnico local

| Control | Resultado | Evidencia |
|---|---|---|
| Typecheck | PASS | `npm run typecheck` |
| Lint | PASS | `npm run lint` sin warnings reportados |
| Build | PASS | `npm run build`; rutas `/api/catalog/import`, `/api/catalog/export`, `/api/v1/catalog`, `/api/v1/keys`, `/api/v1/sales` y `/api/v1/webhooks/preview` registradas |
| Tests unitarios/integración | PASS | `npm test`; 51 casos de autorización y 16 casos en el bloque final, incluidos fiscalidad, CSV y webhooks |
| Reglas Firestore | PASS | `npm run test:rules`; 16 casos de aislamiento y permisos |
| Prueba de carga base | PASS | 120 solicitudes, concurrency 20, 120/120 correctas, p50 53 ms, p95 539 ms, máximo 692 ms |
| Smoke HTTP | PASS | Servidor local de producción y `/api/health` respondieron dentro del umbral |

## Limitaciones de la evidencia

La ejecución E2E completa no quedó certificada en este sandbox porque el navegador administrado de Playwright no pudo descargarse desde el CDN por un fallo de red. Los escenarios autenticados también requieren `E2E_EMAIL`, `E2E_PASSWORD` y un Firebase de staging. El restore real, readiness contra Firestore/Stripe de producción y firma humana de release requieren acceso al entorno operativo y no se deben simular localmente.

## Firma requerida para promoción

| Rol | Nombre | Firma | Fecha UTC |
|---|---|---|---|
| Responsable técnico | Pendiente | Pendiente | Pendiente |
| Responsable de producto | Pendiente | Pendiente | Pendiente |
| Responsable fiscal Nicaragua | Pendiente | Pendiente | Pendiente |
| Operaciones/restore | Pendiente | Pendiente | Pendiente |
