# Supabase Plans Category

Purpose: Keep Supabase implementation docs grouped by role under a single category directory.

## Structure

- `active/SUPABASE-001_PRODUCTION_HARDENING_MASTER_PLAN.md`
 - `active/SUPABASE-002_DB_CODE_COMPARISON_REMEDIATION_PLAN_2026-06-11.md`
  - Active master tracker
- `evidence/`
  - Completed audits and analysis supporting tracker evidence
- `runbooks/`
  - Operational checklists and rollout procedures

### active/
- `SUPABASE-001_PRODUCTION_HARDENING_MASTER_PLAN.md`
- `SUPABASE-002_DB_CODE_COMPARISON_REMEDIATION_PLAN_2026-06-11.md`

## Current Files

### evidence/
- `P1_01_CONNECTION_POOLING_AUDIT.md`
- `P1_03_SLOW_QUERY_ANALYSIS.md`
- `P1_04_INDEX_AUDIT_REPORT.md`

### runbooks/
- `SUPABASE_P0_05_LEAKED_PASSWORD_ROLLOUT_CHECKLIST.md`

## Replication Pattern For Other Categories

1. Keep one active master plan in `docs/Implementation_plans/<category>/active/`.
2. Move supporting docs into `<category>/evidence` and `<category>/runbooks`.
3. When the master plan is complete, move it to `docs/Implementation_plans/completed/<category>/` and leave a pointer in `INDEX.md`.
