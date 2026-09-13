# Guía móvil de continuidad: tareas Supabase con apoyo de Gemini

## Objetivo

El objetivo es que el SaaS `Tienda-SS` funcione completamente con Supabase y deje de depender de Firebase. La migración conserva los módulos y la logística del ERP, pero empieza con una base limpia y no copia datos de prueba antiguos.

## Referencias del proyecto

| Referencia | Valor |
|---|---|
| Proyecto Vercel | `tienda-ss-ozkq` |
| Repositorio | `elprofenica505-ai/Tienda-SS` |
| Rama activa | `migration/supabase-only` |
| Rama de respaldo | `migration/supabase-foundation` |
| Último commit | `013dbd5` — migración inicial del catálogo a Supabase |
| Supabase | Proyecto que contiene las tablas de fundación ya creadas |

## Por qué necesitas hacer algunas tareas manuales

Yo puedo modificar el repositorio, crear migraciones SQL, hacer commits, hacer push y preparar deployments Preview. No puedo ejecutar cambios dentro de tu cuenta Supabase sin una conexión autorizada a ese proyecto. Por seguridad, tampoco debes copiar aquí la `SUPABASE_SERVICE_ROLE_KEY`, contraseñas, tokens ni credenciales fiscales.

Gemini puede ayudarte desde tu celular a abrir el proyecto Supabase, copiar archivos al SQL Editor, ejecutar las migraciones y confirmar resultados. Tú solo debes seguir las instrucciones y enviarme capturas o mensajes de resultado; nunca envíes secretos.

> **No ejecutes instrucciones que borren tablas o datos.** Las tareas de esta guía son aditivas y no deben incluir `DROP DATABASE`, `DROP SCHEMA`, `TRUNCATE`, `DELETE` masivo ni cambios en Production de Vercel.

# Tarea 1 — Preparar Supabase SQL Editor

## Qué debes hacer

1. Abre Supabase en el navegador del celular.
2. Entra al proyecto correcto, el mismo donde ya ves las tablas `tenants`, `profiles`, `members`, `branches`, `warehouses` y `cash_registers`.
3. Abre **SQL Editor**.
4. Crea una consulta nueva.
5. No ejecutes nada todavía hasta tener el archivo correcto.

## Prompt para Gemini

Copia esto en Gemini:

> Estoy trabajando desde un celular en el proyecto Supabase de mi SaaS. No sé programar. Necesito que me guíes con instrucciones de un toque a la vez para abrir el proyecto correcto y entrar a SQL Editor. No me pidas claves, contraseñas, tokens ni Service Role Key. No borres tablas ni datos. Cuando llegue al editor, dime exactamente cómo crear una consulta nueva y cómo pegar el contenido de un archivo SQL completo.

## Resultado que debes obtener

Debes estar viendo un editor donde puedas pegar SQL y un botón parecido a **Run** o **Ejecutar**.

# Tarea 2 — Ejecutar la migración ERP `0002`

## Archivo que debes usar

[Descargar migración ERP 0002](</home/ubuntu/Tienda-SS/supabase/migrations/0002_erp_foundation.sql>)

## Qué debes hacer

1. Descarga o abre el archivo anterior.
2. Copia su contenido completo.
3. Pégalo en una consulta nueva del SQL Editor.
4. Ejecuta el contenido una sola vez.
5. Espera a que Supabase muestre resultado.

El archivo crea la estructura del ERP en PostgreSQL, incluyendo catálogo, inventario, ventas, compras, caja, crédito, fiscalidad, auditoría, Storage metadata, tenant settings y la función de onboarding.

## Prompt para Gemini

> Ayúdame a ejecutar en Supabase SQL Editor el archivo `0002_erp_foundation.sql` que acabo de subir. Estoy usando un celular y no sé programar. Indícame cómo copiarlo completo, pegarlo y pulsar Run. Antes de ejecutar, verifica únicamente que no contenga instrucciones destructivas como DROP, TRUNCATE o DELETE masivo. No cambies el contenido del archivo. Si aparece un error, dime cómo copiar el mensaje exacto sin compartir credenciales.

## Resultado correcto

Gemini o Supabase debe indicar que la consulta terminó correctamente. Si aparece un error, no intentes corregirlo inventando SQL. Guarda una captura del error y envíamela.

# Tarea 3 — Ejecutar la migración Storage `0003`

## Archivo que debes usar

[Descargar migración Storage 0003](</home/ubuntu/Tienda-SS/supabase/migrations/0003_storage_foundation.sql>)

## Qué debes hacer

1. Crea otra consulta nueva en SQL Editor.
2. Copia el contenido completo de `0003_storage_foundation.sql`.
3. Pégalo.
4. Pulsa Run una sola vez.

Este archivo crea el bucket privado `tenant-files` y sus políticas por tenant.

## Prompt para Gemini

> Ayúdame a ejecutar en Supabase SQL Editor el archivo `0003_storage_foundation.sql` que acabo de subir. Estoy en celular. No borres ni reemplaces buckets existentes. Verifica que el bucket `tenant-files` quede privado. Si Supabase dice que una política ya existe, no la borres automáticamente; detente y explícame el mensaje.

# Tarea 4 — Verificación automática sin modificar datos

