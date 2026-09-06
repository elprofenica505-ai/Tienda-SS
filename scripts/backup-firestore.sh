#!/usr/bin/env bash
set -euo pipefail

: "${GOOGLE_CLOUD_PROJECT:?Define GOOGLE_CLOUD_PROJECT con el ID del proyecto de producción}"
: "${FIRESTORE_BACKUP_BUCKET:?Define FIRESTORE_BACKUP_BUCKET con gs://...}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI es obligatorio para exportar Firestore." >&2
  exit 1
fi

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
DESTINATION="${FIRESTORE_BACKUP_BUCKET%/}/tienda-ss/${STAMP}"

echo "Exportando Firestore del proyecto ${GOOGLE_CLOUD_PROJECT} a ${DESTINATION}"
gcloud firestore export "${DESTINATION}" \
  --project="${GOOGLE_CLOUD_PROJECT}"

echo "Backup completado: ${DESTINATION}"
