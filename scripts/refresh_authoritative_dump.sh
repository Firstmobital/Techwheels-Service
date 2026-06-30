#!/usr/bin/env bash
set -euo pipefail

# WHAT CHANGED (2026-06-29): This script used to contain the pg_dump logic
# directly, with the DB host/port/username hardcoded inline and only
# PGPASSWORD read from the environment. It has been superseded by
# scripts/backup-full-db.sh, which does the exact same job (same output
# file, same chunk-splitting behavior, same manifest/window files) but
# reads ALL connection details from environment variables
# (SUPABASE_DB_HOST/PORT/NAME/USER/PASSWORD) — no hardcoded credentials.
#
# This file is kept only so existing docs/automation that call
# `scripts/refresh_authoritative_dump.sh` keep working unchanged. It is a
# thin wrapper — no logic lives here anymore. Prefer calling
# scripts/backup-full-db.sh directly going forward.
#
# See docs/shared/reference/DATABASE_TRUTH.md for the full Database Authority Hierarchy.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$repo_root/scripts/backup-full-db.sh" "$@"
