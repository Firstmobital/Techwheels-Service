# ACCOUNTS-002 Decision Log

**Plan:** [ACCOUNTS-002](../active/ACCOUNTS-002_FINANCE_REPORTING_EXPENSES_REVENUE_REPORTS_PLAN_2026-11-25.md) · **Classification:** state = implementation evidence, scope = web, intent = evidence

Decisions on tax, legal, posting policy and period close belong to the Finance head or accounting owner. This log records options and impacts; **nothing here is decided by this audit.**

## A. Decisions made in this audit (scope/method)
| ID | Decision | Reason |
|---|---|---|
| DL-01 | Audit working root = `local_folder/audits/finance-reporting/` (Git-ignored via `.gitignore:11`); governed copies promoted to `docs/Implementation_plans/webversion/categories/accounts/` | Repo convention: governed docs live under docs; private working files stay local |
| DL-02 | Use the worktree snapshot (sha `7809bd2a…`, 2026-11-25) as structural authority; report that it was uncommitted at audit time (committed afterwards as `98016773`) | Newer than HEAD's snapshot; manifest hash matches file |
| DL-03 | No runtime checks | No environment proven isolated with synthetic data (EV-042) |
| DL-04 | Did not read `local_folder/backups/full_database.sql` | Contains customer/financial rows; structural questions answered from the snapshot |
| DL-05 | Handoff prompt layout differs from the assignment; the assignment's file layout was followed | Assignment governs |
| DL-06 | 2026-11-25: audit promoted as plan ACCOUNTS-002 (new plan, not an amendment) | No existing plan owns revenue reporting/report access; ACCOUNTS-001 and BUSY-001 keep their scope and receive pointers |
| DL-07 | 2026-11-25 second pass: implementation-readiness verification run in an isolated scratch PostgreSQL restored from the committed snapshot with synthetic data (EV-043); no production access was used | Strongest evidence available without production access; hosted Auth settings and real data remain BLOCKED (EV-050) |

## B. Pending business decisions (with Service impact)

Status note (2026-11-25): PD-14, PD-15, PD-17, PD-18, PD-19 and PD-20 were answered by the user on 2026-11-25 (section F), with the exceptions and open follow-ups in section G. Section E is the pre-approval package and is kept as history. Section G is the single register of decisions that are still open.
| ID | Handoff ref | Decision | Options | Proposed approver | Work that can proceed | Work that waits |
|---|---|---|---|---|---|---|
| PD-01 | OD-01 | Book of record and Busy cut-over | Busy only (assumed today); parallel run; in-app ledger | Finance head / CA | P1 fixes, P2 hardening, P3 read-only reports | Any Service posting, any ledger |
| PD-02 | OD-02 | Posting authority across two databases | one ledger DB; ledger per DB + consolidation; Busy only | Finance head / CA | Nothing blocked in P1–P3 | P4 series work beyond inventory |
| PD-03 | OD-03 | Unique reference scheme | prefix per system/department; central numbering | Accounting owner | Inventory of existing Service series (done: RApp, JApp, PV-S, EV-S) | FY rollover design (P4) |
| PD-04 | OD-04 | Master ownership (parties, branches) | single / shared / mapped | Finance head | Mapping table design | Merging masters |
| PD-05 | OD-05 | Shared-cost allocation | company level; direct tag; pool with driver | Finance head | Service-only cost views (payroll) | Consolidated cost figures |
| PD-06 | OD-06 | Estimates vs actuals | keep and label; actuals only | Finance head | Service shows actuals only | Any estimate line |
| PD-07 | OD-07 | Manual revenue policy | needed? source doc, approver, reversal | Finance head | Nothing (not built) | Any register |
| PD-08 | OD-08 | Capitalisation of parts/tools | expense vs capitalise | Accounting owner | — | CAP-007 |
| PD-09 | OD-09 | Date basis per report line | event, invoice, payment, service period | Finance head | Document current bases (done in catalogue) | Changing a basis |
| PD-10 | OD-10 | Edits after Busy period lock | block; allow with reversal | Accounting owner / CA | — | CAP-018 |
| PD-11 | OD-11 | Reconciliation controls, tolerance, sign-off | proposal in `reconciliation` template | Finance head | Internal comparisons (JC vs invoice) | Busy control match |
| PD-12 | OD-12 | Page-load writes | explicit only (Service already complies statically) | Engineering owner | Adopt as standing rule | — |
| PD-13 | new | Does the workshop need any expense register at all, or does Busy hold all workshop expenses? | Busy only; small register for non-Busy items | Finance head | — | CAP-001..003, 006 |
| PD-14 | new | Which revenue basis is finance-grade: invoice grain (`psf_revenue_dms`) or JC grain? Is GST-5 parts treatment per slab acceptable? | recommend invoice grain | Finance head | — | CAP-009 label change |
| PD-15 | new | Report access split (finance vs operational) and who may read DMS revenue rows | | Finance head + Engineering owner | — | CAP-016 policy rewrite |
| PD-16 | new | Obtain Sales voucher series list and company GSTIN holder of record | | Accounting owner | — | CAP-021 collision check |
| PD-17 | new | Branch isolation: should finance tables be scoped to the user's branch in the database, or is application-level filtering enough? | (a) keep application scope; (b) module right only, no branch policy; (c) branch policy using `users.branch` | Finance head + Engineering owner | Phase 3 module-right policies | Any branch policy (needs PD-15 first) |
| PD-18 | new | Can the DMS issue more than one invoice for one job card on one date? (Import key replaces the earlier invoice) | (a) confirm never and document; (b) add invoice number to the key; (c) reject or flag duplicates at import | Finance head + Import owner | Evidence gathering from DMS exports | Task 2.7, invoice-grain totals |
| PD-19 | new | Restrict `employee_master` bank fields to payroll users | (a) payroll-gated RPC; (b) column privileges; (c) move fields to a payroll table | Finance head + HR owner | Payroll loader change | Task 3.5 |
| PD-20 | new | Financial-year rollover mechanics | (a) per-year migration checklist; (b) parameterized FY configuration | Accounting owner + Engineering owner | PD-02, PD-03 | Phase 5 |

