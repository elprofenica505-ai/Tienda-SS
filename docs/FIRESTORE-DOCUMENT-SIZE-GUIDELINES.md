# Firestore: documentos livianos e imágenes

## Imágenes

Los productos multi-tenant no aceptan ni persisten imágenes Base64 desde `app/api/catalog`. El modelo de producto solo guarda datos operativos y queda preparado para almacenar en el futuro una referencia URL de Firebase Storage.

El catálogo legacy conserva compatibilidad con imágenes existentes, pero las nuevas imágenes se comprimen en el cliente y tienen un límite máximo aproximado de 120 KB antes de guardarse. Si después de una segunda compresión siguen superando ese límite, se rechazan y el documento se guarda sin imagen. Esto evita insertar fotografías grandes en documentos que se listan con frecuencia.

Las fotos de identificación del panel legacy también tienen el mismo límite de 120 KB por imagen. Se mantiene un máximo de dos fotos extra y no se duplican imágenes dentro de ventas o compras.

## Documentos de ventas y compras

Una venta multi-tenant guarda únicamente una fotografía de la operación: líneas con `productId`, nombre, SKU, cantidad, precio unitario y total. No embebe documentos completos del catálogo. Se limita a 50 líneas y 50 productos distintos por venta; los textos de cada línea ya están acotados por la validación existente.

Las compras legacy guardan proveedor y descripción acotados a 120 y 500 caracteres, respectivamente. No se permite almacenar un catálogo o una lista de productos completa dentro de una compra.

## Recomendación de Storage

Para producción, las imágenes nuevas deberían migrarse a Firebase Storage. Firestore debe conservar solamente `imageUrl`, `storagePath` o un campo vacío en los listados. La compatibilidad Base64 queda limitada a la funcionalidad legacy mientras se completa esa migración.
