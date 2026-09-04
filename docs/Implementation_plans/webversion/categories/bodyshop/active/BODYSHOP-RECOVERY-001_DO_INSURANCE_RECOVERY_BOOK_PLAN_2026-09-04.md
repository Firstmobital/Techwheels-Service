# BODYSHOP-RECOVERY-001: Bodyshop Recovery (DO / insurance due only)

**Plan ID:** BODYSHOP-RECOVERY-001  
**Created:** 2026-09-04  
**Last Updated:** 2026-09-04 (DBL-0032: org-wide list, no dealer/branch/fuel row filter)  
**Priority:** HIGH  
**Owner:** Bodyshop Team + Platform Team + Accounts  
**Status:** Active (v1 DO-only)  
**Platform:** webversion  
**Category:** bodyshop  
**Ledger:** DBL-0031 (applied earlier); DBL-0032 (APPLIED — org-wide visibility)  
**Route:** `/bodyshop-recovery`  
**Module:** `bodyshop_recovery`  
**Depends on:** BODYSHOP-SETTLEMENT-001 (`bodyshop_settlements.insurance_due_amount`)

---

## Executive Summary

Add a fourth Bodyshop nav item **Bodyshop Recovery**. It is the accounts rupee book for **DO / insurance due** across every billed JC, not the Repair Tracker vehicle queue.

**v1 lock:** insurance due only. Do **not** show customer remaining, customer due, or customer refund. Those stay on Stage 18 Billing.

**Risk Level:** MEDIUM  
**Estimated Duration:** 1–2 days  
**Rollback:** Drop RPC + module row; revert nav/page. Ledger tables stay.

---

## Locked rules (v1)

1. Nav label **Bodyshop Recovery**. Module `bodyshop_recovery`. Route `/bodyshop-recovery`.
2. Open row = `do_amount IS NOT NULL` AND `insurance_due_amount > 0`. Fully posted DO (`received`, due ₹0) is hidden — 005071 after Main+TDS covering DO must not appear.
3. Headline KPI = sum of `insurance_due_amount`. Secondary = open vehicle count. Split pending / partial / not_received.
4. Year → month drill uses **invoice_date** (IST). Default view is **all open dues**, not This Month.
5. No posting UI. Open JC → Repair Tracker lookup `?q=`. Customer pending is out of scope.
6. Grant by named user in Admin → Permissions (`bodyshop_recovery` view). Do not auto-grant to SA / Floor / Survey. Do **not** add a `BS Recovery` Employee Master business role. EDP (or blank) on the employee row is unrelated to this page’s row set.
7. **Org-wide visibility.** `list_bodyshop_do_recovery` does not use `dealer_code_in_scope`, branch, or fuel. A Recovery user with **NO-DEALER** still sees every open insurance-due JC. Repair Tracker posting keeps its own SA/branch rules.

```
insurance_due = do_amount − (Main + GST + TDS, not reversed)
```

---

## Implementation Tasks

- [x] **Task 1.1:** Plan + DBL-0031 PROPOSED (DBL-0030 is payroll Add Employee).
- [x] **Task 1.2:** Migration: module row + `list_bodyshop_do_recovery()` + `bodyshop_settlement_can_view` includes `bodyshop_recovery`.
- [x] **Task 1.3:** Paired sql_checks.
- [x] **Task 2.1:** Web page + API + Bodyshop dropdown.
- [x] **Task 2.2:** Operator apply DBL-0031 then DBL-0032; Sanjay Kansotia has `bodyshop_recovery` view. Grant other Accounts users as needed.
- [x] **Task 2.3:** Org-wide Recovery list (no dealer/branch/fuel filter). DBL-0032.
- [ ] **Task 3.1:** Customer remaining book (later plan). Not v1.

---

## Activity Tracker

```
✅ 1.1 | Plan + ledger | Eng | 2026-09-04 | 2026-09-04 | DO-only lock
✅ 1.2 | Module + RPC | Eng | 2026-09-04 | 2026-09-04 | DBL-0031 PROPOSED; timestamp 20260904170000
✅ 1.3 | sql_checks | Eng | 2026-09-04 | 2026-09-04 |
✅ 2.1 | Web Recovery page | Eng | 2026-09-04 | 2026-09-04 |
✅ 2.3 | Org-wide list (no dealer scope) | Eng | 2026-09-04 | 2026-09-04 | DBL-0032; NO-DEALER must see all
✅ 2.2 | Apply DBL-0031 + DBL-0032 + grant Accounts | Operator | 2026-09-04 | 2026-09-04 | DBL-0032 APPLIED prod; Sanjay has view; other Accounts as needed
⏳ 3.1 | Customer book | - | - | - | Deferred
```

---

## Out of v1

- Customer due / refund KPIs
- Bank UTR matching
- Mobile
- Posting Main/GST/TDS on this page