## C. Sales-handoff recommendations that do not fit Service
| Handoff item | Why not applied |
|---|---|
| Recurring expense templates, scheduled generation, per-run caps (SP-03/04, CAP-003/004) | Service has no expense register; no generator to schedule. The no-write-on-load rule is retained as a standing rule only |
| One-site tagging fix and shared-cost pool lines (SP-06, CAP-006) | No costs to tag in Service; allocation is a Finance decision (PD-05) |
| In-app ledger and posting queue with fingerprints (SP-19/21, CAP-019 as a queue) | Service posts nothing; Busy files only. A queue would create a second book. Replaced by an export-run log |
| Manual revenue register with approvals and reversals (SP-10, CAP-010) | Service revenue comes from DMS invoices; no non-DMS stream evidenced |
| Management P&L with estimates (SP-11/OD-06) | Service has no P&L; adding one is out of scope |
| Assumed tables/labels from Sales | Not used; every Service source was verified in the snapshot |
| "Report right gating every report" as a Sales defect | Same pattern exists in Service (G-04) and is kept as a gap |
| Assumption that source data is behind module rights | Not true in Service: tables are open to any authenticated user (G-03) |

## D. Notes on the handoff package
`SERVICE_AGENT_PROMPT.md` asks for deliverable names that differ from this assignment; the proposal templates (fit-gap, mapping, acceptance tests) were usable as is. The package assumes registers exist; Service has none for expenses/revenue, so most Expenses rows resolve to DEFER.

## E. Decision package (second pass, evidence-based)

Each decision lists why it is needed, the evidence, options with consequences, a recommendation where evidence supports one, and the risk of proceeding without it. Nothing here is decided by this plan.

**PD-14 Finance revenue basis, GST treatment and cancelled invoices.** *Why:* the report formula assumes 18% on everything. *Evidence:* observed 21,339 vs 22,000 on F1 (EV-047); Busy handles 5% and 18% slabs (EV-010). *Options:* (a) invoice-grain `psf_revenue_dms` with per-slab net; (b) keep job-card grain with a corrected divisor; (c) leave as is and label it. *Consequences:* (a) matches the Busy export and shows cancelled separately but needs slab data for parts invoices; (b) is smaller but cannot be reconciled to invoices; (c) keeps a known understatement. *Recommendation:* (a), with the old figure shown beside it for one release. *Risk without it:* parts invoiced at 5% GST stay understated (3% on the synthetic fixture) and revenue cannot be reconciled to Busy.

