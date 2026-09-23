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
| `account_name` | `Account_Name` (or `Account`). Trimmed source text. Null on rows imported before DBL-0083 |
| `account_code` | Leading token of `Account_Name` before the first `-`, uppercased. Example: `3000080-Sv&Pa-Akarbdyshp-AkfPlt` and `3000080-Sv&Pa-Jaipur-AkfPlt` both store `3000080` |

`Part #` and `Quantity` are used only to build `source_row_key`. They are not stored.

Parts `invoice_no` and `invoice_date` are source evidence for traceability, reconciliation, validation, and mismatch detection. They never override Labour invoice number or date on a Labour-backed BUSY voucher. A Job Card mismatch is stored in `busy_parts` and surfaced as a warning.

A Parts invoice with no Labour row is exported only when every line shares one `account_code` present in `public.busy_parts_account_master` (DBL-0083). Party Name, GSTIN, and Group come from that row. Labour amount is 0. Parts 5%/18% aggregation, Round Off, and Series stay on the existing rules. Series is still bill-no only. Unmapped unmatched Parts lines stay unmatched. A Labour row for the same job card keeps the ordinary customer/PDI/Bodyshop path even if the Parts account code is mapped. Re-uploading an invoice that is already stored does not insert another amount row; it may fill `account_name` / `account_code` on the existing `source_row_key`. Admin insert/update of the dealer master is on `/busy`, same pattern as the Bodyshop Group of Account card. There is no delete action.

Invoice Voucher columns are `Bill date`, `bill no`, `Party Name`, `Item Name`, `Qty`, `Price`, `Amount`, `naration`, `Series`. `Series` is derived only from bill no: `IMBTAI*` → `PV-S 26-27`, `EMBTAI*` → `EV-S 26-27`, and is repeated on every voucher line of that invoice including `Rounded Off (+)`.

Invoice Voucher rows are generated per eligible Labour invoice:

- Always emit `SPARE PARTS @18%` and `LABOUR CHARGES @18%`, including Amount 0.
- Emit `SPARE PARTS @5%` only when matched Parts data contains a genuine 5% GST line item. Do not emit it merely because the calculated 5% amount is 0.
- Emit a final `Rounded Off (+)` row (exact BUSY account name) only when labour + Parts inclusive subtotal has a non-zero decimal part. Amount is nearest whole rupee minus that subtotal, rounded to 2 decimals with the existing half-up paise helper (`Math.round`). Exact `.50` goes to the next rupee. A whole-rupee subtotal does not emit this row.
- Order without 5%: 18% Parts, Labour, then `Rounded Off (+)` only if needed. Order with 5%: 5% Parts, 18% Parts, Labour, then `Rounded Off (+)` only if needed.

Party Account columns are `Party Name`, `Group`, `GSTIN`. Parties with classification `Dealer` (the Parts dealer/account master) are omitted from that export. Invoice Vouchers still include them. Exclusion is by classification, not by Group text such as `DEALER TRANSFER` or `sundry Creditors`.

- Normal: branch debtor group; GSTIN only if an authoritative Labour/DMS GSTIN exists (`psf_revenue_dms` currently has no GSTIN column, so this stays blank).
- PDI: Party `CASH AT SITAPURA`, Sitapura debtor group, GSTIN blank unless an authoritative source GSTIN exists.
- Bodyshop (`Account` contains `C/O`): Party Name remains first two words before `C/O` plus everything after `C/O`. Group and GSTIN come from `public.busy_insurance_master` (DBL-0067), maintained by admin on `/busy`. Matching logic stays in `src/lib/busy/insuranceMaster.ts`. Do not use the branch debtor group. Unmapped insurers are blocked and shown in validation. The original INSU.DATA rows are the seed/fallback only. This is not the planned SA Settings catalog (BODYSHOP-INSURER-001 / DBL-0042).

Do not assume `voucher rows = eligible invoices × 3`.

Transformation authority: `src/lib/busy/`.
Implementation plan: `docs/Implementation_plans/webversion/categories/operations/active/BUSY-001_BUSY_ACCOUNTING_EXPORT_PLAN_2026-09-10.md`.
