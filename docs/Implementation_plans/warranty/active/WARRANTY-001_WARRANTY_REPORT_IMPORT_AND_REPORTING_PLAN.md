# WARRANTY-001: Warranty Report Import and Reporting Plan

**Plan ID:** WARRANTY-001  
**Created:** 2026-05-28  
**Last Audit:** 2026-06-04  
**Owner:** Techwheels Product + Dev Team + GitHub Copilot  
**Priority:** High  
**Status:** In Progress (Overview Complete; broader 28-report roadmap in progress)

**Audited Reference:** https://claude.ai/share/3ec32255-d0d4-46a6-8090-66d7ed2a6d7b

**Reference Lock (Do Not Remove):**
1. Primary external reference for this plan remains fixed: https://claude.ai/share/3ec32255-d0d4-46a6-8090-66d7ed2a6d7b
2. Any new requirement from chat must be added to this plan before implementation.
3. If a requirement is not represented in the traceability matrix below, it is considered out of scope until added.

---

## � Strategic Redesign Approach (2026-06-04)

**Objective:** Align the Overview tab to authoritative DB-truth + reference business logic while preserving current Techwheels visual design language.

### Overview Closure Audit Delta (Supersedes Earlier Phase Notes)

**Status:** [OK] COMPLETE (Overview only)

Final audited Overview completion (2026-06-04):
1. Overview data wiring finalized against all 7 warranty tables with paginated full-row retrieval.
2. KPI, Claim Pipeline, Payment Status, Claims by Source, and Claim-Type Performance sections are completed and parity-verified for current scope.
3. Top rejection reasons finalized as multi-category cards with explicit reconciliation line and export action on each category card.
4. WC settled by vehicle model finalized with additional density columns: Rank, Claim Share %, Value Share %, alongside settled amount and average per claim.
5. Overview spacing polish completed: missing vertical gaps between section pairs corrected.
6. TypeScript diagnostics for final Overview edits are clean.

UX decision lock (final):
1. Business-logic explainer blocks are not shown in Overview frontend (kept decluttered per user direction).
2. Payment Status semantics and labels remain aligned to the finalized contract currently implemented in Overview UI.

Implementation file:
1. [src/pages/reports/warranty/WarrantyOverviewReport.tsx](src/pages/reports/warranty/WarrantyOverviewReport.tsx)

Temporary tracker closure sync:
1. The temporary Overview tracker (`WARRANTY-001_OVERVIEW_CRASH_SAFE_IMPLEMENTATION_TRACKER.md`) has been fully merged into this master plan summary and can be removed.

### Remaining Program Scope (Outside Overview)

1. The broader WARRANTY-001 roadmap (including additional report families and traceability tasks TR-024..TR-040) remains in progress.
2. This plan remains the single source of truth for forward work after Overview closure.

---

## �[AUDIT] Audit Summary (2026-06-02)

**Audit Trigger:** Comprehensive review of attached warranty dashboards and settlement reports  
**Audit Scope:** 12 HTML reports + attached data sets spanning Jan-May 2026 warranty operations  
**Finding:** 15 major missing dashboard views and 2 critical schema enhancements required

### Key Discoveries

#### 0. **2026-06-03 DB-Truth Wiring Audit Delta**
- Authoritative dump confirms `public.users.role` enum is limited to `admin|manager|staff|viewer`; there is no `super_admin` role literal in schema constraint.
- Authoritative dump confirms `public.modules` includes `reports` as module id `7`; module-scoped admin behavior must be derived from `public.user_module_permissions` (`can_modify` + `can_delete`) rather than relying on role-string variants.
- Current runtime warranty registration exposes one report route (`warranty-overview`) while traceability tasks `TR-024..TR-040` remain pending/partial; therefore 28-report DB-truth parity is not complete yet.
- Warranty overview still contains multiple reference-constant blocks for non-overview sections; these need phased replacement with JSONB extraction-driven queries per TR-024..TR-040.
- `NO-DEALER` chip text is a metadata fallback indicator and must not be used as authorization scope for `admin` users; warranty scope must come from RBAC + user mappings.
- Access lock for implementation: `admin@firstmobital.com` is treated as super-admin-equivalent (`users.role = 'admin'`) with all three dealer codes mapped (`3000840`, `500A840`, `3001440`), so this user must see all warranty rows across all mapped dealer scopes and all fuel types; this is the baseline contract for wiring all 28 warranty reports.

#### 0A. **2026-06-03 Overview Tab DB-Truth Baseline (Super-Admin Scope)**

Audit objective:
1. Establish authoritative numbers for **Overview** tab labels before wiring fixes.
2. Use only `full_database.sql` (or its chunk mirror) as authority.
3. Freeze baseline for `admin@firstmobital.com` (mapped dealer codes: `3000840`, `500A840`, `3001440`).

Scope used for this baseline:
1. Authorized dealer-code location/fuel pairs: `Sitapura|PV`, `Sitapura|EV`, `Ajmer Road|PV`.
2. Source tables: all 7 warranty tables (`warranty_*`) from authoritative dump `COPY` sections.
3. Extraction logic mirrors current UI computation in `WarrantyOverviewReport` (status bucketing, amount extraction, posting-doc pending logic).

### A) Overview KPI Strip — DB-Truth Values

| Overview KPI Label | Authoritative Value | Supporting Count/Note |
|---|---:|---|
| Settlement portfolio | ₹84.67L | 3,452 unique JCs |
| Claimed (all cats) | ₹1.14Cr | Sum across all scoped warranty rows |
| Pending value | ₹28.91L | 3,355 pending JCs; 8,609 rows without posting doc |
| Payment pending | ₹0 | Current status-bucket extraction yields 0 approved/submitted/SOP claimed amount |
| 20% parts revenue | ₹29.46L | 20% over extracted parts amounts |
| Settlement + revenue | ₹1.14Cr | Settlement + 20% parts revenue |

### B) Claim Pipeline (Overview Card) — DB-Truth Counts

| Stage | Count |
|---|---:|
| Created | 14 |
| Submitted | 57 |
| Awaiting SOP | 56 |
| Approved | 0 |
| Settled | 2,182 |
| Rejected | 56 |

### C) Payment Status — All Categories (Overview Table)

| Category | Settled | Approved | Submitted/SOP | Rejected | Created | Total | Claimed (₹) | Settled ₹ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Claim Settlement | 0 | 0 | 0 | 0 | 4,110 | 4,110 | 11,357,947.5 | 8,466,677.3 |
| Part WC | 105 | 0 | 6 | 4 | 0 | 115 | 0 | 0 |
| Updation | 1,811 | 0 | 7 | 109 | 12 | 1,939 | 0 | 0 |
| Goodwill | 1 | 0 | 89 | 6 | 1 | 97 | 0 | 0 |
| AMC | 298 | 91 | 10 | 3 | 1 | 403 | 0 | 0 |
| FSB | 0 | 0 | 2,244 | 251 | 59 | 2,554 | 0 | 0 |
| Warranty Claim | 2,182 | 0 | 113 | 56 | 14 | 2,365 | 0 | 0 |

### D) Claims by Source (Overview Card)

| Source Label | DB-Truth Count |
|---|---:|
| Claim Settlement | 4,110 |
| Part WC | 115 |
| Updation | 1,939 |
| Goodwill | 97 |
| AMC | 403 |
| FSB | 2,554 |
| Warranty Claim | 2,365 |

### E) Claim-Type Performance (Overview Table Labels)

Labels where count is derivable from current extraction:

| Label | DB-Truth Count |
|---|---:|
| Normal WC | 1,820 |
| Extended WC | 545 |
| Updation | 1,939 |
| AMC | 403 |
| Goodwill | 97 |

Labels not derivable with current authoritative extraction contract (must not be invented):

| Label | DB-Truth Status |
|---|---|
| PDI | Not derivable from current mapped JSONB keys |
| 1st FSB | Not derivable from current mapped JSONB keys |
| 2nd FSB | Not derivable from current mapped JSONB keys |
| 3rd FSB | Not derivable from current mapped JSONB keys |

### F) Top Rejection Reasons (DB-Truth Snapshot)

