# Bodyshop duplicate / wrong-link fix plan (single plan + tracker, updated 2026-11-17)

Rule: a vehicle may have many cards over time. Each job card number and each invoice number belongs to exactly one live card.

Files
- Whole-system checks (read-only, v2): `scripts/bodyshop_integrity_checks.sql`
- Batch 1 ground-truth check (read-only): `scripts/bodyshop_fix_T1_shared_invoice_check.sql`
- Batch 2 team validation workbook (Excel, 9 cards, extract of 17-Nov-2026): `docs/BODYSHOP_B2_validation_2026-11-17.xlsx`; check SQL `scripts/bodyshop_fix_B2_wrong_vehicle_check.sql`
- Batch 1 team validation workbook (Excel, extract of 17-Nov-2026): `docs/BODYSHOP_B1_validation_2026-11-17.xlsx` (sent to team; tracker B1 = "with team for validation")
- First cleanup draft (not run, ends in ROLLBACK, to be split per batch): `scripts/bodyshop_duplicate_cleanup_2026-11-17.sql`

Nothing in the DB has been changed so far.

## 0. TRACKER (update the Status column after every step)
Status flow: Not started -> Check ready -> Validated by owner -> Pilot (3 rows) -> Batch fixed -> Re-check 0

| # | Batch | Cards | Money? | Status | Notes |
|---|---|---|---|---|---|
| B1 | **ALL 5 SHARED-INVOICE CASES DONE 17-Nov (T1 = 0). Last: owner reversed 1310's Rs 1,670 receipt (line 1068), card 1310 cancelled by `scripts/bodyshop_B1_cancel_1310.sql` (dry run matched, verified); Rs 1,670 stays once on 1302. Hand tasks left: re-upload "1841 TAX INVOICE.PDF" to 1302, Accounts cancel voucher JApp/26-27/1880.** T1 same invoice on 2+ cards | 1024, 1220, 1052, 1103, 441, 458, 1031, 1293, 1302, 1310 (5 invoices) | Yes (1220, 1310) | **In progress.** Invoice 006576 fixed on 1220 by the owner in the app on 17-Nov 14:50 (admin). 4 invoices still shared | 1220 now holds its own invoice EMBTAI2627008001 (DMS: JC 007653, RJ45CX5427, Rs 22,554). New open items: 1024 still shows Rs 22,554 (DMS Rs 13,168) and header DO 21,041; 1220 DO line Rs 17,474 vs DO amount Rs 11,168. 1310 held for B3. **Case 2 (EMBTAI2627006922) DONE 17-Nov: card 1103 cancelled, 1052 kept, dry run matched then real run verified (cancelled cards now 474, 1066, 1103; shared invoices 4 -> 3). Script:** `scripts/bodyshop_B1_pilot_cancel_1103.sql` (cancel 1103, keep 1052). 1103 holds one duplicate survey-approval image (8088.png, 15-Nov) that stays linked to the cancelled card. **Case 441/458 DONE 17-Nov: owner reversed both Rs 13,085 lines (receipt on 458, DO on 441); card 458 cancelled by `scripts/bodyshop_B1_cancel_458.sql` (dry run matched, real run verified). Accounts to post the correct payment on 441.** History: 458's JC is a typo (2626 vs 2627), typed on its reception entry 17-Nov 11:26; 458 now carries a Rs 13,085 customer receipt while 441 carries a Rs 13,085 DO, so money decision first (moved to B3). **Case 1031/1293 DONE by owner 17-Nov 15:38-15:40 and verified: 1031 now JC 007317 + invoice IMBTAI2627007779, Rs 11,129 (matches DMS, reception 9132 JC synced); 1293 amount corrected to Rs 6,000.30 (DMS), Rs 0.30 left unpaid. Summary now: T1 5->1 (only 1302/1310), T2c 3->2, T3 5->4, T3b twin 3->1 / no twin 8->7, T6 1->0, T7 3->2. Still open: Rs 11,129 receipt on 1031 and mechanical row 704 (Accounts); 1031's settlement still stores the old job card text RJ60CH4302 (T14 now 6: 711, 1031, 1122, 1195, 1266, 1271), so changing a card's JC does not update its settlement copy; add a sync.** Earlier note: re-assessed 17-Nov: 1031 is a real September visit, not an extra card; fix = correct JC and invoice on 1031 and 1016 (see table), also clears T3b for 1016 and the 1016/1031 duplicate-placeholder item in B8 |
| B2 | Wrong vehicle: JC/invoice belongs to another vehicle (T2c/T8c) | 461, 486, 1242, 1243 (1220 done in B1) | 461 has Rs 4,300 DO | **Check ready, 4 DIFFERENT VEHICLE cases only (REG TYPO moved to B4 done)** | 461 = Accident reception for RJ45CK9236 but its JC 004107 / invoice 4371 are a **Third Free Service (mechanical)** of RJ18CJ2222 (MEENA, Rs 4,302.99); DO line Rs 4,300 on it. 1242's JC 008719 is also a **Second Free Service** of RJ52CA8657. 486's JC 002980 is an Accident of RJ45CZ8887 (card invoice amount 0 vs DMS Rs 24,146). 1243's JC 008645 belongs to PB22V8437 (other live card 1175 exists for that reg) |
| B3 | Money posted twice / to wrong card (T9, T10, 659, 621) | 983/1109, 1302/1310, 659, 621 vs 561 | Yes | Not started | Needs accounts' bank/UPI check |
| B4 | Registration typos on card (T2a/T8a) | 536, 751, 1047, 1134, 1253 | No | **Re-check 0** (18-Nov-2026) | Owner: DMS reg correct on all 5. Scripts: `bodyshop_B4_pilot_fix_reg_536.sql`, `bodyshop_B4_fix_reg_typos_751_1047_1134_1253.sql` (dry run then real). Updated card + reception + intake photos only. 1253 + 1219 both on 25BH5863Q (two visits). **Hand:** 751 receipt Rs 19,483 vs invoice Rs 13,566 — not changed here |
| B5 | Job card typos / bad format (T3, T16a) | 395, 851, 1301, 1255 (verify), 383, test cards 376, 1076, 1081 | No | Not started | Fix JC to DMS value after uniqueness check |
| B6 | Placeholder with real JC in DMS, no twin (T3b) | 711, 1016, 1074, 1084, 1122, 1141, 1182, 1275 | 1016 has receipts | Not started | Write real JC on the card |
| B7 | Not in DMS / DMS reg AF / bad invoice format (T4, T2b, T16b) | 419, 1148, 1271, 408, 436, 620 | 436 has DO Rs 30,466 | Not started | Manual review per card |
| B8 | Duplicate placeholders (T7, T6) | 1392/1400, 1389/1399, 1016/1031 | No | Not started | Owner decides: double reception or new visit |
| B9 | Money above invoice, LARGE tier (T12c) | 17 cards (list from check 7) | Yes | Not started | Review one by one; small tier last |
| B10 | Settlement/DMS data quality (T13, T14) | 6 / 5 rows | No | Not started | Detail rows not reviewed yet |
| P0 | Root cause: how card 461 got another vehicle's JC/invoice | - | - | **Strong lead (17-Nov)**: each card is created 1:1 from a reception entry (same timestamp). The extra cards in B1 come from a SECOND reception entry for the same vehicle (441/458: 2 days apart, 1052/1103: 7 days, 1302/1310: 1 day, same reception login). Staff then typed the invoice (invoice_source blank) and posted payments on both cards (1310/1302: same Rs 1,670). 461 still needs its own trace | Block a second reception entry/card for a vehicle that already has an open card (P5 first) |
| B11 | **1016 DONE 17-Nov: receipt line 931 (Rs 14,308) reversed, card cancelled (`scripts/bodyshop_B11_reverse_and_cancel_1016.sql`, dry run matched, verified). Still open: mechanical row 704 and Rs 11,129 on card 1031 (Accounts); voucher JApp/26-27/1522 to be re-used or cancelled.** Bodyshop cards created from NON-accident receptions (mechanical visits) | 1016 (has money, see B1), 1170, 1172, 1176, 1216, 1229 (stage 1, no photos/docs/money) | 1016 only | Not started | Found 17-Nov. 6 cards from Second Free Service x2, Paid Service x2, Running Repairs, E Breakdown. Cancel the 5 empty ones after the owner confirms; 1016 after B1 money fix |
| B12 | Same payment recorded in BOTH mechanical accounts and bodyshop | RJ60CH4302 (mech row 704: Rs 14,308 received on a Rs 3,179.50 bill) | Yes | Not started | Add a cross-module check: mechanical rows where amount_received > billed_amount, and receipts on both sides for one reception |
| P1-P6 | Prevention (section 4) | - | - | Not started | Guards go in after cleanup |

