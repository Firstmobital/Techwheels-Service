#!/usr/bin/env bash
set -euo pipefail

# Generate the SECONDARY database truth file (full schema + row data):
#   local_folder/backups/full_database.sql
# Then remove old chunk files and re-split into 19MB chunks under:
#   local_folder/backups/chunks/
#
# Strategy (always starts fresh — never appends to an old dump):
#   1. Resolve a direct DB connection when possible (pooler drops long COPY streams).
#   2. Discover large tables from live DB size stats (skip extension-owned
#      runtime tables such as net._http_response — pg_dump never emits their rows).
#   3. Phase 1: schema + all row data except large tables (one connection).
#   4. Phase 2: each large table on its own connection, with pauses + retries.
#      Data presence is checked with a byte search (COPY or INSERT), not grep.
#      Attempts 3+ fall back to --inserts if COPY data is missing.
#      Header-only dumps (extension / no dumpable data) are skipped, not retried.
#   5. Verify every dumped large table landed in the file before chunking.
#
# Required environment variables:
#   SUPABASE_DB_PASSWORD
#   plus either:
#     SUPABASE_PROJECT_REF          (recommended — script uses direct db.<ref>.supabase.co)
#   or full connection details:
#     SUPABASE_DB_HOST
#     SUPABASE_DB_PORT
#     SUPABASE_DB_NAME
#     SUPABASE_DB_USER
#
# Optional:
#   BACKUP_USE_POOLER=1             Force pooler host/user from SUPABASE_DB_* vars.
#   BACKUP_LARGE_TABLE_MIN_BYTES=5242880   Tables >= 5 MiB are dumped separately (default).
#   BACKUP_TABLE_PAUSE_SEC=20       Pause between large-table dumps (default 20).
#
# Usage:
#   1. Copy .env.example -> .env.local and fill in real values (never commit .env.local).
#   2. scripts/backup-full-db.sh
#
# The script auto-loads .env.local from the repo root — no need to export secrets in the shell.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load local secrets once from .env.local (gitignored). Avoids typing passwords in the terminal.
env_local="$repo_root/.env.local"
if [[ -f "$env_local" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$env_local"
  set +a
fi

dump_dir="$repo_root/local_folder/backups"
chunks_dir="$dump_dir/chunks"
dump_file="$dump_dir/full_database.sql"
evidence_dir="$repo_root/supabase/evidence"
manifest_file="$evidence_dir/authoritative_dump_manifest.json"
window_file="$evidence_dir/post_dump_verified_promotions.md"

if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  SUPABASE_DB_PASSWORD="${PGPASSWORD:-}"
fi

if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "Error: set SUPABASE_DB_PASSWORD or PGPASSWORD." >&2
  exit 1
fi

if [[ -z "${SUPABASE_PROJECT_REF:-}" && "${SUPABASE_DB_USER:-}" == postgres.* ]]; then
  SUPABASE_PROJECT_REF="${SUPABASE_DB_USER#postgres.}"
fi

SUPABASE_DB_PORT="${SUPABASE_DB_PORT:-5432}"
SUPABASE_DB_NAME="${SUPABASE_DB_NAME:-postgres}"

if [[ "${BACKUP_USE_POOLER:-}" == "1" ]]; then
  required_vars=(SUPABASE_DB_HOST SUPABASE_DB_USER)
elif [[ -z "${SUPABASE_PROJECT_REF:-}" && ( -z "${SUPABASE_DB_HOST:-}" || -z "${SUPABASE_DB_USER:-}" ) ]]; then
  echo "Error: set SUPABASE_PROJECT_REF (recommended) or SUPABASE_DB_HOST + SUPABASE_DB_USER." >&2
  exit 1
else
  required_vars=()
fi

missing=()
if ((${#required_vars[@]} > 0)); then
  for v in "${required_vars[@]}"; do
    if [[ -z "${!v:-}" ]]; then
      missing+=("$v")
    fi
  done
fi
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Error: missing required environment variable(s): ${missing[*]}" >&2
  exit 1
fi

mkdir -p "$dump_dir" "$chunks_dir" "$evidence_dir"
rm -f "$dump_file"

# User grep config must not affect COPY-block detection (GREP_OPTIONS is inherited).
unset GREP_OPTIONS

export PGPASSWORD="$SUPABASE_DB_PASSWORD"
export PGOPTIONS="${PGOPTIONS:--c statement_timeout=0 -c lock_timeout=0}"

resolve_connection() {
  if [[ "${BACKUP_USE_POOLER:-}" == "1" ]]; then
    echo "Connection: pooler ${SUPABASE_DB_HOST}:${SUPABASE_DB_PORT} as ${SUPABASE_DB_USER}" >&2
    return
  fi

  if [[ -n "${SUPABASE_DB_DIRECT_HOST:-}" ]]; then
    SUPABASE_DB_HOST="$SUPABASE_DB_DIRECT_HOST"
    SUPABASE_DB_USER="${SUPABASE_DB_DIRECT_USER:-postgres}"
  elif [[ -n "${SUPABASE_PROJECT_REF:-}" ]]; then
    SUPABASE_DB_HOST="db.${SUPABASE_PROJECT_REF}.supabase.co"
    SUPABASE_DB_USER="postgres"
  fi

  echo "Connection: direct ${SUPABASE_DB_HOST}:${SUPABASE_DB_PORT} as ${SUPABASE_DB_USER}" >&2
}

resolve_connection

# Conninfo (not --host/--user) so libpq keepalives survive long COPY streams.
pg_conninfo="host=${SUPABASE_DB_HOST} port=${SUPABASE_DB_PORT} user=${SUPABASE_DB_USER} dbname=${SUPABASE_DB_NAME} sslmode=require keepalives=1 keepalives_idle=30 keepalives_interval=10 keepalives_count=5 tcp_user_timeout=60000"
pg_conn=(--dbname="$pg_conninfo")
table_pause_sec="${BACKUP_TABLE_PAUSE_SEC:-20}"
large_table_min_bytes="${BACKUP_LARGE_TABLE_MIN_BYTES:-5242880}"
max_attempts=5
retry_waits=(15 30 60 90 120)

known_large_tables=(
  public.all_service_data
  public.all_service_data_dynamic
  public.job_card_closed_data
  public.job_cards
  public.open_job_cards
  public.service_invoice_data
  public.service_invoice_order_data
  public.service_vas_jc_data
)

run_pg_dump() {
  pg_dump --verbose --format=plain --encoding=UTF8 "$@"
}

run_psql() {
  psql "${pg_conn[@]}" -v ON_ERROR_STOP=1 "$@"
}

discover_large_tables() {
  run_psql -Atq <<SQL
SELECT n.nspname || '.' || c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname NOT IN (
    'pg_catalog',
    'information_schema',
    'net',
    'pgbouncer',
    'cron'
  )
  AND pg_total_relation_size(c.oid) >= ${large_table_min_bytes}
  AND (
    NOT EXISTS (
      SELECT 1
      FROM pg_depend d
      WHERE d.classid = 'pg_class'::regclass
        AND d.objid = c.oid
        AND d.deptype = 'e'
    )
    OR EXISTS (
      SELECT 1
      FROM pg_extension e
      WHERE c.oid = ANY (e.extconfig)
    )
  )
ORDER BY pg_total_relation_size(c.oid) DESC;
SQL
}

merge_unique_tables() {
  local -a merged=()
  local table seen
  for table in "$@"; do
    [[ -z "$table" ]] && continue
    seen=0
    for existing in "${merged[@]:-}"; do
      if [[ "$existing" == "$table" ]]; then
        seen=1
        break
      fi
    done
    if [[ "$seen" -eq 0 ]]; then
      merged+=("$table")
    fi
  done
  if ((${#merged[@]} > 0)); then
    printf '%s\n' "${merged[@]}"
  fi
}

table_schema() {
  local table="$1"
  printf '%s' "${table%%.*}"
}

table_relname() {
  local table="$1"
  local rel="${table#*.}"
  rel="${rel#\"}"
  rel="${rel%\"}"
  printf '%s' "$rel"
}

pg_dump_table_selector() {
  local table="$1"
  local schema rel
  schema="$(table_schema "$table")"
  rel="$(table_relname "$table")"
  if [[ "$rel" == *[A-Z]* ]]; then
    printf '%s."%s"' "$schema" "$rel"
  else
    printf '%s.%s' "$schema" "$rel"
  fi
}

# Byte search (not grep): ignores GREP_OPTIONS, binary rows, and quoted identifiers.
dump_contains_table_data() {
  local table="$1"
  local file="$2"
  python3 - "$(table_schema "$table")" "$(table_relname "$table")" "$file" <<'PY'
import sys

schema, rel, path = sys.argv[1], sys.argv[2], sys.argv[3]
prefixes = (b"COPY ", b"INSERT INTO ")
suffixes = [
    f"{schema}.{rel} ".encode(),
    f"{schema}.{rel}(".encode(),
    f'{schema}."{rel}"'.encode(),
    f'"{schema}"."{rel}"'.encode(),
    f'"{schema}".{rel}'.encode(),
]
needles = [prefix + suffix for prefix in prefixes for suffix in suffixes]
max_n = max(len(n) for n in needles)
tail = b""
with open(path, "rb") as fh:
    while True:
        chunk = fh.read(1024 * 1024)
        if not chunk:
            sys.exit(1)
        data = tail + chunk
        if any(n in data for n in needles):
            sys.exit(0)
        tail = data[-(max_n - 1) :]
PY
}

# Complete pg_dump that emitted only headers — typical for extension members.
dump_is_header_only() {
  local file="$1"
  [[ -s "$file" ]] || return 1
  grep -Fq "PostgreSQL database dump complete" "$file" || return 1
  python3 - "$file" <<'PY'
import sys
data = open(sys.argv[1], "rb").read()
has_copy = b"\nCOPY " in data or data.startswith(b"COPY ")
has_insert = b"\nINSERT INTO " in data or data.startswith(b"INSERT INTO ")
sys.exit(0 if not has_copy and not has_insert else 1)
PY
}

describe_failed_table_dump() {
  local table="$1"
  local file="$2"
  local size
  size="$(wc -c < "$file" | tr -d ' ')"
  echo "Dump diagnostics for ${table}: ${size} bytes" >&2
  python3 - "$file" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
try:
    text = path.read_bytes()[:4096].decode("utf-8", errors="replace")
except OSError as exc:
    print(f"  (could not read dump: {exc})", file=sys.stderr)
    sys.exit(0)
print("  --- dump prefix (SQL headers only) ---", file=sys.stderr)
for i, line in enumerate(text.splitlines(), 1):
    if i > 40:
        break
    if "\t" in line and not line.startswith(("COPY ", "INSERT ", "--", "SET ", "SELECT ")):
        print("  ... (row payload omitted)", file=sys.stderr)
        break
    print(f"  {line[:240]}", file=sys.stderr)
PY
}

discovered_large_tables=()
while IFS= read -r line; do
  [[ -n "$line" ]] && discovered_large_tables+=("$line")
done < <(discover_large_tables || true)

large_tables=()
while IFS= read -r line; do
  [[ -n "$line" ]] && large_tables+=("$line")
done < <(merge_unique_tables "${discovered_large_tables[@]:-}" "${known_large_tables[@]}")

if ((${#large_tables[@]} == 0)); then
  echo "Error: no large tables resolved for phase 2." >&2
  exit 1
fi

echo "Large tables (${#large_tables[@]}) will be dumped on separate connections:" >&2
printf '  - %s\n' "${large_tables[@]}" >&2

skipped_large_tables=()

table_was_skipped() {
  local table="$1"
  local existing
  for existing in "${skipped_large_tables[@]:-}"; do
    if [[ "$existing" == "$table" ]]; then
      return 0
    fi
  done
  return 1
}

dump_with_retries() {
  local label="$1"
  shift
  local attempt=1
  local wait_idx=0
  local tmp_dump
  tmp_dump="$(mktemp "${TMPDIR:-/tmp}/backup-full-db.XXXXXX")"

  while [[ "$attempt" -le "$max_attempts" ]]; do
    : > "$tmp_dump"
    if run_pg_dump "$@" --file="$tmp_dump"; then
      mv "$tmp_dump" "$dump_file"
      return 0
    fi

    rm -f "$dump_file"
    if [[ "$attempt" -eq "$max_attempts" ]]; then
      rm -f "$tmp_dump"
      echo "Error: ${label} failed after ${max_attempts} attempts." >&2
      return 1
    fi

    local wait_secs="${retry_waits[$wait_idx]:-$((attempt * 30))}"
    echo "${label} failed; retrying in ${wait_secs}s (${attempt}/${max_attempts})..." >&2
    rm -f "$tmp_dump"
    sleep "$wait_secs"
    attempt=$((attempt + 1))
    wait_idx=$((wait_idx + 1))
    tmp_dump="$(mktemp "${TMPDIR:-/tmp}/backup-full-db.XXXXXX")"
  done

  rm -f "$tmp_dump"
  return 1
}

append_table_with_retries() {
  local table="$1"
  local index="$2"
  local total="$3"
  local attempt=1
  local wait_idx=0
  local table_dump
  table_dump="$(mktemp "${TMPDIR:-/tmp}/backup-full-db.XXXXXX")"

  echo "Phase 2/2: ${table} (${index}/${total})..." >&2
  local selector dump_extras
  selector="$(pg_dump_table_selector "$table")"
  while [[ "$attempt" -le "$max_attempts" ]]; do
    : > "$table_dump"
    dump_extras=(--strict-names)
    # COPY can fail open on some pooler/proxy paths; INSERT still restores.
    if [[ "$attempt" -ge 3 ]]; then
      echo "Retrying ${table} with INSERT statements instead of COPY..." >&2
      dump_extras+=(--inserts)
    fi
    if run_pg_dump --data-only --table="$selector" --file="$table_dump" "${pg_conn[@]}" "${dump_extras[@]}"; then
      if dump_contains_table_data "$table" "$table_dump"; then
        cat "$table_dump" >> "$dump_file"
        rm -f "$table_dump"
        return 0
      fi
      if dump_is_header_only "$table_dump"; then
        echo "Skipping ${table}: pg_dump has no dumpable row data (extension or non-data table)." >&2
        skipped_large_tables+=("$table")
        rm -f "$table_dump"
        return 0
      fi
      echo "Warning: ${table} dump contained no COPY/INSERT data; treating as failure." >&2
      describe_failed_table_dump "$table" "$table_dump"
    fi

    if [[ "$attempt" -eq "$max_attempts" ]]; then
      rm -f "$table_dump"
      echo "Error: failed to dump ${table} after ${max_attempts} attempts." >&2
      echo "Incomplete Phase 1 dump left at: $dump_file" >&2
      return 1
    fi

    local wait_secs="${retry_waits[$wait_idx]:-$((attempt * 30))}"
    echo "Retrying ${table} in ${wait_secs}s (${attempt}/${max_attempts})..." >&2
    sleep "$wait_secs"
    attempt=$((attempt + 1))
    wait_idx=$((wait_idx + 1))
  done

  rm -f "$table_dump"
  return 1
}

verify_table_in_dump() {
  local table="$1"
  dump_contains_table_data "$table" "$dump_file"
}

echo "Phase 1/2: schema + row data except ${#large_tables[@]} large tables..." >&2
exclude_args=()
for table in "${large_tables[@]}"; do
  exclude_args+=(--exclude-table-data="$(pg_dump_table_selector "$table")")
done

dump_with_retries \
  "Phase 1/2" \
  --create \
  --clean \
  --if-exists \
  "${pg_conn[@]}" \
  "${exclude_args[@]}"

large_table_count="${#large_tables[@]}"
large_table_index=0
for table in "${large_tables[@]}"; do
  large_table_index=$((large_table_index + 1))
  if [[ "$large_table_index" -gt 1 ]]; then
    echo "Pausing ${table_pause_sec}s before next large table..." >&2
    sleep "$table_pause_sec"
  fi
  append_table_with_retries "$table" "$large_table_index" "$large_table_count"
done

echo "Verifying large-table data blocks in dump..." >&2
for table in "${large_tables[@]}"; do
  if table_was_skipped "$table"; then
    echo "  skip ${table} (no dumpable row data)" >&2
    continue
  fi
  if ! verify_table_in_dump "$table"; then
    echo "Error: dump verification failed — missing COPY/INSERT data for ${table}." >&2
    exit 1
  fi
done

rm -f "$chunks_dir/full_database.sql.part_"*
split -d -a 3 -b 19m "$dump_file" "$chunks_dir/full_database.sql.part_"

dump_sha="$(shasum -a 256 "$dump_file" | awk '{print $1}')"
dump_size="$(stat -f%z "$dump_file" 2>/dev/null || stat -c%s "$dump_file")"
dump_created_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

cat > "$manifest_file" <<EOF
{
  "authoritative_dump_path": "local_folder/backups/full_database.sql",
  "chunk_mirror_glob": "local_folder/backups/chunks/full_database.sql.part_*",
  "created_at_utc": "$dump_created_at",
  "sha256": "$dump_sha",
  "size_bytes": $dump_size,
  "host": "$SUPABASE_DB_HOST",
  "port": "$SUPABASE_DB_PORT",
  "database": "$SUPABASE_DB_NAME",
  "username": "$SUPABASE_DB_USER",
  "large_table_count": ${#large_tables[@]},
  "connection_mode": "${BACKUP_USE_POOLER:-direct}"
}
EOF

cat > "$window_file" <<EOF
# Post-Dump Verified Promotions

Window opened at: $dump_created_at
Baseline dump sha256: $dump_sha

This file tracks executed+verified migrations promoted after the latest dump refresh.
When a new dump is refreshed, this window is reset.
EOF

ls -lh "$dump_file"
ls -lh "$chunks_dir"

echo
echo "Backup complete."
echo "Updated manifest: $manifest_file"
echo "Reset post-dump window: $window_file"
