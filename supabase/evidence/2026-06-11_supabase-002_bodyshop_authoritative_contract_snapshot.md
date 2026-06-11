# SUPABASE-002 Evidence: Bodyshop Authoritative Contract Snapshot

Date: 2026-06-11
Plan: SUPABASE-002_DB_CODE_COMPARISON_REMEDIATION_PLAN_2026-06-11.md
Source of truth: local_folder/backups/full_database.sql
Mirror source: local_folder/backups/chunks/full_database.sql.part_*

## Scope

This snapshot freezes the authoritative deployed bodyshop contract used for remediation implementation.
If any conflict appears in code/docs, the local authoritative dump wins.

## Authoritative Bodyshop Objects

1. Tables
- public.bodyshop_repair_cards
- public.bodyshop_assignments

2. Core helper function
- public.update_bodyshop_assignments_updated_at() RETURNS trigger

3. Trigger
- trg_bodyshop_assignments_updated_at on public.bodyshop_assignments

4. Indexes
- idx_brc_job_card
- idx_brc_branch
- idx_brc_status
- idx_brc_stage
- idx_bodyshop_assignments_jc
- idx_bodyshop_assignments_active

5. RLS status and policies
- RLS enabled on public.bodyshop_repair_cards and public.bodyshop_assignments.
- Policies present in authoritative dump:
  - admin_unrestricted_all_ops_v1 on both tables
  - bodyshop_assignments_read (USING true)
  - bodyshop_assignments_insert (WITH CHECK true)
  - bodyshop_assignments_update (USING true)
  - bodyshop_assignments_service_all (service_role USING/WITH CHECK true)

6. ACL snapshot (current state in authoritative dump)
- GRANT ALL to anon/authenticated/service_role on:
  - public.bodyshop_repair_cards
  - public.bodyshop_assignments
  - public.bodyshop_repair_cards_id_seq
  - public.bodyshop_assignments_id_seq
  - public.update_bodyshop_assignments_updated_at()

## Canonical Modules/Permissions Contract

1. modules table contract
- name (unique)
- label
- route
- is_active

2. user_module_permissions contract
- module_id (FK to modules.id)
- can_view
- can_modify
- can_delete
- unique(user_id, module_id)

3. Bodyshop module evidence
- bodyshop_repair module exists in authoritative DB data.

## Remediation Implications

1. Legacy migration 20260610230000_bodyshop_repair_tracker.sql does not represent this contract and is superseded.
2. Corrective migration chain must model the 2-table bodyshop schema and canonical module/permission contract.
3. RBAC/grants hardening is a separate step after contract alignment.

## Execution Evidence (User-Executed in Supabase SQL Editor)

Date: 2026-06-11
Migration executed:
- supabase/migrations/20260611170000_supabase_002_bodyshop_authoritative_alignment.sql

Key verification output provided by user:

1. Bodyshop tables present
- bodyshop_assignments
- bodyshop_repair_cards

2. bodyshop_repair_cards core columns verified
- branch
- current_stage
- delivery_status
- floor_status
- insurance_company
- insurance_valid_date
- job_card_no
- overall_status
- parts_entry_status
- qc_status
- sa_employee_code
- survey_status

3. bodyshop_assignments core columns verified
- assigned_at
- employee_code
- employee_name
- is_active
- job_card_number
- out_ts
- role
- work_status

4. Bodyshop indexes verified
- idx_bodyshop_assignments_active
- idx_bodyshop_assignments_jc
- idx_brc_branch
- idx_brc_job_card
- idx_brc_stage
- idx_brc_status

5. Helper function verified
- update_bodyshop_assignments_updated_at

6. Module row verified
- id: 19
- name: bodyshop_repair
- label: Bodyshop Repair
- route: /bodyshop-repair
- is_active: true

7. Policy snapshot verified
- bodyshop_assignments: admin_unrestricted_all_ops_v1, bodyshop_assignments_insert, bodyshop_assignments_read, bodyshop_assignments_service_all, bodyshop_assignments_update
- bodyshop_repair_cards: admin_unrestricted_all_ops_v1

8. ACL snapshot verified
- broad grants still present for anon/authenticated/service_role on both bodyshop tables.
- this confirms Phase 3 grant hardening is required and pending execution.