## 1. Why start with B1 (recommendation)
- It is exactly the issue raised: one invoice number on more than one card.
- Only 5 invoices / 10 cards, so every case can be checked by hand.
- DMS gives a clear ground truth for each invoice (JC, registration, customer, amount).
- It clears 5 of the 11 T3b placeholder cases and prepares the unique invoice rule.
- Money is touched on only two cards (1220 and 1310), and 1310 is held back for B3.
- B2 (card 461) follows immediately after.

## 2. B1 ground truth (read-only results, 2026-11-17)
Run `scripts/bodyshop_fix_T1_shared_invoice_check.sql` (3 queries). Rows below are what the check returned; verify each against what you know of the vehicle.

| Invoice | Card | JC | Reg | Customer | Stage | DMS says for this invoice | Money on card | Suggested |
|---|---|---|---|---|---|---|---|---|
| EMBTAI2627006576 | 1024 | ...JP2-006465 | RJ21CD5427 | Anil Poonia | 18 | JC 006465, RJ21CD5427, ANIL POONIA, Rs 13,168 (SBI General) | receipt Rs 2,000 | KEEP the card. Its amount Rs 22,554 equals 1220's real invoice amount, so the two cards' billing figures look crossed: confirm 1024's amount, DO (header Rs 21,041) and customer diff (Rs 1,513) |
| EMBTAI2627006576 | 1220 | ...JP2-007653 | RJ45CX5427 | Kamal Sharma | 9 | (not this vehicle) | DO Rs 17,474 | DONE by owner 17-Nov 14:50: invoice changed to EMBTAI2627008001, amount Rs 22,554, matches DMS for this vehicle. Do NOT reverse the Rs 17,474 line automatically: it conflicts with DO amount Rs 11,168 now saved; team to say which DO is right |
| EMBTAI2627006922 | 1052 | ...JP2-006651 | RJ59CC5968 | charu tanwar | 18 | matches | DO Rs 63,120.02 | KEEP |
| EMBTAI2627006922 | 1103 | RJ59CC5968 (placeholder) | RJ59CC5968 | charu tanwar | 18 | JC 006651 | none | CANCEL |
| IMBTAI2627004773 | 441 | ...JP1-2627-004108 | 23BH8801F | URVASHI | 18 | matches | DO Rs 13,085 | KEEP |
| IMBTAI2627004773 | 458 | ...JP1-2626-004108 | 23BH8801F | URVASHI | 18 | JC ...2627-004108 | **UPDATE 17-Nov 15:00: customer receipt Rs 13,085 (ref "ID : 47222", dated 14-Jul) posted on 458 by divyasharma21360.** 441 already holds an insurance DO line of Rs 13,085 (27-Sep). Same Rs 13,085 bill now shown as paid twice | DO NOT CANCEL yet. Accounts decides who really paid (customer or insurer); then keep 441, reverse the wrong line, post the real one on 441, then cancel 458 |
| IMBTAI2627009463 | 1293 | ...JP1-009095 | RJ60CH4302 | RAJPUT (DMS: VISHNU RAJPUT) | 9 | matches | receipts Rs 6,000 | KEEP |
| IMBTAI2627009463 | 1031 | RJ60CH4302 (placeholder) | RJ60CH4302 | RAJPUT RAJPUT | 18 | JC 009095 | none | **CHANGED 17-Nov: DO NOT CANCEL. 1031 is a real separate visit (Accident, reception 9132, 19-Sep; estimate doc, survey approval, floor assignment 20-Sep, photo). Vehicle RJ60CH4302 has 3 DMS invoices: 7680 (18-Sep, JC 007304, Rs 3,179.50), 7779 (21-Sep, JC 007317, Rs 11,129), 9463 (27-Oct, JC 009095, Rs 6,000.30). Likely fix: 1031 gets JC 007317 + invoice 7779; 1016 is a MECHANICAL visit (reception 9025 = Second Free Service; DMS sr_type Second Free Service, invoice 7680, JC 007304, Rs 3,179.50) wrongly turned into a bodyshop card: remove invoice 7779 from it and cancel it after the money is fixed; 1293 keeps 9463. The Rs 14,308 customer payment is recorded TWICE: bodyshop receipt on 1016 AND mechanical accounts row 704 (billed Rs 3,179.50, received Rs 14,308, note "VEHICLE AT BODYSHOP"). It should be Rs 3,179.50 on the mechanical invoice and Rs 11,129 on bodyshop card 1031. Accounts to correct both modules. Replaces the earlier "cancel 1031" suggestion** |
| IMBTAI2627009714 | 1302 | ...JP1-009050 | RJ45CM1841 | Atul Singh Kushwah | 18 | matches | receipt Rs 1,670 | KEEP |
| IMBTAI2627009714 | 1310 | RJ45CM1841 (placeholder) | RJ45CM1841 | Atul Singh Kushwah | 11 | JC 009050 | receipt Rs 1,670 | **Assessed 17-Nov: duplicate card. DMS has ONE invoice/ONE job card for this vehicle (Accident, 31-Oct). 1302 is the real card (11 docs, floor assignment, role logs, QC). 1310 = second reception next day (29-Oct), stage 11, no work. Customer owes exactly Rs 1,670 (invoice 36,039 - DO 34,369), yet BOTH cards hold a Rs 1,670 receipt dated 2-Nov: 1310 line 1068 (UPI ref T2611021837059655807957, voucher JApp/26-27/1880, posted 2-Nov 18:38) and 1302 line 1080 (ref 400714, voucher 1966, posted 5-Nov 10:13) = one payment entered twice. Accounts to check the bank/UPI statement for the real reference. Then: reverse the duplicate line(s) so Rs 1,670 stays ONCE on 1302, cancel 1310, re-upload "1841 TAX INVOICE.PDF" (only on 1310) to 1302, cancel the extra voucher in the books** |

