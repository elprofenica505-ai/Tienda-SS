# Guía de API: matriz de roles y permisos

## Resumen

La API de Tienda-SS utiliza autorización multi-tenant. Cada solicitud protegida debe demostrar tres condiciones: el usuario tiene un token Firebase válido, identifica la empresa mediante `x-tenant-id` y posee una membresía activa en esa empresa. Después, la ruta aplica el permiso correspondiente a su módulo y acción.

> La autorización no se basa únicamente en el rol enviado por el cliente. El servidor obtiene la membresía desde `tenants/{tenantId}/members/{uid}` y valida el rol almacenado allí.

La capa global de API bloquea solicitudes sin autenticación o tenant. La validación final de permisos se realiza en los handlers mediante `requireTenantPermission`, que combina el rol y la configuración personalizada guardada en `tenants/{tenantId}/settings/permissions`.

## Autenticación y headers

Las rutas protegidas requieren un token ID de Firebase en el header `Authorization` y el identificador simple de la empresa en `x-tenant-id`.

```http
Authorization: Bearer <FIREBASE_ID_TOKEN>
x-tenant-id: <TENANT_ID>
Content-Type: application/json
```

El `TENANT_ID` debe contener entre 1 y 128 caracteres y utilizar únicamente letras, números, guion bajo o guion medio, comenzando por un carácter alfanumérico.

| Respuesta | Significado |
|---|---|
| `401` | Falta el token Bearer o la autenticación no es válida. |
| `400` | Falta `x-tenant-id` o el identificador de empresa no es válido. |
| `403` | El usuario no tiene membresía activa, el tenant está suspendido o el rol no posee el permiso. |
| `500` | Error interno no relacionado con la autorización normal. |

## Roles principales

La matriz principal contiene once roles. `jefe` permanece reconocido únicamente como compatibilidad con datos legacy; no forma parte de la matriz recomendada para nuevas asignaciones.

| Identificador | Nombre | Propósito |
|---|---|---|
| `owner` | Owner | Propietario de la empresa; acceso total y no restringible desde la matriz. |
| `admin` | Admin | Administración integral de la operación y configuración. |
| `gerente` | Gerente | Gestión integral de la operación, equipos, finanzas y reportes. |
| `supervisor_sucursal` | Supervisor de Sucursal | Supervisión operativa de una sucursal, incluyendo personal operativo y resultados. |
| `vendedor` | Vendedor | Ventas, clientes, cobros autorizados y consulta de catálogo. |
| `cajero` | Cajero | POS, caja, clientes y cuentas por cobrar. |
| `bodega` | Bodega | Productos, inventario y movimientos de almacén. |
| `compras` | Compras | Catálogo, inventario, proveedores y gastos relacionados con adquisiciones. |
| `chofer` | Chofer | Consulta operativa de pedidos, catálogo, inventario y contactos. |
| `despachador` | Despachador | Preparación de pedidos, inventario y actualización de ventas u órdenes. |
| `solo_lectura` | Solo Lectura | Consulta y exportación; no crea, edita ni elimina información. |

## Módulos y acciones

Los permisos se expresan como una combinación de módulo y acción.

| Módulo | Identificador | Acciones |
|---|---|---|
| Resumen | `dashboard` | `view`, `export` |
| Catálogo | `catalog` | `view`, `create`, `edit`, `delete`, `export` |
| Inventario | `inventory` | `view`, `create`, `edit`, `delete`, `export` |
| Ventas / POS | `sales` | `view`, `create`, `edit`, `delete`, `export` |
| Clientes y proveedores | `contacts` | `view`, `create`, `edit`, `delete`, `export` |
| Cuentas por cobrar | `receivables` | `view`, `create`, `edit`, `delete`, `export` |
| Gastos y flujo de caja | `finance` | `view`, `create`, `edit`, `delete`, `export` |
| Reportes | `reports` | `view`, `create`, `edit`, `delete`, `export` |
| Usuarios y roles | `members` | `view`, `create`, `edit`, `delete`, `export` |

## Matriz predeterminada resumida

La siguiente tabla resume los accesos principales por rol. Los permisos pueden ajustarse por tenant para todos los roles editables, excepto `owner`.

| Rol | Acceso operativo principal | Restricciones destacadas |
|---|---|---|
| `owner` | Todos los módulos y acciones. | No se puede restringir desde `/api/permissions`. |
| `admin` | Todos los módulos y acciones. | El acceso depende de pertenecer al tenant correcto. |
| `gerente` | Todos los módulos y acciones. | Puede administrar configuración y miembros según el endpoint. |
| `supervisor_sucursal` | Dashboard, catálogo, inventario, ventas, contactos, cuentas por cobrar, finanzas, reportes y miembros operativos. | No elimina miembros ni administra roles administrativos o de propietario. |
| `vendedor` | Consulta de catálogo e inventario; creación, edición y consulta de ventas; clientes; cobros; reportes. | Sin acceso a finanzas, miembros o administración. |
| `cajero` | POS, ventas, clientes, cuentas por cobrar, caja y reportes. | No crea ni edita productos; no administra miembros. |
| `bodega` | Catálogo, inventario, movimientos y consulta de contactos. | Sin ventas, finanzas ni miembros. |
| `compras` | Catálogo, inventario, proveedores, finanzas y reportes. | Sin administración de miembros ni cuentas por cobrar. |
| `chofer` | Consulta de dashboard, catálogo, inventario, ventas y contactos. | No crea ni modifica operaciones financieras o administrativas. |
| `despachador` | Inventario, ventas, pedidos, catálogo, contactos y reportes. | Sin finanzas ni miembros. |
| `solo_lectura` | Consulta y exportación de todos los módulos operativos. | No crea, edita ni elimina información. |