**PD-15 Access model for finance data.** *Why:* every signed-in user can change revenue tables (EV-044). *Options:* (a) finance module right for read, writes only through import and accounts functions; (b) split `reports` into finance and operational rights; (c) both. *Consequences:* (a) closes the write gap with the least UI change; (b) also needs role assignments for each user; (c) is the end state. *Recommendation:* (a) first, (b) after role mapping. *Dependencies:* caller inventory (task 3.1) for the DMS importer, mobile import, payroll earnings and triggers. *Risk without it:* any signed-in account can alter or delete revenue rows.

**PD-17 Branch isolation.** *Evidence:* no public policy references branch; a Tonk user read other branches (EV-048). *Options:* (a) accept application-level filtering; (b) database branch policies from `users.branch`; (c) none until PD-15 lands. *Consequences:* (b) can hide data from multi-branch managers unless an all-branch right exists. *Recommendation:* (c) then (a) unless Finance requires per-branch confidentiality. *Risk without it:* a branch user can read all branches by calling the API directly.

**PD-18 Same job card, same date, more than one invoice.** *Evidence:* later invoice overwrites the earlier one in separate batches and fails in one batch (EV-046). *Options:* (a) confirm the DMS never does this; (b) widen the unique key with the invoice number; (c) flag at import. *Consequences:* (b) touches the voucher trigger, the job-card mirror and the Busy export key; (c) is smaller. *Recommendation:* first check DMS exports for such pairs (read-only, needs the export files), then (c) if any exist. *Risk without it:* silent under-reporting of revenue for affected jobs.

**PD-19 Employee bank details.** *Evidence:* readable without a module (EV-049); the payroll page reads them directly. *Options:* (a) payroll-gated RPC; (b) column privileges; (c) separate payroll table. *Recommendation:* (a), changing the payroll loader in the same change. *Risk without it:* any signed-in user can read employee bank details.

**PD-20 Financial-year rollover.** *Evidence:* FY 26-27 in the voucher function, sequence names, CHECK constraints, code constants and the complaint ticket function (EV-045). *Options:* (a) a per-year change set (new sequences, constraints, function, constants) done before 2027-04-01; (b) a configuration table. *Recommendation:* (a), because it is needed once a year and keeps issued numbers untouched; add the checklist to the plan. *Risk without it:* receipts after 2027-03-31 are numbered as 26-27 or rejected by the CHECK constraint.

**PD-01/02/03/16 Busy role, posting authority and series.** *Evidence:* Service issues RApp/JApp and PV-S/EV-S series; BUSY-001 notes the real Busy import has not been verified (task 3.2 pending). *Options:* as in section B. *Recommendation:* keep Busy as the book of record (assumption) and get the Sales series list before any series change. *Risk without it:* possible duplicate references on the shared registration.

**PD-11 Reconciliation controls.** Needs an approved Busy extract, tolerance and sign-off role. *Risk without it:* the Busy match test (ST-21) stays blocked.

**PD-13/07 Expense or manual revenue register.** *Evidence:* none exists and no distinct need is shown (EV-034). *Recommendation:* do not build; Finance lists any non-DMS income or workshop expense that Busy cannot hold.

**Essential blockers for implementation start:** approval of the plan, PD-14, PD-15. **Can be decided later:** PD-17, PD-18, PD-19 (but PD-19 is a security fix and should not wait long), PD-20 (before 2027-03-15), PD-01/02/03/11/16.

## F. Decisions recorded on 2026-11-25 (user approval) and new open decisions

Approved by the user (conditional phased implementation):
| ID | Approved decision |
|---|---|
| PD-14 | Invoice-level revenue with the GST actually charged; no universal 18% divisor on mixed invoices; gross, GST and net kept apart; cancelled apart; missing or unreliable tax information flagged, never guessed; existing-versus-corrected comparison; headline reconciles to detail |
| PD-15 | Dedicated finance access with controlled write paths; server-side and database enforcement; operational callers inventoried first |
| PD-17 | Assigned-branch access with explicit all-branch access; not granted automatically to every administrator or every Sitapura employee; enforced below the application |
| PD-18 | Inspect DMS evidence first; prevent silent overwrite; ambiguous identity flagged, not discarded. A material key redesign needs separate approval |
| PD-19 | Protect bank name, account number and IFSC; keep authorized payroll workflows |
| PD-20 | Evaluate automatic financial-year handling; design only; no implementation |
| Payroll | Gross earnings, deductions, net payable and employer cost kept apart; employer cost shown only where data exists; read-only |
| Busy | Busy stays the accounting authority; no in-app ledger; obtain reconciliation evidence; do not claim Busy import verified |

