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

New open decisions:
| ID | Decision | Options | Proposed approver | Why it matters |
|---|---|---|---|---|
| PD-21 | Role mapping and report-module split | (a) grant `finance_all_branches` and dealer-code links to named users before apply; (b) also split `reports` into finance and operational rights in the UI | Finance head + Engineering owner | Without links and the all-branch right, reading modules (including payroll operators) see no rows after DBL-0101 |
| PD-22 | Platform admin bypass | (a) keep the existing platform-wide admin bypass (current); (b) remove it on finance tables (conflicts with the admin-bypass governance and its auto-created policy) | Finance head + Engineering owner | Approved text says administrators must not get automatic all-branch finance access; the bypass gives them access anyway. New admin users also receive every module by default, including `finance_all_branches` |
| PD-23 | Hard-coded excluded advisor names in `ReportsPage` | keep; remove; move to a setting | Business owner | No authority says who these advisors are; left unchanged |
| PD-24 | Invoice key redesign | (a) keep key plus audit table; (b) add invoice number to the key (touches voucher trigger, job-card mirror, Busy export key) | Finance head + Import owner | 27 same-day groups exist in parts uploads; DBL-0102 preserves replaced invoices but does not count both in totals |

