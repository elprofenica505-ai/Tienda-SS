# Manual de configuración de Firebase para ConexiaX

## 1. Objetivo y alcance

Este manual explica cómo configurar el proyecto Firebase que utiliza el SaaS ConexiaX y cómo conectarlo con el proyecto Vercel `tienda-ss-ozkq`. El procedimiento cubre Firebase Authentication, Cloud Firestore, reglas de seguridad, índices, credenciales del Firebase Admin SDK y variables de entorno de Vercel.

La configuración descrita está dirigida al proyecto Firebase identificado durante la auditoría como `conexiaxx`. Antes de ejecutar cambios, confirma que el identificador mostrado en tu consola Firebase sea exactamente `conexiaxx`. Un proyecto Firebase equivocado puede provocar pérdida de datos, errores de autenticación o conexión del SaaS con otra base de datos.

> **Regla de seguridad:** nunca publiques una clave privada de cuenta de servicio en GitHub, Vercel como texto público, capturas de pantalla, correo electrónico, chat o archivos `.env` versionados.

## 2. Referencias del entorno correcto

| Recurso | Valor |
|---|---|
| Repositorio | `elprofenica505-ai/Tienda-SS` |
| Rama | `SaaS-MultiTenant-Profesional` |
| Proyecto Vercel | `tienda-ss-ozkq` |
| Dominio Vercel | `https://tienda-ss-ozkq.vercel.app` |
| Proyecto Firebase esperado | `conexiaxx` |
| Base Firestore | `(default)` |
| Archivo de reglas | `firestore.rules` |
| Archivo de índices | `firestore.indexes.json` |

El repositorio ya contiene la definición del índice requerido para la consulta de miembros multi-tenant. El archivo se encuentra conectado desde `firebase.json`.

## 3. Requisitos previos

Necesitas una cuenta de Google con permisos de propietario, editor o administrador de índices del proyecto Firebase. Para crear índices, Firebase documenta los roles `roles/datastore.owner`, `roles/datastore.indexAdmin`, `roles/editor` y `roles/owner`.[1]

También necesitas acceso al proyecto Vercel `tienda-ss-ozkq` con permisos para modificar variables de entorno. Si no tienes acceso a alguno de estos paneles, solicita al propietario que realice únicamente los pasos administrativos correspondientes.

## 4. Confirmar el proyecto Firebase correcto

