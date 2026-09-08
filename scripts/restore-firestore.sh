#!/usr/bin/env bash
set -euo pipefail

: "${GOOGLE_CLOUD_PROJECT:?Define GOOGLE_CLOUD_PROJECT con el ID del proyecto destino}"
: "${FIRESTORE_BACKUP_PATH:?Define FIRESTORE_BACKUP_PATH como gs://bucket/tienda-ss/YYYY-MM-DDTHH-MM-SSZ}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI es obligatorio para restaurar Firestore." >&2
  exit 1
fi

case "${FIRESTORE_BACKUP_PATH}" in
  gs://*/tienda-ss/20*) ;;
  *) echo "FIRESTORE_BACKUP_PATH debe apuntar a un prefijo de backup fechado dentro de gs://.../tienda-ss/." >&2; exit 1 ;;
esac

printf 'Importando Firestore en %s desde %s\n' "${GOOGLE_CLOUD_PROJECT}" "${FIRESTORE_BACKUP_PATH}"
gcloud firestore import "${FIRESTORE_BACKUP_PATH}" --project="${GOOGLE_CLOUD_PROJECT}"
echo "Restore solicitado. Verifica /api/health?ready=true y ejecuta las pruebas de integridad antes de abrir tráfico."
