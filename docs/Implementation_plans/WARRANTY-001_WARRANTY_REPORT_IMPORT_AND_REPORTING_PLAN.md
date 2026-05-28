# WARRANTY-001: Warranty Report Import and Reporting Plan

**Plan ID:** WARRANTY-001  
**Created:** 2026-05-28  
**Owner:** Techwheels Product + Dev Team + GitHub Copilot  
**Priority:** High  
**Status:** In Progress

---

## Objective

Implement a new Warranty Report flow end-to-end:

1. Add Import group card: Warranty Report.
2. Add 7 upload cards under Warranty Report:
   - Claim-Settlement-Report
   - Part WC
   - Updation Claim
   - Goodwill
   - AMC
   - FSB
   - WC
3. Support 4 branch tabs per card:
   - Ajmer Road PV
   - Ajmer Road EV
   - Sitapura PV
   - Sitapura EV
4. Persist uploads in dedicated warranty tables.
5. Ensure future uploads update existing rows first and insert new rows.
6. Expose Warranty Report inside Reports sidebar/category for analytics rollout.

---

## Authoritative Schema Rule

Database truth is audited against local_folder/backups/full_database.sql and authority never downgrades.
All schema changes are delivered as migration SQL files and must be run manually by the operator.

---

## Scope

### In Scope

1. Warranty import UI grouping and upload cards.
2. Warranty table schema and metadata registration.
3. Upsert-ready import behavior with stable dedupe key.
4. Warranty Reports category and starter report surface.
5. Tracker for iterative enhancement.

### Out of Scope (Next Iterations)

1. Final KPI design for warranty dashboards.
2. Advanced column-level normalization per file type.
3. Historical reconciliation and backfill scripts.
4. Production alerting and anomaly detection.
5. Strict RBAC/RLS policies for all 7 warranty import tables (explicitly deferred to later phase).

---

## Data Model (Implemented Foundation)

Seven tables:

1. warranty_claim_settlement_report_data
2. warranty_part_wc_data
3. warranty_updation_claim_data
4. warranty_goodwill_data
5. warranty_amc_data
6. warranty_fsb_data
7. warranty_wc_data

Shared shape:

1. branch (4-tab constrained)
2. location (Ajmer Road/Sitapura)
3. portal (PV/EV)
4. source_row_hash (dedupe/upsert key)
5. source_row_number
6. source_file_name
7. source_row_data (jsonb normalized raw row)
8. created_at / updated_at

Unique key:

1. (branch, source_row_hash)

Upload strategy:

1. Upsert on (branch, source_row_hash)
2. Existing rows updated
3. New rows inserted

---

## Implementation Tracker

| Phase | Task | Status | Owner | Notes |
|---|---|---|---|---|
| P0 | Audit authoritative dump for warranty table existence | Done | Copilot | Confirmed no dedicated warranty import tables in full_database.sql |
| P1 | Add Import group card "Warranty Report" | Done | Copilot | Added collapsed group in Import page |
| P1 | Add 7 sub-cards under Warranty Report | Done | Copilot | Claim-Settlement-Report, Part WC, Updation Claim, Goodwill, AMC, FSB, WC |
| P1 | Add 4 branch tabs for warranty cards | Done | Copilot | Ajmer Road PV, Ajmer Road EV, Sitapura PV, Sitapura EV |
| P2 | Add migration for 7 warranty import tables | Done | Copilot | Migration file created under supabase/migrations |
| P2 | Register warranty tables in import_metadata | Done | Copilot | Included in migration |
| P3 | Add warranty upload upsert behavior | Done | Copilot | branch+hash conflict key used for update/insert |
| P4 | Add Reports sidebar category "Warranty Reports" | Done | Copilot | Added category + starter report entry |
| P4 | Add first functional warranty KPI report | Pending | Dev Team | Define KPI contract from uploaded datasets |
| P5 | Define column mapping specs per warranty source | Pending | Product + Dev | Needed for structured metrics beyond raw json |
| P5 | Add data quality validation rules | Pending | Dev Team | Mandatory columns, date/amount parsing, branch mismatch checks |
| P6 | UAT with real branch files | Pending | Ops + Product | Validate import speed, correctness, and upsert behavior |
| P6 | Production rollout checklist | Pending | Dev Team | Migrations, smoke tests, rollback plan |
| P7 | Add strict RBAC/RLS policies for all 7 warranty tables | Deferred | Dev Team | Intentionally postponed; execute after current import/report stabilization |

---

## File Map

1. UI import grouping and upload logic:
   - src/pages/ImportPage.tsx
2. Reports category and starter report:
   - src/pages/reports/types.ts
   - src/pages/reports/index.ts
   - src/pages/ReportsPage.tsx
   - src/pages/reports/warranty/index.ts
   - src/pages/reports/warranty/WarrantyOverviewReport.tsx
3. Schema migration:
   - supabase/migrations/20260528155000_create_warranty_import_tables.sql

---

## Operational Notes

1. Run migration manually in target Supabase project before using Warranty uploads.
2. First release stores normalized raw rows in jsonb for all seven sources.
3. KPI-grade report modeling should be added in next iteration after mapping lock.
4. RBAC/RLS hardening for warranty tables is planned later and not part of current release scope.

---

## Next Immediate Steps

1. Execute migration in staging and production.
2. Upload sample files for all 7 cards across 4 tabs.
3. Confirm upsert behavior by re-uploading same file and validating updates.
4. Finalize Warranty KPI contract and implement first analytics report.