Top extracted reasons from rejected rows:
1. The difference between JC date and JC closure date is beyond defined policy limits of 015 days. (`129`)
2. `-` (`103`)
3. PDI checksheet data not received in SAP ISAUTO or not uploaded in CRMDMS... (`41`)
4. The difference between JC closure date and FSB submission date is beyond defined policy limits of 015 days. (`13`)
5. Service KMS and period less than the defined service schedules... (`11`)
6. `(blank reason)` (`3`)

### G) Overview Wiring Progress (2026-06-03)

First pass implemented in `src/pages/reports/warranty/WarrantyOverviewReport.tsx` against DB-truth baseline:
1. Claim-type performance table is now computed from filtered warranty rows.
2. Top rejection reasons widget is now derived from rejected rows + extracted rejection reason keys.
3. Claim funnel TAT is now computed from live stage-bucket row ages.
4. Claim type mix tiles are now derived from live category counts.

Remaining gap after first pass:
1. PDI / 1st FSB / 2nd FSB / 3rd FSB remain non-derivable labels under current JSONB extraction contract and are intentionally rendered as non-computed placeholders until mapping contracts are added.

### H) Visual Verification Parity (Overview Tab, 2026-06-03)

Verification method:
1. Live browser read on `http://localhost:5175/reports/warranty/warranty-overview` with Overview tab active.
2. User scope shown in UI: `All dealer codes` (admin context) with filters at `All locations` + fuel `All`.
3. Comparison target: locked DB-truth baseline in section **0A** above.

Result summary:
1. **Parity FAILED** for most Overview labels.
2. Only a small subset currently matches baseline exactly (`Payment pending = ₹0`, `Goodwill count = 97`).

#### H1) KPI Parity (Before = Locked Baseline, After = Current UI)

| KPI Label | Baseline (DB) | Current UI | Parity |
|---|---:|---:|---|
| Settlement portfolio | ₹84.67L | ₹10.11L | [FAIL] |
| Claimed (all cats) | ₹1.14Cr | ₹30.13L | [FAIL] |
| Pending value | ₹28.91L | ₹20.02L | [FAIL] |
| Payment pending | ₹0 | ₹0 | [OK] |
| 20% parts revenue | ₹29.46L | ₹7.05L | [FAIL] |
| Settlement + revenue | ₹1.14Cr | ₹17.16L | [FAIL] |

#### H2) Claim Pipeline Parity

| Stage | Baseline (DB) | Current UI | Parity |
|---|---:|---:|---|
| Created | 14 | 12 | [FAIL] |
| Submitted | 57 | 27 | [FAIL] |
| Awaiting SOP | 56 | 41 | [FAIL] |
| Approved | 0 | 0 | [OK] |
| Settled | 2,182 | 889 | [FAIL] |
| Rejected | 56 | 31 | [FAIL] |

#### H3) Claims by Source Parity

| Source | Baseline (DB) | Current UI | Parity |
|---|---:|---:|---|
| Claim Settlement | 4,110 | 1,000 | [FAIL] |
| Part WC | 115 | 115 | [OK] |
| Updation | 1,939 | 1,000 | [FAIL] |
| Goodwill | 97 | 97 | [OK] |
| AMC | 402 | 403 | [FAIL] |
| FSB | 2,554 | 1,000 | [FAIL] |
| Warranty Claim | 2,365 | 1,000 | [FAIL] |

#### H4) New Wired Blocks Parity Snapshot

Claim-type performance (derivable labels only):
1. `Normal WC`: baseline `1,820` vs UI `997` [FAIL]
2. `Extended WC`: baseline `545` vs UI `3` [FAIL]
3. `Updation`: baseline `1,939` vs UI `1,000` [FAIL]
4. `AMC`: baseline `402` vs UI `403` [FAIL]
5. `Goodwill`: baseline `97` vs UI `97` [OK]

Top rejection reasons (top-5 order/count):
1. Baseline top reason count `129` vs UI top reason count `73` [FAIL]
2. Baseline second count `103` vs UI second count `43` [FAIL]

Claim type mix:
1. `Warranty`: baseline `6,590` vs UI `2,115` [FAIL]
2. `FSB`: baseline `2,554` vs UI `1,000` [FAIL]
3. `Updation`: baseline `1,939` vs UI `1,000` [FAIL]
4. `AMC`: baseline `402` vs UI `403` [FAIL]
5. `Goodwill`: baseline `97` vs UI `97` [OK]

TAT rows (computed formula parity):
1. `Initial -> Submit`: baseline `5.0` days vs UI `4.9` days (rounding-adjacent)
2. `Submit -> Review`: baseline `4.0` vs UI `3.2` [FAIL]
3. `Review -> Approve`: baseline `4.8` vs UI `4.8` [OK]
4. `Approve -> Settle`: baseline `4.6` vs UI `4.6` [OK]
5. `End-to-end`: baseline `4.1` vs UI `3.6` [FAIL]

#### H5) Verification Conclusion (No Assumptions)

Observed fact pattern from UI values:
1. Multiple high-volume categories render exactly `1,000` rows (`Claim Settlement`, `Updation`, `FSB`, `Warranty Claim`) while baseline is greater than `1,000`.
2. This is direct evidence that current UI aggregation is not yet reading full baseline row volume for admin full scope.
3. Until this row-volume mismatch is resolved, Overview parity against locked baseline remains failed.

### H6) Post-Fix Visual Parity Rerun (2026-06-03)

Fixes applied before rerun:
1. Replaced single-shot `.limit(...)` fetching with paginated `.range(from,to)` full-row retrieval for each warranty source table.
2. Removed temporary admin viewer bypass and restored RBAC scope resolution via `getDealerScopeContext()` (mapping first, then metadata fallback, then users-table fallback).
3. SQL migration `supabase/migrations/20260603170500_admin_unrestricted_rls_bypass.sql` was executed in Supabase SQL Editor to apply admin-unrestricted RLS bypass on dealer-bound policies.
4. Post-execution verification query confirmed expected admin-bypass policy counts on all touched tables:
   - `public.service_parts_order_data` = 4
   - `public.service_reception_entries` = 4
   - `public.settings_model_options` = 4
   - `public.vehicles` = 3
   - `storage.objects` = 4

Rerun result (Overview tab, same live page + filters):
1. **Parity PASS** for KPI strip, pipeline, and claims-by-source against authoritative dump baseline.
2. Prior `1,000`-row truncation signatures are removed.

Post-fix parity checkpoints:

| Check | Baseline (DB) | Current UI | Status |
|---|---:|---:|---|
| Settlement portfolio | ₹84.67L | ₹84.67L | [OK] |
| Claimed (all cats) | ₹1.14Cr | ₹1.14Cr | [OK] |
| Pending value | ₹28.91L | ₹28.91L | [OK] |
| Payment pending | ₹0 | ₹0 | [OK] |
| 20% parts revenue | ₹29.46L | ₹29.46L | [OK] |
| Settlement + revenue | ₹1.14Cr | ₹1.14Cr | [OK] |
| Pipeline Created/Submitted/Awaiting/Approved/Settled/Rejected | 14/57/56/0/2182/56 | 14/57/56/0/2182/56 | [OK] |
| Claim Settlement rows | 4,110 | 4,110 | [OK] |
| Updation rows | 1,939 | 1,939 | [OK] |
| FSB rows | 2,554 | 2,554 | [OK] |
| Warranty Claim rows | 2,365 | 2,365 | [OK] |

Data-quality note resolved during rerun:
1. `warranty_amc_data` authoritative row count is **403** by direct raw `COPY` line count in `full_database.sql` chunk mirror; earlier `402` mention came from prior audit script parsing drift and is now corrected in this plan.
2. Authoritative dump currently shows `admin@firstmobital.com` mapped dealer codes (`3000840`, `500A840`, `3001440`) present in `user_employee_links` but with `is_active = false`; scope therefore resolves through metadata fallback at runtime until mapping rows are activated.
3. Post-migration verification result: admin-bypass policy coverage is present on all touched tables (4/4/4/3/4), so active admin users are no longer blocked by dealer-bound policy predicates for these policy families.

Acceptance lock for fix rollout:
1. When logged in as `admin@firstmobital.com`, Overview must render DB-backed counts matching this baseline for current dump authority.
2. Any mismatch is a wiring defect unless dump authority changes forward.

