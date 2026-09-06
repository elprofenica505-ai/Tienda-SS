# Guía móvil para poner Tienda-SS en funcionamiento

Esta guía está escrita para configurar el SaaS desde un teléfono Android o iPhone sin necesidad de programar. El orden importa: primero se crea Firebase, después se crean los precios de Stripe, luego se verifica el dominio en Resend y finalmente se copian todas las variables en Vercel.

> **Regla de seguridad:** nunca envíes por WhatsApp, correo, GitHub, capturas de pantalla ni este chat los valores de `FIREBASE_SERVICE_ACCOUNT_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` o `RESEND_API_KEY`. Son secretos del servidor. Si alguno se expone, debes revocarlo y crear otro.

## 1. Qué vas a crear

| Elemento | Para qué lo usa Tienda-SS | Dónde se obtiene |
|---|---|---|
| Proyecto Firebase | Usuarios, empresas, miembros, ventas, inventario y reglas | Firebase Console |
| App web Firebase | Configuración pública del navegador | Firebase > Project settings |
| Cuenta de servicio Firebase | Permite que Vercel use Admin Auth y Firestore desde el backend | Firebase > Project settings > Service accounts |
| Tres precios Stripe | Suscripciones Starter, Growth y Scale | Stripe Dashboard |
| Webhook Stripe | Sincroniza altas, cambios, cancelaciones y pagos fallidos | Stripe > Workbench > Webhooks |
| API key Resend | Envía correos transaccionales | Resend Dashboard |
| Dominio verificado | Autoriza al remitente de Resend | DNS de tu dominio |
| Variables Vercel | Entregan estas configuraciones al despliegue | Vercel > Project Settings > Environment Variables |
| `SUPERADMIN_UIDS` | Define qué usuario puede abrir el panel global | Firebase Authentication |

Firebase considera el proyecto como el contenedor principal de las aplicaciones y servicios; el proyecto también está vinculado a un proyecto de Google Cloud y su identificador no debe cambiarse después de comenzar a provisionar recursos [1].

## 2. Antes de comenzar desde el celular

Abre Chrome o Safari y activa “Sitio para ordenador” si algún botón no aparece. Ten preparadas una cuenta de Google, una tarjeta de facturación para Firebase/Google Cloud si la consola la solicita, una cuenta de Stripe, un dominio propio para el correo y acceso a la cuenta donde administras los DNS del dominio.

Para la primera configuración utiliza **Stripe en modo prueba**, no en modo Live. Así puedes crear usuarios, suscripciones y webhooks sin cobrar dinero real. Cuando todo funcione, se repite el procedimiento con las claves Live.

## 3. Crear el proyecto nuevo de Firebase

### 3.1 Crear el proyecto

