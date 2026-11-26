# ACCOUNTS-003: Profit & Loss Report

**Classification:** state = implementation, scope = web, intent = active · **Created:** 2026-11-26 · **Status:** IP (migration applied and verified; web publication authorized; signed-in verification pending)

## Authorization
On 2026-11-26 the user asked to propose and implement, end to end, a P&L based on the Daily Revenue Report: labour revenue as 100% profit, 9% of parts revenue as profit, less interest, salary, rent, electricity and other expenses, with placement left to the agent. This supersedes, for this report only, the ACCOUNTS-002 exclusion of an expense register (PD-13/07, item 6.1) and of a management P&L (SP-11/OD-06). Later on 2026-11-26 the user authorized applying the migration to production and pushing to `main`, "as per governance".

## What existed (evidence)
- No expense, rent, electricity or loan table in `full_metadata.sql` (snapshot of 2026-11-25).
- Salary: `payroll_entries` only. The 2026-10-02 data dump held August (month status draft) and a partly filled September.
- Employer PF/ESI and other employer costs are not recorded.

## Design
| Topic | Decision |
|---|---|
| Placement | Reports → **Profit & Loss**: *P&L Statement* and *Expenses & Margins* |
| Access | New module `pnl_report` (view / modify), plus admins. Covers all branches. Users also need `reports` to open the Reports page |
| Revenue | `getDailyRevenueReport` (job-card closed data, invoice date), so billed figures tie to the Daily Revenue Report. VAS is not added again |
| GST | Default: profit on revenue excluding GST (18% estimate, as in the operational report). Switchable to billed amount with GST. Parts taxed at other rates make this an estimate; Invoice Revenue (Finance basis) uses actual GST |
| Margins | Labour 100%, parts 9%; editable. One current value applies to all periods (not effective-dated) |
| Expenses | One amount per month, branch (4 branches + Common) and head; 24 starter heads; users can add heads; "copy previous month" (never copies salary) |
| Salary | Payroll gross pay (totals only, through `pnl_payroll_cost`). An entered amount, including 0, replaces Payroll for that branch and month. Payroll branches outside the four report branches count as Common |
| Part periods | Monthly expenses counted by days shown; can be switched to full month |
| Branch view | Carries only that branch's expenses; Common is not allocated |
| Completeness | Marked provisional when Salary, Rent, Electricity or Interest is missing for a month, or salary comes from unfinalized Payroll |

**Limits:** a management estimate, not books of account; nothing is read from or posted to Busy. Principal loan repayments are not expenses. Changes keep only the last editor and time, not a history. Web only (mobile parity: no impact).

## Tasks
| Status | Task |
|---|---|
| ✅ | Migration `20261126120000_pnl_report.sql` and paired checks (DBL-0103) |
| ✅ | Calculation `src/lib/pnl/pnl.ts`, harness `npm run test:pnl` |
| ✅ | Screens, navigation, access gating, CSV export |
| ✅ | Local verification: harness, build, lint on new files; migration, 7 checks and RLS allow/deny cases on a disposable PostgreSQL 17 with stubbed base tables and the snapshot's permission functions; both screens viewed with sample data |
| ✅ | Authorized; migration applied to production, 8/8 checks, live access test, metadata snapshot refreshed (DBL-0103 VERIFIED) |
| ✅ | Publication authorized (user approval, not independent review); goes through `npm run publish:safe` |
| ⏳ | Signed-in verification: billed figures against the Daily Revenue Report; grant `pnl_report` to non-admin users |
| ⏳ | Accounts enters monthly expenses; owner confirms margins and GST basis |

## Rollback
Revert the web commit. Database objects are additive; the drop statements are in the migration header.

## Production findings (2026-11-26)
- Payroll totals through the new RPC: August and September finalized, October draft, nothing for November. This replaces the older data-copy finding above. November salary shows as missing until Payroll has November entries or an amount is entered.
- Platform automation granted `pnl_report` (view, modify, delete) to the 7 active admin accounts.
- No expenses are entered yet.

## Phase 1: easy expense posting (approved 2026-11-26: "Yes, build Phase 1")
**Status:** built and tested locally; DBL-0104 PROPOSED; not applied, not published. The approval covers building; production apply and publication need their own authorization.

| Topic | Design (replaces the monthly grid and "copy previous month" above) |
|---|---|
| Entries | `pnl_expense_entries`: month the cost belongs to, branch, type, amount, note. Several entries add up. Edit or cancel with a reason; never deleted. Each change is stored in `pnl_expense_entry_history` (database records who; the screen shows what and when) |
| Repeating | `pnl_recurring_expenses`: fixed or changing amount, first and optional last month. Counts only after confirmation; once per month; salary excluded. Stopping or editing never changes confirmed months |
| Salary | Order per branch: entered amount, then that month's Payroll, then, only when a month has no Payroll pay at all, the nearest earlier month within 3 months, labelled estimated and marking the figure provisional |
| Pending | Unconfirmed repeats listed in Expenses and counted in the provisional warning; core types with nothing entered or repeating are listed (all branches together) |
| Screens | *Expenses* (add, pending, entries, month summary) and *Repeating & Settings* (repeats, margins, expense types) |
| Old grid | Rows are copied into entries; `pnl_expenses` becomes read-only (kept for rollback). Between migration and web release the old grid cannot save |

Not in Phase 1: bill attachments, vendor and payment status, month lock, approval, Busy import.

| Status | Task |
|---|---|
| ✅ | Migration `20261126150000_pnl_expense_entries.sql` and paired checks |
| ✅ | Calculation, harness, screens; build and lint |
| ✅ | Disposable PostgreSQL: 8/8 checks, carry-over, history, allow/deny cases. Screens exercised with sample data |
| ⏳ | Authorize: apply migration, run checks, refresh snapshot, publish. Apply immediately before publishing; the web release depends on it |
| ⏳ | Signed-in verification in production |
