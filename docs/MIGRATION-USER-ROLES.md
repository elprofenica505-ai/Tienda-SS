# Migración de roles de usuarios

El script `scripts/migrate-user-roles.ts` actualiza las asignaciones de roles de miembros multi-tenant y de la colección legacy `usuarios`.

## Mapeo por defecto

| Valor existente | Nuevo rol |
|---|---|
| `owner`, `admin`, `gerente`, `supervisor_sucursal`, `vendedor`, `cajero`, `bodega`, `compras`, `chofer`, `despachador`, `solo_lectura` | Se conserva sin cambios |
| `jefe`, `supervisor`, `supervisor de sucursal` | `gerente` o `supervisor_sucursal`, según el alias |
| `administrador`, `manager`, `propietario` | `admin`, `gerente` u `owner`, según el alias |
| `comprador`, `lectura`, `readonly` | `compras` o `solo_lectura` |
| Rol vacío o desconocido | `solo_lectura` como valor seguro |

Las asignaciones ya válidas no se sobrescriben. Las cuentas con rol `owner` nunca se degradan. Cada cambio registra `roleMigratedAt` y `roleMigrationSource`.

## Paso 1: simulación

Ejecuta primero un dry-run. No modifica Firestore y genera un informe JSON:

```bash
npm run migrate:user-roles -- --report=reports/migration-user-roles.json
```

Para limitarlo a una empresa concreta:

```bash
npm run migrate:user-roles -- --tenant-id=TENANT_ID --report=reports/migration-tenant.json
```

El script requiere `FIREBASE_SERVICE_ACCOUNT_KEY` configurada en el entorno de ejecución.

## Paso 2: revisión

Revisa `changes`, `previousRole`, `nextRole` y `reason` en el informe. Los registros con `unknown_role_default:*` deben comprobarse especialmente porque fueron enviados a `solo_lectura`.

## Paso 3: aplicación

Después de revisar el informe, ejecuta la migración con una confirmación explícita:

```bash
npm run migrate:user-roles -- --apply --confirm=UPDATE_ROLES
```

Se procesan lotes de hasta 450 escrituras para mantenerse por debajo del límite operativo de Firestore. Si se especifica `--tenant-id`, solo se actualizan sus miembros y se omite la colección global `usuarios`.

> Haz una copia de seguridad de Firestore antes de ejecutar el modo `--apply`. El script no elimina documentos, pero la restauración es la vía recomendada si una equivalencia de rol requiere corrección masiva.