Evidence gathered for PD-18 (local full-database dump of 2026-10-02, aggregates only; no identifiers or amounts recorded): in the parts uploads, 27 of 2,649 job-card and invoice-date groups had more than one distinct invoice number, and 55 of 2,619 job cards had more than one invoice overall. So same-day multiple invoices occur at the DMS level. Because the revenue table keeps one row per job card and date, an overwritten invoice cannot be counted from that table after the fact. In the same dump, 10,981 invoice rows each had labour plus spares equal to the total, and parts tax present on all rows; for rows with spares, 97.8% implied an 18% parts rate and 0.27% fell outside 5%-18% (flagged). 98.17% of invoices classify as verified, 1.65% as cancelled and 0.18% as needing tax detail.

The open decisions that follow from the approvals are in section G (not repeated here).

## G. Outstanding decision register (consolidated 2026-11-25; the single record of open decisions)

None of these is decided by this plan or by the agent. "Blocks" says what cannot finish until the user decides: local completion, financial accuracy, or production release. Activity IDs refer to the plan's Activity Tracker.

### PD-20 Financial-year implementation approach
- **Status (latest user decision):** neither automatic nor annual implementation is authorized. The automatic design is finalized for separate approval in the plan section "Financial-year design" (isolated feasibility 2026-11-25, EV-060). The agent recommendation below is superseded for design purposes: the automatic design is now the proposal under review; the annual change set remains the fallback.
- **Current behaviour:** receipts and vouchers are `RApp/JApp 26-27` and Busy series `PV-S/EV-S 26-27`; the year is fixed in code, the voucher function, two sequences, two CHECK constraints, the reconcile function and the complaint ticket function. A 2027-05-01 receipt still gets `RApp/26-27` (observed on the isolated database).
- **Evidence:** EV-045, EV-055; inventory in the plan (Financial-year design).
- **Options:** (A) annual controlled change set before 2027-04-01; (B) automatic derivation from the document date with per-year counters.
- **Business impact:** receipts after 2027-03-31 are mis-numbered or rejected if neither is done; Busy needs the new series either way.
- **Technical impact:** A touches function, constraints, sequences and constants for one year. B also replaces the reconcile function, the Busy series helper and every reader of the old sequences, and changes sequence gaps into counter rows.
- **Activities:** 5.2, 5.3; ACCOUNTS-001 numbering; BUSY-001 series constants.
- **Dependencies:** PD-02, PD-03, PD-16.
- **Agent recommendation (not approval):** A for 2027, because it is smaller, is needed once a year and B does not remove the Busy series setup. B remains an option for later.
- **Blocks:** production release after 2027-03-31 (date-driven). Not local completion.
- **Approval needed:** Accounting owner and Engineering owner.

### PD-02, PD-03, PD-16 Voucher series and Sales series evidence
- **Current behaviour:** Service issues `RApp`, `JApp`, `PV-S`, `EV-S`. The Sales series list and the GSTIN holder of record are not available to this project.
- **Evidence:** EV-008, EV-012, EV-013; plan section 10.
- **Options:** prefix per system and department; central numbering; Busy-only numbering.
- **Business impact:** possible duplicate references on one registration if series overlap.
- **Technical impact:** series changes touch ACCOUNTS-001 and BUSY-001 code and the database function.
- **Activities:** 5.1 (inventory done), 5.2, ST-22.
- **Dependencies:** Sales series list from the Sales accounting work.
- **Recommendation:** prefix per system; obtain the list before any change.
- **Blocks:** the financial-year change and the collision check; not local completion of other activities.
- **Approval needed:** Finance head / CA and Accounting owner.

