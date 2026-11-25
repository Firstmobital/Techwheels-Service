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
