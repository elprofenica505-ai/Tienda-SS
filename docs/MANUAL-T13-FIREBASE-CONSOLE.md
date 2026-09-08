# Manual T13: verificación de costo de Firestore en Firebase Console

**Proyecto:** `tienda-ss-ozkq`  
**Repositorio:** `elprofenica505-ai/Tienda-SS`  
**Rama:** `SaaS-MultiTenant-Profesional`  
**Objetivo:** demostrar que el home de bodega no carga productos automáticamente, que “Productos y stock” carga una página acotada y que no quedan listeners activos al cambiar de pantalla o cerrar sesión.

## 1. Qué se va a comprobar

La prueba tiene tres resultados esperados:

| Control | Resultado esperado |
|---|---|
| Home de bodega sin abrir productos | No aparece una petición de catálogo de productos desde el navegador. |
| Apertura de “Productos y stock” | La respuesta contiene como máximo 25 productos por página. |
| Cambio de pantalla o cierre de sesión | No se mantienen peticiones repetitivas ni listeners de Firestore activos. |

La aplicación SaaS utiliza rutas API protegidas. Por esta razón, Chrome DevTools no muestra una conexión directa del navegador a la colección `products`. El navegador muestra la petición `GET /api/catalog` o la petición de inventario, mientras que la lectura de Firestore ocurre en el servidor mediante Admin SDK. Esta separación es normal y no invalida la prueba.

## 2. Datos y permisos necesarios

Antes de iniciar, prepara lo siguiente:

| Requisito | Detalle |
|---|---|
| Cuenta Firebase | Debe tener acceso al proyecto Firebase asociado a `tienda-ss-ozkq`. Se recomienda rol Viewer, Editor u Owner para consultar Usage y Monitoring. |
| Tenant de prueba | Debe tener al menos un miembro activo con rol `bodega`. |
| URL de la aplicación | Usa el dominio de producción de Vercel o la URL de preview correspondiente a la rama `SaaS-MultiTenant-Profesional`. |
| Navegador | Chrome o Chromium en una ventana de incógnito para evitar caché y sesiones anteriores. |
| Datos de prueba | Ten preparados hasta 25 productos visibles. No es necesario crear productos nuevos durante esta prueba. |

No ejecutes la prueba mientras otros usuarios estén utilizando el mismo proyecto, porque sus lecturas y listeners pueden mezclarse con la medición.

## 3. Abrir Firebase Console

