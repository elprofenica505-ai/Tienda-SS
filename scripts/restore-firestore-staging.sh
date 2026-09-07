#!/usr/bin/env bash
set -euo pipefail

: "${STAGING_PROJECT:?Define STAGING_PROJECT}"
: "${BACKUP_URI:?Define BACKUP_URI como gs://.../tienda-ss/FECHA}"
: "${RESTORE_CONFIRM:?Define RESTORE_CONFIRM=YES para evitar restauraciones accidentales}"

if [[ "${RESTORE_CONFIRM}" != "YES" ]]; then
  echo "Restore cancelado: RESTORE_CONFIRM debe ser YES." >&2
  exit 1
fi
command -v gcloud >/dev/null 2>&1 || { echo "gcloud CLI es obligatorio." >&2; exit 1; }
STARTED_AT="$(date -u +%s)"
echo "Restaurando ${BACKUP_URI} sobre staging ${STAGING_PROJECT}"
gcloud firestore import "${BACKUP_URI}" --project="${STAGING_PROJECT}"
DURATION="$(( $(date -u +%s) - STARTED_AT ))"
echo "Restore completado en ${DURATION}s. Validar smoke tests antes de promover."
