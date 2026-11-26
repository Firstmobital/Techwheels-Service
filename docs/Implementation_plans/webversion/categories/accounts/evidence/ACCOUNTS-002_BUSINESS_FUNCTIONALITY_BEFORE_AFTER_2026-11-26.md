**Classification:** state = implementation evidence, scope = web, intent = evidence
**Plan:** [ACCOUNTS-002](../active/ACCOUNTS-002_FINANCE_REPORTING_EXPENSES_REVENUE_REPORTS_PLAN_2026-11-25.md)
**Evidence ID:** EV-067

# ACCOUNTS-002 — Business Functionality Before-and-After Report

**Prepared:** 26 November 2026  
**Audience:** Business owners, Finance, Accounts, branch management  
**Evidence basis:** Repository history and governed plan/evidence only — not a signed-in production walkthrough  
**Repository baseline (before ACCOUNTS-002 work):** `e7877341` (audit baseline, 25 Nov 2026)  
**Latest ACCOUNTS-002 application commit:** `ed9b7ec0` (26 Nov 2026); consolidated on `main` with web publication recorded at `779fb2f4`  
**Plan status:** In progress — application logic is on `main`; database migrations **DBL-0101** and **DBL-0102** remain **PROPOSED** and **not applied** to production  

---

## 1. Executive summary (plain language)

Techwheels Service already stored DMS invoice data, job-card revenue, payroll, and Busy export — but management could not rely on it for **finance-grade** figures: revenue in most reports assumed **18% GST on everything**, large reports **stopped after 5,000 rows without warning**, ten useful **Performance** reports existed in code but **did not appear in the menu**, and sensitive revenue data was **readable by any signed-in user at the database level** (fix prepared but **deferred** per your 26 Nov decision).

ACCOUNTS-002 delivered, in the web application (published on `main`):

1. A **new** report, **Invoice Revenue (Finance basis)** — net revenue per invoice using **actual GST** (18% labour, parts tax from the invoice), with cancelled and “needs tax detail” invoices shown separately.  
2. A **new** **Payroll → Cost Summary** read-only tab — gross, deductions, net payable, and branch breakdown (employer cost explicitly “not available”).  
3. **Performance Reports** menu with **10** previously hidden reports.  
4. **Removal of the silent 5,000-row cap** from the main shared report loaders so operational reports can load **all matching rows** (with error if load fails).  
5. **Clearer labelling** that existing Revenue reports are **operational (job-card, estimated ex-GST)** vs the new finance report.  
6. **Prepared** database security and invoice-preservation changes — **not activated** in production (`PD-25` banking retained; `DBL-0101` deferred).

**What did *not* change in production behaviour today:** existing Daily Revenue and similar reports still use the **same ÷1.18 method**; Busy export; Accounts vouchers still use financial year **26-27**; no workshop expense register; no reconciliation to Busy books; invoice **identity** problem (two invoices same job card + date) is **audited in design only**, not fixed in totals.

**Verification gap:** Code and isolated-database tests are recorded; **signed-in production UI** for the new screens is **not verified** in the plan evidence.

---

## 2. What existed before ACCOUNTS-002

| Area | What you had | Where users saw it |
|------|----------------|-------------------|
| Reports | **38** reports in the menu (6 categories; **no Performance category**) | **Reports** module → category tiles → report list (`/reports/...`) |
| Revenue | Job-card–based reports; “ex-GST” via **gross ÷ 1.18** per row | Revenue + Labour Revenue + Dashboard reports |
| DMS invoices | `psf_revenue_dms` imported; used heavily for **Busy** export, not a dedicated finance report | **Import** + **Busy** |
| Payroll | Monthly finalize, salary slips, processing — **no management “cost summary” view** | **Payroll** (`/payroll`) |
| Performance analytics | **10 report screens implemented** but **not registered** — unreachable from menu | Nowhere in UI |
| Report size | Shared loaders stopped at **5,000 rows**, no banner | All reports using shared `reportQueries` loaders |
| Security (DB) | Revenue/warranty tables: policies effectively **open to any authenticated user** | Background (any API client with login) |
| Banking | Employee bank fields readable from `employee_master` in normal queries | Payroll, Settings, SA Tracker |
| Financial year | Hard-coded **26-27** for vouchers/receipts | **Accounts**, Busy series labels |
| Busy | Excel/workbook export; **no export-run log** | **Busy Accounting** (`/busy`) |
| Expenses | **No** workshop expense register in Service | N/A (by design) |