Things to confirm before fixing (these came out of the check, not assumptions):
- **458 was moved from stage 15 to 18 today at 11:28 by a user** (history row, source "reconcile"). Someone worked on 458 today. It has 14 intake photos against 441's 11. Confirm 458 really is the extra card and not the one the staff now uses. If it is the working card, the better fix is to keep 458 and correct its JC to ...2627-004108 only after cancelling 441, but 441 carries the Rs 13,085 DO, so the safe default stays: keep 441, cancel 458.
- **1031 is a September placeholder** (created 19-Sep, same registration as 1016 created 18-Sep). It picked up the October invoice 9463, which belongs to 1293. Confirm 1031 is not a separate real September visit.
- **1024's invoice amount is Rs 22,554 but DMS says Rs 13,168.** That is a T13 difference, not part of the shared-invoice fix. The Rs 13,168 amount was copied onto 1220 from DMS.
- **1310 and 1302 hold a Rs 1,670 receipt each.** 1310's was posted 2-Nov (voucher JApp/26-27/1880, ref T2611021837...), 1302's on 5-Nov by a different user (voucher 1966, ref 400714), both dated 2-Nov. Accounts must check the bank/UPI statement. 1310 stays untouched until then.
- Cancelled cards keep their intake photos and history; nothing is deleted.

