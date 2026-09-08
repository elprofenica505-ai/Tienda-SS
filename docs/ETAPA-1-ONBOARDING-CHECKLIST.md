# Etapa 1 — Onboarding del dueño

## Estado

| Estado | Control | Evidencia |
|---|---|---|
| [x] | Crear empresa | `POST /api/tenants` crea `tenants/{uid}` y `members/{uid}` con rol `owner`, plan `starter` y `onboardingCompleted: false`. |
| [x] | Entrada al tenant correcto | El registro dirige al login verificado y el login dirige a `/onboarding`; `TenantProvider` resuelve membresías activas bajo el tenant autenticado. |
| [x] | Wizard corto en español | `/onboarding` tiene cuatro pasos: negocio, invitación opcional, producto y primera venta. |
| [x] | Invitar empleado | El wizard y `/workspace/members` usan `POST /api/invitations`; el owner selecciona correo y rol sin crear contraseñas ajenas. |
| [x] | Aceptar invitación | `/accept-invitation?token=…` valida el token, crea la cuenta cuando corresponde y activa `tenants/{tenantId}/members/{uid}` mediante transacción. |
| [x] | Desactivar sin borrar historial | `/api/members` cambia el estado a `disabled` y conserva el documento, historial y auditoría. |
| [x] | Límites free/pro | Starter limita miembros y productos; Growth amplía ambos. Backend responde con mensaje de upgrade y HTTP 402 mediante `tenantErrorResponse`. |

## Recorrido validado

El dueño registra nombre, nombre personal, correo y contraseña. El backend crea exclusivamente el tenant y la membresía owner; no crea datos globales ni datos operativos de demo. Después de verificar el correo, el usuario entra al wizard, confirma el nombre de la empresa, puede invitar a un vendedor, cajero, bodega o chofer, agrega el primer producto o salta ese paso y llega al acceso de primera venta.

El empleado recibe un enlace con expiración de siete días. Al aceptarlo crea su propia contraseña y queda activo en el tenant indicado. Si ya tenía cuenta, debe iniciar sesión con el correo invitado y volver a abrir el enlace; la API no permite aceptar una invitación con otra identidad.

## Validaciones

```bash
npm run typecheck
npm run lint
npm test
npm run test:rules
npm run build
```

La prueba específica `tests/stage1-onboarding.test.ts` verifica el número máximo de pasos, las rutas de invitación, la creación limpia de tenant y los límites Starter/Growth.