## Endpoints principales

La política global de API cubre las siguientes rutas. El módulo indicado es la base para resolver el permiso requerido; el método HTTP se traduce normalmente a la acción correspondiente.

| Endpoint | Métodos | Módulo base | Uso |
|---|---|---|---|
| `/api/catalog` | `GET`, `POST`, `PATCH`, `DELETE` | `catalog` | Catálogo de productos y categorías. |
| `/api/inventory` | `GET`, `POST`, `PATCH`, `DELETE` | `catalog` / inventario operativo | Existencias y movimientos de inventario. |
| `/api/contacts` | `GET`, `POST`, `PATCH`, `DELETE` | `contacts` | Clientes y proveedores. |
| `/api/finance` | `GET`, `POST`, `PATCH`, `DELETE` | `finance` | Gastos y movimientos financieros. |
| `/api/members` | `GET`, `POST`, `PATCH`, `DELETE` | `members` | Miembros, roles y estado de acceso. |
| `/api/usuarios` | `GET`, `POST`, `PATCH`, `DELETE` | `members` | Alias de compatibilidad; delega en `/api/members` y no contiene autorización propia. |
| `/api/permissions` | `GET`, `PATCH` | `members` | Consultar y guardar la matriz configurable del tenant. |
| `/api/notifications` | `GET`, `PATCH` | `dashboard` | Notificaciones del espacio de trabajo. |
| `/api/receivables` | `GET`, `POST`, `PATCH`, `DELETE` | `receivables` | Cuentas por cobrar y pagos. |
| `/api/reports` | `GET` | `reports` | Reportes y exportaciones. |
| `/api/sales` | `GET`, `POST`, `PATCH`, `DELETE` | `sales` | Ventas y operaciones POS. |
| `/api/billing` | `GET`, `POST`, `PATCH` | `finance` | Estado y operaciones de facturación del tenant. |
| `/api/tenants/me` | `GET` | `dashboard` | Tenant activo y membresía del usuario. |

Las rutas de superadministración (`/api/superadmin/audit`, `/api/superadmin/metrics` y `/api/superadmin/tenants`) no utilizan la matriz de roles del tenant. Requieren autenticación de superadministrador mediante claim Firebase o `SUPERADMIN_UIDS`.

## Rutas públicas y excepciones

Estas rutas no utilizan la autorización de tenant normal:

| Endpoint | Método | Motivo |
|---|---|---|
| `/api/tenants` | `POST` | Alta inicial de una empresa y su propietario. |
| `/api/billing/webhook` | `POST` | Webhook de Stripe; debe validar su firma propia. |

`/api/members` es la implementación única para listar, crear, editar y deshabilitar miembros. `/api/usuarios` se conserva únicamente como alias legacy para no romper clientes antiguos; no debe recibir lógica nueva. Cualquier endpoint nuevo debe añadirse explícitamente a la política centralizada en `lib/api-policy.ts`. Si no está registrado, el middleware responde `403` para evitar que una ruta nueva quede expuesta accidentalmente.

## Configuración personalizada por tenant

Los permisos editables se guardan en:

```text
tenants/{tenantId}/settings/permissions
```

La estructura esperada es:

```json
{
  "roles": {
    "cajero": {
      "sales": {
        "view": true,
        "create": true,
        "edit": true,
        "delete": false,
        "export": false
      }
    }
  }
}
```

La API normaliza valores incompletos usando el permiso predeterminado del rol. Esto evita que una configuración parcial elimine accidentalmente todos los permisos no enviados.

### Consultar la matriz

```bash
curl -X GET "$APP_URL/api/permissions" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "x-tenant-id: $TENANT_ID"
```

### Actualizar permisos de Cajero

```bash
curl -X PATCH "$APP_URL/api/permissions" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "cajero",
    "permissions": {
      "sales": {
        "view": true,
        "create": true,
        "edit": true,
        "delete": false,
        "export": true
      }
    }
  }'
```

Solo `owner`, `admin` y `gerente` pueden modificar esta configuración mediante la API. El rol `owner` se devuelve con acceso total, pero no es editable.

## Ejemplo de llamada autorizada

```bash
curl -X POST "$APP_URL/api/sales" \
  -H "Authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "customer-123",
    "items": [],
    "paymentMethod": "cash"
  }'
```

El servidor valida el token, obtiene la membresía dentro del tenant y comprueba `sales.create`. Si el usuario es `solo_lectura`, la solicitud se rechaza aunque el cliente intente enviar otro rol en el body.

## Recomendaciones de implementación

Los clientes no deben guardar ni enviar el rol como fuente de autoridad. El frontend puede usarlo para mostrar u ocultar controles, pero la autorización real debe permanecer en el servidor y en las reglas de Firestore.

Cuando se agregue un endpoint, deben actualizarse conjuntamente `lib/api-policy.ts`, el handler, la matriz de permisos, las reglas de Firestore cuando correspondan y las pruebas de autorización. Las pruebas existentes cubren aislamiento multi-tenant, roles operativos, Supervisor de Sucursal, Cajero, Solo Lectura y migración de roles legacy.
