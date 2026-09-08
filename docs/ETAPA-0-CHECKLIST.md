# Etapa 0 — Limpieza y verdad del producto

## Estado

La rama `SaaS-MultiTenant-Profesional` queda preparada para pilotos de pago sin accesos demo visibles en la experiencia de login. La aplicación conserva autenticación real mediante Firebase email/password y el flujo de creación de empresa.

| Estado | Control | Evidencia |
|---|---|---|
| [x] | El login no muestra accesos rápidos, usuarios fake ni clave `1234`. | `components/Login.tsx` y `tests/stage0-product-truth.test.ts`. |
| [x] | La landing y el login dirigen a crear empresa o iniciar sesión real. | `app/page.tsx`, `app/login/page.tsx`, `app/register/page.tsx`, `components/MarketingSite.tsx`. |
| [x] | Las rutas de negocio resuelven el tenant desde la membresía autenticada. | `lib/tenant.ts`, `middleware.ts` y rutas `app/api/**`. |
| [x] | El acceso de datos de negocio usa `tenants/{tenantId}/…`. | Catálogo, ventas, inventario, contactos, finanzas, cuentas por cobrar y API pública. |
| [x] | Las colecciones globales legacy no se usan en rutas reales de clientes. | Las reglas rechazan colecciones globales; las referencias legacy quedan confinadas a scripts de migración explícitos. |
| [x] | Un tenant nuevo no copia productos, ventas o clientes demo. | `app/api/tenants/route.ts` crea únicamente tenant y membresía owner; test estático de creación limpia. |
| [x] | Aislamiento entre tenants verificado. | `tests/firestore.rules.test.mjs`, especialmente lecturas cruzadas, escrituras cruzadas y consultas collection-group. |

## Evidencia de aislamiento

Los casos de reglas crean los tenants `tenant-a` y `tenant-b`, autentican usuarios con membresías separadas y verifican que el usuario de A puede leer sus documentos, no puede leer documentos de B, no puede escribir en B y no puede escapar mediante una consulta de colección. También se rechaza el acceso directo a colecciones globales legacy.

La prueba se ejecuta con:

```bash
npm run test:rules
```

La validación de producto sin demo se ejecuta con:

```bash
node --import tsx --test tests/stage0-product-truth.test.ts
```

## Salida de la etapa

La experiencia de acceso ya no presenta una puerta de entrada de demo interna. Un usuario nuevo debe iniciar sesión con Firebase o seleccionar **Crear empresa**; su catálogo comienza vacío y todos los datos operativos quedan bajo el tenant activo.