### I) Critical Alerts Workflow Contract (Re-Audit, 2026-06-04)

This section replaces earlier mixed baselines and locks one business-logic contract for Critical Alerts using Tata CRM upload behavior.

#### I.1 Data Sources and Workflow Eligibility

All 7 warranty tables are loaded by the page, but **Critical Alerts must be workflow-stage alerts, not settlement-snapshot alerts**.

| Table | Rows (authoritative snapshot) | Workflow status present | Posting doc present | Alert participation |
|---|---:|---:|---:|---|
| `warranty_claim_settlement_report_data` | 4,110 | 0 | 2,973 | Excluded from stage alerts; used for settlement evidence/reconciliation only |
| `warranty_part_wc_data` | 115 | 115 | 0 | Included |
| `warranty_updation_claim_data` | 1,939 | 1,939 | 0 | Included |
| `warranty_goodwill_data` | 97 | 97 | 0 | Included |
| `warranty_amc_data` | 403 | 403 | 0 | Included |
| `warranty_fsb_data` | 2,554 | 2,554 | 0 | Included |
| `warranty_wc_data` | 2,365 | 2,365 | 0 | Included |

Eligibility lock:
1. Include rows only when workflow status is non-blank and table is not `warranty_claim_settlement_report_data`.
2. Derive age from business date keys in `source_row_data`, never from import `created_at`.

#### I.2 Tata CRM Status Normalization (Bucket Contract)

#### I.2 Critical Alerts (Reference Business Logic from warrantycriticalalerts.html)

**Authority**: Reference HTML specification `local_folder/Reference/Critical Alerts(References)/warrantycriticalalerts.html` defines exact business logic, status filters, and table scopes. Implementation must match this spec exactly.

**5 Critical Alerts** (validated against authoritative dump):

| # | Alert Label | Business Logic | Status Filter | Table Scope | Count | Required Action |
|---|---|---|---|---|---|---|
| 1 | **Created — Not Submitted to TM** | Claim initiated by dealer but NOT clicked Submit to TM. Stuck at intake. | `claim_status = 'Created'` | warranty_wc_data, warranty_updation_claim_data, warranty_part_wc_data, warranty_goodwill_data, warranty_fsb_data, warranty_amc_data (EXCLUDES Settlement) | **87** | Dealer to submit immediately; follow-up required |
| 2 | **Claims Rejected / Cancelled / Not Validated** | Terminal failure states. Rejected claims often due to JC-closure-to-submission time limit (FSB: 15 days). Cancelled claims indicate manual rejection. Not Validated = data quality issue. | `claim_status IN ('Rejected', 'Cancelled', 'Not Validated')` | All 7 warranty tables | **429** | Escalation/review for root cause; audit missing rejection reason if blank |
| 3 | **Claims Stuck in Review — SOP Upload / Under Change** | Awaiting SOP Approval or Under Change for technical approval. Time-sensitive but salvageable. Older claims (>5d) typically auto-rejected. | `claim_status IN ('Awaiting SOP Approval', 'Under Change')` | warranty_wc_data, warranty_updation_claim_data, warranty_part_wc_data, warranty_goodwill_data (EXCLUDES FSB, AMC, Settlement) | **71** | SOP upload / approval required; escalate if >5d |
| 4 | **Settlement Line Items — SAP Posting Not Done** | Claim approved but settlement line items not posted to SAP. Unposted = 27.7% of settlement register. Accounts dept must drive posting. | `posting_document_number = ''` (empty) | warranty_claim_settlement_report_data (ONLY) | **1,137** | Accounts to post to SAP immediately; drives financial close |
| 5 | **AMC Claims TM-Approved — Dealer Invoice Not Yet Raised** | AMC claims approved by L1 or L2 TM but dealer has not raised invoice. Uniquely AMC-table risk; recovery potential ~Rs. 5.3 Lakhs. | `claim_status IN ('Approved By L1', 'Approved by L2') AND dealer_invoice_no = ''` | warranty_amc_data (ONLY) | **91** | Dealer to raise invoice; follow-up for cash collection |

**Implementation Rule**:
- No age-based filtering (no >1d, >3d, >5d logic).
- No status bucketing or normalization beyond explicit text matching in table above.
- Filter exactly as shown; do not combine tables across alerts.
- No deduplication required; each row is counted once per table scope.

#### I.3 Status Normalization (Deprecated)

Historical note: Previous implementation used age-based bucketing (created/awaiting_sop/submitted/approved/rejected) with table-aware Accepted mapping. This approach has been superseded by the reference HTML business logic (I.2 above). 

All status mapping logic in code has been replaced with direct status matching per alert definition (I.2).

#### I.4 Runtime Authority

#### I.5 Critical Alerts Visibility Contract (UI Recommendation Locked, 2026-06-04)

Objective:
1. Preserve current Techwheels report visual language (existing tokens, color semantics, typography, spacing).
2. Align alert computation strictly to reference HTML business logic in I.2.
3. Reduce information overload by separating always-visible decision signals from on-click deep detail.

Always visible (without click):
1. 5 alert KPI cards with count + short alert label + severity tone.
2. One-line contract banner: exact table-scope + exact status matching (no age-bucket approximation).
3. Compact summary matrix for all 5 alerts: `Alert`, `Count`, `Table scope`, `Filter contract`, `Owner`.
4. Full single-page dashboard with all 5 report sections rendered sequentially (no card-click drilldown dependency).

Per-section controls:
1. Each alert section must include an `Export` button.
2. Export outputs all records for that alert under current page filters (location/fuel/role scope), not only preview rows.
3. Export format: CSV with claim keys + status + amounts + scope metadata.

Interaction rule:
1. Users should not need a card click to reveal any alert section.
2. If scoped filters (location/fuel) yield zero rows for a section, show explicit zero-state text in that section.

Benefits:
1. Faster executive scan in first viewport.
2. One-pass operational workflow: review + export from same screen.
3. Keeps UI tone/design stable while enforcing report logic parity to reference contract.

#### I.6 Known Gap and Final Rule for Accuracy

Gap:
1. Workflow tables carry robust status but sparse posting-document fields.
2. Settlement table carries posting evidence but no workflow status.

Therefore, final business interpretation for Alert 4 should be:
1. Candidate set from workflow feeds: `approved AND ageDays > 5`
2. Reconcile against settlement evidence feed (`warranty_claim_settlement_report_data`) by claim key
3. Alert only if no settlement/posting evidence exists after reconciliation

This reconciliation is the v2 hardening path for `Approved-not-settled`.

#### I.7 Regression Locks

1. Do not use `created_at` import timestamp for alert aging.
2. Do not count raw rows for Critical Alerts; count deduped claims.
3. Do not include `warranty_claim_settlement_report_data` directly in stage bucket alerts.
4. Keep status normalization mapping synchronized with observed Tata CRM values in uploaded files.

#### 1. **Financial Data** (₹2.03 Crore Total Across 7 Categories)
- WC: ₹48.2L claims  
- FSB: ₹42.1L claims  
- Updation: ₹31.5L claims  
- Goodwill: ₹28.9L claims  
- AMC: ₹18.2L claims  
- Part WC: ₹22.3L claims  
- Settlement Reports (Rpt 32-41): ₹40.8L PV + ₹33.7L EV  

#### 2. **Operational Alerts** (28+ Critical)
- Not submitted > 24 hours: dynamic, compute from authoritative dump/active snapshot  
- Review stuck > 3 days: dynamic, compute from authoritative dump/active snapshot  
- SOP pending > 2 days: dynamic, compute from authoritative dump/active snapshot  
- Approved not settled > 5 days: dynamic, compute from authoritative dump/active snapshot  
- Rejection reason blank: dynamic, compute from authoritative dump/active snapshot  

Count-governance note: if runtime UI and dump differ, treat dump as source of truth.

#### 3. **Special Charges** (₹23.52L Total from Job Codes)
- 980016 (Rusting/Special Labour): ₹2,85,240 · 28 JCs  
- 980019 (Loaner Car): ₹1,07,389 · 11 JCs  
- 980025 (Misc): Present in other invoices  

#### 4. **Rusting Claims**
- 168 total claims  
- ₹3.02L parts paid  
- Root cause tracking required (paint, body integrity, environment)  

