# BODYSHOP-RECOVERY-001: Bodyshop Recovery (DO / insurance due only)

**Plan ID:** BODYSHOP-RECOVERY-001  
**Created:** 2026-09-04  
**Last Updated:** 2026-09-04 (filters + More + Post Payment; DBL-0033)  
**Priority:** HIGH  
**Owner:** Bodyshop Team + Platform Team + Accounts  
**Status:** Active (v1 DO-only)  
**Platform:** webversion  
**Category:** bodyshop  
**Ledger:** DBL-0031 (applied); DBL-0032 (APPLIED); DBL-0033 (APPLIED — Recovery DO post); DBL-0034 (APPLIED — export + mismatch)  
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
4. Period is **invoice_date**: year chips, then months after a year is selected. Default **All years**. Insurer dropdown uses card `insurance_company` (not DMS bill-to). No This month / Last month / Custom pills.
5. **More** is a read-only case sheet (customer, policy no, claim no, documents). **Post Payment** opens Stage 18 · DO Payment on this page. Repair Tracker is not required. Customer remaining stays off this page.
6. Grant by named user in Admin → Permissions (`bodyshop_recovery` view). View is enough to list, open More, and post DO Main/GST/TDS. Do **not** add a `BS Recovery` Employee Master business role.
7. **Org-wide visibility.** List, More, and DO post do not use dealer/branch/fuel. Customer posts and invoice/DO capture stay Repair Tracker (`bodyshop_repair` modify + dealer scope).

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
- [x] **Task 2.4:** Period pills + insurer filter; More modal; Post Payment Stage 18 on Recovery (DBL-0033).
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
✅ 2.4 | Period + insurer + More + Post Payment | Eng | 2026-09-04 | 2026-09-04 | DBL-0033; DO only; no Repair Tracker
⏳ 3.1 | Customer book | - | - | - | Deferred
```

---

## Out of v1

- Customer due / refund KPIs and posting (stay on Repair Tracker)
- Bank UTR matching
- Mobile
