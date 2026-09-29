#!/usr/bin/env bash
set -Eeuo pipefail
export LC_ALL=C

: "${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT must be set}"
: "${FIRESTORE_BACKUP_BUCKET:?FIRESTORE_BACKUP_BUCKET must be set}"

retention_days="${BACKUP_RETENTION_DAYS:-35}"
if [[ ! "$retention_days" =~ ^[1-9][0-9]*$ ]]; then
  echo "BACKUP_RETENTION_DAYS must be a positive integer." >&2
  exit 2
fi
if [[ ! "$GOOGLE_CLOUD_PROJECT" =~ ^[a-zA-Z0-9][a-zA-Z0-9._:-]*$ ]]; then
  echo "GOOGLE_CLOUD_PROJECT contains unsupported characters." >&2
  exit 2
fi

bucket="${FIRESTORE_BACKUP_BUCKET#gs://}"
bucket="${bucket%/}"
if [[ ! "$bucket" =~ ^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$ ]]; then
  echo "FIRESTORE_BACKUP_BUCKET must be a valid GCS bucket name." >&2
  exit 2
fi

backup_root="gs://${bucket}/firestore-backups/${GOOGLE_CLOUD_PROJECT}"
backup_timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
destination="${backup_root}/${backup_timestamp}"
manifest_file="$(mktemp)"
trap 'rm -f "$manifest_file"' EXIT

printf 'Starting Firestore export to %s\n' "$destination"
gcloud firestore export "$destination" \
  --project="$GOOGLE_CLOUD_PROJECT" \
  --database='(default)'

printf 'project=%s\nexported_at_utc=%s\n' \
  "$GOOGLE_CLOUD_PROJECT" "$backup_timestamp" > "$manifest_file"
gcloud storage cp "$manifest_file" "${destination}/.backup-complete"
printf 'Export completed. Applying %s-day retention.\n' "$retention_days"

cutoff_timestamp="$(date -u -d "${retention_days} days ago" +'%Y%m%dT%H%M%SZ')"
objects="$(gcloud storage ls --recursive "${backup_root}/")"
while IFS= read -r object; do
  [[ "$object" == "${backup_root}/"* ]] || continue
  relative_path="${object#"${backup_root}/"}"
  if [[ "$relative_path" =~ ^([0-9]{8}T[0-9]{6}Z)/\.backup-complete$ ]]; then
    old_timestamp="${BASH_REMATCH[1]}"
    if [[ "$old_timestamp" < "$cutoff_timestamp" && "$old_timestamp" != "$backup_timestamp" ]]; then
      printf 'Removing expired backup %s\n' "$old_timestamp"
      gcloud storage rm --recursive "${backup_root}/${old_timestamp}/"
    fi
  fi
done <<< "$objects"

echo "Firestore backup and retention completed successfully."