**Audit baseline commit:** `e7877341` — see plan § “Audit baseline”.

---

## 3. What was wrong or missing (verified gaps, not “nice-to-haves”)

| ID | Issue | Business impact |
|----|--------|-----------------|
| G-01 / ST-04 | Flat 18% on mixed 5%/18% parts invoices | Revenue **understated** (audit fixture: **21,339 vs 22,000** net) |
| G-02 / ST-02 | Silent **5,000-row** cap | Busy months could show **incomplete totals** with no warning |
| G-03 / ST-09 | Open table access | Any logged-in user could **read/change/delete** revenue data (if they used the API) |
| G-06 / ST-15 | 10 Performance reports unregistered | Operational/finance control reports **unreachable** |
| G-07 / ST-23 | FY **26-27** pinned | After **Apr 2027**, numbering risk unchanged |
| G-08 | No Busy export log | Same period could be exported twice **without audit trail** |
| G-16 / ST-07 | One row per JC+date in revenue import | **Second invoice same day overwrites first** in live table (totals wrong) |
| G-10 | Branch mapping gaps | Unknown codes could mis-attribute (e.g. fallbacks to Sitapura in some paths) |
| — | No finance-grade invoice report | Management could not align Service to **invoice + GST** basis (PD-14) |
| — | No payroll cost summary | Finance had to piece together payroll from processing screens only |

---

## 4. Every existing feature modified

### CHG-01 — Shared report data loading (completeness)

| | |
|--|--|
| **Before** | Loops in `reportQueries.ts` stopped after **5,000** rows (`MAX_REPORT_FETCH_ROWS` appeared **23** times at baseline). |
| **After** | Cap **removed** from shared job-card / service-invoice pagination (`ed9b7ec0`); loaders page until exhausted or **throw** on error. |
| **Benefit** | Monthly/branch reports can reflect **full volume**; failed loads surface as errors instead of silent partial data. |
| **Unchanged** | Revenue **arithmetic** in those reports (still ÷1.18 — see CHG-05). |
| **Residual limit** | Two labour reports still use `.limit(5000)` on their **own** queries: Job Card Details, Service Invoice Order Status. |
| **UI** | `ReportsPage` still listens for a “row cap” notice, but shared loaders no longer emit it after `ed9b7ec0` — banner is **dormant** unless a report sets the event. |
| **Status** | **Implemented and published** on `main`; **production UI not verified**. |
| **References** | Activity **2.1**; commits `b1034ea9`, `ed9b7ec0`; ST-02 PASS (logic); EV-019, EV-063 |

### CHG-02 — Revenue Reports category labelling

| | |
|--|--|
| **Before** | Category described generically as revenue/trends. |
| **After** | Description states operational job-card revenue vs **Invoice Revenue (Finance basis)** for finance-grade totals (`revenue/index.ts`). |
| **Benefit** | Reduces mistaking Daily Revenue for audited finance figures. |
| **Status** | **Published**; verify by opening **Reports → Revenue Reports** and reading the category blurb. |
| **References** | PD-26 / pagination batch; `ed9b7ec0` |

### CHG-03 — Report registry and catalogue metadata (background + registry)

| | |
|--|--|
| **Before** | 38 reports; no `reportCatalogue.ts`; Performance not in `reports/index.ts`. |
| **After** | **49** reports; `withCatalogueDefaults()` attaches owner/sources/date basis from `reportCatalogue.ts` (mostly for traceability, not prominent on every screen). |
| **Benefit** | Documented lineage for audits; harness ensures every registered report resolves. |
| **Status** | **Done** (ST-15 PASS registry); Activity **4.3**, **4.6**. |
| **References** | `09adf8a1`, `ed9b7ec0`; EV-062, EV-063 |

