# Aislamiento multi-tenant y legacy

## Tenant verificado

Las rutas de negocio nuevas usan `requireTenantMember` o `requireTenantPermission`. El encabezado `x-tenant-id` únicamente selecciona el tenant candidato; el servidor verifica el token Firebase, la membresía activa, el rol, el estado de la plataforma, la política de sesión y los permisos antes de devolver un `TenantContext`.

El contexto devuelto usa el `tenantId` registrado en la membresía cuando está presente y rechaza una inconsistencia entre el documento de membresía y la ruta solicitada. Ninguna ruta nueva confía en un identificador enviado por el cliente sin esa verificación.

## Firestore Rules

Las reglas requieren una membresía activa bajo `tenants/{tenantId}/members/{uid}` para leer datos. Las colecciones de negocio se encuentran dentro de `tenants/{tenantId}/...`; el fallback global deniega cualquier colección raíz no declarada. Las estadísticas diarias tienen reglas explícitas de lectura por membresía y escrituras client-side bloqueadas, porque solo las actualiza el servidor durante el registro de una venta.

Un miembro de tenant A no puede leer, escribir ni borrar documentos de tenant B. La suite de reglas verifica además el aislamiento de `stats/daily` y el bloqueo de escrituras directas.

## Legacy global

El dashboard `/dashboard`, que dependía de colecciones raíz como `productos`, `ventas`, `compras`, `creditos` y `orders`, ya no es un flujo productivo: redirige al workspace multi-tenant `/workspace`. La UI comercial y las rutas API utilizadas por los clientes reales operan sobre `tenants/{tenantId}/...`.

Los componentes legacy se mantienen temporalmente en el repositorio por compatibilidad y migración, pero no son alcanzables desde la navegación productiva. No se copian sus datos globales a tenants nuevos.

## Alta de empresas

El alta únicamente crea:

1. El documento `tenants/{uid}`.
2. La membresía `tenants/{uid}/members/{uid}` con rol `owner`.

El catálogo, categorías, clientes, ventas y demás colecciones empiezan vacíos. El onboarding lo comunica explícitamente y no existe una rutina de seed de datos de prueba.
