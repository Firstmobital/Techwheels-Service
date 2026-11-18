#!/usr/bin/env bash
# Run a guarded bodyshop DO $$ fix script: dry_run first, then real run.
# The SQL file must contain: dry_run constant boolean := true|false;
# On success, dry run ends with: DRY RUN OK - nothing saved. REPORT: ...
# On real run: SAVED. ... or RAISE NOTICE with SAVED.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SQL="${1:?usage: run_bodyshop_guarded_fix.sh path/to/fix.sql}"
cd "$ROOT"
set -a
# shellcheck source=/dev/null
source .env.local
set +a
export PGPASSWORD="$SUPABASE_DB_PASSWORD"
PSQL=(psql -h "$SUPABASE_DB_HOST" -p "$SUPABASE_DB_PORT" -U "$SUPABASE_DB_USER" -d "$SUPABASE_DB_NAME" -v ON_ERROR_STOP=1)

run_sql() {
  unset PGOPTIONS
  "${PSQL[@]}" -f "$SQL"
}

flip_dry_run() {
  local to="$1"
  perl -i -pe "s/dry_run constant boolean := (true|false)/dry_run constant boolean := $to/" "$SQL"
}

if ! grep -q 'dry_run constant boolean' "$SQL"; then
  echo "error: no dry_run constant in $SQL" >&2
  exit 1
fi

flip_dry_run true
echo "=== DRY RUN: $SQL ==="
set +e
out="$(run_sql 2>&1)"
code=$?
set -e
echo "$out"
if [[ $code -ne 0 ]] && ! grep -q 'DRY RUN OK' <<<"$out"; then
  echo "dry run failed (not the expected DRY RUN OK exception)" >&2
  exit "$code"
fi

flip_dry_run false
echo "=== REAL RUN: $SQL ==="
run_sql

flip_dry_run true
echo "=== Done. dry_run reset to true in $SQL ==="