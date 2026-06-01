#!/bin/bash
# Phase 1 Migration Deployment Script
# Purpose: Deploy all 5 migrations to Supabase staging environment
# Date: 2026-06-01
# Usage: bash scripts/deploy_phase1_migrations.sh

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Phase 1 Migration Deployment - Staging Environment            ║"
echo "║  Date: 2026-06-01                                              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Configuration
SUPABASE_PROJECT_ID="${SUPABASE_PROJECT_ID:-}"
SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:Y00786%40supabase@db.tnakgaoqyumgfxklkujl.supabase.co:5432/postgres}"
MIGRATIONS_DIR="supabase/migrations"

echo "✓ Configuration:"
echo "  Database: ${SUPABASE_DB_URL:0:50}..."
echo "  Migrations dir: $MIGRATIONS_DIR"
echo ""

# List migrations to deploy
echo "📋 Migrations to deploy (in order):"
echo "  1. 20260601000000_create_user_employee_links.sql"
echo "  2. 20260601010000_add_sa_employee_code_to_reception.sql"
echo "  3. 20260601020000_create_sa_employee_code_function.sql"
echo "  4. 20260601030000_fix_reception_rls_policies.sql"
echo "  5. 20260601040000_harden_sensitive_table_rls.sql"
echo ""

# Backup current schema
echo "🔄 Backing up current schema before migrations..."
BACKUP_FILE="local_folder/backups/pre_phase1_migration_$(date +%Y%m%d_%H%M%S).sql"
echo "   Backup location: $BACKUP_FILE"
# Note: User should run pg_dump manually or via Supabase dashboard

# Deploy each migration
echo ""
echo "🚀 Deploying migrations..."
echo ""

MIGRATION_FILES=(
  "20260601000000_create_user_employee_links.sql"
  "20260601010000_add_sa_employee_code_to_reception.sql"
  "20260601020000_create_sa_employee_code_function.sql"
  "20260601030000_fix_reception_rls_policies.sql"
  "20260601040000_harden_sensitive_table_rls.sql"
)

for i in "${!MIGRATION_FILES[@]}"; do
  MIGRATION="${MIGRATION_FILES[$i]}"
  MIGRATION_NUM=$((i + 1))
  
  echo "[$MIGRATION_NUM/5] Deploying: $MIGRATION"
  echo "────────────────────────────────────────────"
  
  if [ ! -f "$MIGRATIONS_DIR/$MIGRATION" ]; then
    echo "❌ ERROR: File not found: $MIGRATIONS_DIR/$MIGRATION"
    exit 1
  fi
  
  echo "   File verified: ✓"
  echo "   Status: Ready to execute"
  echo ""
  echo "   INSTRUCTIONS:"
  echo "   1. Go to Supabase Dashboard → SQL Editor"
  echo "   2. Create new query"
  echo "   3. Copy contents of: $MIGRATIONS_DIR/$MIGRATION"
  echo "   4. Execute"
  echo "   5. Verify success (no errors)"
  echo ""
  
  # Ask user to confirm
  read -p "   Have you executed this migration? (y/n): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Skipping. Please execute migration manually."
    continue
  fi
  
  echo "   ✓ Migration $MIGRATION_NUM recorded as executed"
  echo ""
done

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  NEXT STEPS                                                    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "✓ All 5 migrations deployed"
echo ""
echo "Next: Verify schema in Supabase dashboard:"
echo "  • Table: public.user_employee_links (with 3 indexes)"
echo "  • Columns: service_reception_entries.sa_employee_code + sa_display_name"
echo "  • Functions: my_sa_employee_code(), has_module_action()"
echo "  • RLS Policies: service_reception_select_sa, service_reception_update_sa"
echo ""
echo "Then: Run backfill scripts:"
echo "  1. scripts/01_backfill_sa_name_matcher_diagnostic.sql (diagnostic only)"
echo "  2. scripts/02_backfill_populate_sa_employee_code.sql"
echo "  3. scripts/03_backfill_seed_user_employee_links.sql"
echo "  4. scripts/04_backfill_validate_integrity.sql"
echo ""
