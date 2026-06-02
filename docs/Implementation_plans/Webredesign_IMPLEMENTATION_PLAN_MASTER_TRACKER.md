# Techwheels Web Redesign - Final Implementation Plan (Master Tracker)

Status: ACTIVE
Plan owner: Execution team
Audit basis date: 2026-06-02
Primary source folder: local_folder/Reference/WebVersionRedesignReference
Reference root (from this file): ../../local_folder/Reference/WebVersionRedesignReference
Reference root (workspace-relative): local_folder/Reference/WebVersionRedesignReference
Re-audit pass: 2026-06-02 (deep inventory + artifact delta capture)
Re-audit pass 2: 2026-06-02 (mirror TS constraints + instruction file reconciliation)

Path convention in this plan:
1. Any bare reference filename (for example IMPLEMENTATION_PLAN.md, styles.css, shell.jsx) resolves under ../../local_folder/Reference/WebVersionRedesignReference.
2. Workspace files (for example src/App.tsx) are rooted at project root.

---

## 1. Purpose

This is the fresh, consolidated, execution plan for implementing the full web redesign into the real project codebase.

This plan is built only from explicit content audited inside the reference folder. It does not add guessed requirements.

This document is also the live activity tracker. Every completed, in-progress, blocked, or pending step must be updated here to prevent drift.

---

## 2. Authority And Drift Guard

### 2.1 Authority order

1. Webredesign_IMPLEMENTATION_PLAN_MASTER_TRACKER.md (this file, execution tracker)
2. ../../local_folder/Reference/WebVersionRedesignReference/IMPLEMENTATION_PLAN.md (reference folder original design plan)
3. Prototype source files under ../../local_folder/Reference/WebVersionRedesignReference (styles.css, components.css, app-data.js, screen JSX, screen data JS)
4. Screenshot evidence under ../../local_folder/Reference/WebVersionRedesignReference/screens/
5. Mirror src/pages TypeScript files under ../../local_folder/Reference/WebVersionRedesignReference/src/pages/ for implementation behavior confirmation
6. ../../local_folder/Reference/WebVersionRedesignReference/copilot-instructions.md (currently present; reinstated in authority set)

### 2.2 Non-negotiable constraints (audited)

1. Redesign is presentational only; business logic must remain intact.
2. Do not change Supabase query contracts, RPC usage, RBAC gating logic, validation, exports, edge function behavior.
3. Do not fabricate data, labels, statuses, role names, dropdown options, counts, or module names.
4. Sidebar in app shell must become horizontal TopNav with RBAC-adaptive behavior.
5. TopNav must support overflow More and <=900px hamburger drawer.
6. Responsive behavior must satisfy 375, 768, 1280 checkpoints.
7. No new dependencies unless explicitly required.
8. Do not port tweaks-panel.jsx (preview-only tooling).
9. Every post-login page must use one shared redesign class/token grammar from src/App.css and src/index.css; do not mix ad-hoc utility-first styling that overrides spacing, type scale, card rhythm, or table density.
10. Do not wrap module pages in an extra nested page container that duplicates shell spacing; page content must inherit a single shell flow for synchronized rendering across routes.

### 2.3 Unknown handling protocol (no assumptions)

If any implementation point is missing from audited artifacts:

1. Mark task status = BLOCKED.
2. Add a TODO(redesign) comment in code at exact unresolved spot.
3. Record blocker in section 13 (Blocker Log).
4. Do not invent missing visuals or behavior.

---

## 3. Audited Artifact Register

### 3.1 Core plan/instruction files

1. ../../local_folder/Reference/WebVersionRedesignReference/IMPLEMENTATION_PLAN.md
2. ../../local_folder/Reference/WebVersionRedesignReference/copilot-instructions.md

### 3.2 Shared design system and shell primitives

1. ../../local_folder/Reference/WebVersionRedesignReference/styles.css
2. ../../local_folder/Reference/WebVersionRedesignReference/components.css
3. ../../local_folder/Reference/WebVersionRedesignReference/app-data.js
4. ../../local_folder/Reference/WebVersionRedesignReference/shell.jsx
5. ../../local_folder/Reference/WebVersionRedesignReference/main.jsx

### 3.3 Screen prototype files

1. ../../local_folder/Reference/WebVersionRedesignReference/auth.jsx
2. ../../local_folder/Reference/WebVersionRedesignReference/home.jsx
3. ../../local_folder/Reference/WebVersionRedesignReference/reception.jsx
4. ../../local_folder/Reference/WebVersionRedesignReference/admin.jsx
5. ../../local_folder/Reference/WebVersionRedesignReference/settings.jsx
6. ../../local_folder/Reference/WebVersionRedesignReference/service-advisor.jsx
7. ../../local_folder/Reference/WebVersionRedesignReference/floor.jsx
8. ../../local_folder/Reference/WebVersionRedesignReference/technician.jsx
9. ../../local_folder/Reference/WebVersionRedesignReference/warranty.jsx

### 3.4 Screen data contracts (prototype data mirrors)

1. ../../local_folder/Reference/WebVersionRedesignReference/reception-data.js
2. ../../local_folder/Reference/WebVersionRedesignReference/admin-data.js
3. ../../local_folder/Reference/WebVersionRedesignReference/settings-data.js
4. ../../local_folder/Reference/WebVersionRedesignReference/service-advisor-data.js
5. ../../local_folder/Reference/WebVersionRedesignReference/floor-data.js
6. ../../local_folder/Reference/WebVersionRedesignReference/technician-data.js
7. ../../local_folder/Reference/WebVersionRedesignReference/warranty-data.js

### 3.5 Entry points and runtime wiring

1. ../../local_folder/Reference/WebVersionRedesignReference/Techwheels Redesign.html
2. ../../local_folder/Reference/WebVersionRedesignReference/Reception.html
3. ../../local_folder/Reference/WebVersionRedesignReference/Admin.html
4. ../../local_folder/Reference/WebVersionRedesignReference/Settings.html
5. ../../local_folder/Reference/WebVersionRedesignReference/Service Advisor.html
6. ../../local_folder/Reference/WebVersionRedesignReference/Floor Incharge.html
7. ../../local_folder/Reference/WebVersionRedesignReference/Technician.html
8. ../../local_folder/Reference/WebVersionRedesignReference/Warranty Reports.html
9. ../../local_folder/Reference/WebVersionRedesignReference/reception-main.jsx
10. ../../local_folder/Reference/WebVersionRedesignReference/admin-main.jsx
11. ../../local_folder/Reference/WebVersionRedesignReference/settings-main.jsx
12. ../../local_folder/Reference/WebVersionRedesignReference/service-advisor-main.jsx
13. ../../local_folder/Reference/WebVersionRedesignReference/floor-main.jsx
14. ../../local_folder/Reference/WebVersionRedesignReference/technician-main.jsx
15. ../../local_folder/Reference/WebVersionRedesignReference/warranty-main.jsx

### 3.6 Visual evidence packs

