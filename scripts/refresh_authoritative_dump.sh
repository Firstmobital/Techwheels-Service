#!/usr/bin/env bash
set -euo pipefail

# Refresh authoritative DB dump + chunk mirror and reset post-dump promotion window.
# Requires PGPASSWORD to be present in environment.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dump_dir="$repo_root/local_folder/backups"
chunks_dir="$dump_dir/chunks"
dump_file="$dump_dir/full_database.sql"
manifest_file="$repo_root/supabase/evidence/authoritative_dump_manifest.json"
window_file="$repo_root/supabase/evidence/post_dump_verified_promotions.md"

mkdir -p "$dump_dir" "$chunks_dir" "$repo_root/supabase/evidence"

if [[ -z "${PGPASSWORD:-}" ]]; then
  echo "Error: PGPASSWORD is not set. Export it before running this script." >&2
  exit 1
fi

pg_dump \
  --verbose \
  --format=plain \
  --encoding=UTF8 \
  --create \
  --clean \
  --if-exists \
  --host=aws-1-ap-south-1.pooler.supabase.com \
  --port=5432 \
  --username=postgres.jmdndcphkmaljhwgzqxq \
  --dbname=postgres \
  > "$dump_file"

rm -f "$chunks_dir/full_database.sql.part_"*
split -d -a 3 -b 19m "$dump_file" "$chunks_dir/full_database.sql.part_"

dump_sha="$(shasum -a 256 "$dump_file" | awk '{print $1}')"
dump_size="$(stat -f%z "$dump_file")"
dump_created_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

cat > "$manifest_file" <<EOF
{
  "authoritative_dump_path": "local_folder/backups/full_database.sql",
  "chunk_mirror_glob": "local_folder/backups/chunks/full_database.sql.part_*",
  "created_at_utc": "$dump_created_at",
  "sha256": "$dump_sha",
  "size_bytes": $dump_size,
  "host": "aws-1-ap-south-1.pooler.supabase.com",
  "port": 5432,
  "database": "postgres",
  "username": "postgres.jmdndcphkmaljhwgzqxq"
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
