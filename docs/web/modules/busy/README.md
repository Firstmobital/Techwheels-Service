# BUSY Accounting

Web page `/busy` (module `busy`) exports BUSY Party Accounts and Invoice Vouchers.

Labour source: `public.psf_revenue_dms` already imported on `/import` (PSF Revenue Report (DMS)). Parts PV/EV files are parsed in the browser and are not stored.

Invoice Voucher rows are generated per eligible Labour invoice:

- Always emit `SPARE PARTS @18%` and `LABOUR CHARGES @18%`, including Amount 0.
- Emit `SPARE PARTS @5%` only when matched Parts data contains a genuine 5% GST line item. Do not emit it merely because the calculated 5% amount is 0.
- Order when 5% exists: 5% Parts, 18% Parts, Labour. Otherwise: 18% Parts, Labour.

Do not assume `voucher rows = eligible invoices × 3`.

Transformation authority: `src/lib/busy/`.
Implementation plan: `docs/Implementation_plans/webversion/categories/operations/active/BUSY-001_BUSY_ACCOUNTING_EXPORT_PLAN_2026-09-10.md`.
