# Gates de calidad y CI/CD

El workflow `.github/workflows/ci.yml` bloquea el pipeline si falla cualquiera de estas etapas:

1. Instalación limpia mediante `npm ci`.
2. Secret scanning con Gitleaks.
3. Validación de scripts operativos.
4. Auditoría de dependencias de producción con severidad crítica.
5. Generación de SBOM CycloneDX.
6. Typecheck estricto.
7. Lint con `--max-warnings=0`.
8. Suite unitaria y de integración.
9. Build de producción.
10. Pruebas de reglas Firestore.
11. Dependency Review en pull requests con severidad alta.

El job `e2e-staging` se activa únicamente cuando la variable de repositorio `E2E_ENABLED` vale `true`. Requiere `E2E_BASE_URL`, `E2E_OWNER_EMAIL` y `E2E_OWNER_PASSWORD`; las pruebas mutantes solo se ejecutan con `E2E_RUN_MUTATIONS=true` y deben usar un tenant de staging dedicado.

La suite `e2e/critical-journeys.spec.ts` cubre el flujo de registro, autenticación, creación de producto, venta cobrada, venta a crédito, consulta de cuentas por cobrar, cambio de plan/portal e invitación/aceptación. Los escenarios que escriben datos están protegidos por variables explícitas para no tocar producción por accidente.

## Dependencias

Dependabot abre actualizaciones semanales de npm y mensuales de GitHub Actions. El dependency review bloquea nuevas vulnerabilidades altas en pull requests. El audit completo local todavía reporta vulnerabilidades transitivas de herramientas de desarrollo y de la versión actual de Next/PostCSS; por eso el gate de producción bloquea críticas y el dependency review impide introducir nuevas vulnerabilidades altas. La actualización mayor de Next/Firebase Tools debe hacerse en un PR separado con pruebas de compatibilidad, no mediante `npm audit fix --force` automático.

## Protección de ramas

En GitHub se deben marcar como obligatorios, para `SaaS-MultiTenant-Profesional`, los checks `quality`, `firestore-rules` y `dependency-review`. Si `E2E_ENABLED=true`, también debe ser obligatorio `e2e-staging`. Activar además la regla de no permitir merge cuando el branch esté desactualizado y exigir al menos una revisión.
