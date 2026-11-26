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
| Salary | See the salary rebuild below. An entered amount, including 0, replaces the figure for that branch and month. Branches outside the four report branches count as Common |
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
**Status:** DBL-0104 applied and verified in production 2026-11-26; apply and publication authorized by the user ("document - apply - deploy"); signed-in verification pending.

| Topic | Design (replaces the monthly grid and "copy previous month" above) |
|---|---|
| Entries | `pnl_expense_entries`: month the cost belongs to, branch, type, amount, note. Several entries add up. Edit or cancel with a reason; never deleted. Each change is stored in `pnl_expense_entry_history` (database records who; the screen shows what and when) |
| Repeating | `pnl_recurring_expenses`: fixed or changing amount, first and optional last month. Counts only after confirmation; once per month; salary excluded. Stopping or editing never changes confirmed months |
| Salary | Superseded before release by the salary rebuild below |
| Pending | Unconfirmed repeats listed in Expenses and counted in the provisional warning; core types with nothing entered or repeating are listed (all branches together) |
| Screens | *Expenses* (add, pending, entries, month summary) and *Repeating & Settings* (repeats, margins, expense types) |
| Old grid | Rows are copied into entries; `pnl_expenses` becomes read-only (kept for rollback). Between migration and web release the old grid cannot save |

Not in Phase 1: bill attachments, vendor and payment status, month lock, approval, Busy import.

| Status | Task |
|---|---|
| ✅ | Migration `20261126150000_pnl_expense_entries.sql` and paired checks |
| ✅ | Calculation, harness, screens; build and lint |
| ✅ | Disposable PostgreSQL: 8/8 checks, carry-over, history, allow/deny cases. Screens exercised with sample data |
| ✅ | Authorized; applied, 8/8 checks, role test, snapshot refreshed. Publication through `npm run publish:safe` |
| ⏳ | Signed-in verification in production |

## Audit of existing sources (2026-11-26)
**Why it was needed:** the first design read only saved `payroll_entries`; it did not trace how the Payroll screens create them, although the first data query had shown Salary Type totals. The user directed: audit what exists and reuse it before proposing or building.

Scope: schema money-related fields, web app code search, main salary logic traced; live totals for selected sources only. Not covered: payments made outside these screens, warranty rejection/goodwill cost, mobile app, server functions.

| Source | Finding | P&L treatment |
|---|---|---|
| Job-card revenue | Powers Daily Revenue | Reused |
| Saved Payroll results | Gross pay per employee | Reused when finalized |
| Salary Type, attendance, advisor/technician/bodyshop earnings, Payroll incentives, saved additions | October draft: base ₹23.14L, work-based ₹22.87L, incentives separately recorded ₹1.58L (Oct entries held 0) | Reused through Payroll's own functions (rebuild below) |
| Advance recovery | Does not change salary cost | Gross pay used |
| Bodyshop waivers | ₹887 in November at audit | Not used; check revenue treatment first |
| DMS invoice discounts | About ₹4,300 November | Not deducted separately; revenue treatment unverified |
| Parts consumption cost | 17,015 rows, none with positive total cost | Not usable; 9% margin kept |
| Parts receipt (GRN) charges | 465 rows, charges not analysed | Not used |
| CRE incentive | Rates and on-screen calculation; payment route unknown | Not used; **open question** whether paid outside Payroll |
| Extended warranty incentive | Price-list fields; payments not traced | Not used; **open question** |
| Rent, electricity, interest | No ready source found | Manual and repeating entry |

## Salary rebuild (approved 2026-11-26: "document - apply - deploy (yes rebuild)")
| Order (per month; a typed amount still overrides per branch) | Figure |
|---|---|
| 1 | Finalized Payroll |
| 2 | Live calculation, admins only, current month and up to 3 months back; nothing is saved |
| 3 | Nearest earlier **finalized** month within 3, labelled estimated |
| 4 | The month's saved draft, labelled possibly incomplete |

- Shared rules: `src/lib/payroll/monthCalculation.ts` is used by both Payroll recompute and the live figure. One-off comparison with the previous inline Payroll code on 200,000 generated cases: no mismatches.
- Live inputs are Payroll's own loaders: Salary Type, attendance, saved draft additions, incentives, advisor/technician/bodyshop earnings. Bank details are not loaded. Only branch totals are shown.
- No attendance uploaded: base pay assumes full attendance of active employees (labelled). Any attendance uploaded: Payroll's rule applies (no row, no base pay) and gaps are reported.
- Part periods: base pay is spread by days shown; work-based pay, incentives and additions are to date and only apportioned by the share of elapsed days shown.
- Flaw removed before release: a draft recalculated before attendance (work pay, no base pay) is no longer preferred over a sound figure.
- Limits: the live figure inherits Payroll's calculation behaviour, including that some earnings lookups ignore read errors (a zero earnings type is warned); incentives show only when recorded. Non-admins see saved figures or an estimate.

## "Not in Payroll" (approved 2026-11-26: "this looks good to me")
**Decision:** Payroll stays the one source of salary; missed earnings are never added to P&L expenses. Nothing is added to anyone's pay automatically. Approval covers building; production apply and publication need their own authorization.

**Status:** built and tested locally; DBL-0105 PROPOSED.

- Payroll Processing shows a "Not in Payroll" list for the month, all branches: no employee code, not in Employee Master, no Salary Type record, base only, role rule, and saved draft figures that differ from the current calculation. A name match is suggested only when exactly one employee matches; a person must confirm and correct the record.
- Items (except out-of-date saved figures) can be excluded with a reason; an exclusion holds only for the recorded amount, can be withdrawn, is never deleted, and is frozen once the month is finalized.
- Finalize runs the check first and stops while items are open or if the check cannot run. This is enforced by the screen, not the database; later changes before the final click are not re-checked.
- P&L warns with the open amount (all branches) and does not deduct it. Admins only; others are told the check is unavailable. Recent months only (as for live salary).
- Finalized months are never changed.
- Not detected: technician assignments with no code or to a non-technician role (Payroll's technician lookup drops them before this check); CRE and extended-warranty payments; payments made outside Payroll.

**Verification:** harness cases; disposable PostgreSQL (5/5 checks, allow/deny cases); the new loader run on a temporary copy of November data (deleted after) matched the audit for SA and bodyshop (₹1,53,647) and also found technician ₹4,132. All 41 uncoded bodyshop lines had a single name match (matches unconfirmed). Signed-in screens not verified.