1. Entra en [Firebase Console](https://console.firebase.google.com/).
2. Inicia sesión con tu cuenta de Google.
3. Pulsa **Add project** o **Crear un proyecto**.
4. Usa un nombre fácil de identificar, por ejemplo `NexoFlow Producción`.
5. Si Firebase te permite editar el **Project ID**, elige uno corto y permanente, por ejemplo `nexoflow-produccion-2026`. El Project ID no se puede cambiar después de crear recursos, por lo que debes revisarlo antes de pulsar crear [1] [2].
6. Puedes dejar Google Analytics desactivado inicialmente. Si lo activas, selecciona una cuenta de Analytics y una ubicación de informes.
7. Pulsa **Create project**.

Cuando termine, entra al panel del proyecto y guarda en una nota privada únicamente el **Project ID**. No es una clave secreta y será necesario para reconocer el proyecto.

### 3.2 Registrar la aplicación web

1. Dentro del proyecto, pulsa el icono **Web** `</>` o **Add app** y después **Web**.
2. Escribe un apodo como `Tienda-SS Vercel`.
3. No actives Hosting de Firebase, porque tu aplicación se desplegará en Vercel.
4. Pulsa **Register app**.
5. Firebase mostrará un bloque `firebaseConfig`. Copia sus valores a una nota privada temporal. Los nombres que necesitas son `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId` y `appId`.

El registro de la app web es el que produce la configuración pública que utiliza el navegador [2]. En Vercel esos valores se introducirán con nombres `NEXT_PUBLIC_...`.

### 3.3 Activar Authentication con correo y contraseña

1. En el menú izquierdo entra en **Build > Authentication**.
2. Pulsa **Get started**.
3. Abre la pestaña **Sign-in method**.
4. Selecciona **Email/Password**.
5. Activa únicamente **Email/Password**.
6. Pulsa **Save**.

No actives proveedores como Google, Facebook o teléfono todavía. La versión actual de Tienda-SS utiliza correo y contraseña. Firebase documenta este flujo mediante `signInWithEmailAndPassword`, creación de usuarios y observación del estado de autenticación [3].

### 3.4 Crear Firestore

1. Entra en **Build > Firestore Database**.
2. Pulsa **Create database**.
3. Elige una región cercana a tus usuarios. La región debe ser una decisión permanente porque afecta latencia y ubicación de datos.
4. Si pregunta por reglas iniciales, selecciona **Production mode**.
5. Pulsa **Create**.

No crees manualmente colecciones como `tenants`, `members`, `products` o `sales`. La aplicación las crea con sus documentos cuando el registro y las operaciones funcionan. Las reglas que ya existen en el repositorio deben revisarse y desplegarse mediante el flujo de Firebase que utilice tu equipo técnico; no reemplaces las reglas por “allow read, write: if true”.

### 3.5 Generar `FIREBASE_SERVICE_ACCOUNT_KEY`

Esta es la variable más delicada porque da acceso administrativo al backend.

1. En Firebase abre el icono de engranaje y entra en **Project settings**.
2. Abre la pestaña **Service accounts**.
3. Selecciona **Firebase Admin SDK**.
4. Pulsa **Generate new private key**.
5. Confirma la generación y descarga el archivo JSON.
6. No lo subas a GitHub, no lo guardes en Google Drive compartido y no lo envíes por chat.
7. Abre el JSON solo para copiarlo en Vercel. Debes copiar el objeto JSON completo, desde `{` hasta `}`.

Firebase indica que el Admin SDK necesita un proyecto y una cuenta de servicio para actuar desde un servidor privilegiado [4]. En Vercel se guardará todo el JSON como el valor de una sola variable llamada `FIREBASE_SERVICE_ACCOUNT_KEY`.

## 4. Crear el usuario administrador y obtener `SUPERADMIN_UIDS`

1. En Firebase entra en **Build > Authentication > Users**.
2. Pulsa **Add user**.
3. Escribe tu correo de administrador y una contraseña temporal segura.
4. Guarda el usuario.
5. En la tabla de usuarios, copia el valor de la columna **User UID**.
6. Ese valor será `SUPERADMIN_UIDS`.

Si habrá más de un superadministrador, escribe los UID separados por coma, sin espacios o con espacios normales, por ejemplo:

```text
UID_DEL_ADMIN_1,UID_DEL_ADMIN_2
```

El UID no es el correo. Debes copiar exactamente el identificador largo que Firebase muestra en la tabla.

## 5. Crear los tres planes en Stripe

### 5.1 Entrar en modo prueba

1. Abre [Stripe Dashboard](https://dashboard.stripe.com/).
2. Inicia sesión o crea tu cuenta.
3. Activa el interruptor **Test mode** o **Sandbox**.
4. No desactives el modo prueba hasta completar todos los tests.

Stripe mantiene separadas las claves, productos, precios y clientes de sandbox y Live; un objeto creado en sandbox no sirve en Live [5].

### 5.2 Crear Starter

1. En Stripe abre **Product catalog > Products**.
2. Pulsa **Add product**.
3. Nombre: `NexoFlow Starter`.
4. Precio: `19`.
5. Moneda: `USD`, salvo que tu negocio vaya a cobrar en otra moneda.
6. Tipo de cobro: **Recurring**.
7. Intervalo: **Monthly**.
8. Guarda el producto.
9. Copia el ID del precio, que empieza por `price_`.
10. Ese valor será `STRIPE_PRICE_STARTER`.

### 5.3 Crear Growth

Repite el mismo procedimiento con:

| Campo | Valor |
|---|---|
| Nombre | `NexoFlow Growth` |
| Precio mensual | `49` USD |
| Intervalo | Mensual |
| Variable | `STRIPE_PRICE_GROWTH` |

### 5.4 Crear Scale

Repite el procedimiento con:

| Campo | Valor |
|---|---|
| Nombre | `NexoFlow Scale` |
| Precio mensual | `99` USD |
| Intervalo | Mensual |
| Variable | `STRIPE_PRICE_SCALE` |

Stripe define los productos y precios por separado; un precio recurrente debe tener una moneda, un importe y un intervalo, normalmente mensual para estos tres planes [6] [7]. No copies el ID del producto `prod_`; debes copiar el ID del precio `price_`.

## 6. Obtener `STRIPE_SECRET_KEY`

1. En Stripe abre **Developers > API keys** o **Workbench > API keys**.
2. Confirma que sigues en **Test/Sandbox mode**.
3. Busca la **Secret key**.
4. Pulsa **Reveal test key** si Stripe lo solicita.
5. Copia la clave que empieza por `sk_test_`.
6. Esa clave será `STRIPE_SECRET_KEY`.

No copies la clave publicable `pk_test_`; Tienda-SS necesita la clave secreta en el backend. Stripe recomienda mantener las claves secretas fuera del código y dentro de variables protegidas [5].

## 7. Crear el webhook y obtener `STRIPE_WEBHOOK_SECRET`

Primero necesitas conocer el dominio de Vercel. Puede ser parecido a `https://tu-proyecto.vercel.app` o tu dominio personalizado.

1. En Stripe entra en **Workbench > Webhooks**.
2. Pulsa **Create an event destination**.
3. Selecciona **Your account**.
4. Elige **Webhook endpoint**.
5. En **Endpoint URL** escribe:

```text
https://TU-DOMINIO-VERCEL/api/billing/webhook
```

6. Selecciona estos eventos:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` e `invoice.upcoming`.
7. Guarda el endpoint.
8. En la configuración del endpoint pulsa **Reveal secret**.
9. Copia el valor que empieza por `whsec_`.
10. Ese valor será `STRIPE_WEBHOOK_SECRET`.

El secreto `whsec_` no es la misma cosa que `STRIPE_SECRET_KEY`. Stripe usa el secreto específico del endpoint para verificar que el POST realmente viene de Stripe; la URL del webhook debe ser HTTPS pública [5] [8]. Si después cambias la URL de Vercel o creas otro endpoint, debes generar/copiar el secreto del endpoint nuevo.

## 8. Configurar Resend y obtener `RESEND_API_KEY` y `RESEND_FROM`

### 8.1 Verificar un dominio

1. Entra en [Resend](https://resend.com/) y crea tu cuenta.
2. En el panel abre **Domains**.
3. Pulsa **Add domain**.
4. Escribe un subdominio propio, por ejemplo `mail.tudominio.com` o `notifications.tudominio.com`.
5. Selecciona la región más cercana a tus destinatarios.
6. Resend mostrará registros DNS DKIM, SPF y posiblemente MX/CNAME.
7. Abre desde el celular el panel de tu proveedor de dominio, por ejemplo Cloudflare, Namecheap o GoDaddy.
8. Crea cada registro exactamente como Resend lo muestra. No cambies nombres, valores ni puntos finales.
9. Si usas Cloudflare y Resend muestra un CNAME, déjalo como **DNS only**, no proxied.
10. Regresa a Resend y pulsa **Verify**.

Resend recomienda usar un subdominio para los envíos y exige verificar un dominio propio; la propagación puede tardar desde unos minutos hasta 72 horas [9]. Después de verificarlo, añade un registro DMARC siguiendo la recomendación del proveedor.

### 8.2 Crear la API key

1. En Resend abre **API Keys**.
2. Pulsa **Create API Key**.
3. Nombre: `Tienda-SS Vercel Production`.
4. Permiso: **Sending access**.
5. Restringe la clave al dominio verificado si Resend muestra esa opción.
6. Pulsa crear y copia inmediatamente la clave `re_...`.
7. Esa clave será `RESEND_API_KEY`.

Resend muestra la API key una sola vez; su documentación recomienda guardarla como variable de entorno y usar el permiso mínimo de envío [10].

### 8.3 Elegir `RESEND_FROM`

Usa una dirección del dominio que acabas de verificar. Por ejemplo:

```text
NexoFlow <no-reply@mail.tudominio.com>
```

El dominio después de `@` debe coincidir con el dominio verificado en Resend. Ese texto completo será el valor de `RESEND_FROM`.

## 9. Añadir variables en Vercel desde el celular

1. Entra en [Vercel Dashboard](https://vercel.com/dashboard).
2. Abre tu proyecto de Tienda-SS.
3. Pulsa **Settings**.
4. Entra en **Environment Variables**.
5. Para cada fila pulsa **Add New**.
6. Escribe el nombre y el valor.
7. Marca **Production**. Para probar en Preview, marca también **Preview**. Si vas a usar `vercel dev`, marca **Development**.
8. Guarda cada variable.

Vercel mantiene las variables fuera del código y aplica los cambios solo a nuevos despliegues, por lo que después de guardarlas debes ir a **Deployments**, abrir el último despliegue y seleccionar **Redeploy** [11].

### 9.1 Tabla exacta de variables

| Nombre exacto en Vercel | Qué debes pegar | Tipo |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `apiKey` de Firebase | Pública |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain` de Firebase | Pública |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` de Firebase | Pública |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `storageBucket` de Firebase | Pública |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` de Firebase | Pública |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId` de Firebase | Pública |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | JSON completo de la cuenta de servicio | Secreta |
| `STRIPE_SECRET_KEY` | Clave `sk_test_...` inicialmente | Secreta |
| `STRIPE_WEBHOOK_SECRET` | Secreto `whsec_...` del webhook de Vercel | Secreta |
| `STRIPE_PRICE_STARTER` | ID `price_...` del Starter | Secreta/configuración |
| `STRIPE_PRICE_GROWTH` | ID `price_...` del Growth | Secreta/configuración |
| `STRIPE_PRICE_SCALE` | ID `price_...` del Scale | Secreta/configuración |
| `APP_URL` | URL HTTPS completa de Vercel, sin `/` final | Configuración |
| `RESEND_API_KEY` | Clave `re_...` de Resend | Secreta |
| `RESEND_FROM` | Ejemplo: `NexoFlow <no-reply@mail.tudominio.com>` | Configuración |
| `SUPERADMIN_UIDS` | UID de Firebase Authentication | Secreta/configuración |

### 9.2 Cómo pegar el JSON de Firebase

En el campo `FIREBASE_SERVICE_ACCOUNT_KEY`, pega el JSON completo. Si el teclado del celular convierte saltos de línea o comillas, usa la opción “pegar como texto sin formato” si tu teclado la ofrece. No agregues comillas externas alrededor de todo el JSON. El valor debe comenzar con `{` y terminar con `}`.

No pongas `NEXT_PUBLIC_` delante de las variables secretas. El prefijo `NEXT_PUBLIC_` significa que el valor puede llegar al navegador; nunca lo uses para Stripe, Firebase Admin, Resend o `SUPERADMIN_UIDS`.

## 10. Redeploy y primera prueba

1. En Vercel pulsa **Redeploy** sobre el último despliegue.
2. Espera a que el despliegue termine con estado **Ready**.
3. Abre `https://TU-DOMINIO-VERCEL/api/health`. Debe responder un JSON con `ok: true`.
4. Abre `/register` y crea un usuario de prueba.
5. Comprueba en Firebase Authentication que aparece el usuario.
6. Comprueba en Firestore que aparece un tenant con una subcolección `members`.
7. Entra al onboarding y pulsa **Entrar a mi espacio**.
8. Cierra sesión y vuelve a iniciar sesión desde `/login`; un tenant con onboarding terminado debe llevarte al workspace.
9. Crea una categoría y un producto.
10. Crea una venta de prueba y verifica que el inventario se actualice.
11. Desde Stripe, usa una tarjeta de prueba como `4242 4242 4242 4242`, con fecha futura y cualquier CVC, solo mientras estés en Test mode.
12. En Stripe revisa **Webhooks** y confirma que el evento aparece como entregado con respuesta 2xx.
13. En Resend revisa los logs y confirma el envío desde el dominio verificado.

## 11. Cuando todo funcione, pasar a Live

No cambies a Live hasta haber probado registro, login, recuperación de contraseña, onboarding, creación de producto, venta, cobro, cambio de plan y recepción del webhook.

Cuando estés listo, crea o copia en Stripe las claves Live, los tres precios Live y un webhook Live. Sustituye en Vercel únicamente los valores de Stripe de Test por los equivalentes Live, marca las variables para Production y vuelve a desplegar. El webhook Live tendrá un `whsec_` diferente al de Test.

Después del primer cobro real, revisa el panel de Stripe, el tenant correspondiente en Firestore y el estado de la suscripción en la pantalla de Billing.

## 12. Errores frecuentes

| Síntoma | Causa más probable | Corrección |
|---|---|---|
| Registro devuelve “No se pudo crear la empresa” | Falta o está mal `FIREBASE_SERVICE_ACCOUNT_KEY` | Genera una nueva clave desde Firebase y reemplázala en Vercel |
| Login devuelve `auth/invalid-api-key` | Algún `NEXT_PUBLIC_FIREBASE_*` está mal copiado | Copia de nuevo el bloque `firebaseConfig` |
| Stripe responde `STRIPE_NOT_CONFIGURED` | Falta `STRIPE_SECRET_KEY` | Añade la clave del mismo modo Test/Live que los precios |
| Webhook devuelve 400 | URL incorrecta, secreto incorrecto o body manipulado | Usa el `whsec_` del endpoint exacto y la ruta `/api/billing/webhook` |
| Webhook aparece como 500 | Firebase Admin o el tenant no están configurados correctamente | Revisa Vercel Runtime Logs y `FIREBASE_SERVICE_ACCOUNT_KEY` |
| Resend rechaza el envío | Dominio no verificado o `RESEND_FROM` no coincide | Verifica DNS y usa un remitente del dominio verificado |
| Variables nuevas no hacen efecto | No se creó un nuevo deployment | Haz Redeploy en Vercel |
| Panel global bloqueado | `SUPERADMIN_UIDS` no contiene el UID real | Copia el UID de Firebase Authentication, no el correo |

## 13. Checklist para pedirme la siguiente revisión

Cuando termines la configuración, no me envíes las claves. Respóndeme únicamente con el estado de cada elemento:

| Elemento | Estado esperado |
|---|---|
| Proyecto Firebase creado | Sí |
| App web Firebase registrada | Sí |
| Email/Password activo | Sí |
| Firestore creado en Production mode | Sí |
| Cuenta de servicio descargada | Sí |
| Usuario superadmin creado y UID copiado | Sí |
| Tres precios Stripe creados en Test mode | Sí |
| Webhook Stripe creado en Vercel | Sí |
| Dominio Resend verificado | Sí |
| API key Resend creada | Sí |
| Variables añadidas en Vercel | Sí |
| Nuevo deployment Ready | Sí |
| `/api/health` devuelve `ok: true` | Sí |
| Registro de usuario probado | Sí/No |
| Primer producto creado | Sí/No |
| Primer cobro de prueba realizado | Sí/No |

Con esa respuesta podré decirte exactamente cuál es el siguiente paso sin que tengas que compartir ningún secreto.

## Referencias oficiales

[1]: https://firebase.google.com/docs/projects/learn-more "Understand Firebase projects"
[2]: https://firebase.google.com/docs/web/setup "Add Firebase to your JavaScript project"
[3]: https://firebase.google.com/docs/auth/web/start "Get Started with Firebase Authentication on Websites"
[4]: https://firebase.google.com/docs/admin/setup "Add the Firebase Admin SDK to your server"
[5]: https://docs.stripe.com/keys "Stripe API keys"
[6]: https://docs.stripe.com/products-prices/pricing-models "Stripe recurring pricing models"
[7]: https://docs.stripe.com/api/prices/create "Stripe create a price"
[8]: https://docs.stripe.com/webhooks "Stripe webhooks"
[9]: https://resend.com/docs/add-a-domain "Resend add and verify a domain"
[10]: https://resend.com/docs/create-an-api-key "Resend create an API key"
[11]: https://vercel.com/docs/environment-variables "Vercel environment variables"
