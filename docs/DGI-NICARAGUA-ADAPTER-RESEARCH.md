# Adaptador `dgi_nicaragua`: investigación y definición técnica

**Fecha de investigación:** 12 de septiembre de 2026
**Repositorio:** ConexiaX / `Tienda-SS`
**Alcance:** fuentes públicas oficiales de la Dirección General de Ingresos de Nicaragua (DGI)

## Conclusión ejecutiva

La DGI publica requisitos para facturas, facturación por medios manuales o electrónicos, autorización del sistema de facturación computarizada, numeración por sucursal y acceso a la Ventanilla Electrónica Tributaria (VET). Sin embargo, durante esta investigación no se encontró en `dgi.gob.ni` una especificación pública de API REST, SOAP, XML, JSON, OAuth, certificados, URL de sandbox o endpoint de emisión electrónica que permita conectar ConexiaX directamente a la DGI.

Por esa razón, el adaptador `dgi_nicaragua` debe definirse como un **adaptador de cumplimiento y conexión configurable**, no como una integración oficial ya implementada. La conexión externa solo puede activarse cuando la empresa proporcione una interfaz oficialmente autorizada por la DGI o por su proveedor tecnológico autorizado.

## Hallazgos oficiales

La DGI indica que los responsables recaudadores deben emitir facturas o documentos por medios manuales o electrónicos y que deben cumplirse los requisitos fiscales correspondientes. La misma fuente indica que el RUC del cliente debe constar en determinados casos y describe requisitos como fecha, razón social, RUC del vendedor, bienes o servicios, precios, descuentos, impuesto o exención y tratamiento de documentos anulados.[1]

La DGI también indica que, al abrir una sucursal, debe identificarse la numeración sucesiva mediante una serie o código y comunicarse a la Administración de Rentas correspondiente.[1] Esto afecta directamente el modelo de ConexiaX: la secuencia fiscal no debe ser solamente global por empresa; debe poder segmentarse por sucursal, serie o punto de emisión.

La DGI publica que una sociedad acreditada como contribuyente puede tramitar autorización para usar un sistema de facturación computarizada.[2] Esta autorización administrativa no equivale, por sí sola, a la existencia de una API pública.

La VET permite a las personas jurídicas solicitar accesos mediante usuario y contraseña, con un proceso que incluye solicitud y formalización de seguridad.[2] Las credenciales de VET no deben reutilizarse automáticamente como credenciales de API: la documentación pública consultada no establece que la VET sea un servicio de integración máquina a máquina.

## Lo que no está publicado en las fuentes consultadas

La documentación pública consultada no permite afirmar ninguno de los siguientes puntos:

| Elemento | Estado de evidencia pública |
|---|---|
| URL oficial de API de emisión | No encontrada |
| Endpoint de autenticación OAuth o token | No encontrado |
| Contrato REST o SOAP | No encontrado |
| Esquema XML o JSON de factura electrónica | No encontrado |
| URL oficial de sandbox | No encontrada |
| Firma digital o certificado técnico para API | No especificado públicamente |
| Endpoint de consulta de estado | No encontrado |
| Endpoint de anulación | No encontrado |
| Endpoint de notas de crédito | No encontrado |
| Webhook o callback de aceptación | No encontrado |
| Catálogo técnico de errores | No encontrado |

No se deben inventar estos endpoints. Deben obtenerse mediante autorización, documentación privada de la DGI o documentación del proveedor autorizado que la empresa seleccione.

## Diseño recomendado del adaptador

### Configuración por empresa

La configuración se almacenará en:

```text
tenants/{tenantId}/settings/fiscal
```

Debe incluir, como mínimo:

| Campo | Tipo | Uso |
|---|---|---|
| `provider` | `dgi_nicaragua` | Selecciona el adaptador |
| `mode` | `manual`, `sandbox`, `production` | Controla el ambiente |
| `status` | estado de configuración | Impide activar producción incompleta |
| `country` | `NI` | País fiscal |
| `currency` | `NIO` o moneda autorizada | Moneda del documento |
| `endpoint` | URL | URL entregada por la DGI o proveedor autorizado |
| `credentialRef` | referencia segura | Identifica el secreto sin exponerlo |
| `branchSeries` | mapa por sucursal | Serie o código fiscal por punto de emisión |
| `documentTypes` | lista | Factura, nota de crédito y nota de débito según autorización |
| `nextSequence` | secuencia por serie | Numeración fiscal controlada |

Las credenciales no deben almacenarse en el navegador ni devolverse al frontend. `credentialRef` debe apuntar a un gestor de secretos o a una variable protegida del servidor.

