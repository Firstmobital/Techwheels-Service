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
