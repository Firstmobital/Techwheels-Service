# BUSY-001: BUSY Accounting Export

**Plan ID:** BUSY-001  
**Created:** 2026-09-10  
**Last Updated:** 2026-09-12  
**Priority:** HIGH  
**Owner:** Accounts + Platform Team  
**Status:** Active (web implemented; GSTIN + ROUND OFF corrections in code; BUSY import pending)  
**Platform:** webversion  
**Category:** operations  
**Reference page:** `/busy`

---

## Executive Summary

Add a web **BUSY** page that reads persisted PV/EV Labour from `public.psf_revenue_dms` (Import → PSF Revenue Report (DMS)) and session-uploaded Parts files, then exports two BUSY workbooks: Party Accounts and Invoice Vouchers. Labour is invoice truth. Parts are GST 5%/18% amounts only.

**Risk Level:** 🟡 MEDIUM  
**Estimated Duration:** 1 working day  
**Rollback Strategy:** Revert `src/lib/busy/`, `src/pages/BusyAccountingPage.tsx`, `src/App.tsx` route/nav/RBAC wiring, and the `public.modules` row `busy`. No Labour table rollback.

---

## Objectives

1. Reuse existing DMS Labour data. Do not add a second Labour upload.
2. Filter eligible invoices: PV `IMBTAI*`, EV `EMBTAI*`, inclusive Labour invoice date range.
3. Resolve branch from `sr_assigned_to`, Party Name, and exact BUSY debtor group strings.
4. Export Party and Invoice XLSX files from ready invoices only.
5. Invoice Voucher rows: always emit `SPARE PARTS @18%` and `LABOUR CHARGES @18%` (including Amount 0). Emit `SPARE PARTS @5%` only when matched Parts data contains a genuine 5% GST line. Always emit a final `ROUND OFF` row. Do not use `eligible × 3` as a row-count rule.
6. Party Account columns are `Party Name`, `Group`, `GSTIN`. Bodyshop (`Account` contains `C/O`) takes Group/GSTIN from the INSU.DATA insurance master, not the branch debtor group. Unmapped insurers are blocked.

---

## Context & Background

Labour columns live on `psf_revenue_dms` (`invoice_number`, `invoice_date`, `job_card_number` from Order #, `first_name`, `last_name`, `account`, `sr_type`, `sr_assigned_to`, `vehicle_registration_number`, `final_labour_amount`, `portal`). Reports treat `final_labour_amount` as GST-inclusive.

Parts persist in `public.busy_parts` (DBL-0044, DBL-0050). Inspected CRM files `Parts - PV.csv` and `Parts - EV.csv` use `Invoice_No` and `Invoice_Date`. Those values are stored for evidence, duplicate detection, and mismatch detection. Labour invoice number/date remain BUSY voucher identity. Parts uploads append new invoices and skip invoices already uploaded for that source type.

---

## Implementation Tasks

### Phase 1: Transformation layer
- [x] **Task 1.1:** Branch, debtor group, Party Name, date, series, Parts GST, aggregation in `src/lib/busy/`.
- [x] **Task 1.2:** XLSX writers for Party and Invoice contracts.
- [x] **Task 1.3:** Party GSTIN column + Bodyshop insurance master (`src/lib/busy/insuranceMaster.ts`, evidence `BUSY-001_INSU.DATA.xlsx`). Unmapped insurers block export.
- [x] **Task 1.4:** Mandatory `ROUND OFF` voucher row using `roundOffToNearestRupee` (half-up paise; exact `.50` → next rupee).

### Phase 2: Page and RBAC
- [x] **Task 2.1:** `/busy` page with date range, Labour status, Parts PV/EV uploads, preview, exports.
- [x] **Task 2.2:** Module `busy`, nav, `ROUTE_MODULE_MAP`, `RequireAccess`.

### Phase 3: Verification
- [x] **Task 3.1:** `scripts/verify_busy_accounting.mjs` (required cases + per-invoice voucher contract: 18% Parts and Labour always; 5% only when a genuine 5% Parts line exists).
- [x] **Task 3.3:** Persist Parts with mandatory `invoice_no`/`invoice_date` from CRM `Invoice_No`/`Invoice_Date`. Labour remains voucher truth.
- [ ] **Task 3.2:** Operator applies DBL-0043, DBL-0044, and grants the module. Real BUSY import not available in this session.

---

## Activity Tracker

```
✅ 1.1 | Transformation layer | Agent | 2026-09-10 | 2026-09-10 | src/lib/busy
✅ 1.2 | XLSX writers | Agent | 2026-09-10 | 2026-09-10 | Qty/Price = 0
✅ 2.1 | BUSY page | Agent | 2026-09-10 | 2026-09-10 | /busy
✅ 2.2 | Module/RBAC | Agent | 2026-09-10 | 2026-09-10 | DBL-0043 PROPOSED
✅ 3.1 | Automated checks | Agent | 2026-09-10 | 2026-09-10 | scripts/verify_busy_accounting.mjs
✅ 3.3 | Persist Parts invoice evidence | Agent | 2026-09-11 | 2026-09-11 | busy_parts / DBL-0044
✅ 1.3 | GSTIN + insurance master | Agent | 2026-09-12 | 2026-09-12 | insuranceMaster.ts
✅ 1.4 | ROUND OFF voucher row | Agent | 2026-09-12 | 2026-09-12 | money.ts / transform.ts
⏳ 3.2 | Apply module + Parts table + BUSY import | Operator | - | - | Pending DBL-0043 and DBL-0044
```

---

## Next actions

1. Apply `supabase/migrations/20260910120000_busy_accounting_module.sql` and `supabase/migrations/20260911120000_busy_parts.sql`, then run paired sql_checks.
2. Grant `busy` in Admin → Permissions (admins already receive every route module).
3. Import a generated workbook into BUSY when the accounting app is available.

---

## Related Documentation

- `docs/shared/reference/MODULE_ROUTE_CONTRACT.md`
- `docs/web/modules/busy/README.md`
- Ledger: DBL-0043, DBL-0044, DBL-0050

**Last Updated:** 2026-09-12  
**Status:** 🟡 IN PROGRESS