### Endpoints internos de ConexiaX

Estos son endpoints propios de ConexiaX, no endpoints oficiales de la DGI:

| Método | Ruta | Propósito |
|---|---|---|
| `GET` | `/api/fiscal/config` | Consultar proveedor y configuración enmascarada del tenant |
| `PATCH` | `/api/fiscal/config` | Configurar proveedor, ambiente, series y referencia de credenciales |
| `GET` | `/api/fiscal/providers` | Listar adaptadores disponibles y capacidades |
| `POST` | `/api/fiscal/connection/test` | Probar la conexión sin emitir una factura |
| `POST` | `/api/fiscal/documents/{saleId}/submit` | Enviar una venta preparada al adaptador |
| `GET` | `/api/fiscal/documents/{saleId}` | Consultar estado y referencias externas |
| `POST` | `/api/fiscal/documents/{saleId}/cancel` | Solicitar anulación según capacidad del proveedor |
| `POST` | `/api/fiscal/webhooks/{provider}` | Recibir callbacks solo si el proveedor los documenta |

El endpoint `connection/test` debe verificar autenticación y capacidades, pero nunca debe crear un documento fiscal. El endpoint `submit` debe usar una clave de idempotencia derivada de `tenantId`, `saleId` y versión del documento.

### Contrato del adaptador externo

El adaptador debe implementar estas operaciones lógicas:

```text
validateConfig()
 testConnection()
 submitDocument(document)
 getDocumentStatus(externalId)
 cancelDocument(externalId, reason)
 downloadDocument(externalId, format)
```

El código no debe asumir si la implementación externa usa REST, SOAP, XML, JSON, certificados o tokens. Ese detalle pertenece al adaptador concreto configurado para la empresa.

### Estados de emisión

ConexiaX debe conservar una máquina de estados independiente del proveedor:

```text
not_requested
→ pending
→ submitted
→ accepted
```

Las salidas alternativas son:

```text
pending → rejected
submitted → rejected
accepted → cancelled
```

Cada transición debe guardar `attemptId`, `idempotencyKey`, `provider`, `externalId`, fecha, actor, código de respuesta y un resumen no secreto de la respuesta. XML, PDF y respuestas completas deben guardarse en almacenamiento protegido y no en documentos públicos de Firestore.

## Mapeo fiscal mínimo

El documento interno debe soportar, como mínimo:

- Identidad fiscal del emisor.
- RUC del vendedor.
- Razón social y dirección del vendedor.
- Sucursal, serie o punto de emisión.
- Número consecutivo.
- Fecha y hora.
- Identidad fiscal del cliente cuando corresponda.
- Líneas, cantidad, unidad, precio y descuento.
- Base imponible.
- IVA u otros impuestos aplicables.
- Exenciones y su justificación.
- Total.
- Método y condición de pago.
- Relación con factura original en notas de crédito o débito.
- Estado de anulación.

La aplicación debe permitir que el adaptador rechace un documento incompleto antes de consumir una secuencia fiscal.

## Decisiones de implementación

La implementación actual de ConexiaX ya contiene el registro `dgi_nicaragua`, configuración por tenant, modos de ambiente, referencia de credenciales y estados iniciales de emisión. El siguiente trabajo debe ser una conexión concreta solo después de obtener la documentación técnica privada o el proveedor autorizado.

No se debe habilitar `production` solamente porque exista una URL. La activación debe requerir una prueba de conexión exitosa, una configuración de serie por sucursal, una política de reintentos, una prueba de anulación y una validación de documentos en el ambiente autorizado.

## Información que debe entregar la empresa antes de conectar un proveedor

La empresa deberá proporcionar, de forma segura, el nombre del proveedor autorizado, ambiente, URL técnica, método de autenticación, certificado o secreto, catálogo de documentos permitidos, reglas de numeración, mecanismo de consulta de estado, reglas de anulación y evidencia de autorización. Sin esos datos, solo puede habilitarse el modo manual o una integración de prueba no productiva.

## Referencias

[1]: https://www.dgi.gob.ni/FAQ/obligaciones_de_los_responsabl.htm "DGI — Obligaciones de los Responsables Recaudadores"
[2]: https://www.dgi.gob.ni/FAQ/second_topic.htm "DGI — Personas Jurídicas: inscripción y sistema de facturación"
[3]: https://www.dgi.gob.ni/ "DGI — Dirección General de Ingresos de la República de Nicaragua"
[4]: https://dgienlinea.dgi.gob.ni/ "DGI en línea — Ventanilla y servicios electrónicos"