### PD-11 Busy reconciliation extract, tolerance and sign-off
- **Current behaviour:** Service exports files to Busy; no Busy data is imported; BUSY-001 records that the real Busy import is not verified. The new report compares invoice grain with job-card grain only.
- **Evidence:** BUSY-001 task 3.2; test matrix ST-08, ST-21.
- **Options:** supply an approved extract for named months with a tolerance and a sign-off role; or decline reconciliation.
- **Business impact:** without it the revenue figures are not reconciled to the accounting book.
- **Technical impact:** a read-only comparison by invoice, no ledger.
- **Activities:** 4.5 (Busy part), ST-21.
- **Recommendation:** supply the extract and name the sign-off role.
- **Blocks:** financial accuracy sign-off (external reconciliation); not local completion.
- **Approval needed:** Finance head.

### PD-21 Finance role assignments and UI permission separation
- **Status (latest user decision): DEFERRED.** Keep the database-level Finance authorization (DBL-0101); no new production role assignments; UI permission separation not started. Prerequisites to document before reopening: read-only production list of role/module assignments and employee links; named users for `finance_all_branches`; a decision on splitting the `reports` module.
- **Current behaviour:** DBL-0101 limits revenue and warranty rows to users with a reading module and a matching dealer-code link, or the module `finance_all_branches`. Users without links see no rows. The Reports module is still one right for all report categories.
- **Evidence:** test matrix §4 access matrix (isolated); plan release prerequisites.
- **Options:** (a) map links and grant `finance_all_branches` to named users before apply; (b) also split `reports` into finance and operational rights in the UI.
- **Business impact:** staff without links or the right lose revenue figures; payroll operators would compute variable earnings from no rows.
- **Technical impact:** (a) data and role work only; (b) route gating and report registry changes.
- **Activities:** 3.3, 3.6, release of DBL-0101.
- **Dependencies:** a read-only production list of current role assignments (not available).
- **Recommendation:** (a) before release; (b) after (a).
- **Blocks:** production release. UI-level separation (3.3) stays incomplete until (b).
- **Approval needed:** Finance head and Engineering owner.

### PD-22 Administrator bypass and default module assignments
- **Status (latest user decision):** the designated administrator account `admin@firstmobital.com`, while it holds the Admin role, keeps unrestricted application-level admin access across modules and branches (**approved exception**). Other administrators are **DEFERRED**: their access is unchanged and not narrowed. Implemented by existing mechanisms only: the existing Admin-role bypass (`is_admin()`, `admin_unrestricted_all_ops_v1`, default module grants) is preserved; no email-based or client-side authorization was added and a caller-supplied email claim is never trusted. Verified on the isolated database (EV-061): the designated account with the Admin role reads and writes all finance tables and the bank RPCs; the same email in a JWT claim presented by a non-admin user id, an unauthenticated caller and a module-less user are denied. PD-17's rule about not extending all-branch access to every administrator remains unresolved for administrators other than the designated account.
- **Current behaviour:** (1) every table has the platform policy `admin_unrestricted_all_ops_v1`, and the event trigger `trg_auto_admin_bypass_policy_on_ddl` adds it to new tables, so every administrator can read and change every row regardless of branch; (2) the triggers `trg_grant_active_module_to_admins_after_insert/update` and `trg_grant_admin_all_active_modules_after_insert/update` give every active administrator every active module, so a new module such as `finance_all_branches` is granted to all administrators automatically.
- **Conflict with the approval:** PD-17 says all-branch finance access must be explicitly authorized and must not be given automatically to every administrator. This is not satisfied while (1) and (2) stand. DBL-0101 leaves both untouched.
- **Evidence:** snapshot objects named above; isolated runtime (the seeded administrator received `finance_all_branches` when the module was created); `ADMIN_BYPASS_RLS_GOVERNANCE.md`.
- **Options:** (a) accept and record: administrators are platform-wide by design; (b) exclude finance tables from the bypass and from the default module grant (changes the admin-bypass governance and the auto-created policy); (c) keep the bypass but remove `finance_all_branches` from the default grants so the right is explicit.
- **Business impact:** (a) administrators see all branches' finance data; (b) and (c) need named administrators for consolidated Finance.
- **Technical impact:** (b) touches the event trigger and the policy template; (c) touches two grant functions.
- **Activities:** 3.2, 3.6; PD-17 compliance.
- **Recommendation:** (c) as the smallest step toward the approved rule; (a) if Finance accepts platform-wide administrators.
- **Blocks:** PD-17 compliance and production release. Not local completion.
- **Approval needed:** Finance head and Engineering owner.