### CHG-04 — Branch helpers for finance views (partial)

| | |
|--|--|
| **Before** | Tonk/Shahpura in filters but weak mapping; no **Unmapped** bucket in finance summaries. |
| **After** | `canonicalReportBranch()`, **Unmapped** bucket, dealer-code hints (3 codes only) — used by **new** finance report and payroll cost tab **only**. |
| **Benefit** | Finance summaries do not **drop** unmapped branch amounts silently. |
| **Unchanged** | **Existing 38-style reports** still use prior branch alias logic in loaders. |
| **Status** | **Implemented** for new views; **production mapping** still incomplete (plan release prerequisites). |
| **References** | Activity **4.1**; EV-053, EV-056; PD-21/22 defer DB |

### CHG-05 — Existing revenue/labour/dashboard reports (calculation)

| | |
|--|--|
| **Before** | `parseRevenueExcludingGst`: gross ÷ 1.18 per row; advisor name blocklist on filter options. |
| **After** | **Same formula and blocklist** (Activity **2.4** blocked — PD-23 deferred). Comment in code marks this as **not finance-grade**. |
| **Benefit** | None for accuracy — **intentional** until Finance approves changing operational reports. |
| **Status** | **Unchanged behaviour**; relabelled only. |
| **References** | LIN-R4; Activity **2.2** scope was **new report**, not retrofit all 16 files |

### CHG-06 — Employee bank access (application layer only)

| | |
|--|--|
| **Before** | Direct `select` on `employee_master` bank columns. |
| **After** | `employeeBank.ts` tries RPC `get_employee_bank_details`, **falls back** to direct columns if RPC missing (`dc97aa21`). Payroll/Settings/SA Tracker call the helper. |
| **Your decision 26 Nov (PD-25)** | **Retain existing banking read paths**; **no new restrictions** in production until you choose otherwise; **DBL-0101 deferred**. |
| **Production today** | Probe: **`PGRST202`** — RPC **missing** → behaviour matches **before** (fallback). |
| **Status** | **Prepared, not activated** for protection. |
| **References** | `f573fae4`, `dc97aa21`; Activity **3.5**; EV-052, EV-049 |

---

## 5. Every defect corrected

| Defect | Corrected? | Where | Notes |
|--------|------------|-------|-------|
| Wrong GST blend on **finance** totals | **Yes** (new report only) | Invoice Revenue (Finance basis) | Isolated test PASS; not Busy-reconciled |
| Silent 5k cap on **shared** loaders | **Yes** | `reportQueries.ts` | Two reports still hard-limit 5000 |
| Performance reports unreachable | **Yes** | Registry + menu | ST-15 PASS |
| Open DB policies | **Prepared only** | DBL-0101 migration | **Not applied** — defect **remains in production DB** |
| Bank field exposure | **Prepared only** | DBL-0101 | **Deferred** — defect **remains** |
| Cross-branch DB read | **Prepared only** | DBL-0101 | **Deferred** |
| Invoice overwrite without trace | **Partial** | DBL-0102 trigger | **Not applied**; report shows “audit not enabled” when table missing |
| Accounts payment-line load swallowed | **No** | ACCOUNTS-001 task **4.7** | Still pending |
| FY rollover after Apr 2027 | **No** | Design only | ST-23 FAILED (by design) |

---

## 6. Every completely new feature

### NEW-01 — Invoice Revenue (Finance basis)

| | |
|--|--|
| **Why** | PD-14: finance needs **invoice grain**, actual GST, cancelled separate, no guessing on bad tax rows. |
| **Navigation** | **Reports → Revenue Reports → Invoice Revenue (Finance basis)** |
| **URL** | `/reports/revenue/invoice-revenue-finance` |
| **Permission** | `reports` module (same as other reports). DB row filter **unchanged** until DBL-0101. |
| **Data** | `psf_revenue_dms`; comparison to `job_card_closed_data`; optional `psf_revenue_dms_invoice_conflicts` (when DBL-0102 applied). |
| **Exports** | Detail CSV on screen. |
| **Limitations** | Replaced same-day invoices **not in net**; no Busy sign-off; not production UI-tested; no conflict audit in prod (table absent). |
| **Status** | **Implemented and published**; **not production-verified**. |
| **References** | `b1034ea9`; Activity **2.2, 2.3, 2.6, 4.5** (internal only); ST-04–ST-06 PASS (function); EV-053 |

