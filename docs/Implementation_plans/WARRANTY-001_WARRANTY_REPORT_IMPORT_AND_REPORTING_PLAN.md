# WARRANTY-001: Warranty Report Import and Reporting Plan

**Plan ID:** WARRANTY-001  
**Created:** 2026-05-28  
**Owner:** Techwheels Product + Dev Team + GitHub Copilot  
**Priority:** High  
**Status:** In Progress

**Audited Reference:** https://claude.ai/share/3ec32255-d0d4-46a6-8090-66d7ed2a6d7b

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
7. Build a full warranty dashboard with easy navigation and aligned visual language from audited reference.

---

## Claude Audit Summary (2026-05-28)

The audited shared thread repeatedly converges on these required dashboard blocks:

1. KPI strip: total claims, settlement rate, rejection rate, stuck/pending indicators.
2. Claim pipeline flow: Initial -> Submission -> Review -> Approval -> Settled, with Rejected separate.
3. Critical alerts: SLA breach buckets (24h, 48h, 3-day, 5-day style), missing rejection reasons, pending upload/payment actions.
4. Financial summary: claimed vs approved/settled style rollups and risk amount.
5. Category- and month-wise views: WC, Updation, AMC, Goodwill, FSB, Settlement with trend matrix.
6. Parts margin view: 20% parts revenue projection and leakage visibility.
7. Action-oriented operations view: pending upload backlog, pending settlement, rejection root-cause focus.

Notes from audit:

1. Dataset narratives are operationally valuable but not all formulas are verifiable unless source column contracts are fixed per report type.
2. UI expectation is dense-but-readable management dashboard, not a placeholder or single-table report.

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
6. Full Warranty Overview dashboard sections and easy in-page navigation tabs.
7. Visual alignment to existing app plus audited dashboard tone (blue for primary flow, red/amber for risk, green for settled).

### Out of Scope (Next Iterations)

1. Final KPI design for warranty dashboards.
2. Advanced column-level normalization per file type.
3. Historical reconciliation and backfill scripts.
4. Production alerting and anomaly detection.
5. Strict RBAC/RLS policies for all 7 warranty import tables (explicitly deferred to later phase).
6. Hard lock of OEM-specific business formulas until column mapping contracts are signed off.

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

## Dashboard IA and UX Contract

Primary page: Reports -> Warranty -> Warranty Report

Navigation inside dashboard:

1. Overview
2. Critical Alerts
3. Financial
4. Operations

Visual system contract (aligned to audited intent and existing app style):

1. Primary workflow: blue.
2. Success/settled: green.
3. Risk and rejection: red.
4. Warning and pending backlog: amber.
5. Financial emphasis: indigo/sapphire accents for totals.

Readability rules:

1. KPI first, then action blocks.
2. Tables should keep key columns visible without clipping in common laptop width.
3. Every alert card must expose count and value impact.
4. Every operational backlog table must support clear next action ownership.

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
| P4 | Build full Warranty Overview dashboard shell | Done | Copilot | Implemented KPI strip + tabs + pipeline + alerts + financial + operations |
| P5 | Lock per-source metric formulas and column contract | Pending | Product + Dev | Convert heuristic extraction to explicit formula map per source file type |
| P5 | Add data quality validation rules | Pending | Dev Team | Mandatory columns, date/amount parsing, branch mismatch checks |
| P6 | UAT with real branch files and role workflows | Pending | Ops + Product | Validate values against OEM sheets and action flow usability |
| P6 | Production rollout checklist | Pending | Dev Team | Smoke tests, performance checks, rollback plan |
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
3. Warranty dashboard implementation:
   - src/pages/reports/warranty/WarrantyOverviewReport.tsx
4. Schema migration:
   - supabase/migrations/20260528155000_create_warranty_import_tables.sql

---

## Operational Notes

1. Run migration manually in target Supabase project before using Warranty uploads.
2. First release stores normalized raw rows in jsonb for all seven sources.
3. Warranty dashboard is now live with heuristic metric extraction from normalized source_row_data.
4. KPI-grade formula hardening is required after mapping lock to eliminate ambiguity.
5. RBAC/RLS hardening for warranty tables is planned later and not part of current release scope.

---

## Next Immediate Steps

1. Validate dashboard totals against sample source files (category-wise and month-wise).
2. Freeze column mapping contract for each of the 7 warranty source report formats.
3. Replace heuristic value parsing with explicit formula mapping per source table.
4. Add owner/action columns in critical alert rows for daily operations handoff.
