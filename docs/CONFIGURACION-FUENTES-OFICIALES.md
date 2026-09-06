# Fuentes oficiales consultadas

## Firebase

- Proyectos y relación con Google Cloud: https://firebase.google.com/docs/projects/learn-more
- Configuración de aplicaciones web: https://firebase.google.com/docs/web/setup
- Authentication con correo y contraseña: https://firebase.google.com/docs/auth/web/start
- Firebase Admin SDK y cuentas de servicio: https://firebase.google.com/docs/admin/setup

Hallazgos utilizados: un proyecto Firebase es también un proyecto Google Cloud; el ID del proyecto no se puede cambiar después de provisionar recursos; una app web se registra dentro del proyecto y recibe un objeto de configuración; Authentication debe habilitar el proveedor Email/Password; el Admin SDK requiere un proyecto y una cuenta de servicio para operar desde el backend.

## Stripe

- Claves API y modo sandbox/live: https://docs.stripe.com/keys
- Webhooks y signing secret: https://docs.stripe.com/webhooks
- Modelos de precios recurrentes: https://docs.stripe.com/products-prices/pricing-models
- Crear precios: https://docs.stripe.com/api/prices/create

Hallazgos utilizados: las claves sandbox empiezan por `sk_test_`; el secreto del webhook es distinto de la clave API y empieza por `whsec_`; los webhooks deben usar una URL HTTPS pública; los precios recurrentes se crean asociados a productos y con intervalo mensual.

## Resend

- Crear API key: https://resend.com/docs/create-an-api-key
- Añadir y verificar dominio: https://resend.com/docs/add-a-domain

Hallazgos utilizados: la API key solo se muestra una vez; para este SaaS basta con permiso de envío; Resend exige un dominio propio verificado; se deben copiar exactamente los registros DNS DKIM/SPF y después añadir DMARC.

## Vercel

- Variables de entorno: https://vercel.com/docs/environment-variables
- Ajustes de proyecto: https://vercel.com/docs/project-configuration/project-settings

Hallazgos utilizados: las variables se configuran por entorno; los cambios solo se aplican a nuevos despliegues; las variables sensibles deben añadirse en Project Settings > Environment Variables y asignarse a Production, Preview y Development según corresponda.
