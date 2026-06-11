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

## Execution Evidence (User-Executed in Supabase SQL Editor) - Phase 3

Date: 2026-06-11
Migration executed:
- supabase/migrations/20260611182000_supabase_002_bodyshop_rbac_grants_hardening.sql

Phase 3 check outcome summary (user provided):

1. Policy expression snapshot
- bodyshop_assignments_read now uses scoped predicate (no longer USING true).
- bodyshop_assignments_insert now uses scoped WITH CHECK predicate.
- bodyshop_assignments_update now uses scoped USING and WITH CHECK predicates.
- bodyshop_repair_cards admin_unrestricted_all_ops_v1 now includes scoped non-admin allow paths plus admin bypass.
- service_role policy bodyshop_assignments_service_all remains true/true as intended.

2. Guard check status
- No rows returned for permissive true predicate regression on targeted assignment policies.

3. Grant hardening status
- No rows returned for anon table grants on bodyshop tables.
- No rows returned for anon sequence grants on bodyshop sequences.
- No rows returned for anon routine privileges on update_bodyshop_assignments_updated_at.

Conclusion:
- Phase 3 migration executed successfully and corresponding SQL checks passed.

## Execution Evidence (User-Executed in Supabase SQL Editor) - Phase 4.1

Date: 2026-06-11
Migration executed:
- supabase/migrations/20260611193000_supabase_002_parts_stock_zero_qty_retention.sql

Phase 4.1 check outcome summary (user provided):

1. Function behavior mode
- skip_zero_qty_parts_stock_rows -> retention_mode

2. Trigger presence
- trg_skip_zero_qty_parts_stock_rows present on service_parts_stock_snapshot_data

3. Current zero-qty observability snapshot
- zero_qty_rows = 0 (informational baseline)

Conclusion:
- Phase 4.1 migration executed successfully and retention-mode behavior is active.

## Execution Evidence (User-Executed in Supabase SQL Editor) - Phase 4.2/4.3

Date: 2026-06-11
Migration executed:
- supabase/migrations/20260611201500_supabase_002_location_portal_semantics_split.sql

Phase 4.2/4.3 check outcome summary (user provided):

1. New columns verified
- location, portal, branch_label present on:
  - service_reception_entries
  - bodyshop_repair_cards
  - job_card_closed_data

2. Portal constraints verified
- service_reception_entries_portal_check
- bodyshop_repair_cards_portal_check
- job_card_closed_data_portal_check

3. Data validity verified
- invalid_portal_rows = 0 for all three tables.

4. Backfill coverage snapshot
- service_reception_entries: total=744, location_filled=744, portal_filled=0, branch_label_filled=744
- bodyshop_repair_cards: total=1, location_filled=1, portal_filled=0, branch_label_filled=1
- job_card_closed_data: total=11481, location_filled=11481, portal_filled=0, branch_label_filled=11481

5. Legacy compatibility verified
- branch column still present on all three tables.

6. Sample projection verified
- branch and location values align; portal remains NULL for current unsuffixed branch data.

Conclusion:
- Phase 4.2 and 4.3 migration executed successfully with compatibility-safe additive semantics.

## Execution Evidence (User-Executed in Supabase SQL Editor) - Phase 4.5

Date: 2026-06-11
Check pack executed:
- supabase/sql_checks/20260611213000_supabase_002_semantic_filter_contract_checks.sql

Phase 4.5 check outcome summary (user provided):

1. Semantic completeness
- service_reception_entries: total=745, location_filled=744, portal_filled=0, branch_label_filled=744
- job_card_closed_data: total=11481, location_filled=11481, portal_filled=0, branch_label_filled=11481
- bodyshop_repair_cards: total=1, location_filled=1, portal_filled=0, branch_label_filled=1

2. Contract guards
- mismatched_location_rows = 0
- invalid_portal_rows = 0 for all target tables

3. Distribution snapshot (service_reception_entries)
- Sitapura / Unknown portal: 9615
- Ajmer Road / Unknown portal: 1322
- Tonk / Unknown portal: 309
- Shahpura / Unknown portal: 235

Interpretation:
- Location semantics are aligned and deterministic fallback behavior is working.
- Portal is currently NULL/Unknown for existing rows because source branch values are unsuffixed; this is expected under compatibility mode and not a contract failure.

## Execution Evidence (User-Executed in Supabase SQL Editor) - Portal Precedence Hardening

Date: 2026-06-11
Migration executed:
- supabase/migrations/20260611224500_supabase_002_portal_backfill_employee_master_precedence.sql

Check pack executed:
- supabase/sql_checks/20260611224500_supabase_002_portal_backfill_employee_master_precedence_checks.sql

Batch outcome summary (user provided):

1. Coverage guards for mapped SA/dealer rows
- unresolved_service_reception_portal_rows = 0
- unresolved_bodyshop_repair_portal_rows = 0
- unresolved_job_card_closed_portal_rows = 0

2. Dealer mapping projection snapshot
- service_reception_entries | portal=EV | row_count=201 (for 500A840-mapped cohort)
- job_card_closed_data | portal=EV | row_count=2788 (for 500A840-mapped cohort)

3. Future-row trigger guard
- trigger_function_portal_logic = portal_assignment_present

Conclusion:
- The portal precedence hardening migration is successfully applied.
- Deterministic mapping coverage for targeted dealer-code cohorts is complete (no unresolved portal rows).
- Forward behavior is enforced through trigger logic, preventing recurrence on new reception inserts.
