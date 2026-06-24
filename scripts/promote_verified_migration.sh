#!/usr/bin/env bash
set -euo pipefail

# Promote executed+verified migration artifacts into archive to prevent drift.
# Usage:
#   scripts/promote_verified_migration.sh 20260624103000
#   scripts/promote_verified_migration.sh 20260624103000 --with-checks

usage() {
  cat <<'USAGE'
Usage: scripts/promote_verified_migration.sh <timestamp_prefix> [--with-checks]

Arguments:
  <timestamp_prefix>  Migration timestamp prefix, e.g. 20260624103000
  --with-checks       Require at least one matching check file in supabase/sql_checks

Behavior:
  - Moves one migration file from supabase/migrations to supabase/exec_success_migrations/sql
  - Moves matching check files from supabase/sql_checks to supabase/exec_success_migrations/sql_check
  - Appends an entry to supabase/evidence/execution_promotion_log.md
USAGE
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 1
fi

prefix="$1"
require_checks="false"
if [[ "${2:-}" == "--with-checks" ]]; then
  require_checks="true"
fi

if [[ ! "$prefix" =~ ^[0-9]{10,14}$ ]]; then
  echo "Error: prefix must be numeric timestamp-like value (10-14 digits)." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migrations_dir="$repo_root/supabase/migrations"
checks_dir="$repo_root/supabase/sql_checks"
archive_base_dir="$repo_root/supabase/exec_success_migrations"
archive_sql_dir="$archive_base_dir/sql"
archive_sql_check_dir="$archive_base_dir/sql_check"
log_file="$repo_root/supabase/evidence/execution_promotion_log.md"
dump_file="$repo_root/local_folder/backups/full_database.sql"
manifest_file="$repo_root/supabase/evidence/authoritative_dump_manifest.json"
post_dump_window_file="$repo_root/supabase/evidence/post_dump_verified_promotions.md"

migration_matches=()
while IFS= read -r line; do
  migration_matches+=("$line")
done < <(find "$migrations_dir" -maxdepth 1 -type f -name "${prefix}*.sql" ! -name "*_checks.sql" | sort)
if [[ ${#migration_matches[@]} -eq 0 ]]; then
  echo "Error: no migration file found for prefix $prefix in $migrations_dir" >&2
  exit 1
fi
if [[ ${#migration_matches[@]} -gt 1 ]]; then
  echo "Error: multiple migration files matched. Be specific." >&2
  printf '  %s\n' "${migration_matches[@]}" >&2
  exit 1
fi

migration_file="${migration_matches[0]}"

check_matches=()
while IFS= read -r line; do
  check_matches+=("$line")
done < <(find "$checks_dir" -maxdepth 1 -type f -name "${prefix}*checks.sql" | sort)
if [[ "$require_checks" == "true" && ${#check_matches[@]} -eq 0 ]]; then
  echo "Error: --with-checks specified but no check files matched for prefix $prefix" >&2
  exit 1
fi

mkdir -p "$archive_sql_dir"
mkdir -p "$archive_sql_check_dir"
mkdir -p "$(dirname "$log_file")"

# Move migration first.
mig_base="$(basename "$migration_file")"
mv "$migration_file" "$archive_sql_dir/$mig_base"

moved_checks=()
for check_file in "${check_matches[@]}"; do
  check_base="$(basename "$check_file")"
  mv "$check_file" "$archive_sql_check_dir/$check_base"
  moved_checks+=("$check_base")
done

if [[ ! -f "$log_file" ]]; then
  cat > "$log_file" <<'LOGHDR'
# Execution Promotion Log

Tracks migration/check files promoted to supabase/exec_success_migrations after user-confirmed successful SQL checks.
LOGHDR
fi

ts_utc="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
dump_meta="dump_missing"
if [[ -f "$dump_file" ]]; then
  dump_size="$(stat -f%z "$dump_file" 2>/dev/null || echo unknown)"
  dump_sha="$(shasum -a 256 "$dump_file" | awk '{print $1}')"
  dump_meta="size=${dump_size}, sha256=${dump_sha}"
fi

baseline_dump_sha="unknown"
if [[ -f "$manifest_file" ]]; then
  baseline_dump_sha="$(awk -F'"' '/"sha256"/ {print $4; exit}' "$manifest_file")"
fi

if [[ ! -f "$post_dump_window_file" ]]; then
  {
    echo "# Post-Dump Verified Promotions"
    echo
    echo "Window opened at: unknown"
    echo "Baseline dump sha256: $baseline_dump_sha"
    echo
    echo "This file tracks executed+verified migrations promoted after the latest dump refresh."
    echo "When a new dump is refreshed, this window is reset."
  } > "$post_dump_window_file"
fi

{
  echo
  echo "## $ts_utc"
  echo "- prefix: $prefix"
  echo "- moved migration: $mig_base"
  if [[ ${#moved_checks[@]} -gt 0 ]]; then
    echo "- moved checks: ${moved_checks[*]}"
  else
    echo "- moved checks: none"
  fi
  echo "- dump reference: $dump_meta"
} >> "$log_file"

{
  echo
  echo "## $ts_utc"
  echo "- prefix: $prefix"
  echo "- migration: $mig_base"
  if [[ ${#moved_checks[@]} -gt 0 ]]; then
    echo "- checks: ${moved_checks[*]}"
  else
    echo "- checks: none"
  fi
  echo "- baseline_dump_sha256: $baseline_dump_sha"
} >> "$post_dump_window_file"

echo "Promoted migration: $mig_base -> $archive_sql_dir"
if [[ ${#moved_checks[@]} -gt 0 ]]; then
  echo "Promoted checks: ${moved_checks[*]} -> $archive_sql_check_dir"
fi
echo "Updated log: $log_file"
echo "Updated post-dump window: $post_dump_window_file"
