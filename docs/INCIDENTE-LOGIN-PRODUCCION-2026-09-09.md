# Incidente de inicio de sesión en producción — 2026-09-09

## Resumen ejecutivo

El problema observado en el móvil tiene **dos causas diferentes**.

Primero, Chrome muestra una advertencia de contraseñas porque la URL abierta es un alias aleatorio de Vercel, no el dominio estable del proyecto. La advertencia no demuestra que Firebase haya rechazado la contraseña ni que el sitio haya sido creado para robarla. Sin embargo, desde el punto de vista de seguridad y confianza, el usuario no debe escribir credenciales en aliases aleatorios.

Segundo, el mensaje de “demasiados intentos” sí proviene de la aplicación. El frontend llamaba a `/api/auth/login-attempt` antes de cada intento de Firebase Auth. Ese pre-filtro tenía un límite de ocho solicitudes por correo, endpoint y combinación, durante quince minutos. Recargas, reintentos y despliegues pueden consumir ese límite aunque el usuario todavía no haya completado correctamente el login.

## Evidencia revisada

El proyecto Vercel correcto es `tienda-ss-ozkq`. Su dominio estable es:

```text
https://tienda-ss-ozkq.vercel.app
```

Vercel reporta como despliegue más reciente el commit `b917778`, que estaba listo en producción. La URL que aparece en la captura contiene otro hostname de despliegue aleatorio. Ese tipo de hostname no debe ser la URL de uso diario ni la URL que se comparte con usuarios.

El endpoint de pre-login utilizaba originalmente los límites `ip: 20`, `endpoint: 8` y `composite: 8`, con ventana de quince minutos. El bloqueo era legítimo como protección contra abuso, pero demasiado estricto para un entorno de prueba usado repetidamente desde un único móvil.

## Correcciones aplicadas

El endpoint de pre-login ahora utiliza una clave versionada `login-attempt:v2`. Esto evita que los contadores antiguos mantengan bloqueados a los usuarios después del despliegue de la corrección.

Los límites se ajustaron a:

| Dimensión | Límite anterior | Límite nuevo | Ventana |
|---|---:|---:|---|
| IP | 20 | 40 | 15 minutos |
| Endpoint | 8 | 15 | 15 minutos |
| Combinación | 8 | 15 | 15 minutos |

La protección de Firebase Auth permanece activa. El cambio no desactiva la seguridad; elimina el doble bloqueo innecesariamente agresivo del pre-login.

La interfaz ahora lee `Retry-After` y muestra aproximadamente cuántos minutos debe esperar el usuario si realmente alcanza el límite.

También se agregó una redirección de producción desde aliases `*.vercel.app` hacia:

```text
https://tienda-ss-ozkq.vercel.app
```

La redirección aplica a despliegues nuevos. Un alias antiguo puede seguir mostrando el comportamiento antiguo porque contiene una versión anterior de la aplicación.

## Qué debe hacer el usuario desde el móvil

No debe usar el enlace aleatorio guardado en el historial, en una notificación de Vercel o en una captura anterior.

Debe abrir manualmente esta URL:

```text
https://tienda-ss-ozkq.vercel.app
```

Después debe cerrar la pestaña anterior, abrir una pestaña nueva y entrar desde el dominio estable. Si Chrome vuelve a mostrar la advertencia en el alias antiguo, debe cerrar esa página y no introducir la contraseña allí.

Si el mensaje de “demasiados intentos” aparece en el dominio estable, debe esperar hasta quince minutos desde el último bloqueo, cerrar la pestaña y volver a abrir el dominio estable. El despliegue de la clave `v2` elimina los contadores anteriores solamente cuando la nueva versión ya está publicada.

Si no recuerda la contraseña, debe utilizar “¿Olvidaste tu contraseña?” desde el dominio estable. No debe realizar muchos intentos consecutivos porque Firebase Auth puede aplicar su propia protección temporal.

## Lo que no se puede resolver desde el móvil

El usuario no puede desplegar índices Firestore desde la aplicación ni corregir variables secretas de Vercel desde el login. Tampoco debe intentar borrar documentos de rate limit desde Firestore sin acceso administrativo.

El despliegue del código sí se realiza automáticamente desde GitHub hacia Vercel cuando el commit llega a la rama configurada. La verificación se realiza en Vercel comprobando que el despliegue contenga el commit correspondiente.

## Estado real del producto

El proyecto no está cerca de ser un SaaS ERP productivo completo. La base técnica ha avanzado, pero todavía se encuentra en una fase de construcción y estabilización de producción.

En particular, el problema actual demuestra que todavía faltaba cerrar una capacidad transversal: **la experiencia de acceso y operación en producción**. Un ERP no está listo solo porque compila y sus pruebas unitarias pasan. También necesita un dominio estable, autenticación confiable, rate limiting probado desde redes reales, logs operativos y un procedimiento móvil de recuperación.

El orden correcto ahora es:

1. Estabilizar dominio y autenticación.
2. Confirmar variables de Firebase en Vercel.
3. Confirmar que el login funciona en el dominio estable desde móvil.
4. Confirmar que `/api/tenants/me` y `/api/organization` cargan sin error.
5. Ejecutar un smoke test autenticado de onboarding, workspace y logout.
6. Recién después continuar con la siguiente etapa funcional.

## Criterio de cierre del incidente

El incidente no se considera cerrado hasta que el usuario pueda, desde un móvil real y usando `https://tienda-ss-ozkq.vercel.app`:

- Abrir la página sin advertencia de alias extraño.
- Iniciar sesión con una cuenta verificada.
- Llegar a `/onboarding` o `/workspace` sin pantalla blanca.
- Ver el nombre de su empresa.
- Recargar el workspace sin perder la sesión.
- Cerrar sesión y volver a iniciar sesión una vez.
- Recibir un mensaje claro si ocurre un bloqueo temporal.

## Referencias

[1]: https://tienda-ss-ozkq.vercel.app "Dominio estable de producción de ConexiaX"
[2]: ../README.md "Repositorio Tienda-SS"