### PD-23 Hard-coded advisor exclusions
- **Status (latest user decision): DEFERRED.** The hard-coded behaviour is kept; task 2.4 stays blocked.
- **Current behaviour:** `ReportsPage.tsx` removes a fixed list of names from the advisor filter options.
- **Evidence:** EV-022; task 2.4 Blocked.
- **Options:** keep; remove; move to a setting or an inactive flag on the employee record.
- **Business impact:** unknown until someone identifies the names; the list affects only the filter options.
- **Technical impact:** small.
- **Activities:** 2.4.
- **Recommendation:** none without a business answer.
- **Blocks:** nothing but task 2.4.
- **Approval needed:** Business owner.

### PD-24 Material invoice identity redesign
- **Status (latest user decision): DEFERRED.** The interim DBL-0102 preservation safeguard stays; no key, trigger, mirror or Busy change; the completeness limitation remains open.
- **Current behaviour:** one row per location, portal, job card and invoice date. A second invoice for the same job card and date replaces the first in a later batch (DBL-0102 preserves the replaced row but does not add it back to totals) or fails a single batch.
- **Evidence:** EV-046, EV-052, EV-054 (private local dump, aggregates only: 27 of 2,649 job-card and date groups in parts uploads have more than one invoice number).
- **Options:** (a) keep the key plus the preservation table, and report the replaced invoices to Finance; (b) widen the key with the invoice number; (c) both, with a backfill from the preserved rows.
- **Business impact:** under (a) revenue totals can omit legitimate same-day invoices that were replaced; (b) fixes totals.
- **Technical impact:** (b) touches the unique constraint, the voucher assignment trigger, the job-card mirror refresh and the Busy export key.
- **Activities:** 2.7 (partial), revenue completeness.
- **Recommendation:** (b), after a read-only check of how many psf rows were replaced, to be approved separately.
- **Blocks:** financial accuracy (completeness). Not local completion; not release of the preservation safeguard.
- **Approval needed:** Finance head and Import owner.

### PD-25 Authorized read paths for employee bank fields
- **Status (latest user decision): DEFERRED.** Current protection and read paths (Settings, SA Tracker, service-role edge functions) are preserved; no new restrictions or expansion.
- **Current behaviour:** after DBL-0101, bank fields can be read by `payroll` view, `employees` view (Settings), `sa_tracker` view (SA Tracker export) and administrators through `get_employee_bank_details`, and by service-role edge functions that build earnings reports (unchanged). Writes: administrators only (`set_employee_bank_details`, existing row policy); payroll users also through the existing definer functions.
- **Support in the approved scope:** the approval names payroll workflows. Payroll is supported. The Settings (employees) and SA Tracker paths are existing behaviours preserved to avoid breaking them; they were not individually approved. The edge functions' recipients and content were not audited.
- **Options:** (a) keep all four paths; (b) limit to payroll and administrator and give Settings and SA Tracker a masked view; (c) limit to payroll and administrator only.
- **Business impact:** (b) and (c) change what HR and SA Tracker users can see or export.
- **Technical impact:** change the RPC permission check and two screens.
- **Activities:** 3.5.
- **Recommendation:** (b) after HR confirms the need.
- **Blocks:** nothing locally; the exception should be settled before production release.
- **Approval needed:** Finance head and HR owner.

### PD-26 Registration of the ten unregistered Performance reports
- **Current behaviour:** ten report components under `src/pages/reports/performance/` (including `jc-invoice-reconciliation`) are not in the registry, so they are unreachable (G-06). The registered 39 reports now all resolve to catalogue metadata through `reportCatalogue.ts`; the ten are not catalogued in code.
- **Evidence:** EV-035; `scripts/report-catalogue.harness.ts` output (EV-062).
- **Options:** register all or some (adds navigation and a category); retire; leave as is.
- **Business impact:** registering exposes reports that were never reviewed for access or accuracy; leaving them hides existing analyses.
- **Technical impact:** small registry change plus the same gate as other reports.
- **Activities:** 4.3 (ST-15 stays open for these ten).
- **Recommendation:** none without a business answer.
- **Blocks:** ST-15 full closure only.
- **Approval needed:** Business owner and Engineering owner.

