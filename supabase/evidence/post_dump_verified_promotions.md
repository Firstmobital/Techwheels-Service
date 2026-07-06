# Post-Dump Verified Promotions

Window opened at: 2026-06-30T06:43:38Z
Baseline dump sha256: dc1d49909baef9d9b02562a570bec29fd8bb3100f90db4e165d68a2e7e1b149d
Baseline dump path: supabase/backups/full_metadata.sql

This file tracks executed+verified migrations promoted after the latest dump refresh.
When a new dump is refreshed, this window is reset.

## Promoted in this window

| Ledger | Prefix | Migration | Checks | Verified |
|--------|--------|-----------|--------|----------|
| DBL-0008 | 20260630120000 | supabase/exec_success_migrations/sql/20260630120000_global_settings_model_options.sql | supabase/exec_success_migrations/sql_check/20260630120000_global_settings_model_options_checks.sql | 2026-06-30 — global `settings_model_options` catalog (19 unique active models, all `dealer_code=GLOBAL`) |

## 2026-07-05T06:25:08Z
- prefix: 20260705110000
- migration: 20260705110000_add_warranty_spl_labour_source_claim_id.sql
- checks: 20260705110000_add_warranty_spl_labour_source_claim_id_checks.sql
- baseline_dump_sha256: 3642cc29eab0d821b40e324ca702fd662e7e10d170ce29e0c31433dd8c9c83a8

## 2026-07-05T16:46:55Z
- prefix: 20260705220000
- migration: 20260705220000_parts_requests_spm_workflow.sql
- checks: 20260705220000_parts_requests_spm_workflow_checks.sql
- baseline_dump_sha256: 3642cc29eab0d821b40e324ca702fd662e7e10d170ce29e0c31433dd8c9c83a8

## 2026-07-05T17:04:54Z
- prefix: 20260705223500
- migration: 20260705223500_parts_requests_add_parts_qty.sql
- checks: 20260705223500_parts_requests_add_parts_qty_checks.sql
- baseline_dump_sha256: 3642cc29eab0d821b40e324ca702fd662e7e10d170ce29e0c31433dd8c9c83a8

## 2026-07-06T12:13:24Z
- prefix: 20260706200000
- migration: 20260706200000_ew_renewal_reminders.sql
- checks: 20260706200000_ew_renewal_reminders_checks.sql
- baseline_dump_sha256: 3642cc29eab0d821b40e324ca702fd662e7e10d170ce29e0c31433dd8c9c83a8

## 2026-07-06T12:13:24Z
- prefix: 20260706201000
- migration: 20260706201000_ew_service_reminders.sql
- checks: 20260706201000_ew_service_reminders_checks.sql
- baseline_dump_sha256: 3642cc29eab0d821b40e324ca702fd662e7e10d170ce29e0c31433dd8c9c83a8

## 2026-07-06T12:13:24Z
- prefix: 20260706202000
- migration: 20260706202000_ew_reminder_wa_template_drafts.sql
- checks: 20260706202000_ew_reminder_wa_template_drafts_checks.sql
- baseline_dump_sha256: 3642cc29eab0d821b40e324ca702fd662e7e10d170ce29e0c31433dd8c9c83a8