B1 fix steps once you confirm (script already drafted for the first five):
1. 1220: invoice already corrected by the owner. Remaining: decide DO line 1011 (Rs 17,474) against the saved DO amount Rs 11,168. Also 1024: fix amount/DO if the team confirms they came from 1220.
2. Cancel 458, 1103, 1031 (no money lines on any of them).
3. 1310: wait for B3.
Pilot = 1103, 458, 1220 (3 cards). Then re-run the check: expected shared-invoice count 5 -> 1 (only IMBTAI2627009714 until B3).

## 3. Findings behind the other batches (from detail output)
### Wrong vehicle (10 cards) - B2 and B4
- Registration typed wrong, JC and invoice right (5): 536, 751, 1047, 1134, 1253 (e.g. RJO6CG4442 with a letter O). Correct the registration after checking the reception photo or RC. Do not cancel.
- JC/invoice really another vehicle (5): 461 (RJ18CJ2222 / MEENA, DO Rs 4,300), 1220 (B1), 486 (stage 18, no money, invoice amount 0 vs DMS Rs 24,146), 1242 and 1243 (stage 9, JC belongs to RJ52CA8657 and PB22V8437; they need the correct JC, not a cancel).
### Money (B3)
- Ref 43869: Rs 2,116 on cards 983 and 1109 (RJ60CG3120), same date 30-Sep, vouchers 1514 and 1512. Card 1109 has DO 14,017 + receipts 2,116 = 16,133 against invoice 15,314.
- Rs 1,670 on 1302 and 1310 (above).
- Card 659: DO Rs 219,260 and receipts Rs 224,900 against one Rs 224,866 invoice, looks counted twice.
- Card 621: receipts Rs 19,487 against own invoice Rs 6,982; card 561 has an invoice of exactly Rs 19,487. Possible receipt on the wrong card.
- Card 761 repeats ref 662710876805 (9,000 and 2,000) on the same card, probably a split payment.
- T9 false positives (DISCOUNT, BY TRANSFER narrations) are now excluded.
### Job card problems (B5, B6)
- T3 typos: 395 (JP1-002619 vs DMS JP2-002919), 851 (extra digit), 1301 (JP2 vs JP1), 1255 (different number, verify), 458 (B1).
- Format: 376, 1076, 1081 test cards (invoice "test01" on 1081), 383 `JC-MBTPIT-...` (typo of PLT), 851.
- T3b no twin: 711, 1016, 1074, 1084, 1122, 1141, 1182, 1275. 1016 has receipts Rs 14,308 dated 12-Sep, before the card was created on 18-Sep, against invoice Rs 11,129.
### Not in DMS / unverifiable (B7)
- 419, 1148, 1271 (invoice MAT878027SAH74202), and DMS reg "AF" on 408, 436, 620. Card 436 has DO Rs 30,466 on an invoice amount of 0.
### Duplicate placeholders (B8)
- 1392/1400 (RJ49CB1632) and 1389/1399 (RJ60CK8118): stage 1, no history, money or photos.
### Money above invoice (B9)
- 3 rounding, 24 small, 17 large. Large: 420, 436, 476, 498, 566, 621, 659, 707, 751, 760, 764, 852, 864, 986, 1016, 1126, 1220.
### Checks SQL v2 summary counts
T1 5 | T2a 4 | T2b 3 | T2c 3 | T3 5 | T3b twin 3 / no twin 8 | T4 4 | T5 0 | T6 1 | T7 3 | T8a 5 | T8c 4 | T9 1 | T10 2 | T11 12 | T12 3/24/17 | T13 6 | T14 5 | T15 0 | T16a 5 | T16b 2 | T17 1.

