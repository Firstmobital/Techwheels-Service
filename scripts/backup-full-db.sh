#!/usr/bin/env bash
set -euo pipefail

# Generate the SECONDARY database truth file (full schema + row data):
#   local_folder/backups/full_database.sql
# Then remove old chunk files and re-split into 19MB chunks under:
#   local_folder/backups/chunks/
#
# Use this dump when row data, seed/lookup/master data, default business
# configuration, or complete database evidence is required. For schema-only
# questions (tables, columns, types, constraints, policies, grants, etc.),
# supabase/backups/full_metadata.sql is primary — see docs/database-truth.md
# for the full Database Authority Hierarchy.
#
# This script is the canonical replacement for the former
# scripts/refresh_authoritative_dump.sh (same output paths/format; that
# script now just calls this one for backward compatibility).
#
# Credentials are read from environment variables only. Nothing is
# hardcoded in this file — never commit real credentials.
#
# Required environment variables:
#   SUPABASE_DB_HOST
#   SUPABASE_DB_PORT
#   SUPABASE_DB_NAME
#   SUPABASE_DB_USER
#   SUPABASE_DB_PASSWORD
#
# Usage:
#   export SUPABASE_DB_HOST=... SUPABASE_DB_PORT=... SUPABASE_DB_NAME=...
#   export SUPABASE_DB_USER=... SUPABASE_DB_PASSWORD=...
#   scripts/backup-full-db.sh

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dump_dir="$repo_root/local_folder/backups"
chunks_dir="$dump_dir/chunks"
dump_file="$dump_dir/full_database.sql"
evidence_dir="$repo_root/supabase/evidence"
manifest_file="$evidence_dir/authoritative_dump_manifest.json"
window_file="$evidence_dir/post_dump_verified_promotions.md"

required_vars=(SUPABASE_DB_HOST SUPABASE_DB_PORT SUPABASE_DB_NAME SUPABASE_DB_USER SUPABASE_DB_PASSWORD)
missing=()
for v in "${required_vars[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    missing+=("$v")
  fi
done
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Error: missing required environment variable(s): ${missing[*]}" >&2
  echo "Export them before running this script (see .env.example)." >&2
  exit 1
fi

mkdir -p "$dump_dir" "$chunks_dir" "$evidence_dir"

export PGPASSWORD="$SUPABASE_DB_PASSWORD"

pg_dump \
  --verbose \
  --format=plain \
  --encoding=UTF8 \
  --create \
  --clean \
  --if-exists \
  --host="$SUPABASE_DB_HOST" \
  --port="$SUPABASE_DB_PORT" \
  --username="$SUPABASE_DB_USER" \
  --dbname="$SUPABASE_DB_NAME" \
  > "$dump_file"

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
  "username": "$SUPABASE_DB_USER"
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
echo "Updated manifest: $manifest_file"
echo "Reset post-dump window: $window_file"
