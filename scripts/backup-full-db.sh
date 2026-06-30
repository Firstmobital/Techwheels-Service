#!/usr/bin/env bash
set -euo pipefail

# Generate the SECONDARY database truth file (full schema + row data):
#   local_folder/backups/full_database.sql
# Then remove old chunk files and re-split into 19MB chunks under:
#   local_folder/backups/chunks/
#
# Strategy (always starts fresh — never appends to an old dump):
#   1. Resolve a direct DB connection when possible (pooler drops long COPY streams).
#   2. Discover large tables from live DB size stats.
#   3. Phase 1: schema + all row data except large tables (one connection).
#   4. Phase 2: each large table on its own connection, with pauses + retries.
#   5. Verify every large table landed in the dump before chunking.
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

pg_conn=(--host="$SUPABASE_DB_HOST" --port="$SUPABASE_DB_PORT" --username="$SUPABASE_DB_USER" --dbname="$SUPABASE_DB_NAME")
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
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND pg_total_relation_size(c.oid) >= ${large_table_min_bytes}
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

copy_marker_for_table() {
  local table="$1"
  local schema rel
  schema="$(table_schema "$table")"
  rel="$(table_relname "$table")"
  if [[ "$rel" == *[A-Z]* ]]; then
    printf 'COPY %s."%s"' "$schema" "$rel"
  else
    printf 'COPY %s.%s ' "$schema" "$rel"
  fi
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

dump_with_retries() {
  local label="$1"
  shift
  local attempt=1
  local wait_idx=0
  local tmp_dump
  tmp_dump="$(mktemp "${TMPDIR:-/tmp}/backup-full-db.XXXXXX")"

  while [[ "$attempt" -le "$max_attempts" ]]; do
    : > "$tmp_dump"
    if run_pg_dump "$@" > "$tmp_dump"; then
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
  local selector copy_marker
  selector="$(pg_dump_table_selector "$table")"
  copy_marker="$(copy_marker_for_table "$table")"
  while [[ "$attempt" -le "$max_attempts" ]]; do
    : > "$table_dump"
    if run_pg_dump --data-only --table="$selector" "${pg_conn[@]}" > "$table_dump"; then
      if ! grep -Fq "$copy_marker" "$table_dump"; then
        echo "Warning: ${table} dump contained no COPY block; treating as failure." >&2
      else
        cat "$table_dump" >> "$dump_file"
        rm -f "$table_dump"
        return 0
      fi
    fi

    if [[ "$attempt" -eq "$max_attempts" ]]; then
      rm -f "$table_dump" "$dump_file"
      echo "Error: failed to dump ${table} after ${max_attempts} attempts." >&2
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
  grep -Fq "$(copy_marker_for_table "$table")" "$dump_file"
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

echo "Verifying large-table COPY blocks in dump..." >&2
for table in "${large_tables[@]}"; do
  if ! verify_table_in_dump "$table"; then
    rm -f "$dump_file"
    echo "Error: dump verification failed — missing COPY block for ${table}." >&2
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
