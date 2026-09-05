# Base multi-tenant

Esta rama introduce la base segura para convertir Tienda-SS en un SaaS multi-tenant.

## Modelo nuevo

```text
tenants/{tenantId}
tenants/{tenantId}/members/{uid}
tenants/{tenantId}/products/{productId}
tenants/{tenantId}/sales/{saleId}
```

El `tenantId` se identifica en el servidor mediante el encabezado `x-tenant-id` y se valida contra la membresía del usuario autenticado. El navegador no puede convertirse en miembro solo cambiando ese encabezado.

## Reglas

`firestore.rules` comienza con una política deny-by-default para rutas no reconocidas. Las colecciones nuevas bajo `tenants/{tenantId}` están restringidas a miembros activos. Las operaciones críticas deberán migrarse progresivamente a endpoints server-side y transacciones.

## Datos existentes

Esta fase no borra ni migra las colecciones antiguas (`productos`, `ventas`, `usuarios`, etc.). Permanecen intactas para evitar pérdida de datos. La migración se hará en una fase posterior, después de crear respaldos y probar con una copia de staging.

## Variables necesarias

```text
FIREBASE_SERVICE_ACCOUNT_KEY={JSON de la cuenta de servicio, solo servidor}
```

Nunca se debe subir el valor de esa variable a GitHub ni incluirlo en `NEXT_PUBLIC_*`.
