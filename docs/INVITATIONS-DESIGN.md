# Diseño e implementación de invitaciones empresariales seguras

## Objetivo

Permitir que una empresa invite a un miembro sin crear cuentas manualmente ni confiar en datos enviados por el navegador. La invitación debe pertenecer a un solo tenant, expirar, poder revocarse, aceptar un único uso y dejar rastro auditable.

## Modelo de datos

La invitación vive en `tenants/{tenantId}/tenantInvitations/{invitationId}`.

| Campo | Propósito |
|---|---|
| `email` | Correo normalizado en minúsculas. |
| `role` | Rol asignable y validado contra la lista permitida. |
| `status` | `pending`, `accepted`, `revoked` o `expired` lógico al vencer. |
| `tokenHash` | SHA-256 del token; nunca se guarda el token en claro. |
| `expiresAt` | Siete días desde la creación o reenvío. |
| `createdBy` / `acceptedBy` / `revokedBy` | Trazabilidad de actores. |
| `createdAt` / `acceptedAt` / `revokedAt` / `lastSentAt` | Control temporal y auditoría. |
| `resendCount` | Número de reenvíos. |

## Flujo seguro

1. Un miembro autorizado solicita una invitación. El servidor normaliza el correo, valida el rol, comprueba capacidad del plan y evita duplicados.
2. El servidor genera 32 bytes aleatorios, entrega el token solo al canal de correo y guarda únicamente su hash SHA-256.
3. La consulta pública de aceptación solo devuelve correo, rol y vencimiento; nunca devuelve el hash ni el token.
4. La aceptación vuelve a buscar por hash y comprueba en servidor que el estado sea `pending` y que `expiresAt` no haya pasado.
5. Una transacción Firestore crea la membresía activa y cambia la invitación a `accepted`. Si dos solicitudes compiten, solo la primera puede completar la transición.
6. Revocar cambia el estado a `revoked`; reenviar reemplaza el hash anterior, renueva la fecha y deja inutilizable el enlace anterior.
7. Cada creación, aceptación, revocación y reenvío escribe un evento en `tenants/{tenantId}/auditLogs`.

## Superficie API

| Endpoint | Acceso | Operación |
|---|---|---|
| `GET /api/invitations` | `members.view` | Lista invitaciones sin tokens. |
| `POST /api/invitations` | `members.create` | Crea o reenvía (`action: resend`). |
| `DELETE /api/invitations` | `members.delete` | Revoca una pendiente. |
| `GET /api/invitations/accept?token=...` | Público con token | Previsualiza la invitación. |
| `POST /api/invitations/accept` | Público con token | Crea/valida la cuenta y acepta. |

## Controles incluidos

Se aplica una ventana de 20 operaciones por actor y tenant cada hora, cooldown de 60 segundos para reenvío, expiración de siete días, normalización de correo, prevención de invitación duplicada, protección de owner, control de roles administrativos y respuestas que no devuelven secretos. La suite automatizada cubre entropía/hash, expiración, cooldown, roles y política de rutas.

## Decisiones pendientes para una versión empresarial posterior

El límite actual por actor está en memoria del proceso; para múltiples instancias debe migrarse a un rate limiter distribuido. El envío de correo requiere `RESEND_API_KEY` y `RESEND_FROM`; sin esas variables la API crea la invitación y devuelve `delivery: not_configured`, permitiendo verificar el flujo antes de configurar el proveedor.