#### 5. **Invoice Pending Upload**
- 12 invoices ₹25.72L awaiting TM portal upload  
- Aging: 8 pending > 24h, 4 pending > 48h  
- Status tracking: Awaiting, Pending Upload, Uploaded, Failed  

#### 6. **Settlement & Payment Flow**
- Approved claims not yet settled: 3 pending > 5 days  
- Payment status visibility required: Paid, Not Paid, Pending  
- Settlement staging: Processing, Initiated, Completed, Failed  

#### 7. **Parts Revenue Analysis**
- 20% MRP rule for parts revenue projection  
- Top 20 parts by frequency + cost  
- Parts margin leakage: ₹4,37,242 (Rpt 39) to ₹2,38,615 (Rpt 37)  

#### 8. **Labour Analysis**
- ICE vs EV labour cost differential  
- FSB (First Service By) cost breakdown  
- Labour efficiency per location  

#### 9. **PV vs EV Comparison**
- PV: Reports 32-41 historical data  
- EV: Reports 32-36 settled  
- Settlement differential analysis  

#### 10. **Advisor & Model Tracking**
- Advisor-wise claim quality metrics  
- Model-wise warranty cost as % of sales  
- Skill-level mapping to labour assignments  

### Missing Data Fields (Corrected – Stored in JSONB, NOT in Schema)

**CRITICAL CLARIFICATION (2026-06-02 Audit):**

The following fields are **NOT missing from the database schema** because the JSONB design intentionally stores them inside `source_row_data` as unstructured data, NOT as separate columns. This is by design.

Fields that SHOULD be extractable from `source_row_data` for each warrant source type:

**Financial Fields (All Types):**
- claimed_amount, approved_amount, paid_amount
- parts_amount, labour_amount, special_charges
- special_charge_code (980016, 980019, 980025)

**Operational Fields (All Types):**
- claim_id / job_card_id
- status (Initial, Submitted, Review, SOP, Approved, Rejected, Settled, Paid)

**Accountability Fields (All Types):**
- advisor_id, advisor_name
- action_owner, rejection_reason, corrective_action

**Vehicle/Asset Fields (Most Types):**
- model, variant
- vehicle_age_months, manufacturing_date
- registration_number

**Timeline Fields (All Types):**
- created_date, submitted_date, review_date, sop_date, approved_date, settled_date, paid_date

**Status & Documentation Fields (All Types):**
- payment_status (Paid, Not Paid, Pending)
- settlement_status (Processing, Initiated, Completed, Failed)
- invoice_status (Awaiting, Pending Upload, Uploaded, Failed)
- posted_doc_url (invoice/document link)

### Why JSONB Design?

1. **Heterogeneous sources:** Each of the 7 warranty report types may have different columns
2. **No schema churn:** New source formats don't require new table migrations
3. **Source fidelity:** Preserves original structure for audit trail
4. **Flexible extraction:** Application layer decides what to parse and normalize

### Required: JSONB Extraction Mapping

Instead of schema migration, define **per-source extraction contracts** that specify:
- Which JSONB keys map to which semantic fields
- Parsing rules (date formats, amount normalization, etc.)
- Validation rules per source type
- Fallback values when keys are missing

**Example:**
```json
{
  "warranty_claim_settlement_report_data": {
    "claim_id": "JP#",
    "advisor_id": "Advisor ID",
    "model": "Model",
    "claimed_amount": "Claimed Amt",
    ...
  },
  "warranty_fsb_data": {
    "claim_id": "Job Card #",
    "labour_amount": "Labour Cost",
    ...
  }
}
```  

### New Report Views Required (15)

1. **Special Charges Dashboard** – 980016, 980019, 980025 breakdown  
2. **PDI & FSB Separated Report** – distinct analysis  
3. **Invoice Pending Upload Report** – TM portal status  
4. **Settlement Aging Report** – Approved not settled  
5. **Rusting Analysis Report** – 168 claims deep dive  
6. **Advisor Performance Report** – quality by advisor  
7. **Model Cost Analysis Report** – loss by model  
8. **Top Parts Analysis Report** – 20 by frequency + cost  
9. **Labour Efficiency Report** – ICE vs EV  
10. **PV vs EV Settlement Comparison** – Reports 32-41  
11. **Critical Alerts v2** – 28+ with ownership  
12. **TAT Monitoring Dashboard** – 4-stage SLA tracking  
13. **Rejection Root-Cause Report** – reason + action + effectiveness  
14. **Payment Flow Dashboard** – claim->settlement->paid visibility  
15. **Month-wise Category Matrix** – historical trends  

**Action:** All 15 new report views + schema enhancement added to Traceability Matrix below. See TR-024 through TR-040.

---

**Reference Lock (Do Not Remove):**
1. Primary external reference for this plan remains fixed: https://claude.ai/share/3ec32255-d0d4-46a6-8090-66d7ed2a6d7b
2. Any new requirement from chat must be added to this plan before implementation.
3. If a requirement is not represented in the traceability matrix below, it is considered out of scope until added.

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

## Schema Validation Snapshot (Authoritative Dump-Backed – 2026-06-02)

Validated against `local_folder/backups/full_database.sql` using mirrored chunk access under `local_folder/backups/chunks/full_database.sql.part_*`.

### Confirmed from Authoritative Dump

1. `branch` CHECK is exactly `('Ajmer Road', 'Sitapura')` on all 7 warranty tables.
2. `location` CHECK is exactly `('Ajmer Road', 'Sitapura')` on all 7 warranty tables.
3. `portal` CHECK is exactly `('PV', 'EV')` on all 7 warranty tables.
4. Unique key is **not** `(branch, source_row_hash)`; it is `(branch, portal, source_row_hash)`.
5. Trigger `set_updated_at()` exists on all 7 warranty tables.
6. No RLS enablement/policies for warranty tables were found in the dump.

### Observed Stored Values in Dump Data

From `COPY` sections in the authoritative dump, warranty rows currently contain combinations such as:
- `Ajmer Road | Ajmer Road | PV`
- `Sitapura | Sitapura | PV`
- `Sitapura | Sitapura | EV`

## Data Model (Authoritative Schema – Verified 2026-06-02)

**Source Migration:** `supabase/exec_success_migrations/20260528155000_create_warranty_import_tables.sql`  
**Migration Status:** [OK] Applied and verified in database

### Seven Warranty Import Tables (All Active)

1. warranty_claim_settlement_report_data
2. warranty_part_wc_data
3. warranty_updation_claim_data
4. warranty_goodwill_data
5. warranty_amc_data
6. warranty_fsb_data
7. warranty_wc_data

### Authoritative Column Structure (JSONB Design)

Each table has **exactly 10 columns** (no variations):

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| id | bigint | PK, identity | Row identifier |
| branch | text | NOT NULL, CHECK ('Ajmer Road', 'Sitapura') | Branch/location label |
| location | text | NOT NULL, CHECK ('Ajmer Road', 'Sitapura') | Location field |
| portal | text | NOT NULL, CHECK ('PV', 'EV') | Portal/fuel-type channel as stored |
| source_row_hash | text | NOT NULL | Dedupe hash of source row |
| source_row_number | integer | nullable | Line number in source file |
| source_file_name | text | nullable | Original Excel/CSV file name |
| source_row_data | jsonb | NOT NULL, DEFAULT '{}' | All detailed fields are JSONB |
| created_at | timestamptz | NOT NULL, DEFAULT now() | Record creation timestamp |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | Record update timestamp |

### Unique Constraint

```sql
UNIQUE (branch, portal, source_row_hash)
```

### Upsert Strategy

- **On Upload:** Insert or update on `(branch, portal, source_row_hash)` conflict
- **Behavior:** Existing rows updated, new rows inserted
- **Dedupe Key:** Stable hash of normalized source row
- **Trigger:** `set_updated_at()` maintains updated_at on every change

### Important: JSONB Design Philosophy

**All detailed warranty claim fields (claim_id, advisor, model, status, amounts, dates, etc.) are stored INSIDE `source_row_data` as unstructured JSONB, NOT as separate columns.**

This design choice allows:
- Storage of heterogeneous source formats without schema churn
- Preservation of original source structure
- Flexibility for future source type additions
- Data extraction/transformation happens in application layer, not database layer