### NEW-02 — Payroll Cost Summary tab

| | |
|--|--|
| **Why** | CAP-008: read-only management view of payroll cost without duplicating Busy. |
| **Navigation** | **Payroll → Cost Summary** tab |
| **URL** | `/payroll` (tab `cost`) |
| **Permission** | Payroll view (existing payroll security gate). |
| **Shows** | Gross (base/variable/incentive/additions), deductions, **net payable**, by branch with **Unmapped**; **employer cost: Not available**; provisional warning if month not finalized. |
| **Status** | **Published**; UI NOT RUN in test matrix. |
| **References** | `b1034ea9`; Activity **4.2**; ST-13 PASS (logic); EV-056 |

### NEW-03 — Performance Reports category (10 reports)

| | |
|--|--|
| **Why** | PD-26 (26 Nov): register audited operational reports. |
| **Navigation** | **Reports → Performance Reports** |
| **Before** | Components in repo; **not in menu** (EV-035). |
| **After** | All **10** registered; category visible in nav. |
| **Status** | **Published**. |
| **References** | `ed9b7ec0`; Activity **4.3**; EV-062 |

---

## 7. Report-by-report before-and-after comparison

**Legend:**  
- **Data / calc:** unchanged unless noted.  
- **Load:** how many rows are fetched.  
- **GST:** flat ÷1.18 vs finance method (only on NEW finance report).

### 7.A Categories unchanged in purpose

| Category | Reports (count) | Data source (before = after) | Calculation | Load behaviour | GST / status |
|----------|-----------------|------------------------------|-------------|----------------|--------------|
| Dashboard | 2 | `job_card_closed_data` (+VAS/parts) | ÷1.18 ex-GST estimate | **Was 5k cap → now full pages** | No cancel filter |
| Labour Revenue | 6 | JC closed + employees | ÷1.18 | **Full pages** (except see 7.C) | Advisor blocklist unchanged |
| Revenue (operational) | 7 | JC / invoice imports | ÷1.18 | **Full pages** | No finance slab logic |
| Parts | 16 | Parts import tables | Quantities / operational | **Full pages** where shared loader used | N/A |
| Warranty | 8 | `warranty_*` | Imported amounts | **Full pages** | N/A |
| Master Data | 1 | `all_service_data` | Null counts | **Full pages** | N/A |

### 7.B New / newly reachable

| Report | Existed in code before? | In menu before? | After | Primary change |
|--------|-------------------------|-----------------|-------|----------------|
| **Invoice Revenue (Finance basis)** | No | No | **Yes** | New finance calc + reconciliation panels |
| **Customer Retention** | Yes | No | Yes | Registered only |
| **Service Due** | Yes | No | Yes | Registered only |
| **Advisor Performance** | Yes | No | Yes | Registered only |
| **VAS Job Performance** | Yes | No | Yes | Registered only |
| **TAT Duration Buckets** | Yes | No | Yes | Registered only |
| **Employee Utilization** | Yes | No | Yes | Registered only |
| **JC-to-Invoice Reconciliation** | Yes | No | Yes | Registered; metadata notes finance control use |
| **Net Price vs Final Revenue Variance** | Yes | No | Yes | Registered only |
| **End-to-End Job Lifecycle** | Yes | No | Yes | Registered only |
| **VAS Billing Hours Efficiency** | Yes | No | Yes | Registered only |

### 7.C Reports with remaining special limits

| Report | Limitation |
|--------|------------|
| **Job Card Details** | Own query `.limit(5000)` — may still truncate |
| **Service Invoice Order Status** (if exposed) | `.limit(5000)` |

