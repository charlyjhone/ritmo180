#!/bin/sh
# Copia o banco de produção. Uso: DATABASE_URL=... scripts/backup-postgres.sh [pasta]
set -eu
: "${DATABASE_URL:?Defina DATABASE_URL}"
folder="${1:-backups}"
keep="${BACKUP_KEEP:-14}"
mkdir -p "$folder"
file="$folder/ritmo-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --file="$file" "$DATABASE_URL"
pg_restore --list "$file" > /dev/null
ls -1t "$folder"/ritmo-*.dump | tail -n +"$((keep + 1))" | xargs -r rm --
echo "Backup conferido: $file"
