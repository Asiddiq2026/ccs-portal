#!/usr/bin/env bash
# Restore drill: prove a backup actually restores, with the audit chain intact
# and RLS still enforced. A backup nobody has restored is a hope, not a backup.
#
#   ./scripts/db-restore-drill.sh [dump-file]
#
# With no argument it takes a fresh dump via scripts/db-backup.sh first.
# Run from the repo root (on the dev machine: the C:\Users\...\ccs-portal
# junction — npm breaks under the OneDrive path).
#
# What it does, in order:
#   1. verify:audit against the SOURCE database — records row count + tip hash
#   2. restore the dump into a scratch database (dropped and recreated)
#   3. verify:audit against the RESTORE — the chain must be INTACT
#   4. compare tips: identical → the restore is byte-faithful to the source;
#      source ahead by newer rows → reported as such (live writes since the
#      dump), the restore's own intact chain still stands
#   5. RLS spot check on the restore: a context-less ccs_app session must see
#      ZERO appointed_rep rows; an operator context must see the fleet.
#      (Backups that restore without their policies would fail open — this is
#      the check that catches it.)
#   6. drop the scratch database (KEEP_DRILL=1 keeps it for inspection)
#
# Environment (defaults target the local dev cluster):
#   ADMIN_URL       maintenance DB connection for createdb/dropdb
#                   (default postgresql://postgres@localhost:5432/postgres)
#   SOURCE_APP_URL  app-role URL for step 1
#                   (default postgresql://ccs_app:ccs_app@localhost:5432/ccs)
#   DRILL_DB        scratch database name (default ccs_drill)
#   APP_PASSWORD    ccs_app password for the drill connection (default ccs_app,
#                   the local dev value)
#   PGBIN           directory holding pg_restore/psql if not on PATH
#
# Exit 0 only when the restored chain verifies AND the RLS spot check passes.
set -euo pipefail

ADMIN_URL="${ADMIN_URL:-postgresql://postgres@localhost:5432/postgres}"
SOURCE_APP_URL="${SOURCE_APP_URL:-postgresql://ccs_app:ccs_app@localhost:5432/ccs}"
DRILL_DB="${DRILL_DB:-ccs_drill}"
APP_PASSWORD="${APP_PASSWORD:-ccs_app}"
PG_RESTORE="${PGBIN:+${PGBIN}/}pg_restore"
PSQL="${PGBIN:+${PGBIN}/}psql"

command -v "$PG_RESTORE" >/dev/null 2>&1 || { echo "pg_restore not found — set PGBIN" >&2; exit 1; }

# Derive the drill connection URLs from the admin URL's host:port.
HOSTPORT="$(sed -E 's#^postgresql://[^@]*@([^/]+)/.*#\1#' <<<"$ADMIN_URL")"
DRILL_APP_URL="postgresql://ccs_app:${APP_PASSWORD}@${HOSTPORT}/${DRILL_DB}"

DUMP="${1:-}"
if [[ -z "$DUMP" ]]; then
  echo "== no dump given — taking a fresh one =="
  DUMP="$(./scripts/db-backup.sh | sed -n 's/^backup written: \([^ ]*\).*/\1/p')"
  [[ -n "$DUMP" ]] || { echo "db-backup.sh produced no dump path" >&2; exit 1; }
fi
[[ -f "$DUMP" ]] || { echo "dump not found: ${DUMP}" >&2; exit 1; }
if [[ -f "${DUMP}.sha256" ]]; then
  sha256sum --check --quiet "${DUMP}.sha256" && echo "checksum OK: ${DUMP}"
fi

verify() { # verify() <database-url> — runs the full-chain verifier, echoes its output
  # Direct node invocation, not `npm run verify:audit`: npm's cmd shims break
  # when the resolved working-directory path contains "&" (bash resolves
  # junctions to the physical path before spawning). node passes argv intact.
  DATABASE_URL="$1?schema=public" node node_modules/tsx/dist/cli.mjs scripts/verify-audit-chain.ts
}
tip_of()  { sed -n 's/.*): \([0-9a-f]\{64\}\)$/\1/p' <<<"$1"; }
rows_of() { sed -n 's/^audit chain INTACT: \([0-9]*\) rows.*/\1/p' <<<"$1"; }

echo "== 1. source chain =="
SRC_OUT="$(verify "$SOURCE_APP_URL")"; echo "$SRC_OUT"

echo "== 2. restore ${DUMP} -> ${DRILL_DB} =="
# Options before the URL throughout — Windows libpq tools do not permute args.
"$PSQL" --quiet --command="DROP DATABASE IF EXISTS ${DRILL_DB};" \
  --command="CREATE DATABASE ${DRILL_DB};" "$ADMIN_URL"
"$PG_RESTORE" --dbname="${ADMIN_URL%/*}/${DRILL_DB}" --exit-on-error "$DUMP"
echo "restore completed"

echo "== 3. restored chain =="
DRILL_OUT="$(verify "$DRILL_APP_URL")"; echo "$DRILL_OUT"

echo "== 4. tip comparison =="
SRC_TIP="$(tip_of "$SRC_OUT")"; DRILL_TIP="$(tip_of "$DRILL_OUT")"
SRC_ROWS="$(rows_of "$SRC_OUT")"; DRILL_ROWS="$(rows_of "$DRILL_OUT")"
if [[ -n "$DRILL_TIP" && "$SRC_TIP" == "$DRILL_TIP" ]]; then
  echo "PASS: restored tip matches source (${DRILL_TIP})"
elif [[ -n "$DRILL_TIP" && "${SRC_ROWS:-0}" -gt "${DRILL_ROWS:-0}" ]]; then
  echo "PASS (with note): source has ${SRC_ROWS} rows vs ${DRILL_ROWS} restored —"
  echo "writes landed after the dump was taken. The restored chain is intact up"
  echo "to its own tip: ${DRILL_TIP}"
else
  echo "FAIL: restored tip ${DRILL_TIP:-<none>} does not match source ${SRC_TIP:-<none>}" >&2
  exit 1
fi
echo "record the restored tip OUTSIDE the database (SMF review pack) — it is"
echo "the anchor a doctored future restore cannot reproduce."

echo "== 5. RLS spot check on the restore =="
NOCTX="$("$PSQL" --tuples-only --no-align \
  --command="SELECT count(*) FROM appointed_rep;" "$DRILL_APP_URL")"
OPCTX="$("$PSQL" --tuples-only --no-align \
  --command="SELECT set_config('app.role','COMPLIANCE',false);" \
  --command="SELECT count(*) FROM appointed_rep;" "$DRILL_APP_URL" | tail -1)"
if [[ "$NOCTX" == "0" && "$OPCTX" -ge 1 ]]; then
  echo "PASS: context-less session sees 0 rows; operator context sees ${OPCTX} (fail-closed survived the restore)"
else
  echo "FAIL: context-less=${NOCTX} (want 0), operator=${OPCTX} (want >=1) — RLS did NOT survive the restore" >&2
  exit 1
fi

if [[ "${KEEP_DRILL:-0}" == "1" ]]; then
  echo "keeping scratch database ${DRILL_DB} (KEEP_DRILL=1)"
else
  "$PSQL" --quiet --command="DROP DATABASE ${DRILL_DB};" "$ADMIN_URL"
  echo "scratch database ${DRILL_DB} dropped"
fi

echo
echo "DRILL PASSED: ${DUMP} restores with an intact audit chain and enforced RLS."
