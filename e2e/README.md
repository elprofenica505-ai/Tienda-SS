# Suite E2E de Playwright

La suite cubre los flujos de **login**, **onboarding** y **creación de productos**. Las pruebas que requieren Firebase Auth y Firestore usan exclusivamente una cuenta E2E dedicada y no crean usuarios ni empresas automáticamente.

## Instalación

```bash
npm install
npx playwright install chromium
```

## Variables requeridas

Configura una cuenta de Firebase destinada únicamente a pruebas:

```bash
export E2E_EMAIL='e2e@example.com'
export E2E_PASSWORD='una-clave-segura'
```

La aplicación debe tener sus variables Firebase configuradas en `.env.local` o en el entorno de ejecución. **Nunca agregues credenciales reales a Git.**

## Ejecución local

Con las variables E2E presentes:

```bash
npm run test:e2e
```

El comando inicia Next.js automáticamente en `http://127.0.0.1:3000` si no se define `BASE_URL`.

Para ejecutar contra un deployment ya disponible:

```bash
BASE_URL=https://tienda-ss-ozkq.vercel.app npm run test:e2e
```

## Pruebas sin credenciales

El caso de validación de email inválido siempre se ejecuta. Los casos autenticados aparecen como `skipped` cuando faltan `E2E_EMAIL` o `E2E_PASSWORD`; esto evita que CI intente usar datos reales o falle de forma ambigua.

## Limpieza

El caso de catálogo archiva el producto que crea. La cuenta E2E y su empresa deben conservarse para reutilizar el entorno. Si se desea una limpieza total, elimina manualmente los datos de prueba desde una cuenta administrativa o usa un proyecto Firebase de staging.

## Reportes

Playwright genera el reporte HTML en `playwright-report/` y artefactos de fallo en `test-results/`. Ambos directorios están ignorados por Git.
