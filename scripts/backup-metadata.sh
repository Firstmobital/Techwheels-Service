#!/usr/bin/env bash
set -euo pipefail

# Generate the PRIMARY database truth file (schema/object metadata only):
#   supabase/backups/full_metadata.sql
#
# This is a schema-only pg_dump and is the authoritative source for tables,
# columns, types/enums, constraints, indexes, views, materialized views,
# functions/RPCs, triggers, RLS, policies, grants/privileges, extensions,
# and comments. See docs/database-truth.md for the full Database Authority
# Hierarchy.
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
#   scripts/backup-metadata.sh

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out_dir="$repo_root/supabase/backups"
out_file="$out_dir/full_metadata.sql"
evidence_dir="$repo_root/supabase/evidence"
manifest_file="$evidence_dir/authoritative_metadata_manifest.json"

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

mkdir -p "$out_dir" "$evidence_dir"

export PGPASSWORD="$SUPABASE_DB_PASSWORD"

# --schema-only        : metadata truth only, never row data
# --no-owner           : omit ALTER ... OWNER TO statements (portability)
# (no --no-privileges) : GRANT/REVOKE privilege statements are kept on purpose
pg_dump \
  --schema-only \
  --no-owner \
  --verbose \
  --format=plain \
  --encoding=UTF8 \
  --host="$SUPABASE_DB_HOST" \
  --port="$SUPABASE_DB_PORT" \
  --username="$SUPABASE_DB_USER" \
  --dbname="$SUPABASE_DB_NAME" \
  > "$out_file"

dump_sha="$(shasum -a 256 "$out_file" | awk '{print $1}')"
dump_size="$(stat -f%z "$out_file" 2>/dev/null || stat -c%s "$out_file")"
dump_created_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

cat > "$manifest_file" <<EOF
{
  "authoritative_metadata_path": "supabase/backups/full_metadata.sql",
  "created_at_utc": "$dump_created_at",
  "sha256": "$dump_sha",
  "size_bytes": $dump_size,
  "host": "$SUPABASE_DB_HOST",
  "port": "$SUPABASE_DB_PORT",
  "database": "$SUPABASE_DB_NAME",
  "username": "$SUPABASE_DB_USER",
  "pg_dump_flags": "--schema-only --no-owner (privileges/grants included, --no-privileges NOT used)"
}
EOF

ls -lh "$out_file"
echo
echo "Updated manifest: $manifest_file"
