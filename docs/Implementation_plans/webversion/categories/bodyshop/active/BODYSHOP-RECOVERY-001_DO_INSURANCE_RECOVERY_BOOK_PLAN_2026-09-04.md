# BODYSHOP-RECOVERY-001: Bodyshop Recovery (DO / insurance due only)

**Plan ID:** BODYSHOP-RECOVERY-001  
**Created:** 2026-09-04  
**Last Updated:** 2026-09-04 (ledger DBL-0031; 20260904160000 is payroll DBL-0030)  
**Priority:** HIGH  
**Owner:** Bodyshop Team + Platform Team + Accounts  
**Status:** Active (v1 DO-only)  
**Platform:** webversion  
**Category:** bodyshop  
**Ledger:** DBL-0031 (PROPOSED)  
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
6. Grant by named user in Admin → Permissions. Do not auto-grant to SA / Floor / Survey. Admin already sees all modules.

```
insurance_due = do_amount − (Main + GST + TDS, not reversed)
```

---

## Implementation Tasks

- [x] **Task 1.1:** Plan + DBL-0031 PROPOSED (DBL-0030 is payroll Add Employee).
- [x] **Task 1.2:** Migration: module row + `list_bodyshop_do_recovery()` + `bodyshop_settlement_can_view` includes `bodyshop_recovery`.
- [x] **Task 1.3:** Paired sql_checks.
- [x] **Task 2.1:** Web page + API + Bodyshop dropdown.
- [ ] **Task 2.2:** Operator apply DBL-0031; grant `bodyshop_recovery` view to Accounts.
- [ ] **Task 3.1:** Customer remaining book (later plan). Not v1.

---

## Activity Tracker

```
✅ 1.1 | Plan + ledger | Eng | 2026-09-04 | 2026-09-04 | DO-only lock
✅ 1.2 | Module + RPC | Eng | 2026-09-04 | 2026-09-04 | DBL-0031 PROPOSED; timestamp 20260904170000
✅ 1.3 | sql_checks | Eng | 2026-09-04 | 2026-09-04 |
✅ 2.1 | Web Recovery page | Eng | 2026-09-04 | 2026-09-04 |
⏳ 2.2 | Apply + grant Accounts | Operator | - | - | Pending
⏳ 3.1 | Customer book | - | - | - | Deferred
```

---

## Out of v1

- Customer due / refund KPIs
- Bank UTR matching
- Mobile
- Posting Main/GST/TDS on this page