### 7.D Reports explicitly **unchanged** in business logic

All operational revenue reports (Daily Revenue, Category Wise, Monthly Trend, Labour vs Spares Mix, Product Line, Model-wise, Vehicle-wise) — same ÷1.18 and job-card-oriented sources per LIN-R4.

---

## 8. Frontend navigation and verification guide

**Module permission:** Most items need **`reports`** or **`payroll`** assigned in Settings (as today).

### High-priority checks (no code; read-only)

| # | Goal | Steps | Pass signal |
|---|------|--------|-------------|
| 1 | New finance report | Log in with Reports access → **Reports → Revenue Reports** → **Invoice Revenue (Finance basis)** → pick branch **ALL**, **This month** | Page loads; cards for Verified net, GST, Cancelled, Needs tax detail; green “Reconciled” line if internal sums match |
| 2 | Compare methods | Same report → section **Existing method versus corrected** | Two rupee totals side by side (may differ when 5% parts present) |
| 3 | Performance menu | **Reports → Performance Reports** | 10 report tiles; open **JC-to-Invoice Reconciliation** |
| 4 | Payroll cost | **Payroll → Cost Summary** → select last finalized month | Finalized banner green; net payable; employer cost says **Not available** |
| 5 | Large month completeness | **Reports → Daily Revenue** → wide date range | No misleading partial total from shared loader (no 5k cut-off in network calls for JC closed data — optional: compare row count sense check with Finance) |
| 6 | Invoice replacement message | Finance report for a month with known re-imports | Amber/red box about replacements **or** grey “audit not enabled” if DBL-0102 not applied |

**Direct URLs (append your app host):**

- Finance report: `/reports/revenue/invoice-revenue-finance`  
- Example performance: `/reports/performance/jc-invoice-reconciliation`  
- Payroll cost: `/payroll` (select **Cost Summary** tab)

**What you cannot verify from UI until DB apply:** branch-scoped DB security, bank RPC restriction, invoice conflict table.

---

## 9. Financial and operational examples

*All amounts below are from **governed test evidence**, not live production revenue.*

### Ex-1 — Gross vs net and wrong 18% assumption (**synthetic F1**, EV-047, LIN-R1)

Three non-cancelled invoices in one branch/month:

- Invoice A: gross **11,800** (labour, 18%) → correct net **10,000**  
- Invoice B: gross **5,250** (parts, 5%) → correct net **5,000**  
- Invoice C: mixed gross **8,130** → correct net **7,000**  

| Method | Net total |
|--------|-----------|
| **Old (every row ÷ 1.18)** | **21,339** |
| **Correct (slab-aware)** | **22,000** |
| **Difference** | **661 understated** |

Cancelled invoice D on fixture is excluded from verified net in the **new** report.

### Ex-2 — Actual GST vs flat divisor (**local dump aggregate**, test matrix §5)

On ~10,981 invoice rows (Oct 2025 dump, aggregates only): **98.17%** verified, **1.65%** cancelled, **0.18%** need tax detail. On verified rows, corrected net differs from old method by about **0.002%** because most parts in that data imply 18% — the F1 fixture shows the **method** risk when 5% parts matter.

### Ex-3 — Invoice vs job-card revenue

**Invoice grain:** one row per DMS invoice in `psf_revenue_dms`.  
**Job-card grain:** `job_card_closed_data` — operational KPIs/Daily Revenue.  
The new report’s **Invoice grain vs job-card grain** table shows gross differences and job cards only on one side — for **internal review**, not Busy posting.

### Ex-4 — Cancelled invoices

Status containing “cancel” or a cancellation date → **Cancelled (gross)** bucket; **excluded from verified net** (aligned with Busy export rule in plan).

### Ex-5 — Missing tax detail

If parts tax missing or implied rate outside **4.9%–18.1%**, invoice is **flagged**, gross shown, **not** included in verified net (no guess).

### Ex-6 — Multiple invoices same job card + date

