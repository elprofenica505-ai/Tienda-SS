# Agente de Cobranza Automática

El agente reutiliza las tablas actuales `customers`, `sales` y `receivables`. No duplica facturas ni modifica el saldo por su cuenta: los pagos siguen pasando por el flujo transaccional de Cuentas por Cobrar que ya usa ConexiaX.

## Implementación por pasos

### 1. Aplicar la migración

En Supabase CLI, desde la raíz del repositorio:

```bash
supabase db push
```

O ejecuta el archivo `supabase/migrations/20261003000001_receivables_collection_agent.sql` en el SQL Editor de Supabase. La migración:

- agrega `customers.whatsapp_opt_in` (los registros existentes quedan desactivados hasta confirmar el consentimiento);
- crea `receivable_reminder_logs`, con aislamiento por empresa, claves de idempotencia, intentos, estado del proveedor y fecha de respuesta;
- crea índices para cartera, historial y respuestas pendientes.

La configuración vive en `tenant_settings` con la clave `receivables_reminders`; no hay que migrar manualmente los clientes ni las ventas a crédito.

### 2. Preparar el proveedor de WhatsApp

En Vercel → Project Settings → Environment Variables configura `CRON_SECRET` y las credenciales del proveedor. No pongas secretos en variables `NEXT_PUBLIC_*`.

**Meta WhatsApp Cloud API**

```env
WHATSAPP_PROVIDER=meta
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_GRAPH_VERSION=v21.0
WHATSAPP_REMINDER_TEMPLATE_NAME=conexiax_recordatorio_cobro
WHATSAPP_REMINDER_TEMPLATE_LANGUAGE=es
WHATSAPP_WEBHOOK_VERIFY_TOKEN=un-secreto-aleatorio-largo
WHATSAPP_APP_SECRET=...
```

Crea y espera la aprobación de una plantilla Utility en WhatsApp Manager. La plantilla debe aceptar un parámetro de texto de cuerpo `{{1}}`; ConexiaX envía el mensaje personalizable renderizado como ese parámetro. Usa una plantilla apropiada para recordatorios de pago y cumple las reglas de WhatsApp.

**Twilio WhatsApp**

```env
WHATSAPP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=+...
TWILIO_WHATSAPP_REMINDER_CONTENT_SID=HX...
APP_URL=https://tu-dominio-publico
```

Crea/aprueba un Content Template de WhatsApp que acepte la variable `{{1}}` y configura su Content SID. `APP_URL` debe ser la URL pública canónica para que se pueda validar la firma de los webhooks entrantes.

En ambos proveedores, la plantilla también se usa para alertas al dueño. Si faltan credenciales o plantilla, el ciclo no intenta enviar un texto libre: registra el envío como omitido y lo muestra en el historial.

### 3. Conectar el webhook de respuestas

Registra en el proveedor la URL pública:

```text
https://tu-dominio-publico/api/webhooks/whatsapp
```

- En Meta, selecciona el objeto WhatsApp Business Account y suscribe el campo `messages`. Meta llama `GET` para validar el token y firma los `POST` con `WHATSAPP_APP_SECRET`.
- En Twilio, configura la URL como webhook de mensajes entrantes. Twilio firma cada POST con `TWILIO_AUTH_TOKEN`; por eso el `APP_URL` debe coincidir con la URL pública que configuraste.

El endpoint almacena únicamente la relación de la respuesta con los recordatorios pendientes, su hora y el ID del mensaje. No guarda el texto entrante. Si un mismo número tiene conversaciones pendientes en más de una empresa, el sistema no adivina a qué empresa pertenece la respuesta.

### 4. Activar la revisión automática

`vercel.json` registra `/api/cron/receivables-reminders` todos los días a las 12:00 UTC (06:00 en Managua). Configura `CRON_SECRET` en Vercel para que el Cron envíe la cabecera `Authorization: Bearer <CRON_SECRET>`. El ciclo calcula el día local de cada empresa, busca cuentas `open`/`partial` con saldo y vencimiento, y es idempotente por empresa, deuda y día local.

Si tu plan/operación requiere un intervalo más preciso, puedes ejecutar el endpoint cada hora desde un plan compatible o desde un cron externo; las claves de idempotencia evitan reenvíos durante el mismo día local. Como mínimo debe ejecutarse una vez al día. La ruta acepta un `tenantId` UUID opcional para diagnósticos, pero exige el mismo secreto.

### 5. Dar consentimiento y configurar el agente

1. En **Clientes**, abre cada ficha y marca **El cliente autorizó recordatorios de cobranza por WhatsApp** únicamente después de obtener autorización expresa.
2. Confirma que el teléfono tenga código de país (formato E.164, por ejemplo `+50588888888`).
3. En **Cuentas por cobrar**, el dueño, admin o gerente activa el agente y define:
   - días de anticipación del primer recordatorio;
   - frecuencia en días entre envíos exitosos;
   - texto y variables `{nombre}`, `{monto}`, `{empresa}`, `{factura}`, `{vencimiento}` y `{dias_vencidos}`;
   - alertas al dueño y el WhatsApp de destino. Si se deja vacío, se reutiliza el destino guardado en **Resumen diario automático**.
4. Guarda la configuración. El panel muestra si el proveedor, la plantilla y el webhook están listos.

Los clientes existentes no reciben mensajes hasta que se confirme y registre su consentimiento. Los envíos proactivos se hacen con una plantilla aprobada, no con texto libre, para respetar la ventana de conversación de WhatsApp.

### 6. Operación y validación

- La cartera muestra **Al día**, **Por vencer** (vencimiento dentro de 7 días), **Vencida** y **Pagada**. Los pagos totales y parciales se registran desde esa vista; al cubrir el saldo, el RPC actual de pagos marca la cuenta como pagada de forma transaccional.
- El primer aviso se envía al entrar en la ventana configurada. Los siguientes se programan desde el último envío exitoso; intentos fallidos u omitidos no cuentan como envío exitoso.
- El dueño recibe una alerta cuando una deuda activa pasa a vencida. Si un recordatorio no tiene respuesta entrante después del intervalo de frecuencia, el dueño recibe una alerta de seguimiento. Las alertas enviadas no se repiten para esa deuda; un intento fallido/omitido puede volver a intentarse en el siguiente día local.
- El historial indica intentos omitidos, fallidos, enviados y respuestas detectadas.

Pruebas locales recomendadas:

```bash
npm run typecheck
node --import tsx --test tests/receivables-reminders.test.ts tests/receivables-reminders-api.test.ts
```
