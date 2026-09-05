# Arquitectura SaaS multi-tenant universal

## Decisión de producto

Tienda-SS no se convertirá en una aplicación para una empresa específica. Se convertirá en una plataforma SaaS universal para empresas de distintos nichos.

Los productos que existen actualmente en las colecciones globales son datos de prueba. No se asignarán a ningún cliente ni se copiarán automáticamente a un tenant real.

## Estado inicial de una empresa nueva

Cada empresa que se registre tendrá:

```text
tenants/{tenantId}
tenants/{tenantId}/members/{ownerUid}
```

Pero comenzará con sus catálogos vacíos:

```text
products: []
categories: []
sales: []
purchases: []
orders: []
credits: []
```

El propietario podrá agregar sus propios productos, categorías, usuarios, precios, inventario y configuraciones.

## Nichos soportados

La plataforma no debe asumir que todos los clientes venden los mismos artículos. El modelo de producto debe ser configurable y admitir, como mínimo:

- comercio minorista;
- ferretería;
- tecnología;
- muebles;
- ropa;
- alimentos no perecederos;
- distribución;
- servicios con catálogo;
- otros negocios con inventario.

Por eso no se deben hardcodear nombres de productos, categorías, proveedores ni clientes en la aplicación.

## Datos legacy de prueba

Las colecciones actuales (`productos`, `categorias`, `ventas`, etc.) se consideran datos legacy de desarrollo. El script `scripts/migrate-global-data.ts` se utiliza solo para analizarlos y comprobar su contenido. No se ejecutará una copia automática hacia `tenants/tienda-principal`.

No se borran los datos legacy en esta fase. Permanecen intactos como referencia de pruebas hasta decidir si se archivan o se eliminan manualmente en el futuro.

## Alta de un cliente real

El flujo correcto será:

```text
Empresa se registra
    -> se crea su tenant único
    -> se crea su membresía owner
    -> catálogo vacío
    -> owner agrega categorías y productos
    -> owner invita empleados
```

Nunca se reutilizará un tenant global para varios clientes.

## Regla de aislamiento

Toda entidad comercial nueva debe pertenecer a un tenant:

```text
tenants/{tenantId}/products/{productId}
tenants/{tenantId}/categories/{categoryId}
tenants/{tenantId}/sales/{saleId}
tenants/{tenantId}/purchases/{purchaseId}
tenants/{tenantId}/orders/{orderId}
tenants/{tenantId}/credits/{creditId}
tenants/{tenantId}/members/{uid}
```

El `tenantId` se deriva de una membresía verificada. No se confía únicamente en un valor enviado desde el navegador.