**Synthetic (EV-046):** IMBTAI-FX-E1 (1,000) then IMBTAI-FX-E2 (2,000) → table keeps **2,000** only.  
**Dump evidence (PD-18):** 27/2,649 JC+date groups had >1 invoice number (parts uploads).  
**After DBL-0102 (isolated only):** replaced row preserved in audit table; **totals still use surviving row only** until PD-24 redesign approved.

### Ex-7 — Payroll gross vs net (**synthetic F2**, EV-047, LIN-E1)

Employee X: net **28,250.25**; Y: **20,000**; finalized total **48,250.25**; unfinalized Z excluded from finalized total.

### Ex-8 — Incomplete vs complete report retrieval

**Before:** 5,200 identical job cards → loader summed **5,000,000** net, dropped **200×1,000** silently (LIN-R2).  
**After:** shared loaders intended to fetch **all pages** until complete.

---

## 10. Background and database changes (not active in production)

| Object | ID | Purpose | Application tie-in | Production status |
|--------|-----|---------|----------------------|-------------------|
| Finance access hardening | **DBL-0101** / `20261125140000` | Module + branch scoped RLS; `finance_all_branches`; bank RPCs | Required for real bank protection & DB branch isolation | **PROPOSED** — commit `b52c1e83`, **not applied** |
| Invoice replacement audit | **DBL-0102** / `20261125141000` | Trigger preserves replaced `psf_revenue_dms` rows | Finance report replacement panel | **PROPOSED** — **not applied** (prod: `PGRST205` on conflicts table) |

**Release prerequisites** (from plan): dealer-code links on users, grant `finance_all_branches` to Finance/importers, staged SQL checks, **app+DB coordinated rollout** for banking.

**Unrelated merges on `main`:** Bodyshop default-EDP and governance publication scripts are **not** ACCOUNTS-002 scope (excluded per your instructions).

---

## 11. Functionality prepared but not activated

| Item | What exists in repo | Why inactive | User-visible today |
|------|---------------------|--------------|-------------------|
| DBL-0101 RLS + bank RPCs | Migration + sql_checks | User decision: defer DB; PD-25 retain banking | Same as pre-change DB |
| DBL-0102 invoice conflicts | Migration + trigger | Not applied | Message: audit **not enabled** |
| Bank RPC callers | `employeeBank.ts` + fallbacks | RPC missing in prod | Direct column reads still work |
| Finance vs operational report **rights split** | DB design | PD-21 UI split deferred | Single `reports` module |
| Automatic financial year (Option B design) | Plan §5.2–5.3, EV-060 feasibility | Not approved to implement | Still **26-27** in `accounts.ts` |
| Busy export run log | — | BUSY-001 task 4.4 | No log |
| Invoice key redesign | PD-24 design summary | Not approved | Overwrite behaviour unchanged |
| Row-cap warning UI | ReportsPage banner | No emitter after cap removal | Harmless; rarely shown |

---

## 12. Remaining decisions and pending work

### Original approved scope vs done

| Phase / activities | Completed in repo | Blocked / deferred / owned elsewhere |
|--------------------|-------------------|--------------------------------------|
| **1** Decisions & baseline | ✅ 1.1–1.2, 1.4–1.5 | 🔄 1.3 Busy extract, Sales series |
| **2** Safety fixes | ✅ 2.1, 2.2–2.3, 2.5–2.7 (except 2.4) | ❌ 2.4 advisor names (PD-23) |
| **3** Access | ✅ 3.1, authored 3.2–3.6 | **DB not applied**; 🔄 3.3 UI split (PD-21) |
| **4** Reporting controls | ✅ 4.1–4.3, 4.6; partial 4.5 | ⏳ 4.4 Busy log (BUSY-001); ⏳ 4.7 Accounts (ACCOUNTS-001); ❌ Busy reconciliation |
| **5** FY | ✅ 5.1 inventory, 5.2–5.3 design | **Not implemented** (ST-23) |
| **6** Expense register | ➖ Excluded | By design (PD-13/07) |

**Additional approvals 26 Nov (G1):** PD-26 Performance ✅; PD-25 banking retain ✅; DBL-0101 defer ✅; pagination fix ✅; safe web publication ✅.