1. ../../local_folder/Reference/WebVersionRedesignReference/screens/* (all provided PNG snapshots)
2. ../../local_folder/Reference/WebVersionRedesignReference/uploads/* (uploaded screenshots and SQL chunks in reference folder)

Deep re-audit deltas captured from visual artifacts and prototypes:
1. Warranty-specific evidence artifacts are present (for example 01-wty.png, 02-wty.png).
2. Reception redesign artifact now reflects front-desk console split layout (intake form + live recent feed), not only table-first list layout.

Note: src/ inside this reference folder was inventoried and treated as context mirror, not as primary visual source unless explicitly referenced by IMPLEMENTATION_PLAN.md.

---

## 4. Target Implementation Map (Real Repo)

### 4.1 Core shell and routing

1. src/App.tsx

### 4.2 Authentication

1. src/pages/LoginPage.tsx
2. src/pages/SignUpPage.tsx
3. src/pages/PasswordUpdatePage.tsx

### 4.3 Dashboard and modules

1. src/pages/ReceptionPage.tsx
2. src/pages/AdminPage.tsx
3. src/pages/SettingsPage.tsx
4. src/pages/ServiceAdvisorPage.tsx
5. src/pages/FloorInchargePage.tsx
6. src/pages/TechnicianPage.tsx
7. src/pages/ReportsPage.tsx
8. src/pages/ImportPage.tsx
9. src/pages/AutoDocPage.tsx
10. src/pages/JobCardPage.tsx

### 4.4 Shared styling layer

1. src/index.css
2. src/App.css
3. Optional shared component CSS file if needed (same class names as reference)

---

## 5. Design System Contract (Must Port Exactly)

### 5.1 Theme tokens

From styles.css root tokens:

1. Accent and accent derivatives
2. Ink and neutral palette
3. Border and surface tokens
4. Status tokens (success, danger, warn)
5. Radius scale
6. Shadow scale
7. Density variables
8. Content max width token (--maxw = 1680px)
9. Font stacks (Plus Jakarta Sans, Geist Mono)

### 5.2 Shared class system

Classes that must be available in real app styling:

1. btn variants
2. inp, sel, inp-wrap
3. card, card__head, card__body
4. tbl and tbl-wrap
5. pill and badge system
6. tabs and tab
7. switch
8. cbx
9. modal family
10. note/callout styles
11. kpi and summary chip styles
12. menu/dropdown classes
13. action button classes (tbtn, mini)

### 5.3 Responsive requirements

1. <=1080: KPI 4->2, two-column content to one-column
2. <=900: module nav collapses to hamburger drawer
3. <=720: tab strip scroll, utility reductions, form grid compaction
4. <=600: tighter page paddings and typography scaling
5. <=420: KPI 1-column fallback
6. all widths: data tables in horizontal scroll container

### 5.4 Visual Synchronization Contract (All Web Pages)

1. Shared layout primitives must be reused across modules: pagehead, card/card__head/card__body, tbl/tbl-wrap, summary/schip, kpis.
2. Typography and spacing scale must come from shared tokens and classes, not per-page one-off utility stacks.
3. Home (dashboard) is the baseline rhythm for page-head, summary, card, and table density; all operational pages must align to this flow.
4. Any discovered visual drift (font-size, row height, padding, chip scale, header rhythm) is a tracker defect and must be resolved before task closure.

---

## 6. Navigation And RBAC Contract

### 6.1 TopNav behavior

1. Utility strip (dealer identity, search, notifications, version)
2. Main nav row with module items
3. Inline module limit with overflow More menu
4. Reports dropdown menu categories in nav
5. User chip menu with profile/dealer/preferences/sign out entries
6. Mobile drawer for full module list
7. Support light and dark header variant

### 6.2 RBAC invariants

1. Render nav from existing visibleNavItems logic in real app.
2. Preserve route-level guards and permission checks.
3. Preserve default route resolution and existing access checks.

---

## 7. Screen-by-Screen Execution Scope

### 7.1 Auth set

1. Login visual redesign in LoginPage.tsx
2. Forgot password dedicated state/screen behavior using existing reset flow
3. Request access redesign in SignUpPage.tsx with password strength rules aligned with existing constraints
4. Preserve auth API calls and validation paths
5. Explicit auth constraint reconciliation required:
- SignUpPage mirror flow currently enforces minimum 8 chars.
- PasswordUpdate flow enforces 12+ with upper/lower/number/special.
- Prototype request-access design guidance expects 12+ strength-meter behavior.
- Final execution must preserve existing runtime logic unless user explicitly requests logic change.

### 7.2 Home and shell

1. App shell migration from sidebar to TopNav
2. Dashboard KPIs and cards visual redesign using real live counts
3. Recent reception table visual redesign
4. Activity feed visual redesign
5. RBAC module launcher visual redesign

### 7.2A Cross-Page Synchronization Rule (Mandatory)

1. Home page establishes canonical post-login layout rhythm.
2. Service Advisor, Reception, Admin, Settings, Floor Incharge, Technician, Reports, Import, AutoDoc, and JobCard must match canonical rhythm using shared design-system classes.
3. Mixed styling systems on the same page are not acceptable for final web redesign sign-off.

### 7.3 Reception

1. Intake form layout parity
2. Required field behavior parity (Reg No, SA, Source)
3. Source option set parity
4. Console split layout parity: left sticky intake form + right live recent intake feed with newest-first prepend behavior
5. Feed item visual states parity including fresh-entry highlight animation
6. Import parser constraints from mirror TS implementation:
- required headers: reg_number and sa_employee_code
- row-level skip behavior when required fields are missing
- owner phone validation remains exact 10 digits

### 7.4 Admin

1. Four-tab structure parity (Users, Permissions, Modules, Mappings)
2. Users tab search/show inactive/cards/table/actions visual parity
3. Permissions matrix visual parity (View/Modify/Delete + quick full/none)
4. Modules tab table visual parity
5. Mappings tab table visual parity
6. Toast and modal visual parity
7. Dealer assignment constraint must remain explicit in UX/help text:
- dealer code is required for AutoDoc visibility
- user must sign out and sign back in after dealer updates for JWT/claims refresh

### 7.5 Settings

1. Section index card launcher parity
2. selectedSectionId gating behavior parity (single section open, default index-only)
3. Branch Management section parity
4. Employee Master section parity
5. Models section parity
6. AutoDoc Rate Cards section parity
7. Unmapped SR Entries section parity

### 7.6 Service Advisor

1. Advisor-only assigned rows presentation parity
2. Per-row editable controls parity (service type, JC number, remark)
3. Estimate upload/replace visual actions parity
4. Per-row save affordance parity
5. Service type editor must preserve current non-standard values by retaining current value as selectable option when it is outside standard option list
6. Service Advisor must remain synchronized with Home page flow (shared pagehead/card/tbl/summary grammar; no independent spacing/font scale drift).

### 7.7 Floor Incharge

1. Assignment dashboard cards parity
2. Branch filter/search toolbar parity
3. Per-row assignment controls parity (bay, technician, status, remark)
4. Save-stage gating parity

### 7.8 Technician

1. Technician picker parity
2. Income tracker cards/table parity
3. Assigned rows table parity

### 7.9 Remaining modules without final redesign specs

1. ReportsPage.tsx - warranty report redesign is explicitly available in this bundle via warranty.jsx/warranty-data.js/warranty-main.jsx and Warranty Reports.html
2. ImportPage.tsx - shell + design system parity only until dedicated reference arrives
3. AutoDocPage.tsx and JobCardPage.tsx - shell + design system parity only until dedicated reference arrives

These are explicitly tracked as partially blocked-for-full-parity due to missing dedicated redesign specs for non-warranty report categories, Import, and AutoDoc/JobCard in the audited folder.

### 7.10 Reports - Warranty full operational scope (WARRANTY-001 + WARRANTY_REFERENCE audited)

1. Warranty report implementation covers **28 reports across 5 audit-backed sections (A1–E3)** wired to authoritative DB schema.
2. **Warranty schema verified from authoritative dump** (local_folder/backups/full_database.sql, 71MB export snapshot, 2026-06-02). 7 tables present with identical DDL contract confirmed in active database.
3. Authoritative warranty source: 7 tables present in active dump with verified DDL, constraints, and triggers:
- public.warranty_claim_settlement_report_data (verified COPY, triggers, constraints)
- public.warranty_part_wc_data (verified COPY, triggers, constraints)
- public.warranty_updation_claim_data (verified COPY, triggers, constraints)
- public.warranty_goodwill_data (verified COPY, triggers, constraints)
- public.warranty_amc_data (verified COPY, triggers, constraints)
- public.warranty_fsb_data (verified COPY, triggers, constraints)
- public.warranty_wc_data (verified COPY, triggers, constraints)
3. Shared column contract fixed to: id, branch, location, portal, source_row_hash, source_row_number, source_file_name, source_row_data, created_at, updated_at.
4. **Constraint/trigger contract verified from authoritative dump:**
- **Check constraints VERIFIED:** branch CHECK (Ajmer Road | Sitapura), location CHECK (Ajmer Road | Sitapura), portal CHECK (PV | EV) on all 7 tables
- **Primary key VERIFIED:** id PRIMARY KEY on all 7 tables
- **Unique key VERIFIED:** (branch, portal, source_row_hash) UNIQUE on all 7 tables — deduplication key locked
- **BEFORE UPDATE triggers VERIFIED:** set_updated_at() trigger on all 7 tables (trg_warranty_*_updated_at) confirmed present in dump
5. **RLS Security verified from authoritative dump:** No CREATE POLICY or ALTER TABLE...ENABLE ROW LEVEL SECURITY statements found for warranty tables. RLS is NOT currently enabled (deferred per scope). Authority: full_database.sql audit confirms absence.
6. **Shared column contract verified present on all 7 tables:** id, branch, location, portal, source_row_hash, source_row_number, source_file_name, source_row_data (jsonb), created_at, updated_at. JSONB extraction mapping required per source format (no fixed nested schema at DDL level).

7. **JSONB content mapping (per source format, extracted from source_row_data column):**
- Financial: claimed_amount, approved_amount, paid_amount, parts_amount, labour_amount, special_charges, special_charge_code (980016/980019/980025)
- Operational: status (Created/Submitted/Awaiting SOP/Approved/Settled/Rejected/Under Change), action_owner, rejection_reason (5 categories from VCM Comments: not-submitted>24h / review>3d / SOP>2d / approved>5d / reason-blank)
- Vehicle: model, registration_number, vehicle_age_months
- Timeline: created_date, submitted_date, sop_date, approved_date, paid_date
- Status docs: payment_status, settlement_status, invoice_status, posted_doc_url, posting_doc_number
- Claim metadata: employee_code, advisor_code, complaint_desc, job_code, job_type, prowac_series, dealer_code, branch, location, portal

---

## 7.10A Warranty Schema Authority Governance (2026-06-02)

**Authoritative Source:** local_folder/backups/full_database.sql (71 MB full database export, 2026-06-02 snapshot)

**Authority Level:** FINAL (Repo Memory: warranty-schema-verified-from-authoritative-dump.md locks all schema details from dump export)

**Warranty Implementation Contract (Locked):**
1. 7 tables must remain with exact DDL and column structure as found in authoritative dump
2. All 7 tables must maintain 3 CHECK constraints (branch, location, portal enum checks)
3. All 7 tables must maintain PRIMARY KEY on id and UNIQUE on (branch, portal, source_row_hash)
4. All 7 tables must maintain BEFORE UPDATE triggers calling public.set_updated_at()
5. RLS is NOT enabled on warranty tables (confirmed absent from dump; deferred to future phase)
6. JSONB source_row_data column structure remains flexible per source format (no additional schema constraints)
7. No new tables, columns, or policies allowed without explicit full_database.sql update

**Verification Status:**
- ✅ 7 tables verified PRESENT with CREATE TABLE statements
- ✅ All CHECK constraints verified PRESENT
- ✅ All PRIMARY KEY constraints verified PRESENT
- ✅ All UNIQUE (branch, portal, source_row_hash) constraints verified PRESENT
- ✅ All 7 BEFORE UPDATE triggers verified PRESENT
- ✅ No RLS ENABLE statements verified ABSENT
- ✅ All COPY statements verified PRESENT (indicating data is loaded)


7. **Three core business-logic rules (WARRANTY_REFERENCE section):**
- Data cleaning: strip "Rs." prefix, remove commas, dayfirst=True dates, UTF-16 LE+tab for TM parts, SpreadsheetML XML for XLS settlement
- Revenue: MRP = List Price, NDP = TM settled, Margin = MRP−NDP, **20% Revenue = MRP × 0.20** (only MRP>0, excludes pure-labour SPL)
- Classification: Dealer 3000840 = PV/ICE, 500A840 = EV; Job codes 980016 = Rusting/Body SPL ₹37.71L, 980019 = Loaner Car ₹5.66L, 980025 = Special Misc ₹10.19L

8. **Real aggregate metrics (WARRANTY_REFERENCE sourced from 28 reports + full_database.sql):**
- Settlement grand total **₹196.13L** across **1,961 unique JCs** (reports 32–41)
- Pending claims **767 JCs = ₹46.22L** (no Posting Doc)
- SPL total **₹53.71L** (980016 ₹37.71L, 980019 ₹5.66L, 980025 ₹10.19L + others)
- 20% parts revenue **₹26.96L**; Settlement+Revenue combined **₹223.08L**; revenue leakage **₹8.16L**
- PV (3000840) **₹113.25L** (Report 37 0% posted, Report 38 63% posted); EV (500A840) month-wise Jan ₹7.69L/Feb ₹21.25L/Mar ₹13.18L/Apr–May ₹19.96L
- FSB total **₹17.77L** (ICE 1,855 JCs ₹10.21L + EV 1,262 JCs ₹7.56L)
- Rusting **168 claims** (Nexon highest 60 JCs, Harrier SOP-pending 4 of 7); PDI rejections **132** (77 open>15d, 32 no checksheet, 23 duplicate/post-delivery)
- Top parts PV: Alternator OED Pulley ₹10L/252 JCs; EV: 3-in-1 NOVA LR ₹6.96L/4 JCs, HV AC Cable ₹6.04L/28 JCs
- Invoice pending **12 invoices ₹25.72L** (aging >24h and >48h); AMC payment gap **₹98,036** (TM deduction)

9. **28 Reports exact mapping (WARRANTY_REFERENCE sections A1–E3):**
- **A1–A6 (Dashboard & Monitoring, 6 reports):** Live dashboard (Created→Submitted→Review→Approved→Settled; KPI strip; SLA Created>24h=red/Review>3d=red/SOP>2d=amber/Approved-not-settled>5d=amber); Critical Alerts (5 types: not-submitted>24h, review>3d, SOP>2d, approved>5d, reason-blank); Warranty Master (5 sheets WC/Updation/AMC/Goodwill/FSB); Invoice Pending (12 invoices table); Complete Final Dashboard (₹196.13L, 17 cols); Final Master + 20% Revenue (₹223.08L combined)
- **B1–B8 (Claim Analysis, 8 reports):** Category Parts/Labour (WC/UP/AMC/GW/FSB)+20%; Rusting 168; Month-wise Category (Jan–May); Payment Status; Special Charges 980016/19/25; PDI Rejection Root Cause 132 (3 VCM categories); Claim Type Deep (9 types, settle%/rej%/pending, ₹6L opportunity); 20% Parts Revenue (PV avg 12.94%, EV 15.28% margin)
- **C1–C7 (Settlement, 7 reports):** EV Extended ₹16.02L; EV reports 33–36 month-wise; PV 37–41; Combined all 10; FSB ICE+EV ₹17.77L; PV vs EV defect signals; Special charges breakdown
- **D1–D4 (Parts/Backorder, 4 reports):** PV 147 rows, EV 135 rows; Top parts by NDP (PV/EV); Registry
- **E1–E3 (Root Cause/Recommendations, 3 reports):** PDI 30-day corrective plan; Daily/Weekly/Monthly/Quarterly/On-Demand reports; Claim type P1–P6 recovery (₹6L+ opportunity)

10. **A5/A6 COMPLETE FINAL DASHBOARD structure (gold-standard target from WARRANTY_REFERENCE):**
- Header: "Warranty complete report — Dealer 3000840" with right stat **₹25.72L total pending/at risk**
- 5 critical KPI tiles (colored top border): Invoices pending 12/₹25.72L (red); Pending WC 31 Created/SOP/Submitted (red); AMC pending 89/₹4.48L (amber); 20% revenue Normal WC ₹6.10L (green); 20% revenue Ext WC ₹3.19L (teal)
- Section 1: Invoice pending table (Invoice No / JCs / Parts / Labour / SPL / Total / Status) with 12 real invoice rows
- Section 2: Pending claims 42 (WC 31 + Updation 11) with JC short, model, status tags, complaint text (e.g. "No complaint—urgent fill", "Tail lamp+rusting")
- Section 3: Pending settlement with AMC stage breakdown (Approved-L2 76/₹3.87L, etc.) and WC-awaiting-SOP by model (Nexon 7/Harrier 4/Punch 6/Altroz 5)
- Section 4: Payment status table (Category / Settled / Approved / Submitted/SOP / Rejected / Created / Total / Claimed ₹ / Settled ₹) with exact row counts and claimed/settled totals per category
- Section 5: 20% parts revenue breakdown by product (Safari/Harrier/Nexon/Punch/Altroz) and month (Jan/Feb/Mar/Apr) with Normal/Extended split

11. **Dashboard accessibility & interaction:** Location + PV/EV filter; claim funnel TAT per stage (Good/Watch/High); claim-type performance matrix (claims/settle%/rej%/20%revenue); advisor-wise rejection% (omitted—no real advisor↔claim mapping in sample); dense 10–11px tables; money right-aligned mono; KPI tiles 3px colored top border; tag states (Not-posted red/amber, Created red, Under-Change amber, Approved green)

12. **Visual design tokens (WARRANTY_REFERENCE):** Header gradient #185FA5→#1D6F42; Pills: blue #E6F1FB/#185FA5, red #FCEBEB/#A32D2D, amber #FAEEDA/#854F0B, green #EAF3DE/#3B6D11, indigo #534AB7; map to app system: --danger, --warn, --success, #4F46E5

13. **Scope gate:** Only Warranty Reports to be ported; Labour Revenue, Revenue, Parts categories remain hub/preview only (do not port per WARRANTY_REFERENCE)

14. **Traceability:** Audit basis WARRANTY-001 + WARRANTY_REFERENCE + all_reports_registry.html (full_database.sql + 28 reports registry + exact report-by-report ETL logic + 4201 settlement+2223 WC+... rows), reference TR-001..TR-008, TR-010..TR-012, TR-019 (PDI root-cause), TR-022 (model/LOB), TR-024..TR-040 (new 15 views) plus A1–E3 section mapping

15. **Additional ETL & operational specifications from all_reports_registry.html (meta-reference for developers):**
- **File encoding specifications:** UTF-16 LE+tab for TM parts exports (D1, D2); SpreadsheetML XML with namespace urn:schemas-microsoft-com:office:spreadsheet for claim-settlement XLS (C1–C7); standard UTF-8 CSV for claim CSVs (B1–B8)
- **Data cleaning procedures:** Strip "Rs." prefix, remove commas, pd.to_numeric(coerce), fillna(0), datefirst=True for DD-MM-YY date parsing, regex filters for text analysis
- **Specific report ETL details:** A1 stage-wise pipeline (Created→Submitted→Review→Approved→Settled→Rejected) with SLA color-codes; A2 5 alert categories with claim JC drill-down + action buttons; A3 5 sheets with different column names per category; A4 XML parsing for Posting Document detection; B2 regex filter for 'rust|rusting|corrosion' (168 claims, Nexon 60 JCs systemic); B4 value_counts() on Claim Status for all 7 states; B6 VCM Comments text analysis → 3 exact rejection reasons (77 open>15d/32 no-checksheet/23 duplicate) from TM system; B7 complaint description NLP + top-15 list
- **Specific product/model patterns identified:** PV Alternator OED Pulley ₹10L/252 JCs (systemic defect); EV 3-in-1 NOVA LR ₹6.96L/4 JCs, HV AC Cable ₹6.04L/28 JCs (battery cable failure pattern); Nexon 60 rusting JCs (highest systemic), Harrier 4 of 7 SOP-pending; Nexon FSB ₹3.16L highest ICE, Harrier ₹2.93L highest EV
- **Claim type performance targets:** Extended WC = best (0% rej, 94.5% settle) but only 8.7% of volume (target 20%); Updation Safari+Harrier = 79% rejections → ADAS SOP training needed; PDI = 12.4% rejection (3 root causes); 2nd Free Service = 17.4% → late submission
- **Back order specifications:** PV 147 rows ZSSO/ZSOR/ZPGO mix; EV 135 rows with 83 ZSOR (oldest Feb 2023), 43 ZPGO, 8 ZSSO; EV 188 intransit units; Dashboard layout match (title + sub-title + badge + 3-branch dropzones + Upload All + divider + table)
- **Reports frequency & priority (E2):** Daily (red), Weekly (amber), Monthly (green), Quarterly, On-Demand; 25 reports identified with owner (Warranty Executive/GM/TM Auditor); revenue-protection reports highlighted separately
- **Recovery opportunities (E3):** ₹6L+ total recoverable across P1–P6 priorities; Extended WC opportunity (increase 8.7% to 20%), Updation ADAS fix, PDI 3-cause plan, 2nd Free Service late-submission gate
5. Snapshot row counts from authoritative dump COPY blocks (2026-06-02 validation):
- warranty_claim_settlement_report_data: 4110
- warranty_part_wc_data: 115
- warranty_updation_claim_data: 1939
- warranty_goodwill_data: 97
- warranty_amc_data: 403
- warranty_fsb_data: 2554
- warranty_wc_data: 2365
6. UI tab layout (Overview/Critical Alerts/Financial/Operations) remains a reference-driven redesign concern, but must only read from the DB-backed table/column contract above.
7. Non-warranty report categories remain blocked for full redesign parity until dedicated visual references are supplied (tracked under T-038/B-001).

---

## 8. Implementation Phases And Gates

### Phase 0 - Baseline lock

1. Confirm current branch state and build passes before redesign edits.
2. Snapshot existing UI references for before/after comparison.

Gate: baseline build green.

### Phase 1 - Design system foundation

1. Port tokens and class primitives.
2. Add shared Icon renderer compatible with audited icon paths.

Gate: style tokens and primitives render in sandbox page.

### Phase 2 - App shell migration

1. Replace sidebar with TopNav in App.tsx.
2. Preserve routing and RBAC logic.
3. Implement responsive drawer and overflow menus.

Gate: role presets (2/4/all modules equivalent) pass manual checks.

### Phase 3 - Auth screens

1. Login
2. Forgot
3. Request access

Gate: sign-in, reset flow, signup flow work unchanged.

### Phase 4 - Home dashboard and module launcher

1. Dashboard visuals and cards.
2. Reception summary/activity shells.

Gate: live data displays with no hardcoded fake values.

### Phase 5 - Operational modules designed in reference

1. Reception
2. Admin
3. Settings
4. Service Advisor
5. Floor Incharge
6. Technician

Gate: each screen passes acceptance checklist before next screen close.

### Phase 6 - Remaining modules (limited scope)

1. Reports:
- apply full redesign parity for Warranty report workflow using warranty prototypes in this bundle.
- keep non-warranty report categories blocked until dedicated redesign references are added.
2. Import and AutoDoc/JobCard shell parity only.
3. Mark full visual parity blocked where specific redesign references are still missing.

Gate: consistent shell/design system across all remaining pages.

### Phase 7 - Regression and release hardening

1. Responsive verification at 375/768/1280.
2. RBAC verification.
3. Build and runtime check.
4. Visual parity review against screens/ evidence.

Gate: no blockers, no logic regression, sign-off checklist complete.

---

## 9. Master Activity Tracker (Live)

Status codes: PENDING | IN_PROGRESS | REVIEW | DONE | BLOCKED

| ID | Workstream | Task | Source Evidence | Target Files | Status | Owner | Start | Last Update | Done | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| T-001 | Baseline | Baseline build and route sanity capture | IMPLEMENTATION_PLAN.md | src/* | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Build clean (718 modules, 983ms), lint clean, git clean, dev server running, login baseline UI captured |
| T-002 | Foundation | Port theme tokens (colors/type/radius/shadow/density) | styles.css | src/index.css, src/App.css | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Ported all token definitions: accent, ink, borders, status, radius, shadows, density, fonts. CSS variables ready in :root |
| T-003 | Foundation | Port shared component classes (btn/card/tbl/tabs/badge/modal/etc.) | styles.css + components.css | src/index.css or shared css | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Ported 200+ component classes from reference: auth, form, button, table, tabs, modal, badge, pill, feed, reception, warranty. Added responsive breakpoints. |
| T-004 | Foundation | Add/reuse shared Icon component with audited path set | app-data.js + shell.jsx | src/components or equivalent | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Created src/components/Icon.tsx with all 50 icon paths from reference ICON_PATHS library. Accepts name, size, className, strokeWidth props. |
| T-005 | Shell | Replace sidebar with TopNav utility+nav rows | shell.jsx + IMPLEMENTATION_PLAN.md | src/App.tsx | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Sidebar shell replaced with utility strip + horizontal TopNav, user chip menu, reference brand treatment, and explicit preferred tab ordering (Home, Reception, Service Advisor, Floor Incharge, Technician, Imports, Reports, AutoDoc, Settings, Admin). |
| T-006 | Shell | Implement More overflow for nav | shell.jsx | src/App.tsx or nav component | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Replaced fixed MAX_INLINE overflow with width-aware inline-capacity rules so on-screen tabs stay visible and overflowed modules automatically move into More. |
| T-007 | Shell | Implement <=900 hamburger drawer nav | styles.css + shell.jsx | src/App.tsx + css | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Wired mobile hamburger drawer using existing nav__drawer/navdrawer__item responsive styles and route navigation handling. |
| T-008 | Shell | Preserve RBAC visibleNavItems and route guards | IMPLEMENTATION_PLAN.md + copilot-instructions.md | src/App.tsx | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Retained permission gating, default-route logic, and RequireAccess route wrappers while rendering nav from RBAC-filtered items. |
| T-009 | Auth | Redesign login screen visuals | auth.jsx | src/pages/LoginPage.tsx | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Login visual parity aligned with reference shell/auth grammar; error alert style normalized to shared alert variant. |
| T-010 | Auth | Redesign forgot-password flow visuals in login recovery UI | auth.jsx | src/pages/LoginPage.tsx | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Forgot page updated with reference pitch copy, back action, recovery note card, success state, and sign-in return flow. |
| T-011 | Auth | Redesign request-access screen visuals | auth.jsx | src/pages/SignUpPage.tsx | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Sign-up page aligned to reference layout (back action, role cards, password bar/rules, submitted confirmation block). |
| T-012 | Auth | Keep auth handlers and validation intact | copilot-instructions.md | src/pages/LoginPage.tsx, src/pages/SignUpPage.tsx | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Supabase auth calls and validation gates preserved; only presentational structure/class grammar changed. AuthGate now explicitly redirects authenticated sign-ins to /home by default. |
| T-013 | Home | Redesign dashboard hero/KPI/feeds/module launcher | home.jsx + app-data.js | src/App.tsx plus home target page | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Added /home landing dashboard with live KPI counts, recent reception table, activity feed shell, and RBAC-driven module launcher cards; Home entry added in TopNav and mobile drawer. |
| T-014 | Reception | Redesign intake form layout and controls | reception.jsx + reception-data.js | src/pages/ReceptionPage.tsx | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Intake form moved to redesigned split-layout card with required-field markers, source/model selectors, SA mapping, and create/update/cancel actions while preserving existing API flow. |
| T-015 | Reception | Redesign reception entries table and search toolbar | reception.jsx | src/pages/ReceptionPage.tsx | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Entries view ported to live-feed style with search toolbar, source pills, meta row, inline edit/delete actions, and newest-first behavior over live data. |
| T-016 | Admin | Redesign tabs shell and summary chips | admin.jsx | src/pages/AdminPage.tsx | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Tabs with 4-count badges, summary chips (42 users, 2 admins, 42 active, 0 inactive), Users/Perms/Modules/Mappings all operational with modals, toast, full design system styling. Verified in browser. |
| T-017 | Admin | Redesign Users tab | admin.jsx + admin-data.js | src/pages/AdminPage.tsx | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Search, role filter, show inactive toggle, user table with dealer/role/status columns, action buttons (Perms/Dealer/Pwd), add user modal with dealer assignment, dealer constraints note. |
| T-018 | Admin | Redesign Permissions matrix tab | admin.jsx + admin-data.js | src/pages/AdminPage.tsx | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | User selector dropdown, module search, view/modify/delete checkboxes per module, quick Full/None/Grant All/Revoke All buttons, save permissions button with state tracking. |
| T-019 | Admin | Redesign Modules tab | admin.jsx + admin-data.js | src/pages/AdminPage.tsx | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Module table with #/Module/DB name/Route/Description/Status columns, show inactive toggle, enable/disable action buttons, module counts displayed in tab badge. |
| T-020 | Admin | Redesign Mappings tab | admin.jsx + admin-data.js | src/pages/AdminPage.tsx | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Employee mapping table with User/Employee code/Dealer/Primary/Status columns, add mapping modal, edit modal, primary toggle, deactivate button, search/filter. |
| T-021 | Settings | Redesign section index cards | settings.jsx | src/pages/SettingsPage.tsx | REVIEW | Vinod | 2026-06-02 | 2026-06-02 | - | Section index cards redesigned with icon-led cards, highlighted active state, and Open/Opened CTA parity; local file diagnostics clean and build verified. |
| T-022 | Settings | Enforce selectedSectionId single-open gating | settings.jsx + IMPLEMENTATION_PLAN.md | src/pages/SettingsPage.tsx | REVIEW | Vinod | 2026-06-02 | 2026-06-02 | - | Hardened with typed section IDs, default section fallback, and hashchange listener to enforce one valid open section. Local diagnostics/build passed; browser validation blocked by module access state in shared session. |
| T-023 | Settings | Redesign Branch Management section | settings.jsx + settings-data.js | src/pages/SettingsPage.tsx | REVIEW | Vinod | 2026-06-02 | 2026-06-02 | - | Branch section redesigned to reference table layout (Sort/Branch/Status/Action) with iconized row chips and status badge while preserving add/delete branch flows. Diagnostics, build, and browser render checks passed. |
| T-024 | Settings | Redesign Employee Master section | settings.jsx + settings-data.js | src/pages/SettingsPage.tsx | REVIEW | Vinod | 2026-06-02 | 2026-06-02 | - | Employee Master redesigned with header actions (Export/Import/Add), search toolbar, shown-count indicator, toggleable add form, and refined row action styling while preserving import/export/add/edit/delete handlers. Diagnostics/build passed; shared browser session blocked by module-access gating. |
| T-025 | Settings | Redesign Models section | settings.jsx + settings-data.js | src/pages/SettingsPage.tsx | REVIEW | Vinod | 2026-06-02 | 2026-06-02 | - | Models section redesigned to chip-first management layout with inline rename controls and refined action styling while preserving add/edit/delete handlers. Diagnostics and build passed; shared browser session redirected to Home/module-gated state during validation attempts. |
| T-026 | Settings | Redesign AutoDoc Rate Cards section | settings.jsx + settings-data.js | src/pages/SettingsPage.tsx | REVIEW | Vinod | 2026-06-02 | 2026-06-02 | - | AutoDoc Rate Cards redesigned with counted heading, iconized export/import controls, structured config strip, and refreshed table badges/chips while preserving import/export/activate behavior. Diagnostics, build, and browser rendering checks passed. |
| T-027 | Settings | Redesign Unmapped SR Entries section | settings.jsx + settings-data.js | src/pages/SettingsPage.tsx | REVIEW | Vinod | 2026-06-02 | 2026-06-02 | - | Unmapped SR section redesigned with structured action bar, stats cards, filter strip, selected-count bulk resolve bar, and refreshed table badges/actions while preserving existing resolve and auto-assign logic. Diagnostics/build passed; shared browser session currently module-access gated. |
| T-028 | Service Advisor | Redesign advisor assigned-rows workspace | service-advisor.jsx + service-advisor-data.js | src/pages/ServiceAdvisorPage.tsx | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Service Advisor visual system synchronized with Home baseline using shared class/token grammar only: inline style usage removed from page content blocks (pagehead, summary, table cells, estimate actions), shared App.css classes introduced, existing save/upload logic and non-standard service-type retention preserved. |
| T-044 | Governance | Enforce cross-page visual synchronization lock (no design-system drift) | home.jsx + service-advisor.jsx + styles.css + components.css | docs/Implementation_plans/Webredesign_IMPLEMENTATION_PLAN_MASTER_TRACKER.md, src/App.css, src/pages/* | IN_PROGRESS | Vinod | 2026-06-02 | 2026-06-02 | - | Governance lock is now treated as active enforcement (not documentation-only). Home + Reception + Service Advisor + shell surfaces are being normalized to shared classes/tokens; remaining mixed-system pages must be remediated before closure (notably Floor Incharge and other pending modules). |
| T-029 | Floor Incharge | Redesign assignment workspace and controls | floor.jsx + floor-data.js | src/pages/FloorInchargePage.tsx | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-030 | Technician | Redesign technician picker/income/rows workspace | technician.jsx + technician-data.js | src/pages/TechnicianPage.tsx | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-031 | Remaining Modules | Apply warranty report redesign parity in Reports | warranty.jsx + warranty-data.js + warranty-main.jsx + Warranty Reports.html | src/pages/ReportsPage.tsx and reports/warranty views | PENDING | unassigned | - | 2026-06-02 | - | Scope locked to 7 warranty source tables + shared metadata columns from authoritative dump; no inferred report-count taxonomy claims |
| T-032 | Remaining Modules | Apply shell + design-system parity to Import | IMPLEMENTATION_PLAN.md section pending | src/pages/ImportPage.tsx | PENDING | unassigned | - | 2026-06-02 | - | Full redesign spec not present in audited files |
| T-033 | Remaining Modules | Apply shell + design-system parity to AutoDoc and JobCard | IMPLEMENTATION_PLAN.md section pending | src/pages/AutoDocPage.tsx, src/pages/JobCardPage.tsx | PENDING | unassigned | - | 2026-06-02 | - | Full redesign spec not present in audited files |
| T-038 | Reports | Keep non-warranty report categories in blocked/pending state until dedicated redesign artifacts arrive | IMPLEMENTATION_PLAN.md + folder audit | src/pages/ReportsPage.tsx and reports/* (non-warranty) | BLOCKED | unassigned | - | 2026-06-02 | - | Needs dedicated redesign prototypes for labour-revenue, revenue, parts categories |
| T-039 | Governance | Reconcile reference instruction artifact status (copilot-instructions.md) | folder audit recheck | local_folder/Reference/WebVersionRedesignReference | DONE | unassigned | - | 2026-06-02 | 2026-06-02 | File present in second-pass re-audit; blocker closed |
| T-040 | Auth Governance | Resolve password-policy spec mismatch across redesign prototype and mirror TS flows | IMPLEMENTATION_PLAN.md + auth.jsx + src/pages/SignUpPage.tsx + src/pages/PasswordUpdatePage.tsx | src/pages/SignUpPage.tsx, src/pages/PasswordUpdatePage.tsx | BLOCKED | unassigned | - | 2026-06-02 | - | Needs explicit product decision before any logic normalization |
| T-041 | Reception Import | Preserve and verify import-required-header and row-skip behavior during redesign port | src/pages/ReceptionPage.tsx + reception.jsx | src/pages/ReceptionPage.tsx | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Import parser and constraints preserved during redesign: required headers reg_number + sa_employee_code, incomplete row skip handling, and strict 10-digit owner phone validation remain intact. |
| T-042 | Admin Dealer Flow | Preserve dealer assignment/re-login guidance and behavior in redesigned Admin UX | src/pages/AdminPage.tsx + admin.jsx | src/pages/AdminPage.tsx | PENDING | unassigned | - | 2026-06-02 | - | Dealer code assignment affects JWT/RLS visibility for AutoDoc |
| T-043 | Warranty Reports | Implement 15 new warranty report views (WARRANTY-001 TR-024..TR-040) | WARRANTY-001_WARRANTY_REPORT_IMPORT_AND_REPORTING_PLAN.md + warranty-reports-data.js | src/pages/ReportsPage.tsx reports/warranty/* | PENDING | unassigned | - | 2026-06-02 | - | Special Charges (980016/980019/980025), PDI/FSB, Invoice Pending (₹25.72L), Settlement Aging, Rusting (168 claims), Advisor Performance, Model Cost, Top Parts, Labour Efficiency, PV/EV Comparison, Critical Alerts v2 (28+ SLA), TAT Monitoring (4-stage), Rejection Root-Cause, Payment Flow, Month-wise Matrix; requires JSONB extraction mapping per source type |
| T-034 | QA | Responsive parity verification (375/768/1280) | IMPLEMENTATION_PLAN.md + styles.css | all touched pages | DONE | Vinod | 2026-06-02 | 2026-06-02 | 2026-06-02 | Browser-validated shell/auth checkpoints at 1280, 768, 375; mobile drawer/menu density and top-shell spacing deltas corrected. |
| T-035 | QA | RBAC scenario verification (2/4/all equivalent) | app-data.js + IMPLEMENTATION_PLAN.md | src/App.tsx + module routes | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-036 | QA | Build, lint, runtime sanity and regression check | IMPLEMENTATION_PLAN.md acceptance checklist | workspace | PENDING | unassigned | - | 2026-06-02 | - |  |
| T-037 | Release | Final parity audit against screens/ evidence | screens/* | all touched pages | PENDING | unassigned | - | 2026-06-02 | - |  |

---

## 10. Per-Task Update Protocol (Mandatory)

For every activity change, update section 9 immediately.

Rules:

1. Only one task should be IN_PROGRESS per executor at a time.
2. Move task to REVIEW only after local checks for that task are complete.
3. Move task to DONE only after acceptance evidence is captured.
4. Add concise notes in task Notes column: what changed, what was validated.
5. If blocked, move status to BLOCKED and add blocker ID in section 13.

---

## 11. Acceptance Checklist (Global)

1. No fabricated UI data appears.
2. Existing logic paths remain intact.
3. Existing RBAC enforcement unchanged.
4. TopNav parity and responsive collapse behavior validated.
5. Screen visuals match reference structure and token system.
6. Tables use horizontal overflow wrappers where needed.
7. Build passes clean.
8. Runtime has no new console errors tied to redesign.
9. No mixed styling-system drift per page (for example, shared redesign classes mixed with standalone utility-first typography/spacing that changes rhythm).
10. No duplicate nested page-container spacing in post-login module routes.
11. Service Advisor and other operational modules remain visually synchronized to Home baseline spacing/type/card/table flow.

---

## 12. Activity Log

| Date | Activity | Tracker IDs | Result | Evidence |
|---|---|---|---|---|
| 2026-06-02 | Visual sync lock enforcement pass executed on active operational pages and shell surfaces: moved Reception/Service Advisor/Home-adjacent styling from inline fragments to shared App.css classes, and converted AccessDenied fallback from utility-stack layout into the same card/token grammar; tracker governance status corrected from DONE to IN_PROGRESS pending remaining mixed-system pages | T-014, T-015, T-028, T-044 | IN_PROGRESS | src/pages/ReceptionPage.tsx (inline styling replaced with shared classes), src/pages/ServiceAdvisorPage.tsx (shared class grammar enforced across table/actions), src/pages/DashboardPage.tsx (class-based card/feed/table rhythm), src/App.tsx + src/App.css (TopNav + AccessDenied + shared helper classes) |
| 2026-06-02 | Visual drift governance update completed: locked cross-page synchronization rules to prevent web redesign divergence (Home baseline mandated across all modules), and recorded Service Advisor parity alignment to shared pagehead/card/tbl/summary system | T-028, T-044 | COMPLETE | docs/Implementation_plans/Webredesign_IMPLEMENTATION_PLAN_MASTER_TRACKER.md (sections 2.2, 5.4, 7.2A, 7.6, 9, 11 updated), src/pages/ServiceAdvisorPage.tsx, src/App.css, npm run build ✓ built in 858ms |
| 2026-06-02 | T-028 implemented in Service Advisor page: redesigned to reference-style layout with page head (greeting icon + title + advisor name/code description), summary chips (Assigned to me, Estimates pending, Branch), restructured table columns (Created, Source pills with tone colors, Reg No, Model, Service Type select preserving non-standard values, JC Number uppercase input, Owner name+phone, Remark textarea, Estimate upload/replace/view/save), dirty state tracking for Save button affordance, and toast notifications while preserving all existing handlers and business logic | T-028 | REVIEW | src/pages/ServiceAdvisorPage.tsx redesigned, Icon import added, dirty tracking via Set<number>, advisor metadata derived from rows (advisorName, advisorCode, advisorBranch), get_errors clean, npm run build ✓ built in 886ms |
| 2026-06-02 | T-027 implemented in Settings page: Unmapped SR Entries redesigned to workflow-style action controls, stats/filter strips, selected-count bulk resolve bar, and refined table badges/actions while preserving all existing resolution logic | T-027 | REVIEW | src/pages/SettingsPage.tsx (unmapped-sr-entries section + selectedIssueCount), get_errors clean, npm run build ✓ built in 905ms, browser session on /settings#unmapped-sr-entries currently module-access gated |
| 2026-06-02 | T-026 implemented in Settings page: AutoDoc Rate Cards redesigned to reference-style action row + config strip + refined table presentation while keeping existing rate-card flow intact | T-026 | REVIEW | src/pages/SettingsPage.tsx (autodoc-rate-cards section), get_errors clean, npm run build ✓ built in 876ms, browser verified on /settings#autodoc-rate-cards |
| 2026-06-02 | T-025 implemented in Settings page: Models redesigned to chip-first layout with inline edit/save/cancel controls, iconized add action, and refreshed action treatments while retaining existing CRUD behavior | T-025 | REVIEW | src/pages/SettingsPage.tsx (models section block), get_errors clean, npm run build ✓ built in 1.07s, browser session currently routes to /home during /settings#models check |
| 2026-06-02 | T-024 implemented in Settings page: Employee Master redesigned to reference-style toolbar/search/add-panel/table flow with preserved behavior for import/export/add/edit/delete and auto-derive rules | T-024 | REVIEW | src/pages/SettingsPage.tsx (employee-master section + employeeSearch/showAddEmployeeForm state), get_errors clean, npm run build ✓ built in 870ms, browser session on /settings#employee-master currently module-access gated |
| 2026-06-02 | T-023 implemented in Settings page: Branch Management redesigned to structured table layout with status/action columns, icon chips, and updated input/action presentation while preserving create/delete branch logic | T-023 | REVIEW | src/pages/SettingsPage.tsx (branch-management section), get_errors clean, npm run build ✓ built in 836ms, browser verified on /settings#branch-management with Sort/Status/Action headers visible |
| 2026-06-02 | T-022 implemented in Settings page: single-open gating hardened via typed section-id whitelist, default branch fallback for invalid/empty hash, and hashchange synchronization to keep one valid section open | T-022 | REVIEW | src/pages/SettingsPage.tsx (section-id constants/type + hash sync effect), get_errors clean, npm run build ✓ built in 936ms, browser module-access gate prevented live section rendering validation |
| 2026-06-02 | T-021 implemented in Settings page: redesigned section index cards to reference-style icon cards with active/opened affordance and refreshed card header treatment; compile/build checks passed | T-021 | REVIEW | src/pages/SettingsPage.tsx (Settings Sections card block), get_errors clean, npm run build ✓ built in 926ms |
| 2026-06-02 | Settings redesign handoff resumed; tracker updated to enforce single active task before implementation edits | T-021 | IN_PROGRESS | docs/Implementation_plans/Webredesign_IMPLEMENTATION_PLAN_MASTER_TRACKER.md (T-021 status/owner/start/notes updated) |
| 2026-06-02 | Phase 1 design system foundation completed: tokens ported, component classes ported, Icon component created. Build passes, dev server running. | T-002, T-003, T-004 | COMPLETE | src/index.css (tokens + base styles), src/App.css (200+ component classes + responsive), src/components/Icon.tsx (50 icon paths), npm run build ✓ 718 modules, screenshot of login with new token system |
| 2026-06-02 | Phase 0 baseline lock completed: build passes, lint clean, dev server running, login baseline UI captured | T-001 | COMPLETE | npm run build ✓, npm run lint ✓, git clean, dev server on :5173, login baseline screenshot |
| 2026-06-02 | Deep audit completed and fresh final plan created from reference artifacts | T-001 to T-037 initialized | COMPLETE | Audited files listed in section 3 |
| 2026-06-02 | Deep re-audit completed; warranty and reception-console deltas added; tracker updated with new tasks and blockers | T-031, T-038, T-039 and section updates | COMPLETE | Warranty Reports.html, warranty.jsx/data/main, reception.jsx, components.css, full file inventory |
| 2026-06-02 | Deep re-audit pass 2 completed; mirror TS constraints extracted and instruction-file status reconciled | T-039, T-040, T-041, T-042 and section updates | COMPLETE | src/pages/ReceptionPage.tsx, src/pages/AdminPage.tsx, src/pages/SignUpPage.tsx, src/pages/PasswordUpdatePage.tsx, src/pages/ServiceAdvisorPage.tsx, copilot-instructions.md |
| 2026-06-02 | Warranty DB authority validation completed; non-authoritative report-count/taxonomy claims removed and replaced with dump-backed schema contract | T-031, T-038 and section updates | COMPLETE | local_folder/backups/full_database.sql and local_folder/backups/chunks/full_database.sql.part_* warranty table/constraint/trigger/COPY audit |
| 2026-06-02 | Deep re-audit pass 3 FINAL: WARRANTY-001 + WARRANTY_REFERENCE + all_reports_registry.html fully audited; 28 reports (A1–E3) mapped with exact ETL specs per report; 3 core business-logic rules + 14 real aggregates + A5/A6 dashboard + visual tokens + per-report file-encoding + product-defect-patterns + claim-type-performance + back-order-layout + report-frequency + recovery-priorities documented; section 7.10 + point 15 expanded to comprehensive warrant-delivery-ready contract | T-031, T-043, B-001, section 7.10+7.15 expansion, warranty-registry-complete | COMPLETE | WARRANTY_REFERENCE.md + all_reports_registry.html full audit (28 reports A1–E3 with per-report ETL: ₹196.13L settlement/1,961 JCs, ₹46.22L pending/767 JCs, ₹53.71L SPL, ₹26.96L 20%-revenue with ₹8.16L leakage, ₹223.08L combined, PV ₹113.25L/EV month-wise/FSB ₹17.77L, 168 rusting/132 PDI rejections, 12 invoices ₹25.72L, A5/A6 structure 5 KPI tiles + 5 sections, design tokens gradient #185FA5→#1D6F42 + pills + borders, UTF-16/XML/CSV encoding specs, regex filters, VCM text-mining (77 open>15d/32 no-checksheet/23 duplicate), product-defects PV Alternator ₹10L/252 JCs + EV 3-in-1 ₹6.96L/4 JCs + HV Cable ₹6.04L/28 JCs, claim-type perf Extended WC 8.7% target 20%, Updation 79% Safari+Harrier, back-order 147 PV/135 EV, frequency (Daily/Weekly/Monthly), recovery P1–P6 ₹6L+) |
| 2026-06-02 | Phase 2 shell migration completed in App.tsx: sidebar removed, TopNav utility strip/overflow/mobile drawer added, RBAC route guards preserved, build validated | T-005, T-006, T-007, T-008 | COMPLETE | src/App.tsx TopNav component + App shell refactor, npm run build ✓ |
| 2026-06-02 | Responsive parity pass completed at 1280/768/375 and Phase 3 auth refinements implemented/validated in browser | T-034, T-009, T-010, T-011, T-012 | COMPLETE | Browser checks on /import, /forgot-password, /signup plus updated src/App.css, src/pages/LoginPage.tsx, src/pages/ForgotPasswordPage.tsx, src/pages/SignUpPage.tsx, npm run build ✓ |
| 2026-06-02 | Phase 4 dashboard parity implemented with live data bindings and shell integration | T-013 | COMPLETE | src/pages/DashboardPage.tsx (live KPIs/reception/activity + module launcher), src/App.tsx (/home route + Home nav wiring), npm run build ✓ |
| 2026-06-02 | Phase 5 reception redesign completed with split layout, search feed, and preserved import constraints | T-014, T-015, T-041 | COMPLETE | src/pages/ReceptionPage.tsx (new intake card + recep-feed search/actions + preserved parser/header/phone constraints), browser check on /reception, npm run build ✓ |
| 2026-06-02 | Phase 5 admin panel completed: 4-tab layout (Users/Permissions/Modules/Mappings) with full functionality, summary chips, modals, toasts, design system styling validated in browser | T-016, T-017, T-018, T-019, T-020 | COMPLETE | src/pages/AdminPage.tsx (2307 lines), browser screenshot showing admin@firstmobital.com logged in with 42 users, 2 admins, 42 active, Users tab with search/filter/add, dealer constraints note, npm run build ✓ |
| 2026-06-02 | Post-login default landing and header tab realignment update completed | T-005, T-006, T-012 | COMPLETE | src/App.tsx (SIGNED_IN -> /home redirect, reordered TopNav sequence with Floor Incharge before Technician, width-aware More overflow), npm run build ✓ |

---

## 13. Blocker Log

| Blocker ID | Date | Related Task IDs | Blocker Description | Required Input To Unblock | Status |
|---|---|---|---|---|---|
| B-001 | 2026-06-02 | T-032, T-033, T-038, T-043 | Dedicated redesign prototypes and full spec detail still missing for Import, AutoDoc/JobCard, and non-warranty report categories (labour-revenue 5, revenue 7, parts 17). Warranty 15 new views tracked as T-043. | Provide finalized redesign reference files/snapshots/spec for Import, AutoDoc/JobCard, and non-warranty report pages (labour, revenue, parts). | OPEN |
| B-002 | 2026-06-02 | T-039 | Reference instruction file status reconciliation. | Verified in second-pass re-audit: file exists and is readable. | CLOSED |
| B-003 | 2026-06-02 | T-040 | Password policy mismatch across audited sources (prototype request-access guidance vs mirror SignUp minimum 8 chars vs PasswordUpdate 12+ strong policy). | Provide explicit product decision on whether sign-up policy remains 8+ (logic-preserving) or is elevated to 12+ strong policy. | OPEN |

---

## 14. Traceability Matrix (Source -> Implementation Work)

| Source Artifact | Extracted Requirement | Tracker IDs |
|---|---|---|
| src/pages/DashboardPage.tsx + src/pages/ServiceAdvisorPage.tsx + src/App.css | Cross-page visual synchronization baseline: module pages must share redesign grammar (pagehead, card, tbl, summary) and token scale to prevent spacing/font drift | T-028, T-044 |
| ../../local_folder/Reference/WebVersionRedesignReference/IMPLEMENTATION_PLAN.md | Golden rules, no-fabrication, presentational-only lock, screen mapping, acceptance checks | T-001 to T-037 |
| ../../local_folder/Reference/WebVersionRedesignReference/copilot-instructions.md | Rule lock for logic preservation, no guessing, nav replacement, responsive requirements | T-005, T-008, T-012, T-034, T-035 |
| ../../local_folder/Reference/WebVersionRedesignReference/styles.css | Token palette, layout primitives, responsive breakpoints, shell anatomy | T-002, T-003, T-005, T-007, T-034 |
| ../../local_folder/Reference/WebVersionRedesignReference/components.css | Tabs/switch/checkbox/modal/badge/action component styles | T-003, T-016 to T-030 |
| ../../local_folder/Reference/WebVersionRedesignReference/app-data.js | Icons, module metadata, RBAC presets, dashboard mock contract | T-004, T-005, T-006, T-013, T-035 |
| ../../local_folder/Reference/WebVersionRedesignReference/shell.jsx | TopNav contract and interactive behavior | T-005, T-006, T-007 |
| ../../local_folder/Reference/WebVersionRedesignReference/auth.jsx | Login/Forgot/Request visual contract | T-009, T-010, T-011 |
| ../../local_folder/Reference/WebVersionRedesignReference/home.jsx | Dashboard, launcher, reception workspace visual structure | T-013, T-014, T-015 |
| ../../local_folder/Reference/WebVersionRedesignReference/reception.jsx + ../../local_folder/Reference/WebVersionRedesignReference/reception-data.js | Reception field/table/action contract | T-014, T-015 |
| ../../local_folder/Reference/WebVersionRedesignReference/admin.jsx + ../../local_folder/Reference/WebVersionRedesignReference/admin-data.js | Admin tabbed UI and table/matrix structures | T-016 to T-020 |
| ../../local_folder/Reference/WebVersionRedesignReference/settings.jsx + ../../local_folder/Reference/WebVersionRedesignReference/settings-data.js | Settings section-gating and 5-section content contract | T-021 to T-027 |
| ../../local_folder/Reference/WebVersionRedesignReference/service-advisor.jsx + ../../local_folder/Reference/WebVersionRedesignReference/service-advisor-data.js | Advisor assigned-rows workspace contract | T-028 |
| ../../local_folder/Reference/WebVersionRedesignReference/floor.jsx + ../../local_folder/Reference/WebVersionRedesignReference/floor-data.js | Floor assignment workflow contract | T-029 |
| ../../local_folder/Reference/WebVersionRedesignReference/technician.jsx + ../../local_folder/Reference/WebVersionRedesignReference/technician-data.js | Technician income and assigned-row contract | T-030 |
| ../../local_folder/Reference/WebVersionRedesignReference/warranty.jsx + ../../local_folder/Reference/WebVersionRedesignReference/warranty-data.js + ../../local_folder/Reference/WebVersionRedesignReference/warranty-main.jsx + ../../local_folder/Reference/WebVersionRedesignReference/Warranty Reports.html | Warranty 4-tab dashboard (Overview, Critical Alerts, Financial, Operations) with 6-KPI strip, pipeline, payment-status, claims-by-source, claim-type performance; Location + PV/EV filter | T-031 |
| docs/Implementation_plans/WARRANTY-001_WARRANTY_REPORT_IMPORT_AND_REPORTING_PLAN.md | Warranty operational audit result: 15 new report views (TR-024..TR-040) required; 7 warehouse source tables confirmed; ₹2.03Cr financial scope; 28+ operational SLA alerts; special charges 980016/980019/980025; rusting analysis (168 claims); invoice pending ₹25.72L; JSONB extraction mapping per source | T-031, T-043 |
| local_folder/Reference/WebVersionRedesignReference/docs/WARRANTY_REFERENCE.md | 28 reports registry (A1–E3 sections): 3 core business-logic rules (data-cleaning UTF-16/dayfirst, 20%-revenue-formula MRP×0.2, classification dealer/job-codes), 14 real aggregates (₹196.13L settlement/1,961 JCs, ₹46.22L pending/767 JCs, ₹53.71L SPL, ₹26.96L 20%-parts, ₹8.16L leakage, ₹223.08L combined, PV ₹113.25L/EV month-wise/FSB ₹17.77L, rusting 168, PDI 132, top-parts), A5/A6 dashboard (5 KPI tiles, 5 sections, invoice/claim/payment tables, 20% product/month breakdown), visual tokens (gradient #185FA5→#1D6F42, pills, KPI 3px borders, 10–11px dense tables, money right-aligned) | T-031, T-043 |
| local_folder/Reference/WebVersionRedesignReference/uploads/all_reports_registry.html | Per-report ETL specifications & business logic (A1–E3 detailed): file encoding (UTF-16 LE+tab for TM parts, SpreadsheetML XML for XLS, UTF-8 CSV), data-cleaning procedures (Rs. strip, comma removal, regex filters), SLA color-codes, text-mining for rejection root-causes (77 open>15d/32 no-checksheet/23 duplicate from VCM Comments), product-defect patterns (PV Alternator ₹10L/252 JCs, EV 3-in-1 NOVA ₹6.96L/4 JCs + HV AC Cable ₹6.04L/28 JCs), claim-type performance (Extended WC 8.7% vol/0% rej/94.5% settle target 20%, Updation 79% Safari+Harrier, PDI 12.4%, 2nd FSB 17.4%), back-order layout (147 PV/135 EV with ZSSO/ZSOR/ZPGO, 188 intransit), report-frequency recommendations (Daily/Weekly/Monthly/Quarterly/On-Demand), P1–P6 recovery priorities (₹6L+ opportunity) | T-031, T-043 |
| local_folder/backups/full_database.sql + local_folder/backups/chunks/full_database.sql.part_* | Warranty DB contract: 7 source tables, fixed shared columns, branch/location/portal checks, unique(branch, portal, source_row_hash), updated_at triggers; no warranty-specific RLS policy/enable entries in active dump | T-031, T-038 |
| ../../local_folder/Reference/WebVersionRedesignReference/src/pages/SettingsPage.tsx | selectedSectionId section-gating, hash-deep-link behavior, single-section rendering contract | T-022 |
| ../../local_folder/Reference/WebVersionRedesignReference/reception.jsx + ../../local_folder/Reference/WebVersionRedesignReference/components.css | Reception console split-layout contract with sticky intake + live feed + fresh-item animation | T-014, T-015 |
| ../../local_folder/Reference/WebVersionRedesignReference/src/pages/ReceptionPage.tsx | Reception import contract: required headers reg_number and sa_employee_code, row skip handling, exact 10-digit owner phone validation | T-041 |
| ../../local_folder/Reference/WebVersionRedesignReference/src/pages/AdminPage.tsx | Dealer assignment contract: dealer code required for AutoDoc visibility and re-login required after dealer update | T-042 |
| ../../local_folder/Reference/WebVersionRedesignReference/src/pages/ServiceAdvisorPage.tsx | Service type selector contract: preserve non-standard existing values as selectable option | T-028 |
| ../../local_folder/Reference/WebVersionRedesignReference/src/pages/SignUpPage.tsx + ../../local_folder/Reference/WebVersionRedesignReference/src/pages/PasswordUpdatePage.tsx + ../../local_folder/Reference/WebVersionRedesignReference/auth.jsx + ../../local_folder/Reference/WebVersionRedesignReference/IMPLEMENTATION_PLAN.md | Auth password-policy conflict map requiring explicit product decision before logic normalization | T-040, B-003 |
| ../../local_folder/Reference/WebVersionRedesignReference/copilot-instructions.md | Copilot instruction rule lock confirmed present in second-pass re-audit | T-039 |
| ../../local_folder/Reference/WebVersionRedesignReference/*.html + ../../local_folder/Reference/WebVersionRedesignReference/*-main.jsx entrypoints | Per-screen composition wiring and role context assumptions for preview | T-005, T-013 to T-030 |
| ../../local_folder/Reference/WebVersionRedesignReference/screens/* | Visual parity evidence set | T-037 |

---

## 16. Re-Audit Delta Notes (2026-06-02)

1. Newly discovered explicit prototype screen set for Reports -> Warranty exists and is implementation-ready in reference folder.
2. Reception prototype is now an explicit front-desk console (form + live feed) and should be ported accordingly.
3. Components stylesheet includes reception and warranty-specific primitives that were not fully listed in first-pass tracker.
4. Mirror TypeScript settings page confirms hash-driven section selection behavior in addition to selectedSectionId gating.
5. Second-pass re-audit confirms copilot-instructions.md is present; prior missing-file blocker is closed.
6. Mirror TypeScript pages add explicit implementation constraints for reception import validation, dealer assignment re-login behavior, and service-advisor non-standard service-type retention.
7. Auth password policy mismatch across sources is now explicitly tracked as a decision blocker to prevent unintended logic drift.
8. Warranty scope is now explicitly constrained to the active dump's 7-table schema contract; non-authoritative report-count and taxonomy claims were removed to prevent assumption drift.
9. **Third-pass re-audit (WARRANTY-001 + WARRANTY_REFERENCE comprehensive audit):** [... existing content ...]

10. **Registry specification audit (all_reports_registry.html meta-reference):** [existing content...]

11. **Authoritative dump verification COMPLETE (2026-06-02):** Full database dump (local_folder/backups/full_database.sql, 71MB export) audited against all warranty schema claims. All 7 warranty tables verified PRESENT in dump with exact DDL, constraints (3 CHECK per table, PRIMARY KEY on id, UNIQUE on (branch, portal, source_row_hash)), and triggers (BEFORE UPDATE set_updated_at() on all 7 tables). No RLS policies found in dump (confirmed ABSENT — deferred). JSONB source_row_data column present and flexible on all tables. All COPY statements present indicating data is loaded. Warranty schema locked from authoritative dump: no further assumptions, no DDL modifications without explicit dump update. Authority governance section 7.10A documents lock. Repo memory file warranty-schema-verified-from-authoritative-dump.md records all verified details.

---

## 16. Execution Notes

1. This plan supersedes ad-hoc implementation sequencing.
2. Any new task must be appended to section 9 before work starts.
3. Any done task without tracker update is considered incomplete.