1. Abre [Firebase Console](https://console.firebase.google.com/).
2. Selecciona el proyecto Firebase conectado a `tienda-ss-ozkq`.
3. En el menú lateral entra en **Firestore Database**.
4. Abre la pestaña **Usage** o **Uso**.
5. Selecciona una ventana corta, preferiblemente **Last 1 hour** o **Últimos 60 minutos**.
6. Identifica las gráficas de **Document reads**, **Document writes**, **Document deletes** y, si están disponibles, las métricas de conexiones/listeners.

Firebase indica que los paneles de Usage son estimaciones para detectar tendencias. Las métricas pueden tardar hasta aproximadamente cuatro minutos en reflejarse y se muestrean por minuto. Para un análisis de facturación exacto, el reporte de billing tiene prioridad sobre el panel de Usage. Por ello, anota la hora de inicio y la lectura observada, en lugar de interpretar un punto aislado como una cifra contable exacta.

## 3.1 Procedimiento si solo tienes celular

La prueba se puede hacer parcialmente desde un teléfono. Usa el navegador del celular en modo incógnito y deja Firebase Console abierta en una pestaña separada. La ventana de **60 minutos** es suficiente; no necesitas cambiarla a una ventana más corta.

En el teléfono, realiza esta secuencia sin que otros usuarios estén usando el proyecto:

| Momento | Acción | Qué anotar |
|---|---|---|
| Inicio | Abre Firestore > Usage con rango de 60 minutos | Hora y lecturas visibles en ese momento |
| Baseline | Espera 5 minutos sin abrir la aplicación | Si la gráfica permanece estable |
| Home | Abre la aplicación, inicia sesión como bodega y permanece en el home sin abrir “Productos y stock” durante 2 minutos | Hora de entrada y cambio aproximado de lecturas |
| Catálogo | Pulsa “Productos y stock” una sola vez y espera 2 minutos | Hora de apertura y nuevo cambio aproximado |
| Salida | Cierra sesión o cambia de pantalla y espera 2 minutos | Si las lecturas siguen subiendo sin tocar la aplicación |

Después de cada acción, vuelve a Firebase Console y actualiza la página. Si la gráfica tarda en cambiar, espera hasta cuatro minutos antes de sacar una conclusión. Haz capturas de pantalla del inicio, del momento posterior al home y del momento posterior a abrir el catálogo. Las capturas deben ocultar correos, tokens y datos personales.

Desde el celular no podrás confirmar la cabecera `x-tenant-id`, el contenido exacto de `pagination.pageSize` ni la ausencia de una petición repetitiva en Network. Esas comprobaciones requieren DevTools de escritorio. Con Firebase Console sí puedes validar el patrón agregado: el home sin abrir productos no debe producir un salto grande y, después de salir, las lecturas no deberían continuar aumentando rápidamente mientras no interactúas con la aplicación.

En esta aplicación la consulta de productos se ejecuta en el servidor mediante Admin SDK. Por ello, el gráfico de Firebase es la evidencia principal disponible desde el teléfono, pero no separa automáticamente las lecturas del catálogo de las lecturas de autenticación, tenant, permisos u otros usuarios. La prueba móvil sirve para detectar un aumento anormal; no puede demostrar por sí sola el número exacto de 25 documentos.

Si solo tienes el teléfono, marca T13 como **verificación móvil parcial** cuando el patrón sea estable y registra la limitación en la hoja de evidencia. Marca T13 como **pendiente de verificación técnica completa** si necesitas demostrar de forma exacta `pageSize <= 25`, `nextCursor` o las cabeceras HTTP.

## 4. Preparar Chrome DevTools

1. Abre la aplicación en una ventana de incógnito.
2. Pulsa `F12` o selecciona **Menú > Más herramientas > Herramientas para desarrolladores**.
3. Entra en la pestaña **Network**.
4. Activa **Preserve log**.
5. Activa **Disable cache** mientras DevTools esté abierto.
6. Pulsa el botón de limpieza de Network para empezar con el registro vacío.
7. En el filtro escribe `catalog`.

Para inspeccionar una petición, selecciónala y revisa:

| Sección de DevTools | Qué comprobar |
|---|---|
| Headers > Request URL | Debe ser una ruta de la aplicación, por ejemplo `/api/catalog`. |
| Headers > Request Headers | Debe incluir `Authorization` y `x-tenant-id`. No compartas ni copies el valor completo de `Authorization`. |
| Response | Debe existir `products` y un objeto `pagination`. |
| Response > `pagination.pageSize` | Debe ser `25` o un valor menor. |
| Response > `pagination.hasMore` | Indica si existe otra página. |
| Response > `pagination.nextCursor` | Debe existir solamente cuando hay otra página. |

La respuesta nunca debe contener cientos de productos en una sola página.

## 5. Ejecutar la prueba completa en cinco pasos

### Paso 1: establecer una línea base

En Firebase Usage, anota la hora exacta y el valor aproximado de **Document reads**. En Cloud Monitoring, si tienes acceso, registra también **Snapshot listeners** y **Active connections**. Deja abierta esta pantalla para volver a comparar después.

En Chrome Network, limpia el registro. Inicia sesión con el usuario de prueba del tenant y entra al home de bodega. Espera entre 15 y 30 segundos sin pulsar ningún botón relacionado con productos.

**Resultado esperado:** no aparece una petición `/api/catalog` iniciada por la vista de bodega y no aparece una lectura directa del navegador a una colección de productos.

### Paso 2: comprobar que el home no carga productos

Sin abrir “Productos y stock”, revisa las peticiones de Network. Puede haber peticiones normales de autenticación, configuración o navegación. No las confundas con el catálogo.

Busca específicamente estas señales:

- No debe existir una petición `GET /api/catalog` producida por el home de bodega.
- No debe existir una llamada de SDK visible en Network a `google.firestore.v1.Firestore/Listen` originada por esa pantalla.
- No debe aparecer `onSnapshot` como parte del flujo de bodega.

Si no aparece una petición de catálogo, marca este control como **aprobado**.

### Paso 3: abrir “Productos y stock” y medir la página

1. Limpia nuevamente Network.
2. Pulsa una sola vez **Productos y stock**.
3. Espera a que aparezca el listado.
4. Abre la petición `/api/catalog`.
5. Revisa la respuesta JSON.

El objeto debe ser similar a este ejemplo:

```json
{
  "ok": true,
  "products": [
    "... hasta 25 elementos ..."
  ],
  "pagination": {
    "pageSize": 25,
    "hasMore": false,
    "nextCursor": null
  }
}
```

Cuenta los elementos de `products`. El resultado esperado es **25 o menos**. La ruta también puede devolver categorías, pero las categorías están limitadas por separado a 100 y no deben interpretarse como productos.

En Firebase Usage, espera entre dos y cuatro minutos y compara el gráfico con la línea base. La variación puede incluir autenticación, validación de tenant, reglas, categorías y otras operaciones del mismo proyecto. Por eso la comprobación exacta de la página se hace en la respuesta de `/api/catalog`, mientras el panel de Firebase confirma que no existe un salto de cientos de lecturas.

Si el tenant tiene más de 25 productos, pulsa **Cargar más productos** una sola vez y verifica que se haga una segunda petición con `cursor`. Esa segunda página también debe contener como máximo 25 elementos. El uso de cursor evita descargar de nuevo todo el catálogo.

### Paso 4: comprobar que no hay listeners colgados

1. Con “Productos y stock” abierto, observa Network durante 30 segundos sin realizar acciones.
2. No debería repetirse continuamente la petición `/api/catalog`.
3. Cambia a otra vista o cierra sesión.
4. Limpia Network y espera otros 30 segundos.
5. Comprueba que no reaparezca una petición de catálogo por sí sola.
6. En Cloud Monitoring revisa **Snapshot listeners** y **Active connections** después del intervalo de muestreo.

La aplicación modificada utiliza cargas puntuales mediante `fetch` y no agrega listeners `onSnapshot` en este flujo. Si existiera un listener, Firebase documenta que debe conservarse la función de cancelación y ejecutarse al dejar de necesitarlo. En esta prueba, la señal práctica de ausencia de listener es que no hay reconexiones, callbacks o peticiones repetitivas después de abandonar la pantalla.

### Paso 5: registrar evidencia y repetir en el catálogo SaaS

Repite la medición entrando directamente en `/workspace/catalog`:

1. Abre la ruta con la sesión del tenant de prueba.
2. Revisa que el request sea `/api/catalog`.
3. Confirma que el request incluya la cabecera `x-tenant-id` sin copiar su valor a un documento público.
4. Confirma `pagination.pageSize <= 25` y que la lista inicial no tenga más de 25 productos.
5. Guarda una captura de Network con la URL parcialmente visible, la respuesta paginada y la hora de la prueba. Oculta el token de autorización y cualquier dato personal.

## 6. Cómo interpretar las lecturas

No esperes que el número global de Firebase sea exactamente 25. Una apertura puede incluir varias operaciones legítimas además de la página de productos. Por ejemplo, puede haber autenticación, lectura del tenant, permisos, categorías y la consulta paginada de productos.

| Observación | Interpretación |
|---|---|
| Home sin catálogo y sin `/api/catalog` | El lazy loading funciona en el cliente. |
| `/api/catalog` con 25 productos | La página está acotada correctamente. |
| Cientos de productos en la respuesta | La paginación no se está aplicando o estás usando una versión vieja del despliegue. |
| Peticiones `/api/catalog` repetidas sin interacción | Puede existir un ciclo de renderizado, reintento o listener; investigar antes de aprobar T13. |
| Firebase Usage aumenta, pero no hay request directa en Chrome | Es normal: la lectura puede ejecutarse en el servidor mediante Admin SDK. |
| Snapshot listeners permanece en cero o no aumenta | No hay listeners persistentes en este flujo. |
| Usage no cambia inmediatamente | Espera hasta cuatro minutos por el muestreo del panel. |

La facturación de Firestore también considera detalles que pueden no aparecer de la misma forma en el panel, como consultas sin resultados, lecturas de entradas de índice y el mínimo de una lectura por consulta. Los agregados `count()` pueden tener un cobro mínimo aunque no devuelvan documentos. No uses la suma visual del panel como sustituto de un reporte de facturación.

## 7. Hoja de registro de la prueba

Completa esta tabla durante la ejecución:

| Campo | Resultado |
|---|---|
| Fecha y hora de inicio |  |
| Proyecto Firebase |  |
| Tenant de prueba |  |
| Usuario y rol |  |
| URL probada |  |
| Document reads antes de la prueba |  |
| Document reads después del home sin catálogo |  |
| ¿Apareció `/api/catalog` en el home? | Sí / No |
| Productos devueltos por la primera página |  |
| `pagination.pageSize` |  |
| `pagination.hasMore` |  |
| ¿Se solicitó una segunda página? | Sí / No |
| ¿Hubo peticiones repetitivas al cambiar de pantalla? | Sí / No |
| Snapshot listeners antes/después |  |
| Captura de evidencia guardada | Sí / No |
| Resultado final T13 | Aprobado / Fallido |

## 8. Criterios de aprobación y fallos

Considera T13 **aprobado** cuando el home de bodega no produce una carga de catálogo, la primera página de productos contiene como máximo 25 elementos, el botón de paginación solicita páginas adicionales mediante cursor y no aparecen peticiones repetitivas después de cambiar de pantalla o cerrar sesión.

Considera T13 **fallido** si `/api/catalog` se dispara al entrar al home sin abrir productos, si una respuesta contiene más de 25 productos, si el catálogo se descarga completo, si las peticiones se repiten sin interacción o si Cloud Monitoring muestra listeners persistentes que no desaparecen después de abandonar el flujo.

Si falla, guarda la hora exacta, la URL, la respuesta de Network sin tokens, el tenant afectado y una captura de las métricas. No publiques tokens, correos, identificadores personales ni datos completos de clientes o productos.

## 9. Referencias oficiales

[1]: https://firebase.google.com/docs/firestore/monitor-usage "Monitor Cloud Firestore activity"
[2]: https://firebase.google.com/docs/firestore/query-data/listen "Get realtime updates with Cloud Firestore"
[3]: https://firebase.google.com/docs/firestore/pricing "Cloud Firestore pricing"
[4]: https://console.firebase.google.com/project/_/firestore/usage/last-24h/reads "Firebase Console Firestore usage dashboard"

Las referencias oficiales explican dónde consultar el uso, cómo funcionan los listeners y cómo se calculan las lecturas. El panel de Usage es útil para detectar tendencias, pero la documentación oficial advierte que puede diferir del uso facturado.