**External dependencies:** Busy control extract (PD-11), Sales series (PD-16), ACCOUNTS-001 payment-line warning, BUSY-001 export log + real import verification.

**Do not treat “on main” as:** plan complete, migrations applied, production sign-off, or Busy reconciliation.

---

## 13. Comprehensive frontend inventory (user-visible ACCOUNTS-002)

| S/N | Module | Feature / report | Existed before | Previous limitation | Change | New / modified | Navigation path | Direct URL | On main | Verification | Pending |
|-----|--------|------------------|----------------|---------------------|--------|----------------|-----------------|------------|---------|--------------|---------|
| 1 | Reports | Invoice Revenue (Finance basis) | No | No finance-grade invoice view | Full finance report + export | **New** | Reports → Revenue → Invoice Revenue (Finance basis) | `/reports/revenue/invoice-revenue-finance` | Yes | Function-level only | Busy reconcile; prod UI; DB RLS |
| 2 | Reports | Performance category + 10 reports | Code only | Not in menu | Registered | **New menu** | Reports → Performance Reports → (each) | `/reports/performance/{report-id}` | Yes | Registry harness | Signed-in smoke test |
| 3 | Reports | All shared-loader reports (≈40+) | Yes | Silent 5k cap | Paginate to completion | **Modified load** | Various | `/reports/{category}/{report-id}` | Yes | Logic PASS | 2 reports still 5k |
| 4 | Reports | Revenue category description | Yes | Ambiguous vs finance | Clarified operational vs finance | Modified copy | Reports → Revenue Reports | `/reports/revenue/...` | Yes | Visual | — |
| 5 | Reports | Row-cap warning banner | No | N/A | Added (mostly dormant post-5k removal) | Modified UI shell | Any report | `/reports/...` | Yes | Not run | Re-wire if caps reintroduced |
| 6 | Payroll | Cost Summary tab | No | No mgmt cost view | Read-only summary | **New** | Payroll → Cost Summary | `/payroll` | Yes | Logic PASS | Employer cost data; UI not run |
| 7 | Payroll / Settings / SA | Bank read via RPC helper | Yes | Direct columns | RPC + **fallback** | Modified backend path | Payroll, Settings employees, SA export | Various | Yes | Prod uses fallback | DBL-0101 + PD-25 policy |
| 8 | Accounts | Vouchers / FY | Yes | FY 26-27 hard-coded | **None implemented** | Unchanged | Accounts | `/accounts` | Yes | — | Phase 5 approval |
| 9 | Busy | Export | Yes | No duplicate warning / log | **None** | Unchanged | Busy Accounting | `/busy` | Yes | — | BUSY-001 4.4 |

*Operational revenue reports (Daily Revenue, etc.): **unchanged calculation**, improved load completeness — not repeated row-by-row in this table (see §7).*

---

## Thematic sections (A–K) — consolidated

### A. Existing Reports module  
See §7. **Takeaway:** completeness improved; **money logic** unchanged except new finance report.

### B. Invoice Revenue (Finance basis)  
See NEW-01, §9, Ex-1–Ex-6. **Rely on:** verified net, GST line, cancelled/flagged splits, internal JC comparison. **Do not rely on:** Busy match, replaced-invoice completeness, production-confirmed access scope.

### C. Performance reports (10)  
All existed in source; **none** in menu before. **Now registered** per PD-26. **JC-to-Invoice Reconciliation** overlaps purpose with internal panels on finance report but remains operational (not BUSY-signed). URLs: `/reports/performance/customer-retention`, `service-due`, `advisor-performance`, `vas-job-performance`, `tat-duration-buckets`, `employee-utilization`, `jc-invoice-reconciliation`, `net-price-final-revenue-variance`, `end-to-end-job-lifecycle`, `vas-billing-hours-efficiency`.

### D. Payroll Cost Summary  
Uses finalized `payroll_entries`; provisional months flagged. Branch table uses `canonicalReportBranch`. Employer cost explicitly withheld.

