# Guía de listeners y lecturas Firestore

## Regla del proyecto

> **`getDocs` = carga inicial | `onSnapshot` = solo tiempo real necesario.**

La carga inicial de listados, catálogos, ventas, compras, reportes y dashboards debe ejecutarse como consulta puntual. Solo se debe usar tiempo real cuando el usuario necesita recibir cambios sin actualizar la pantalla, por ejemplo en chats, notificaciones o presencia.

## Resultado de la auditoría

La auditoría de la rama `SaaS-MultiTenant-Profesional` no encontró usos de `onSnapshot` en componentes de negocio, providers ni rutas activas. El único uso permitido queda encapsulado en `hooks/useFirestoreCollection.ts`, dentro de `useCollectionRealtime`, para evitar que cada pantalla implemente listeners sin cleanup.

El `onAuthStateChanged` de `components/tenant/TenantProvider.tsx` es un listener de Firebase Authentication, no un listener de lecturas de Firestore. Su callback devuelve el cleanup de Firebase Auth al desmontar el provider. No se debe confundir con `onSnapshot`.

| Zona auditada | Resultado | Decisión |
|---|---|---|
| `components/tenant/TenantProvider.tsx` | `onAuthStateChanged` de Auth | Se conserva; es necesario para conocer login/logout y tiene cleanup. |
| `components/ProductosAdmin.tsx` | Carga puntual de productos y categorías | Usa `useCollectionOnce`; no abre listener. |
| `components/legacy/LegacyApp.tsx` | Cargas puntuales con `getDocs`/`getDoc` | Se mantienen puntuales; el flujo legacy no usa realtime. |
| Workspace SaaS | Lecturas mediante rutas API con Admin SDK | No mantiene listeners Firestore en el navegador. |
| `hooks/useFirestoreCollection.ts` | Implementación común de carga puntual y realtime | `useCollectionOnce` es la opción por defecto; `useCollectionRealtime` exige una decisión explícita. |

## Hooks reutilizables

`useCollectionOnce(queryRef, enabled)` ejecuta `getDocs` una vez por referencia de consulta. Al desmontar el componente, marca la operación como cancelada para impedir que una respuesta tardía actualice estado desmontado. Este hook se debe usar para listados y dashboards que no requieren actualización automática.

`useCollectionRealtime(queryRef, enabled)` ejecuta `onSnapshot` y retorna `unsubscribe` desde `useEffect`. Solo debe usarse en una pantalla que documente por qué necesita tiempo real. Si la consulta cambia, React ejecuta primero el cleanup del listener anterior.

`useCollectionRealtime` no debe utilizarse en providers globales para datos que el usuario no está viendo. Un provider global puede mantener listeners durante toda la sesión y generar lecturas aunque la aplicación esté en segundo plano.

## Aplicación actual

`components/ProductosAdmin.tsx` usa `useCollectionOnce` para cargar como máximo 25 productos y 100 categorías. Las cargas de productos del flujo SaaS se realizan a través de endpoints API paginados, por lo que el navegador no ejecuta consultas libres ni listeners directos sobre las colecciones multi-tenant.

No se modificó el login multi-tenant. La suscripción de Firebase Auth se conserva porque determina el estado de autenticación y se desmonta automáticamente mediante la función retornada por `onAuthStateChanged`.

## Verificación en Firebase Console

Para comprobar el comportamiento en background, abre Firebase Console, entra en Firestore Database > Usage y selecciona una ventana de una hora. En una ventana de incógnito, abre la aplicación, registra una línea base, entra al home de bodega sin abrir productos y espera entre 30 segundos y 4 minutos. Después abre el catálogo, mide la petición de página, cambia de pantalla y repite la observación.

En Chrome DevTools > Network, confirma que no se repitan peticiones del catálogo sin interacción. En Cloud Monitoring, si está disponible, revisa `Snapshot listeners` y `Active connections`. El panel de Firebase es muestreado y puede tardar varios minutos; se debe comparar el patrón antes y después, no una cifra instantánea aislada.

La verificación detallada de T13 está en `docs/MANUAL-T13-FIREBASE-CONSOLE.md`.

## Criterio para futuros cambios

Antes de añadir `onSnapshot`, el cambio debe identificar la pantalla que necesita tiempo real, explicar por qué una carga puntual no basta y demostrar el cleanup. Si el dato solo se necesita al entrar a la pantalla o después de una acción explícita del usuario, se debe usar `getDocs` o un endpoint API paginado.