**Consequence:** Reporting requires JSONB path extraction (e.g., `source_row_data->>'claim_id'`) or computed columns.

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

## Traceability Matrix (Zero-Miss Checklist)

Execution rule:

1. Do not mark this plan complete until every row is either Done or explicitly Deferred with owner and date.
2. Every Done row must have file path coverage and a validation method.

| Ref ID | Claude Requirement | Techwheels Target (Report/Widget) | File Path(s) | Status | Validation Method |
|---|---|---|---|---|---|
| TR-001 | KPI strip with total claims, settlement rate, rejection rate, stuck/pending | Warranty Dashboard KPI strip | src/pages/reports/warranty/WarrantyOverviewReport.tsx | Done | UI check + row counts from warranty tables |
| TR-002 | Claim pipeline flow (Initial -> Submission -> Review -> Approval -> Settled + Rejected) | Claim Pipeline Flow card | src/pages/reports/warranty/WarrantyOverviewReport.tsx | Done | Status bucketing sanity check vs sample records |
| TR-003 | Critical alerts buckets (24h/48h/3-day/5-day style) | Critical Alerts tab | src/pages/reports/warranty/WarrantyOverviewReport.tsx | Done (v1 heuristic) | Alert count audit against filtered records |
| TR-004 | Top rejection reasons with actionability | Top Rejection Reasons card | src/pages/reports/warranty/WarrantyOverviewReport.tsx | Done (v1 heuristic) | Rejection reason frequency cross-check |
| TR-005 | Financial summary (claimed/settled/risk) | Financial tab summary cards + category table | src/pages/reports/warranty/WarrantyOverviewReport.tsx | Done (v1 heuristic) | Totals vs aggregated table-level sums |
| TR-006 | Category-wise claim analysis (WC, Updation, AMC, Goodwill, FSB, Settlement, Part WC) | Category matrix + financial category table | src/pages/reports/warranty/WarrantyOverviewReport.tsx | Done | Category totals validation |
| TR-007 | Month-wise category matrix | Month-wise Category Matrix | src/pages/reports/warranty/WarrantyOverviewReport.tsx | Done | Month bucket validation by created/invoice/closed date |
| TR-008 | Pending upload visibility | Pending Upload Backlog table | src/pages/reports/warranty/WarrantyOverviewReport.tsx | Done | Missing posting doc rows sample audit |
| TR-009 | Payment/pending settlement visibility | Pending settlement-focused alert and financial exposure | src/pages/reports/warranty/WarrantyOverviewReport.tsx | Partial | Add dedicated settlement aging report |
| TR-010 | 20% parts revenue inclusion | 20% Parts Revenue KPI in Financial tab | src/pages/reports/warranty/WarrantyOverviewReport.tsx | Done (v1) | 0.2 x parts total verification |
| TR-011 | PV/EV separated analysis | Branch+Fuel wiring and portal-level filtering | src/pages/ReportsPage.tsx; src/pages/reports/warranty/WarrantyOverviewReport.tsx | Done | Filter matrix test (ALL/PV/EV + Ajmer/Sitapura) |
| TR-012 | Full easy navigation | Warranty tabs: Overview/Alerts/Financial/Operations | src/pages/reports/warranty/WarrantyOverviewReport.tsx | Done | UX walkthrough |
| TR-013 | Reports sidebar warranty module | Warranty Reports category and report route | src/pages/reports/index.ts; src/pages/reports/warranty/index.ts; src/pages/ReportsPage.tsx | Done | Route navigation test |
| TR-014 | Source upload groups and 7 report inputs | Warranty Import group + 7 sub-cards + 4 branch tabs | src/pages/ImportPage.tsx | Done | Upload smoke test all seven cards |
| TR-015 | Upsert behavior (update existing + insert new) | branch+source_row_hash upsert strategy | src/pages/ImportPage.tsx; supabase/migrations/20260528155000_create_warranty_import_tables.sql | Done | Re-upload same file and compare counts |
| TR-016 | Dedicated DB foundation for warranty sources | 7 warranty import tables + triggers + metadata | supabase/migrations/20260528155000_create_warranty_import_tables.sql | Done | Schema audit in full_database.sql |
| TR-017 | Dashboard UI/UX aligned with audited reference | Color semantics + dense management layout | src/pages/reports/warranty/WarrantyOverviewReport.tsx | Done (v1 aligned) | Visual QA against audited sections |
| TR-018 | Exact formula parity from source sheets | Explicit per-source metric formula map | docs/Implementation_plans/warranty/active/WARRANTY-001_WARRANTY_REPORT_IMPORT_AND_REPORTING_PLAN.md (planned), future code files | Pending | Signed formula sheet + unit checks |
| TR-019 | Rejection corrective-action report | Dedicated root-cause + owner/action report | Future: src/pages/reports/warranty/* | Pending | Rejection reason to action mapping audit |
| TR-020 | Invoice pending upload report | Dedicated report page with invoice/doc granularity | Future: src/pages/reports/warranty/* | Pending | Invoice status reconciliation |
| TR-021 | Pending settlement report | Dedicated settlement aging report | Future: src/pages/reports/warranty/* | Pending | Approved-not-settled amount reconciliation |
| TR-022 | Advisor-wise quality and model loss risk | Advisor/model deep-dive reports | Future: src/pages/reports/warranty/* | Pending | Advisor/model pivot validation |
| TR-023 | Strict RBAC/RLS for 7 warranty tables | Security hardening phase | Future migration file | Deferred | Policy tests once phase starts |

---

## Phase Sign-Off Gates

Use this for closure control per phase:

1. Data correctness gate: computed totals reconcile with sampled source files.
2. Filter wiring gate: Branch, Fuel, Filter By, Date Range behave as expected.
3. UX gate: no clipped tables, clear hierarchy, quick drill path.
4. Operations gate: alerts are actionable and not purely informational.
5. Performance gate: dashboard loads within acceptable latency under current data volume.

---

## Implementation Tracker (Corrected – Database-Backed 2026-06-02)

| Phase | Task | Status | Owner | Notes |
|---|---|---|---|---|
| P0 | Audit authoritative dump for warranty table existence | Done | Copilot | Confirmed in full_database.sql – all 7 tables exist with JSONB design |
| P1 | Add Import group card "Warranty Report" | Done | Copilot | Added collapsed group in Import page |
| P1 | Add 7 sub-cards under Warranty Report | Done | Copilot | Claim-Settlement-Report, Part WC, Updation Claim, Goodwill, AMC, FSB, WC |
| P1 | Add 4 branch tabs for warranty cards | Done | Copilot | Ajmer Road PV, Ajmer Road EV, Sitapura PV, Sitapura EV |
| P2 | Add migration for 7 warranty import tables | Done | Copilot | Migration file created + executed: 20260528155000_create_warranty_import_tables.sql |
| P2 | Register warranty tables in import_metadata | Done | Copilot | Included in migration |
| P3 | Add warranty upload upsert behavior | Done | Copilot | branch+hash conflict key used for update/insert |
| P4 | Add Reports sidebar category "Warranty Reports" | Done | Copilot | Added category + starter report entry |
| P4 | Build full Warranty Overview dashboard shell | Done | Copilot | Implemented KPI strip + tabs + pipeline + alerts + financial + operations |
| P5 | Lock per-source metric formulas and column contract | Pending | Product + Dev | **CORRECTED:** Define JSONB extraction mappings per source type (not schema changes) |
| P5 | Add data quality validation rules | Pending | Dev Team | Validate JSONB keys present + types match + required fields non-null |
| P6 | UAT with real branch files and role workflows | Pending | Ops + Product | Validate extracted values against OEM sheets and action flow usability |
| P6 | Production rollout checklist | Pending | Dev Team | Smoke tests, performance checks, rollback plan |
| P7 | Add strict RBAC/RLS policies for all 7 warranty tables | Deferred | Dev Team | Intentionally postponed; execute after current import/report stabilization |
| **P5-CORRECTED** | **Audit source files + document JSONB key mappings** | **Pending** | **Dev Team** | **Sample each of 7 warranty types + create extraction contract docs** |
| **P5-CORRECTED** | **Choose JSONB extraction strategy (App vs DB views)** | **Pending** | **Product + Dev** | **Decide between TypeScript extraction or SQL views for performance/maintainability** |
| **P5-CORRECTED** | **Build JSONB extraction utilities (TypeScript)** | **Pending** | **Dev Team** | **src/lib/warranty/jsonExtraction.ts with type safety + validation** |
| **P5-CORRECTED** | **Create reporting views (Optional – if choosing DB views)** | **Pending** | **Dev Team** | **supabase/migrations/20260602*_warranty_reporting_views.sql** |
| **P5-CORRECTED** | **Build Special Charges Dashboard (980016, 980019, 980025)** | **Pending** | **Dev Team** | **PV vs EV breakdown + top claims + margin impact** |
| **P5-CORRECTED** | **Build Invoice Pending Upload Report** | **Pending** | **Dev Team** | **12 invoices ₹25.72L + aging buckets (24h, 48h, 5+ days)** |
| **P5-CORRECTED** | **Build Settlement Aging Report** | **Pending** | **Dev Team** | **Approved-not-settled tracking + payment status visibility** |
| **P5-CORRECTED** | **Build TAT Monitoring Dashboard** | **Pending** | **Dev Team** | **4 stages: Initial->Submission (0d) / Submission->Review (2d SLA 3d) / Review->Approval (1d SLA 2d) / Approval->Settlement (5d SLA 7d)** |
| **P5-CORRECTED** | **Build Rusting Analysis Report** | **Pending** | **Dev Team** | **168 claims ₹3.02L + model/batch correlation + preventive actions** |
| **P5-CORRECTED** | **Build Advisor Performance Report** | **Pending** | **Dev Team** | **Claim count, rejection rate, avg value, quality trends by advisor** |
| **P5-CORRECTED** | **Build Model Cost Analysis Report** | **Pending** | **Dev Team** | **Cost per model, warranty % of sales, top problem parts, leakage** |
| **P5-CORRECTED** | **Build Top Parts Analysis Report** | **Pending** | **Dev Team** | **Top 20 by frequency + cost + margin impact (20% rule) + rejection rate** |
| **P5-CORRECTED** | **Build Labour Efficiency Report (ICE vs EV)** | **Pending** | **Dev Team** | **FSB labour breakdown, cost per JC, skill mapping** |
| **P5-CORRECTED** | **Build PV vs EV Settlement Comparison** | **Pending** | **Dev Team** | **Reports 32-41 historical, side-by-side financial, cost variance** |
| **P5-CORRECTED** | **Build PDI & FSB Separated Report** | **Pending** | **Dev Team** | **PDI rejections vs FSB labour costs, acceptance rates** |
| **P5-CORRECTED** | **Enhance Critical Alerts (v2)** | **Partial** | **Dev Team** | **28+ alerts with ownership + action required + aging buckets** |
| **P5-CORRECTED** | **Build Rejection Root-Cause Report** | **Pending** | **Dev Team** | **Top reasons + corrective action assignment + completion tracking + effectiveness** |
| **P5-CORRECTED** | **Build Payment Flow Dashboard** | **Pending** | **Dev Team** | **Claim->Settlement->Payment stage visibility + status transitions** |
| **P8-NEW** | **Implement role-correct warranty scope contract (admin dealer-agnostic)** | **Pending** | **Dev Team** | **Use backend RBAC scope as source of truth; separate UI dealer chip state (`NO-DEALER`) from data visibility** |

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

## Additional Dashboard Views & Reports (Audit Findings)

Based on warranty report audit, the following additional reporting surfaces are required:

### Required Dashboard Sections (Discovered from Audited References)

1. **Special Charges Dashboard**
   - Job codes: 980016 (Rusting), 980019 (Loaner Car), 980025 (Misc)
   - PV vs EV breakdown of special charges
   - Top claims analysis by charge type
   - Impact on margins and settlement

2. **PDI & FSB Separated Analysis**
   - PDI rejections tracking separately from warranty claims
   - FSB (First Service By) labor costs segregated by ICE vs EV
   - FSB acceptance rate and trend

3. **Invoice Pending Upload Report**
   - 12 invoices ₹25.72L pending upload to TM portal
   - Invoice aging (which invoices pending > 24hrs, 48hrs, 5+ days)
   - Status: Awaiting Invoice, Pending Upload, Upload Failed, Uploaded

4. **Payment Status Tracking**
   - Paid vs Not Paid visibility per claim
   - Payment aging report
   - Pending settlement (Approved but payment not received)
   - Settlement staging (Processing, Initiated, Completed)

5. **Settlement Aging Report**
   - Approved claims > 5 days not yet settled
   - Settlement delay impact by branch/location
   - Claim-level settlement trace with dates

6. **Rusting Claims Deep Dive**
   - 168 rusting claims total, ₹3.02L parts paid
   - Rusting by model and production batch
   - Root cause analysis (paint, body integrity, environment)
   - Preventive action effectiveness

7. **Advisor-wise Quality Report**
   - Claims count by advisor
   - Rejection rate by advisor
   - Average claim value by advisor
   - Quality trends over time

8. **Model-wise Loss Analysis**
   - Parts and labour cost per model
   - Warranty cost as % of sales
   - Top problem parts by model
   - Leakage by model

9. **Top Parts Analysis**
   - Top 20 parts by frequency
   - Top 20 parts by cost
   - Parts margin impact (20% rule)
   - Parts with highest rejection rate

10. **Labour Analysis (FSB ICE vs EV)**
    - FSB labour costs ICE vs EV comparison
    - Labour headcount per location
    - Labour efficiency metrics
    - Skill-level mapping to labour costs

11. **PV vs EV Settlement Comparison**
    - PV settlement reports (multiple batches)
    - EV settlement reports (multiple batches)
    - Side-by-side financial comparison
    - PV/EV cost variance analysis

12. **Critical Alerts Enhanced**
    - 28+ active alerts categorized:
         - Not submitted > 24 hours (current dump-backed snapshot: 82)
         - Review stuck > 3 days (current dump-backed snapshot: 47)
         - SOP pending > 2 days (current dump-backed snapshot: 2427)
         - Approved not settled > 5 days (current dump-backed snapshot: 91)
      - Rejection reason blank (2 claims)
    - Each alert must show: claim ID, advance amount, days pending, assigned owner, action required

13. **Month-wise Category Matrix**
    - Categories: WC, FSB, Updation, Goodwill, AMC, Part WC, Settlement
    - Columns: Count, Claimed, Settled, Pending, Rejection Rate, Avg Value
    - Monthly historical view with YTD rollup

14. **TAT (Turn-Around Time) Monitoring**
    - Initial -> Submission: target 0 days
    - Submission -> Review: target 2 days (SLA: 3 days)
    - Review -> Approval: target 1 day (SLA: 2 days)
    - Approval -> Settlement: target 5 days (SLA: 7 days)
    - Actual vs Target by claim stage with trend

15. **Rejection Root-Cause Report**
    - Top rejection reasons with frequency
    - Corrective action owner assignment
    - Action completion status tracking
    - Effectiveness metrics (same claim re-submission after action)

---

## Enhanced Data Model Requirements

Additional fields required in warranty import tables (discovered from audited reports):

### Common Fields (All Tables)
- `claim_id` / `job_card_id` (primary reference)
- `advisor_id` / `advisor_name` (track by advisor)
- `model` / `variant` (vehicle model for loss analysis)
- `vehicle_age_months` (correlate to warranty period)
- `manufacturing_date` (batch/production trace)
- `registration_number` (VIN/registration for dedup)
- `status` (Initial, Submitted, Review, SOP, Approved, Rejected, Settled, Paid)
- `created_date`, `submitted_date`, `review_date`, `sop_date`, `approved_date`, `settled_date`, `paid_date` (TAT tracking)
- `posted_doc_url` (invoice/document link)

### Specific Fields
- `parts_amount`, `labour_amount`, `special_charges` (amount breakdown)
- `special_charge_code` (980016, 980019, 980025 mapping)
- `claimed_amount`, `approved_amount`, `paid_amount` (financial trace)
- `rejection_reason`, `corrective_action`, `action_owner` (root cause & owner)
- `payment_status` (Paid, Not Paid, Pending)
- `settlement_status` (Processing, Initiated, Completed, Failed)
- `invoice_status` (Awaiting, Pending Upload, Uploaded, Failed)

---

## Updated Traceability Matrix (Database-Backed – Corrected 2026-06-02)

### Important Correction

**Schema is COMPLETE.** All 7 warranty tables are created with JSONB design. No schema migration needed. Focus shifts to **data extraction/transformation** from JSONB.

| Ref ID | Claude Requirement | Techwheels Target (Report/Widget) | File Path(s) | Status | Validation Method |
|---|---|---|---|---|---|
| (Previous 23 rows: TR-001 through TR-023 remain as-is) | | | | | |
| **TR-024** | **Special charges dashboard (980016, 980019, 980025)** | **Special Charges Report tab** | **src/pages/reports/warranty/SpecialChargesReport.tsx** | **Pending** | **Extract special_charge_code from source_row_data + validate job code frequency** |
| **TR-025** | **PDI & FSB separated analysis** | **PDI & FSB Separation tab** | **src/pages/reports/warranty/PDIFSBReport.tsx** | **Pending** | **Filter by claim type in source_row_data + calculate acceptance rates** |
| **TR-026** | **Invoice pending upload aging report** | **Invoice Upload Status Report** | **src/pages/reports/warranty/InvoiceUploadReport.tsx** | **Pending** | **Extract invoice_status from source_row_data + aging by submitted_date** |
| **TR-027** | **Payment status and settlement aging** | **Settlement Aging Report** | **src/pages/reports/warranty/SettlementAgingReport.tsx** | **Pending** | **Extract payment_status + approved_date + settled_date from source_row_data** |
| **TR-028** | **Rusting claims root cause deep dive** | **Rusting Analysis Report** | **src/pages/reports/warranty/RustingAnalysisReport.tsx** | **Pending** | **Filter by special_charge_code='980016' + extract model + cost from source_row_data** |
| **TR-029** | **Advisor-wise quality and performance** | **Advisor Performance Report** | **src/pages/reports/warranty/AdvisorPerformanceReport.tsx** | **Pending** | **Extract advisor_id + aggregate rejection_reason from source_row_data by advisor** |
| **TR-030** | **Model-wise loss and warranty cost** | **Model Cost Analysis Report** | **src/pages/reports/warranty/ModelCostAnalysisReport.tsx** | **Pending** | **Extract model + labour_amount from source_row_data + group by model** |
| **TR-031** | **Top 20 parts by frequency and cost** | **Parts Analysis Report** | **src/pages/reports/warranty/PartsAnalysisReport.tsx** | **Pending** | **Parse parts array from source_row_data + count + sum cost** |
| **TR-032** | **Labour analysis ICE vs EV** | **Labour Efficiency Report** | **src/pages/reports/warranty/LabourAnalysisReport.tsx** | **Pending** | **Extract labour_amount by portal (PV vs EV) from source_row_data** |
| **TR-033** | **PV vs EV settlement comparison** | **PV/EV Settlement Report** | **src/pages/reports/warranty/PVEVSettlementReport.tsx** | **Pending** | **Filter by portal + extract settled_amount from warranty_claim_settlement_report_data** |
| **TR-034** | **Enhanced critical alerts (28+ alerts)** | **Critical Alerts v2 with ownership** | **src/pages/reports/warranty/CriticalAlertsReport.tsx** | **Partial** | **Calculate TAT from dates in source_row_data + check status field for SLA breaches** |
| **TR-035** | **Month-wise category matrix (7 categories)** | **Month Category Matrix** | **src/pages/reports/warranty/MonthWiseCategoryReport.tsx** | **Partial** | **Group by month + table (warranty_*_data) + sum claimed/settled from source_row_data** |
| **TR-036** | **TAT monitoring by claim stage** | **TAT Monitoring Dashboard** | **src/pages/reports/warranty/TATMonitoringReport.tsx** | **Pending** | **Calculate stage durations from date fields in source_row_data vs SLA targets** |
| **TR-037** | **Rejection root-cause with corrective actions** | **Rejection Analysis Report** | **src/pages/reports/warranty/RejectionAnalysisReport.tsx** | **Pending** | **Extract rejection_reason + corrective_action + action_owner from source_row_data** |
| **TR-038-CORRECTED** | **Define JSONB extraction mappings per source type (REPLACES schema migration)** | **Extraction contract documentation** | **docs/Implementation_plans/warranty/evidence/WARRANTY-001_JSONB_EXTRACTION_MAPPINGS.md** | **Pending** | **Audit source files + document field->JSONB path mappings** |
| **TR-039** | **Claim-to-settlement payment flow visibility** | **Payment Flow Dashboard** | **src/pages/reports/warranty/PaymentFlowReport.tsx** | **Pending** | **Extract status + payment_status stages + trace through source_row_data** |
| **TR-040** | **Invoice document tracking and URL linking** | **Invoice Document Repository** | **src/pages/reports/warranty/InvoiceDocumentReport.tsx** | **Pending** | **Extract posted_doc_url from source_row_data + validate URL accessibility** |
| **TR-041-NEW** | **Build per-source JSONB extraction functions** | **TypeScript extraction utilities** | **src/lib/warranty/jsonExtraction.ts** | **Pending** | **Unit tests for each source type's key extraction + type safety** |
| **TR-042-NEW** | **Create computed columns or materialized views for reporting** | **Supabase views for warranty analytics** | **supabase/migrations/20260602*_warranty_reporting_views.sql** | **Pending** | **Test view performance + data completeness vs raw JSONB** |
| **TR-043-NEW** | **Role-correct dealer scope contract for warranty reports** | **Admin dealer-agnostic + mapped scope for non-admin** | **supabase/migrations/20260603*_warranty_scope_contract.sql; supabase/migrations/20260603170500_admin_unrestricted_rls_bypass.sql; src/lib/api/auth.ts; src/pages/reports/warranty/WarrantyOverviewReport.tsx** | **Done (Executed + Verified 2026-06-03)** | **Admin-bypass policy verification passed with counts `service_parts_order_data=4`, `service_reception_entries=4`, `settings_model_options=4`, `vehicles=3`, `storage.objects=4`; non-admin remains mapped-dealer scoped** |
| **TR-044-NEW** | **Super-admin equivalent full-scope contract for 28-report wiring** | **`admin@firstmobital.com` must see all mapped dealer-code data across all fuel types in every warranty report** | **docs/Implementation_plans/warranty/active/WARRANTY-001_WARRANTY_REPORT_IMPORT_AND_REPORTING_PLAN.md; src/pages/reports/warranty/*** | **Pending** | **For `admin@firstmobital.com` with mapped dealer codes `3000840`, `500A840`, `3001440`: totals/rows must match unfiltered dataset across all 28 reports** |

---

## Warranty Role-Scope Contract (Long-Term Proper Fix)

Problem observed:

1. Header chip can show `NO-DEALER` when JWT metadata is missing.
2. Warranty overview currently combines role-string checks and client-side dealer arrays.
3. This can drift from authoritative RBAC (`public.is_admin()`, `get_my_permissions`, `user_employee_links`).

Target contract:

1. `admin` users are dealer-agnostic for warranty reporting.
2. `manager|staff|viewer` users are restricted to active `user_employee_links` dealer mappings.
3. `NO-DEALER` is UI-only metadata state, never an auth input.
4. Location/fuel tabs are presentation filters after backend scope resolution, not security boundaries.

Implementation direction:

1. Add one scope RPC/helper that returns `is_admin` and effective `dealer_codes[]`.
2. Use this scope in warranty query wiring before UI filters.
3. Keep dealer-code-to-location/portal mapping for analytics facets only.
4. Add regression checks for admin users with blank metadata dealer code.

Acceptance checks:

1. Admin user with blank metadata dealer code still sees Sitapura PV/EV and Ajmer Road PV records and alerts.
2. Non-admin user mapped to `3000840` only sees Sitapura PV scope.
3. Non-admin user with no active mapping gets explicit empty-state guidance.
4. UI chip may display `NO-DEALER`, but data visibility still follows RBAC scope contract.

### Super-Admin Equivalent Coverage Lock (2026-06-03)

Locked implementation baseline for this plan:

1. Test/control user is `admin@firstmobital.com`.
2. This user is super-admin-equivalent by project policy (`users.role = 'admin'`, active admin full-module access).
3. Dealer mappings for this user are locked as `3000840`, `500A840`, `3001440` (per RBAC master plan).
4. Therefore, every warranty report query for this user must operate as full-scope across all mapped dealer codes and all fuel types represented by those mappings.
5. No UI metadata fallback (including `NO-DEALER` chip state) may reduce or suppress this user scope.
6. This lock applies to all 28 report wires in this plan (existing and pending rows in TR-001..TR-040 plus newly added traceability rows).

---

## JSONB Data Extraction Strategy (Corrected – No Schema Migration Needed)

### The Reality: Schema is Complete [OK]

Migration `20260528155000_create_warranty_import_tables.sql` has already created all 7 tables with the correct JSONB design. **No schema enhancement migration is required.**

### What's Next: Define Extraction Contracts

Instead of adding columns, define **per-source JSONB key mappings** that specify:
1. Which keys exist in each source type's source_row_data
2. How to parse and validate values
3. Type conversions and date formats
4. Fallback strategies for missing keys

### Recommended Approach

**Option A: Application-Layer Extraction (TypeScript)**
```typescript
// src/lib/warranty/jsonExtraction.ts
export const warrantyClaim SettlementExtraction = {
  claim_id: { jsonPath: '$.JP#', type: 'string' },
  advisor_id: { jsonPath: '$.Advisor ID', type: 'string' },
  claimed_amount: { jsonPath: '$.Claimed Amt', type: 'decimal' },
  approved_amount: { jsonPath: '$.Approved Amt', type: 'decimal' },
  status: { jsonPath: '$.Status', type: 'enum', values: [...] },
  submitted_date: { jsonPath: '$.Submitted Date', type: 'date', format: 'DD-MM-YYYY' },
  // ... etc
};
```

**Option B: Database Views (SQL)**
```sql
-- supabase/migrations/20260602*_warranty_reporting_views.sql
CREATE OR REPLACE VIEW warranty_claim_settlement_normalized AS
SELECT
  id, branch, location, portal,
  source_row_data->>'JP#' AS claim_id,
  source_row_data->>'Advisor ID' AS advisor_id,
  (source_row_data->>'Claimed Amt')::decimal AS claimed_amount,
  (source_row_data->>'Approved Amt')::decimal AS approved_amount,
  source_row_data->>'Status' AS status,
  ...
FROM warranty_claim_settlement_report_data;
```

**Option C: Hybrid (Computed Columns)**
```sql
-- Add non-materialized computed columns
ALTER TABLE warranty_claim_settlement_report_data
ADD COLUMN claim_id TEXT GENERATED ALWAYS AS (source_row_data->>'JP#') STORED;
-- (Only if performance requires materialization)
```

### Action Items

1. **Audit source files** – Sample each of the 7 warranty report types
2. **Document JSONB keys** – Map expected keys per source type
3. **Choose extraction strategy** – Application vs Database views
4. **Implement extraction** – Build parser with type safety and validation
5. **Create reporting layer** – Views or services that expose normalized data
6. **Test extraction** – Validate against sample data + edge cases

### No Migration File Required

The database schema is already correct. Focus on **data transformation, not schema changes**.

## Next Immediate Steps (Corrected – Database-Backed 2026-06-02)

### [OK] What's Already Done
- 7 warranty tables created with JSONB design
- Branch/location/portal CHECK constraints validated from authoritative dump
- Upsert strategy implemented (branch + portal + source_row_hash unique constraint)
- Import UI and upload flow functional
- Overview dashboard shell deployed

### 🔄 What Needs Immediate Attention

1. **[CRITICAL]** Sample actual source files from all 7 warranty types
   - Extract sample rows from uploaded Excel files
   - Document what keys exist in source_row_data for each type
   - Identify any keys that are inconsistent or missing
   - Create JSONB extraction contract doc (warranty/evidence/WARRANTY-001_JSONB_EXTRACTION_MAPPINGS.md)

2. **[CRITICAL]** Choose JSONB extraction strategy
   - **Option A:** Application-layer parsing (TypeScript utilities)
   - **Option B:** Database views (SQL computed columns)
   - **Option C:** Hybrid (Materialized views for high-volume reports)
   - **Decision criteria:** Performance, maintainability, type safety

3. **[HIGH]** Build JSONB extraction layer
   - Create `src/lib/warranty/jsonExtraction.ts` with extraction utilities
   - Add type-safe parsers for each source type
   - Add validation + error handling for missing/malformed data
   - Unit test against sample data

4. **[HIGH]** Freeze per-source field mappings
   - Claim Settlement: claim_id, advisor, model, amounts, dates, status
   - Part WC: parts, labour, claim reference, cost breakdown
   - Updation: update type, model variant, cost
   - FSB: labour cost, model, labour type (ICE vs EV)
   - Goodwill: goodwill reason, cost, approval status
   - AMC: service type, model, costs
   - WC: warranty claim type, root cause, claim amount

5. **[HIGH]** Validate extraction against audited financial data
   - Total claimed amounts should match ₹2.03 Crore across all 7 types
   - Category totals (WC, FSB, Updation, etc.) should reconcile
   - Month-wise summaries should match source files

6. **Build reporting dashboards (in priority order)**
   - Invoice Pending Upload (₹25.72L, 12 invoices, TM portal status)
   - Settlement Aging (dynamic, dump-backed pending > 5 days with claim-level reconciliation)
   - TAT Monitoring (4-stage flow with SLA thresholds)
   - Special Charges (980016 rusting, 980019 loaner, 980025 misc)
   - Critical Alerts v2 (28+ with ownership)
   - PV vs EV Settlement Comparison (Rpt 32-41)
   - Rusting Analysis (168 claims, ₹3.02L, model correlation)
   - Advisor Performance, Model Cost, Top Parts, Labour (ICE vs EV)
---

## Database Validation Summary (Authoritative Dump – 2026-06-02)

### Validation Source

- Primary authority: `local_folder/backups/full_database.sql`
- Access mirror used for large-file reads: `local_folder/backups/chunks/full_database.sql.part_*`

### Dump-Backed Findings

| Check | Result | Details |
|---|---|---|
| **7 Tables Exist** | [OK] Yes | warranty_claim_settlement_report_data, warranty_part_wc_data, warranty_updation_claim_data, warranty_goodwill_data, warranty_amc_data, warranty_fsb_data, warranty_wc_data |
| **Column Count (per table)** | [OK] 10 | id, branch, location, portal, source_row_hash, source_row_number, source_file_name, source_row_data, created_at, updated_at |
| **CHECK (branch)** | [OK] Present | `branch IN ('Ajmer Road', 'Sitapura')` on all 7 tables |
| **CHECK (location)** | [OK] Present | `location IN ('Ajmer Road', 'Sitapura')` on all 7 tables |
| **CHECK (portal)** | [OK] Present | `portal IN ('PV', 'EV')` on all 7 tables |
| **Unique Constraint** | [OK] Applied | `(branch, portal, source_row_hash)` on all 7 tables |
| **JSONB Column** | [OK] Present | `source_row_data jsonb NOT NULL DEFAULT '{}'` |
| **Triggers** | [OK] Present | `trg_warranty_*_updated_at` executes `set_updated_at()` on update |
| **Indexes** | [OK] Present | `idx_warranty_*_branch_portal` on each table |
| **Import Metadata** | [OK] Registered | All 7 warranty tables present in `import_metadata` COPY data |
| **RLS/Policies on Warranty Tables** | ➖ Not Found | No `ENABLE ROW LEVEL SECURITY` / `CREATE POLICY` entries for `warranty_*` in dump |

### Observed Warranty Data Combinations in Dump

Distinct combinations observed in `COPY` data (table|branch|location|portal):
- `warranty_*|Ajmer Road|Ajmer Road|PV`
- `warranty_*|Sitapura|Sitapura|PV`
- `warranty_*|Sitapura|Sitapura|EV`

### Final Authority Lock

All schema and data-shape statements in this plan are now anchored to the local authoritative dump. If any future conflict appears between narrative text and dump content, dump content wins without reconciliation.