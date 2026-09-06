# Plan de pruebas de aislamiento multi-tenant en Firestore

## Objetivo

Demostrar automáticamente que un usuario autenticado solo puede acceder a los datos del tenant donde tiene una membresía activa, y que sus permisos de rol se aplican dentro de ese límite. La suite usa el emulador de Firestore y `@firebase/rules-unit-testing`, por lo que no modifica datos de producción.

## Reglas del escenario

La suite crea dos empresas de prueba:

| Identidad | Tenant | Rol | Estado |
|---|---|---|---|
| `owner-a` | `tenant-a` | `owner` | active |
| `seller-a` | `tenant-a` | `vendedor` | active |
| `warehouse-a` | `tenant-a` | `bodega` | active |
| `inactive-a` | `tenant-a` | `admin` | inactive |
| `owner-b` | `tenant-b` | `owner` | active |

Los documentos sembrados pertenecen de forma explícita a `tenant-a` o `tenant-b`. El código de la prueba usa el SDK administrativo del emulador únicamente para preparar el escenario; los asserts se ejecutan con contextos autenticados normales.

## Matriz de casos

| ID | Caso | Resultado esperado |
|---|---|---|
| ISO-01 | Usuario no autenticado lee un documento | Denegado |
| ISO-02 | Miembro activo lee su propio tenant | Permitido |
| ISO-03 | Owner A lee datos de Tenant B | Denegado |
| ISO-04 | Owner A escribe, actualiza o elimina en Tenant B | Denegado |
| ISO-05 | Miembro inactivo intenta acceder | Denegado |
| RBAC-01 | Bodega crea producto propio | Permitido |
| RBAC-02 | Vendedor crea producto | Denegado |
| RBAC-03 | Owner actualiza producto propio | Permitido |
| RBAC-04 | Vendedor elimina producto | Denegado |
| RBAC-05 | Vendedor crea venta propia | Permitido |
| RBAC-06 | Vendedor crea venta en otro tenant | Denegado |
| RBAC-07 | Owner gestiona miembros propios | Permitido |
| RBAC-08 | Vendedor gestiona miembros | Denegado |
| GLOBAL-01 | Usuario accede a colección legacy global | Denegado |
| GLOBAL-02 | Usuario accede a colección global `platformAudit` | Denegado para usuarios de tenant |
| SCHEMA-01 | Usuario accede a colección no declarada dentro de su tenant | Denegado |
| PATH-01 | Usuario intenta escribir usando la ruta de otro tenant | Denegado |

## Criterios de aprobación

La suite se aprueba únicamente si todos los asserts terminan correctamente. Un solo caso permitido de forma inesperada bloquea el merge. El caso `SCHEMA-01` es obligatorio porque evita que una colección nueva quede protegida accidentalmente por una regla demasiado amplia.

## Ejecución

Instalar las dependencias de desarrollo:

```bash
npm install
```

Ejecutar la suite mediante el emulador:

```bash
npm run test:rules
```

Iniciar el emulador para inspección manual:

```bash
npm run emulators:start
```

La interfaz local del emulador queda en `http://127.0.0.1:4000` cuando Firebase CLI está instalado.

## Revisión obligatoria cuando se agrega una colección

Antes de crear una nueva colección en la aplicación, se debe:

1. Añadir una regla explícita en `firestore.rules`.
2. Definir qué roles pueden leer, crear, actualizar y eliminar.
3. Añadir al menos un caso permitido y uno denegado.
4. Añadir una prueba de acceso cruzado con el segundo tenant.
5. Ejecutar `npm run test:rules`.
6. Revisar el diff de las reglas antes de hacer commit.

## Limitaciones conocidas

Las reglas de Firestore autorizan o deniegan operaciones de datos. No pueden verificar por sí solas toda la lógica de negocio de una API que usa Firebase Admin SDK, porque Admin SDK omite las reglas. Por eso esta suite debe complementarse con pruebas de las rutas API, especialmente para inventario, ventas, facturación, webhooks y superadmin.

También se deben agregar pruebas de consultas de colección una vez confirmados los índices requeridos. Firestore evalúa las consultas contra las reglas, por lo que una consulta que pueda devolver documentos no autorizados debe fallar completa, no filtrar silenciosamente documento por documento.

## Resultado esperado de seguridad

El modelo se considera aislado cuando:

- Ningún usuario anónimo accede a datos.
- Ningún miembro activo cruza el `tenantId`.
- Ningún miembro inactivo conserva acceso.
- Ningún rol ejecuta una operación superior a sus permisos.
- Las colecciones globales permanecen cerradas para usuarios de tenant.
- Las colecciones nuevas no quedan abiertas por una regla comodín.
- Las pruebas de reglas y las pruebas de APIs pasan en cada cambio.
