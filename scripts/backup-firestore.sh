#!/usr/bin/env bash
set -euo pipefail

: "${GOOGLE_CLOUD_PROJECT:?Define GOOGLE_CLOUD_PROJECT con el ID del proyecto de producción}"
: "${FIRESTORE_BACKUP_BUCKET:?Define FIRESTORE_BACKUP_BUCKET con gs://...}"
: "${BACKUP_RETENTION_DAYS:=35}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud CLI es obligatorio para exportar Firestore." >&2
  exit 1
fi

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
DESTINATION="${FIRESTORE_BACKUP_BUCKET%/}/tienda-ss/${STAMP}"
STARTED_AT="$(date -u +%s)"

printf 'Exportando Firestore del proyecto %s a %s\n' "${GOOGLE_CLOUD_PROJECT}" "${DESTINATION}"
gcloud firestore export "${DESTINATION}" --project="${GOOGLE_CLOUD_PROJECT}"

cat > /tmp/tienda-ss-backup-manifest.json <<EOF
{"project":"${GOOGLE_CLOUD_PROJECT}","destination":"${DESTINATION}","startedAt":"${STAMP}","durationSeconds":$(( $(date -u +%s) - STARTED_AT )),"retentionDays":${BACKUP_RETENTION_DAYS},"encryptedAtRest":true}
EOF
gsutil cp /tmp/tienda-ss-backup-manifest.json "${DESTINATION}/manifest.json"

CUTOFF="$(date -u -d "-${BACKUP_RETENTION_DAYS} days" +%Y-%m-%dT%H-%M-%SZ)"
echo "Eliminando backups anteriores a ${CUTOFF}"
gsutil ls -d "${FIRESTORE_BACKUP_BUCKET%/}/tienda-ss/*" 2>/dev/null | awk -v cutoff="${CUTOFF}" '$0 < cutoff {print}' | xargs -r -n1 gsutil -m rm -r || true

echo "Backup completado: ${DESTINATION}"
