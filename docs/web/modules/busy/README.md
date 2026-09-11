# BUSY Accounting

Web page `/busy` (module `busy`) exports BUSY Party Accounts and Invoice Vouchers.

Labour source: `public.psf_revenue_dms` already imported on `/import` (PSF Revenue Report (DMS)).

Parts PV/EV files uploaded on `/busy` are persisted in `public.busy_parts` (ledger DBL-0044, DBL-0050). Uploads are append-only. An invoice already stored for the same `source_type` + `Invoice_No` + `Invoice_Date` is skipped as a group; new invoices insert every Parts line. Uploading PV does not delete EV, and neither upload truncates historical Parts data.

Exact CRM columns inspected from `Parts - PV.csv` and `Parts - EV.csv`:

| Persisted field | CRM source column |
| --- | --- |
| `invoice_no` | `Invoice_No` |
| `invoice_date` | `Invoice_Date` |
| `job_card_no` | `Job Card_No` |
| `net_amount` | `Net_Amount` |
| `gst_rate` | `CGST Classification` + `SGST Classification` (or `IGST Classification` / `Tax Amount` ÷ `Net_Amount`) |
| `source_type` | Upload slot `PV` / `EV` (not a CRM column) |

`Part #` and `Quantity` are used only to build `source_row_key`. They are not stored.

Parts `invoice_no` and `invoice_date` are source evidence for traceability, reconciliation, validation, and mismatch detection. They never override Labour invoice number or date on BUSY vouchers. A Job Card mismatch is stored in `busy_parts` and surfaced as a warning.

Invoice Voucher rows are generated per eligible Labour invoice:

- Always emit `SPARE PARTS @18%` and `LABOUR CHARGES @18%`, including Amount 0.
- Emit `SPARE PARTS @5%` only when matched Parts data contains a genuine 5% GST line item. Do not emit it merely because the calculated 5% amount is 0.
- Order when 5% exists: 5% Parts, 18% Parts, Labour. Otherwise: 18% Parts, Labour.

Do not assume `voucher rows = eligible invoices × 3`.

Transformation authority: `src/lib/busy/`.
Implementation plan: `docs/Implementation_plans/webversion/categories/operations/active/BUSY-001_BUSY_ACCOUNTING_EXPORT_PLAN_2026-09-10.md`.
