# Optimización de lecturas Firestore

## Alcance

Esta ronda reduce lecturas innecesarias en la rama `SaaS-MultiTenant-Profesional` sin migrar la persistencia fuera de Firestore. El objetivo es que las pantallas de operación no descarguen colecciones completas al entrar y que los listados se consulten bajo demanda.

## Inventario y bodega

El endpoint multi-tenant `GET /api/inventory` ya no consulta productos por defecto. La pantalla de inventario obtiene únicamente los movimientos recientes de los últimos siete días, limitados a `DEFAULT_PAGE_SIZE` (25). La lectura de `tenants/{tenantId}/products` solo se ejecuta cuando el usuario abre la sección **“Productos y stock”** o inicia una acción que necesita seleccionar un producto.

Cuando se abre la sección, la consulta utiliza `limit(25)`, orden estable por nombre e identificador, y un cursor codificado para `startAfter`. El botón **“Cargar 25 productos más”** solicita páginas posteriores sin repetir la primera página. Las alertas y métricas de productos representan la página cargada; no se afirma que sean totales globales sin leer toda la colección.

El home legacy de bodega mantiene el mismo comportamiento: al montar `bodega_home` no carga productos. El botón **“Productos y stock”** ejecuta una lectura acotada de 25 productos únicamente al abrirse.

## Historiales

Los movimientos de inventario se filtran por defecto a los últimos siete días y se limitan a 25 documentos. El dashboard legacy deja de descargar historiales completos al iniciar sesión; sus vistas antiguas realizan lecturas puntuales limitadas a 25 documentos únicamente cuando la vista necesita esos datos.

## Listeners en tiempo real

Se eliminaron todos los `onSnapshot` del código activo y legacy auditado para productos, categorías, ventas, compras, turnos, usuarios y permisos. Los catálogos legacy realizan una lectura única al abrirse, y las vistas legacy consultan lotes limitados cuando cambian de vista. Esto evita conexiones persistentes y lecturas repetidas por cada cambio de documento.

## Consideraciones

Las colecciones legacy (`productos`, `ventas`, `compras`, etc.) no pertenecen al path multi-tenant nuevo y se conservan únicamente para compatibilidad con `/dashboard`. El código nuevo usa el path aislado `tenants/{tenantId}/...` y sus controles de autorización existentes.

Las imágenes no se modifican en esta ronda; las nuevas operaciones no deben guardar imágenes Base64 dentro de documentos. La siguiente etapa recomendable es mover cualquier imagen legacy a Storage y persistir solo su URL o referencia.