1. Abre [Firebase Console](https://console.firebase.google.com/).
2. Selecciona el proyecto cuyo **Project ID** sea exactamente `conexiaxx`.
3. En **Project settings > General**, confirma el Project ID.
4. No continúes si el identificador es diferente.
5. Verifica que el proyecto contenga la base de datos Firestore y los usuarios esperados.

El nombre visible del proyecto puede ser diferente del Project ID. Para ConexiaX importa el **Project ID**, no solamente el nombre mostrado.

## 5. Activar Firebase Authentication

1. En Firebase Console, abre **Build > Authentication**.
2. Pulsa **Get started** si Authentication todavía no fue inicializado.
3. En **Sign-in method**, activa **Email/Password**.
4. Mantén desactivado cualquier proveedor que el producto no utilice.
5. En la sección de usuarios, confirma que el registro de correo y contraseña esté habilitado.
6. No desactives la verificación de correo si el flujo del SaaS exige cuentas verificadas antes de entrar al workspace.

### 5.1 Dominios autorizados

En Authentication, abre **Settings > Authorized domains** y agrega los dominios desde los que se utilizará Firebase Auth:

```text
tienda-ss-ozkq.vercel.app
```

Si existe un dominio comercial propio, agrega también solamente el hostname, sin `https://`, rutas ni barras finales. Por ejemplo:

```text
app.tudominio.com
```

Conserva los dominios predeterminados de Firebase. Firebase utiliza dominios autorizados para permitir los flujos de autenticación web y redirección.[2]

## 6. Inicializar o verificar Cloud Firestore

1. Abre **Build > Firestore Database**.
2. Si Firestore no está creado, pulsa **Create database**.
3. Selecciona la base `(default)`.
4. Elige la región que corresponda a la ubicación principal de tus clientes. La región no debe cambiarse después de crear la base sin una migración planificada.
5. Para un proyecto que se publicará, usa las reglas administradas por el repositorio y no dejes las reglas de prueba activas.
6. Verifica que la base esté operativa antes de desplegar reglas e índices.

El SaaS utiliza una estructura multi-tenant bajo `tenants/{tenantId}`. Las reglas del repositorio deben ser la fuente de verdad para los accesos directos desde el cliente.

## 7. Desplegar reglas e índices desde el repositorio

### 7.1 Instalar y autenticar Firebase CLI

Desde la carpeta raíz del repositorio, ejecuta:

```bash
npm install
npx firebase-tools login
npx firebase-tools projects:list
```

La CLI de Firebase requiere una autenticación interactiva y permite confirmar que la cuenta puede ver el proyecto.[3] Si trabajas en un equipo remoto sin navegador local, usa el flujo indicado por `firebase-tools login --no-localhost`.

### 7.2 Seleccionar `conexiaxx`

Ejecuta:

```bash
npx firebase-tools use --add conexiaxx
```

Cuando solicite un alias, usa:

```text
production
```

Este comando puede crear o modificar `.firebaserc`. Revisa que su contenido apunte únicamente a `conexiaxx` antes de guardarlo en el repositorio.

### 7.3 Revisar los archivos antes del despliegue

Confirma que `firebase.json` contenga:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

Confirma que `firestore.indexes.json` contenga el índice para la colección de miembros:

```json
{
  "indexes": [
    {
      "collectionGroup": "members",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "uid", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

### 7.4 Desplegar

Desde la rama `SaaS-MultiTenant-Profesional`, ejecuta:

```bash
npx firebase-tools deploy --only firestore
```

Este comando publica las reglas y los índices definidos en el repositorio. Firebase puede tardar varios minutos en construir el índice; la consulta de usuarios invitados no estará completamente disponible hasta que el estado del índice sea **Enabled** o **Built**.[1]

Si quieres separar ambos cambios, usa:

```bash
npx firebase-tools deploy --only firestore:indexes
npx firebase-tools deploy --only firestore:rules
```

Después, en Firebase Console, abre **Firestore Database > Indexes** y confirma que el índice de `members`, alcance `Collection group`, campo `uid` ascendente, esté listo.

## 8. Crear una aplicación web Firebase y copiar la configuración pública

1. En Firebase Console, abre **Project settings > General**.
2. En **Your apps**, selecciona **Add app > Web**.
3. Registra la aplicación con un nombre reconocible, por ejemplo `conexiax-web-production`.
4. No necesitas activar Firebase Hosting para este paso.
5. Copia los valores de la configuración web.

En Vercel, configura estas variables públicas para **Production**, **Preview** y **Development** según corresponda:

| Variable Vercel | Valor Firebase |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `apiKey` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId` |

La API key web no es una clave administrativa. Aun así, las reglas de Firestore y Authentication deben proteger los datos; no dependas de ocultar la API key en el navegador.

## 9. Crear y configurar la cuenta de servicio para Firebase Admin

El backend Next.js utiliza Firebase Admin SDK para verificar tokens, consultar Firestore y ejecutar operaciones protegidas. Firebase crea una cuenta de servicio para el proyecto y permite generar una clave privada JSON desde **Project settings > Service accounts > Generate new private key**.[4]

1. Abre [Firebase Project Settings](https://console.firebase.google.com/project/conexiaxx/settings/serviceaccounts/adminsdk).
2. Entra en la pestaña **Service accounts**.
3. Pulsa **Generate new private key**.
4. Confirma la operación y descarga el JSON una sola vez.
5. Guarda el archivo en un lugar cifrado y con acceso restringido.
6. No lo renombres dentro del repositorio ni lo agregues a Git.
7. Si la clave se expone, revócala inmediatamente y genera otra.

En Vercel, crea la variable secreta:

```text
FIREBASE_SERVICE_ACCOUNT_KEY
```

Como valor, pega el JSON completo de la cuenta de servicio, incluyendo `project_id`, `client_email` y `private_key`. Configúrala para **Production** y, si usarás previews con una base de staging, configura una credencial distinta para **Preview**. No reutilices una cuenta de servicio de producción en previews no controladas.

La aplicación valida que la cuenta de servicio corresponda al mismo proyecto que `NEXT_PUBLIC_FIREBASE_PROJECT_ID`. Para producción, ambos deben corresponder a `conexiaxx`.

## 10. Configurar las variables en Vercel

Abre el proyecto `tienda-ss-ozkq` en Vercel y entra en **Settings > Environment Variables**. Configura las variables siguientes.

| Variable | Ambiente recomendado | Obligatoria |
|---|---|---:|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Production, Preview, Development | Sí |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Production, Preview, Development | Sí |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Production, Preview, Development | Sí |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Production, Preview, Development | Sí |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Production, Preview, Development | Sí |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Production, Preview, Development | Sí |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Production; Preview solo si es seguro | Sí en servidor |
| `SUPERADMIN_UIDS` | Production | Sí |
| `APP_URL` | Production | Sí |
| `STRIPE_SECRET_KEY` | Production | Sí para billing |
| `STRIPE_WEBHOOK_SECRET` | Production | Sí para billing |
| `STRIPE_PRICE_STARTER` | Production | Sí para billing |
| `STRIPE_PRICE_GROWTH` | Production | Sí para billing |
| `STRIPE_PRICE_SCALE` | Production | Sí para billing |
| `RESEND_API_KEY` | Production | Sí si se envían correos |
| `RESEND_FROM` | Production | Sí si se envían correos |

Para guardar cambios en Vercel:

1. Selecciona el entorno correcto.
2. Agrega el nombre y valor.
3. Guarda la variable.
4. Revisa que no tenga espacios al inicio o final.
5. Realiza un nuevo deployment. Las variables no se aplican retroactivamente a un deployment ya construido.

## 11. Configurar `SUPERADMIN_UIDS`

Para conocer el UID de un usuario desde Firebase Console:

1. Abre **Authentication > Users**.
2. Busca el usuario administrador.
3. Copia el valor de **User UID**.
4. Colócalo en `SUPERADMIN_UIDS`.

Si existen varios administradores, sepáralos con comas:

```text
UID_ADMIN_1,UID_ADMIN_2
```

No uses correos electrónicos en esta variable. El backend compara UIDs de Firebase.

## 12. Verificación posterior

### 12.1 Verificación desde Vercel

Después del deployment, comprueba:

```bash
curl -i https://tienda-ss-ozkq.vercel.app/api/health
```

La respuesta esperada contiene:

```json
{
  "ok": true,
  "status": "live"
}
```

El endpoint de salud debe responder sin exponer secretos ni credenciales.

### 12.2 Verificación de protección API

Una solicitud sin token debe ser rechazada:

```bash
curl -i https://tienda-ss-ozkq.vercel.app/api/catalog
```

La respuesta esperada es HTTP `401`.

No pruebes endpoints protegidos con tokens de usuarios reales si no es necesario. Para pruebas autenticadas, usa una cuenta de staging.

### 12.3 Verificación de índice

En Firebase Console:

1. Abre **Firestore Database > Indexes**.
2. Busca el índice de `members`.
3. Confirma `Collection group` como alcance.
4. Confirma `uid` en orden ascendente.
5. Espera a que el estado sea **Enabled** o **Built**.

En Vercel, revisa los runtime logs después del deployment. El error `COLLECTION_GROUP_ASC index` no debe volver a aparecer.

### 12.4 Verificación de autenticación

1. Abre `https://tienda-ss-ozkq.vercel.app/register`.
2. Confirma que el formulario se carga.
3. Usa únicamente un correo de prueba controlado si vas a crear una cuenta.
4. Confirma el correo desde el mensaje de Firebase.
5. Inicia sesión en `/login`.
6. Verifica que el usuario llegue a `/onboarding` o `/workspace`.
7. No uses datos de clientes durante esta verificación.

## 13. Errores comunes

| Síntoma | Causa probable | Corrección |
|---|---|---|
| `FIREBASE_PROJECT_MISMATCH` | La cuenta de servicio pertenece a otro proyecto | Genera una clave del proyecto `conexiaxx` y alinea `NEXT_PUBLIC_FIREBASE_PROJECT_ID` |
| `FIREBASE_SERVICE_ACCOUNT_KEY no está configurada` | Falta la variable en Vercel | Agrega la variable en el entorno correcto y crea un nuevo deployment |
| `The query requires a COLLECTION_GROUP_ASC index` | Falta el índice o todavía está construyéndose | Despliega `firestore.indexes.json` y espera a que finalice |
| Error de dominio no autorizado | Falta el hostname en Authentication | Agrega `tienda-ss-ozkq.vercel.app` en Authorized domains |
| `401 Autenticación requerida` | Solicitud sin Bearer token | Es correcto para endpoints protegidos |
| El usuario no tiene empresa activa | No existe membership activo | Revisa el documento tenant y el miembro en Firestore |
| Los correos no salen | Resend no está configurado o el remitente no está verificado | Configura `RESEND_API_KEY` y `RESEND_FROM` con un dominio verificado |
| Stripe no actualiza el plan | Webhook no apunta al endpoint correcto | Configura el webhook hacia `/api/billing/webhook` y guarda su secreto en Vercel |

## 14. Lista de comprobación final

| Comprobación | Estado esperado |
|---|---|
| Project ID confirmado | `conexiaxx` |
| Authentication Email/Password | Enabled |
| Dominio Vercel autorizado | Agregado |
| Firestore `(default)` | Activo |
| Reglas de Firestore | Desplegadas desde el repositorio |
| Índice `members.uid` | Built/Enabled |
| Firebase web config | Variables `NEXT_PUBLIC_*` configuradas |
| Cuenta de servicio | JSON correcto y secreto en Vercel |
| `SUPERADMIN_UIDS` | UIDs válidos |
| `/api/health` | HTTP 200 y `ok: true` |
| API sin token | HTTP 401 |
| Nuevo deployment Vercel | READY |
| Runtime logs | Sin errores de índice o proyecto incorrecto |
| Stripe | Claves, precios y webhook configurados |
| Resend | Remitente verificado y API key activa |
| Dominio comercial | DNS y HTTPS verificados, si aplica |

## 15. Orden recomendado de ejecución

Primero confirma el Project ID `conexiaxx`. Después configura Authentication y Firestore. Luego despliega reglas e índices desde la rama `SaaS-MultiTenant-Profesional`. A continuación configura las variables públicas y secretas en Vercel. Finalmente crea un nuevo deployment, verifica `/api/health`, confirma que el índice esté construido y revisa los logs de runtime.

No marques el SaaS como listo para vender hasta que el índice esté construido y los errores `tenant_me_failed` hayan desaparecido de Vercel. La configuración externa es parte de la aplicación; un código correcto no puede compensar un Firebase equivocado o una variable secreta ausente.

## Referencias

[1]: https://firebase.google.com/docs/firestore/query-data/indexing "Manage indexes in Cloud Firestore"

[2]: https://firebase.google.com/docs/auth/web/google-signin "Firebase Authentication for web applications"

[3]: https://firebase.google.com/docs/cli "Firebase CLI reference"

[4]: https://firebase.google.com/docs/admin/setup "Add the Firebase Admin SDK to your server"