Después de ejecutar ambas migraciones, usa una consulta nueva y pídele a Gemini que te ayude a verificar solamente, sin modificar nada.

## Prompt para Gemini

> Ejecuta o ayúdame a ejecutar consultas de solo lectura para verificar el proyecto Supabase. Necesito confirmar: 1) que existen las tablas `categories`, `products`, `inventory_stocks`, `inventory_movements`, `sales`, `sale_items`, `sale_payments`, `purchases`, `purchase_items`, `cash_sessions`, `cash_movements`, `receivables`, `receivable_payments`, `fiscal_configs`, `fiscal_documents`, `audit_logs`, `file_metadata` y `tenant_settings`; 2) que RLS está activo en esas tablas; 3) que existen políticas RLS; 4) que existe la función `create_initial_tenant`; 5) que existe el bucket privado `tenant-files`. No insertes, actualices ni borres datos. No me pidas claves.

## Qué debes enviarme

Envíame una captura o el texto del resultado. Puedes ocultar nombres de proyecto, correos y cualquier dato sensible. No envíes claves ni tokens.

# Tarea 5 — Confirmar las variables públicas de Preview

En Vercel, dentro del proyecto `tienda-ss-ozkq`, el entorno **Preview** debe tener estas variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

## Qué debes hacer

1. Abre Vercel desde el celular.
2. Entra a `tienda-ss-ozkq`.
3. Abre **Settings → Environment Variables**.
4. Confirma que las tres existan con alcance **Preview**.
5. No copies sus valores al chat.
6. No borres todavía las variables Firebase; todavía estamos migrando módulos.

## Prompt para Gemini

> Guíame desde el celular para verificar en Vercel que el proyecto `tienda-ss-ozkq` tenga estas variables en Preview: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. No necesito ver ni copiar los valores. No borres variables Firebase todavía. Solo quiero verificar nombres y alcance Preview.

# Tarea 6 — Probar el registro limpio en Preview

Después de que yo publique una versión que incluya las migraciones aplicadas, te indicaré la URL exacta de Preview que debes abrir. No pruebes el registro antes de ejecutar `0002`, porque la función de onboarding todavía no existiría en Supabase.

## Flujo de prueba

1. Abre la URL Preview indicada.
2. Usa un correo de prueba nuevo.
3. Crea una empresa de prueba nueva.
4. Confirma el correo si Supabase lo solicita.
5. Inicia sesión.
6. Verifica que aparezcan empresa, sucursal principal, almacén principal y caja principal.

## Prompt para Gemini

> Ayúdame a probar desde el celular una aplicación web en Preview. No cambies configuraciones ni Production. Solo quiero registrar una cuenta de prueba nueva, confirmar el correo si llega y verificar que se cree una empresa, una sucursal, un almacén y una caja. Si aparece un error, captura el texto exacto y no intentes crear registros repetidos.

# Tarea 7 — Qué debes reportarme después de cada tarea

Usa este formato sencillo:

```text
Tarea: 0002 / 0003 / verificación / Vercel / Preview
Resultado: correcto o error
Mensaje exacto: pega aquí el mensaje, sin claves
Captura: sí o no
```

Ejemplo:

```text
Tarea: 0002
Resultado: correcto
Mensaje exacto: Success. No result returned
Captura: sí
```

# Acciones que nunca debes hacer

No compartas en Manus ni en Gemini:

- `SUPABASE_SERVICE_ROLE_KEY`.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` con su valor completo si no es necesario.
- Contraseñas.
- Tokens de sesión.
- Claves fiscales.
- Claves Stripe.
- Claves Firebase.
- Códigos de recuperación.

No ejecutes:

```text
DROP DATABASE
DROP SCHEMA
TRUNCATE
DELETE FROM public...
```

No cambies el proyecto Vercel a Production. No elimines Firebase todavía. La eliminación de Firebase se hará únicamente cuando todos los módulos tengan reemplazo probado.

# Estado del trabajo que continuará Manus

Mientras tú completas las tareas manuales de Supabase, Manus continuará con:

1. Migración de inventario.
2. Migración de compras.
3. Migración de caja.
4. Migración de ventas.
5. Migración de crédito.
6. Migración de facturación electrónica.
7. Migración de archivos.
8. Pruebas de aislamiento multi-tenant.
9. Eliminación final de referencias Firebase.

La única dependencia manual inmediata es ejecutar `0002` y `0003` en el proyecto Supabase correcto. Cuando informes que ambas terminaron, el trabajo podrá probarse en Preview.

# Prompt maestro para continuar con Gemini

> Estoy ayudando a migrar el SaaS `Tienda-SS` de Firebase a Supabase-only. Proyecto Vercel: `tienda-ss-ozkq`. Repositorio: `elprofenica505-ai/Tienda-SS`. Rama: `migration/supabase-only`. No sé programar y trabajo desde celular. Guíame con pasos pequeños y claros. No me pidas claves, contraseñas, tokens ni Service Role Key. No borres datos ni uses DROP, TRUNCATE o DELETE masivo. Ayúdame únicamente a ejecutar y verificar los archivos SQL que yo suba al editor de Supabase. Si ocurre un error, detente y muéstrame cómo copiar el mensaje exacto. No cambies Production.
