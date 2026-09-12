# Módulo fiscal extensible por empresa

## Objetivo

ConexiaX incorpora un núcleo fiscal desacoplado del checkout. Cada empresa puede seleccionar su modo de facturación, país, moneda, prefijo, tipos de documento y proveedor sin modificar el flujo comercial principal. La configuración se guarda bajo `tenants/{tenantId}/settings/fiscal` y se autoriza únicamente para responsables de la empresa.

## Proveedores soportados por el núcleo

| Proveedor | Propósito | Emisión externa |
|---|---|---|
| `manual` | Numeración y registro interno | No |
| `generic_api` | Adaptador para un proveedor mediante API | Preparado |
| `dgi_nicaragua` | Adaptador de cumplimiento conectado mediante DGI o proveedor autorizado | Preparado, no implica una API pública confirmada |
| `custom` | Adaptador propio de la empresa o integrador | Preparado |

La configuración acepta `manual`, `sandbox` o `production`. Para cualquier modo externo se exige un endpoint y una referencia segura de credenciales (`credentialRef`); el secreto no se devuelve al navegador ni se almacena como valor visible en la respuesta.

## Endpoints

`GET /api/fiscal/config` devuelve la configuración de la empresa y el catálogo de proveedores. La referencia de credenciales se presenta únicamente como `configured`.

`PATCH /api/fiscal/config` permite a `owner`, `admin` o `gerente` actualizar proveedor, modo, endpoint, referencia de credenciales, moneda, país, prefijo y tipos de documento.

## Flujo de una venta

La venta lee la configuración fiscal del tenant y guarda en el documento comercial el proveedor, modo y estado inicial de emisión. En modo manual, el estado es `not_requested`; en modo externo, queda `pending` hasta que un adaptador real procese el documento. La numeración continúa siendo transaccional e idempotente dentro del tenant.

## DGI Nicaragua: alcance confirmado

La información pública de la DGI confirma facturación manual o electrónica, autorización de sistemas computarizados, requisitos de factura y numeración por sucursal. No publica en las fuentes revisadas un contrato técnico de API, URL de emisión, esquema XML/JSON, OAuth, sandbox o webhook. Por eso `dgi_nicaragua` no debe presentarse como una conexión directa ya disponible. El detalle técnico y la matriz de endpoints se encuentran en `docs/DGI-NICARAGUA-ADAPTER-RESEARCH.md`.

## Lo que todavía falta para emisión real

Este bloque prepara la arquitectura, pero no afirma que ConexiaX ya emita facturas electrónicas oficiales. Cada proveedor requiere un adaptador específico con autenticación, firma o certificados, formato fiscal, envío, consulta de estado, reintentos, cancelaciones, almacenamiento de XML/PDF y pruebas en sandbox. Esos secretos deben vivir en un gestor seguro o en variables protegidas del servidor; nunca en Firestore legible por usuarios ni en el navegador.

Antes de activar producción se debe confirmar el país, la autoridad tributaria, el proveedor elegido, el contrato de API y los requisitos legales aplicables a cada empresa.