### E. Pagination  
Baseline **23** cap checks in `reportQueries` → **0** at `ed9b7ec0`. Invoice finance loader never had 5k cap. Residual: Job Card Details + Service Invoice Order Status.

### F. Branch reporting  
New **Unmapped** bucket on finance report + payroll cost only. Dealer-code hints: **500A840, 3000840, 3001440** only — Tonk/Shahpura still risk **Unmapped** or DB policy gaps until mapping/DBL-0101. **Production DB branch policies:** inactive.

### G. Employee banking  
Prepared RPC + migration; **your 26 Nov decision** keeps today’s read paths; fallback preserves behaviour.

### H. Invoice identity  
Preservation designed (DBL-0102); redesign **PD-24** documented, **not implemented**. Totals still one row per JC+date key.

### I. BUSY  
**Unchanged** posting/export logic. Internal JC vs invoice comparison only. Busy export log and ST-21 **blocked**.

### J. Automatic financial year  
Design Option B documented (EV-060 feasibility). **No code** for counters/FY switch. **Apr 2027 risk unchanged** (ST-23).

### K. Deliberately excluded  
No expense register, manual revenue register, in-app ledger, duplicate Finance module, shared-cost allocation, period-lock — per plan §Phase 6 and decision log §C.

---

## 13 (continued). Complete implementation reference index

| Type | Reference |
|------|-----------|
| **Plan** | `docs/Implementation_plans/webversion/categories/accounts/active/ACCOUNTS-002_FINANCE_REPORTING_EXPENSES_REVENUE_REPORTS_PLAN_2026-11-25.md` |
| **Decisions** | `.../evidence/ACCOUNTS-002_DECISION_LOG_2026-11-25.md` (§F approval, §G1 26 Nov) |
| **Tests** | `.../evidence/ACCOUNTS-002_TEST_MATRIX.md` (§3 baseline, §4 post-impl) |
| **Lineage** | `.../evidence/ACCOUNTS-002_REPORT_LINEAGE_2026-11-25.csv` |
| **Catalogue audit** | `.../evidence/ACCOUNTS-002_REPORTS_CATALOGUE_2026-11-25.csv` |
| **Commits (ACCOUNTS-002 application)** | `1c1b9afc` plan; `b52c1e83` migrations; `f573fae4` bank callers; `b1034ea9` invoice report + payroll cost + row notice; `09adf8a1` catalogue; `31fd5b0a` merge; `779fb2f4` publication; `dc97aa21` bank RPC fallback; `ed9b7ec0` performance + pagination |
| **Migrations** | `supabase/migrations/20261125140000_finance_data_access_hardening.sql` (DBL-0101); `20261125141000_psf_invoice_overwrite_audit.sql` (DBL-0102) |
| **Key source** | `src/lib/revenue/invoiceRevenue.ts`, `invoiceRevenueSource.ts`, `InvoiceRevenueFinanceReport.tsx`, `src/lib/payroll/costSummary.ts`, `PayrollCostTab.tsx`, `src/lib/reportQueries.ts`, `src/lib/branches.ts`, `src/pages/reports/index.ts` |
| **Activity IDs** | As in plan Activity Tracker §B (2026-11-26 snapshot) |
| **Evidence IDs** | EV-019–020 (cap/formula), EV-035 (unregistered), EV-044–049 (runtime gaps), EV-052–053 (post-migration isolated), EV-056 (payroll cost), EV-060 (FY feasibility), EV-062–063 (catalogue/pagination) |

---

### Distinction summary (for sign-off conversations)

| Claim | Safe to say? |
|-------|----------------|
| New finance report and payroll cost exist in deployed web **source** | Yes (on `main`) |
| Operational reports now load more than 5,000 JC rows via shared loaders | Yes (code); verify on your host |
| Production database is secured per DBL-0101 | **No** — not applied |
| Employee bank details are restricted | **No** — deferred + RPC fallback |
| ACCOUNTS-002 is **complete** | **No** — plan status **IP** |
| Figures match Busy | **No** — PD-11 blocked |

This report is a **retrospective audit** only; no application, migration, or production data changes were made while preparing it.
