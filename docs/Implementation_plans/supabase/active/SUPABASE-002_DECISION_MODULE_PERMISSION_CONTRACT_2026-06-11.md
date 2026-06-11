# SUPABASE-002 Decision Note: Modules and Permission Contract Mismatch

Date: 2026-06-11
Plan: SUPABASE-002_DB_CODE_COMPARISON_REMEDIATION_PLAN_2026-06-11.md
Status: Approved for implementation

## Decision

Use canonical schema contract only:

1. modules
- name
- label
- description
- route
- is_active

2. user_module_permissions
- user_id
- module_id
- can_view
- can_modify
- can_delete

Do not use legacy/non-canonical fields:
- modules.module_name
- modules.display_name
- user_module_permissions.module_name
- user_module_permissions.can_access

## Why

1. Authoritative dump confirms canonical contract.
2. Legacy field names cause migration replay failure and governance drift.
3. Canonical contract aligns with existing helper functions and RBAC architecture.

## Backfill and Transform Rules

1. For bodyshop_repair module alignment:
- Upsert modules row by name = 'bodyshop_repair'.

2. For user permissions:
- Insert missing user_module_permissions rows by module_id.
- Default inserted values: can_view=true, can_modify=false, can_delete=false.
- Do not overwrite existing per-user permissions.

3. Replay safety:
- All operations must be idempotent.
- Use ON CONFLICT and existence guards.

## Evidence

1. Authoritative contract snapshot:
- supabase/evidence/2026-06-11_supabase-002_bodyshop_authoritative_contract_snapshot.md

2. Corrective migration:
- supabase/migrations/20260611170000_supabase_002_bodyshop_authoritative_alignment.sql

3. SQL checks:
- supabase/sql_checks/20260611170000_supabase_002_bodyshop_authoritative_alignment_checks.sql
