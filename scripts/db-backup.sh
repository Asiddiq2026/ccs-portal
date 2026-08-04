#!/usr/bin/env bash
# Logical backup of the CCS database: pg_dump custom format + SHA-256 manifest.
#
#   ./scripts/db-backup.sh
#
# Environment (defaults target the local dev cluster):
#   SOURCE_URL   maintenance connection for pg_dump
#                (default postgresql://postgres@localhost:5432/ccs — the local
#                 trust-auth superuser; on Azure use the ccsadmin URL)
#   BACKUP_DIR   where dumps land (default ./backups, gitignored)
#   PGBIN        directory holding pg_dump if it is not on PATH
#
# The dump is schema + data, INCLUDING the RLS policies, FORCE RLS flags and
# grants — scripts/db-restore-drill.sh verifies exactly that survives a
# restore. SHA-256 is recorded alongside so a stored dump can be checked for
# corruption before anyone relies on it.
#
# Retention reminder (SYSC 9): documents & audit 6 years. Dumps that contain
# audit rows inherit that requirement wherever they are stored.
set -euo pipefail

SOURCE_URL="${SOURCE_URL:-postgresql://postgres@localhost:5432/ccs}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
PG_DUMP="${PGBIN:+${PGBIN}/}pg_dump"

command -v "$PG_DUMP" >/dev/null 2>&1 || {
  echo "pg_dump not found — set PGBIN to your PostgreSQL bin directory" >&2
  exit 1
}

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
DUMP="${BACKUP_DIR}/ccs-${STAMP}.dump"

# Options before the URL — Windows builds of libpq tools do not permute args.
"$PG_DUMP" --format=custom --file="$DUMP" "$SOURCE_URL"
sha256sum "$DUMP" > "${DUMP}.sha256"

echo "backup written: ${DUMP} ($(du -h "$DUMP" | cut -f1))"
echo "checksum:       $(cut -d' ' -f1 "${DUMP}.sha256")"
echo
echo "Verify this dump actually restores:  ./scripts/db-restore-drill.sh ${DUMP}"