## 4. Preventing it again (build after cleanup; each is a separate DB change with a ledger entry)
Recommended order and why:
- **P0 Find the root cause first.** Trace how card 461 ended up with another vehicle's JC and invoice (card creation, job card entry, "Use DMS invoice" button). Guards below are only as good as this answer.
- **P1 Unique real job card number** on live cards (partial unique index, placeholders excluded). Hard stop at the database. Safe once T5/T6/B5 are clean.
- **P2 Unique invoice number across live cards.** The settlements table has no card status, so use a trigger on settlements (reject when another live card already holds the invoice) rather than an index.
- **P3 Invoice must belong to this vehicle.** In the save-billing function, compare the invoice's DMS registration with the card's registration and reject a mismatch with the message "this invoice belongs to RJxxxx in DMS". Run in warn-only mode for a week, then block. Allow an override with a manager's reason, which is logged.
- **P4 Duplicate payments.** When adding a receipt, reject the same non-generic payment reference already live on another card, and warn on same registration + date + amount.
- **P5 No second open card for a vehicle that has no real JC yet.** At reception, block creating another card while an earlier card for that registration is still a placeholder and not delivered. Repeat visits stay allowed.
- **P6 Format guard.** CHECK constraints (added NOT VALID so they apply to new and edited rows only) for job card format and invoice format.
- **P7 Monitoring.** Save the v2 summary as a database view and run it daily; alert when any count rises above the agreed baseline. This also catches anything the guards miss.
- **P8 Only accident receptions become bodyshop cards.** Today 917 cards come from "Accident" and 6 from other service types (Second Free Service, Paid Service, Running Repairs, E Breakdown). Block (or require a manager reason for) creating a bodyshop card from any non-accident reception entry.
- **P9 One payment, one module.** When a payment is posted in bodyshop for a reception that already has a mechanical accounts payment (or the reverse), warn and show the other entry.
Guard rollout: P1/P6 after B5, P2 after B1/B3, P3 and P4 in warn mode first, P5 after B8.

## 5. Per-batch procedure
1. Run the batch's check query; owner validates every row against ground truth.
2. Mark the tracker "Validated".
3. For each guarded `DO $$` fix script: **dry run then real run** (`dry_run := true` then `false`, or `./scripts/run_bodyshop_guarded_fix.sh scripts/your_fix.sql`). Pilot one card first when the batch calls for it; otherwise fix the batch after pilot re-check.
4. Re-run the summary: that type drops by the expected count, nothing else rises.
5. Fix the rest in batches of at most 20; each step stops if the card no longer matches the audit.
6. Re-run the summary, set tracker to "Re-check 0", log the batch in the DB change ledger.

Money is undone with reversal lines, never deletes; wrong cards are cancelled, not deleted.
