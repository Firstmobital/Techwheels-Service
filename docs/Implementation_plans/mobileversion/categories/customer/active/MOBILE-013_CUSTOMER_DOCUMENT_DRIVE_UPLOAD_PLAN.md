# Implementation Plan: MOBILE-013

**Plan ID:** MOBILE-013  
**Created:** 2026-09-25  
**Priority:** HIGH  
**Owner:** Mobile Team + Platform  

---

## Executive Summary

Login as Customer can attach claim documents on the Documents tab, but those files stay on the phone. The workshop bodyshop screen already stages files in the `autodoc` bucket, upserts one `bodyshop_repair_card_documents` row per `(repair_card_id, doc_key)`, then calls `universal-drive-upload` so `drive_url` and `drive_file_id` are written back.

This plan puts the customer app on that same sequence. The phone keeps talking only to `customer-portal-upload` with the customer session token. That function, after the row exists, calls `universal-drive-upload` with the service role. A slot counts as submitted only when `drive_url` is set.

**Risk Level:** 🟡 MEDIUM  
**Estimated Duration:** 2–3 working days  
**Rollback Strategy:** Redeploy the previous `customer-portal-upload` bundle. Customer screens fall back to showing server rows only; local AsyncStorage drafts are ignored for progress. No schema change in this plan, so no SQL rollback.

---

## Objectives

1. Every customer claim file follows storage staging, metadata upsert, then `universal-drive-upload` with `resource_type: 'bodyshop_document'`.
2. The Documents tab and the home remaining-documents card use server rows with `drive_url` as the submitted state.
3. Customer catalog matches the dump’s `doc_key` check, one file per key, excluding workshop-only keys.
4. Drive failure leaves the staged row, does not flip the repair-card `doc_*` flag, and can be retried without picking the file again.

---

## Context & Background

Audit date: 2026-09-25. DB authority: `supabase/backups/full_metadata.sql`.

**What staff already do** (`src/pages/BodyshopRepairPage.tsx`):

1. Upload the object to bucket `autodoc`.
2. Upsert `bodyshop_repair_card_documents` on conflict `(repair_card_id, doc_key)`.
3. `POST /functions/v1/universal-drive-upload` with `resource_type: 'bodyshop_document'`, `resource_id` = row id, `bucket_id: 'autodoc'`, `object_name`, `file_type` = `doc_key`.
4. The function downloads the object, writes it under the Techwheels Drive root in the registration folder, and updates `drive_url` and `drive_file_id` on that row. A later upload of the same row replaces the Drive file when `drive_file_id` is already set.
5. Outcome is logged in `pending_drive_uploads`.

There is no trigger on `bodyshop_repair_card_documents` that calls Drive. The caller must invoke the function after the row exists. Column comments on `drive_url` / `drive_file_id` describe that offload. Unique index: `ux_bodyshop_repair_card_documents_card_doc_key`.

**What Login as Customer does today:**

| Surface | Behavior |
|---|---|
| `mobile/src/app/(customer)/documents.tsx` | Camera, gallery, and PDF save a local URI in AsyncStorage key `claim_docs_<reg>`. No network upload. |
| `mobile/src/lib/customer/claimDocumentProgress.ts` and `RemainingDocumentsCard` | Home progress counts those local URIs as submitted. |
| `mobile/src/lib/api/customerBodyshopUploads.ts` | Unused client for `customer-portal-upload` (`create_ticket`, signed upload, `complete_upload`, `list_assets`). |
| `supabase/functions/customer-portal-upload/index.ts` `complete_upload` | Inserts the storage object and a document or intake-photo row. Does not call `universal-drive-upload`. Insert (not upsert) conflicts with the unique index on a second upload of the same key. Sets the repair-card `doc_*` flag before any Drive URL exists. |
| Complaint, booking, feedback, helpdesk, invoices, gate pass, tracker, estimate | No customer file upload. Estimate and tracker only open workshop documents. |

Customers authenticate with the custom session token from MOBILE-011 (`customer_get_repair_card`, `customer_get_active_job`). They do not have a staff Supabase user JWT. The phone must not call `universal-drive-upload` directly and must not hold the service role key.

**Catalog mismatch:**

- Dump check `bodyshop_repair_card_documents_doc_key_check` allows: `doc_claim_form`, `doc_rc`, `doc_insurance`, `doc_dl`, `doc_aadhaar`, `doc_pan`, `doc_kyc`, `doc_gst`, `doc_company_pan`, `doc_bank_detail`, `doc_estimate`, `doc_survey_approval`.
- `universal-drive-upload` `BODYSHOP_DOC_KEYS` is that list without `doc_estimate` and `doc_survey_approval`.
- The customer screen splits Driving Licence and Aadhaar into front and back slots that share one `doc_key`. The unique index can store one file per key. Staff already uses one file per key.
- `doc_tp_affidavit` is on the customer screen and in the broker allow-list. It is not in the dump check and not in `BODYSHOP_DOC_KEYS`.

---

## Target contract

Customer-visible success means the row’s `drive_url` is set. A file that exists only on the phone or only in Storage is pending.

```
Documents tab
  -> customer-portal-upload create_ticket   (anon key + session_token)
  -> signed PUT to autodoc
  -> customer-portal-upload complete_upload
       -> upsert bodyshop_repair_card_documents on (repair_card_id, doc_key)
       -> universal-drive-upload
            resource_type: bodyshop_document
            resource_id:   upserted row id
            bucket_id:     autodoc
            object_name:   storage path
            file_type:     doc_key
            Authorization: Bearer service role
       -> set bodyshop_repair_cards.doc_<key> = true only after drive_url is saved
  -> response includes drive_url
```

`list_assets` already prefers `drive_url` over a short-lived storage signed URL. After this plan, View uses that Drive link.

`retry_drive` on the same broker re-invokes `universal-drive-upload` with the existing row id and `storage_path`. The customer does not pick the file again.

Allowed customer `doc_key` values (must match the dump check, `BODYSHOP_DOC_KEYS`, and the broker allow-list):

| doc_key | Customer slot | Required when |
|---|---|---|
| `doc_claim_form` | Signed insurance claim form | Insurance claim |
| `doc_rc` | RC | Insurance claim |
| `doc_insurance` | Insurance policy | Insurance claim |
| `doc_dl` | Driving licence (front and back in one photo or one PDF) | Insurance claim |
| `doc_aadhaar` | Aadhaar (front and back in one photo or one PDF) | Insurance claim |
| `doc_pan` | PAN | Insurance claim |
| `doc_kyc` | KYC | Optional |
| `doc_bank_detail` | Bank proof | Optional |
| `doc_gst` | GST certificate | Insurance claim and firm/company card |
| `doc_company_pan` | Company PAN | Insurance claim and firm/company card |

Out of the customer upload allow-list:

- `doc_estimate` and `doc_survey_approval` stay workshop uploads. The customer app keeps viewing the estimate through `customer_get_bodyshop_document`.
- `doc_tp_affidavit` stays out until one migration adds it to the check constraint, `BODYSHOP_DOC_KEYS`, and the broker allow-list together. This plan does not add that migration.

Claim mode and ownership come from the repair card (`claimModeFromRepairCard`, `ownershipFromRepairCard` in `mobile/src/lib/customer/customerClaimDocuments.ts`). Cash repairs show no upload list. Firm slots appear only when `customer_type` is firm or company.

Storage path stays the broker’s existing prefix: `{dealerCode}/customer-portal/{repairCardId}/document/{docKey}/{timestamp}_{uuid}_{fileName}`. Bucket stays `autodoc`. Max size stays 15 MB.

Do not write customer claim files into the autodoc `documents` table. That table is the job-card path (`resource_type: 'document'`).

---

## Implementation Tasks

### Phase 1: Broker finishes the staff sequence
- [x] **Task 1.1:** In `supabase/functions/customer-portal-upload/index.ts`, change document `complete_upload` from insert to upsert on `(repair_card_id, doc_key)`, returning `id`. Keep dealer, reception, registration, storage, file, and `uploaded_by` (`customer:<phone>`) fields aligned with the staff upsert.
- [x] **Task 1.2:** After the upsert, call `universal-drive-upload` from the function with the service-role bearer, `resource_type: 'bodyshop_document'`, `resource_id`, `bucket_id: 'autodoc'`, `object_name`, and `file_type` = `doc_key`.
- [x] **Task 1.3:** Set `bodyshop_repair_cards[doc_key] = true` only after the Drive call returns `drive_url`. On Drive failure, leave the flag false, keep the staged object and row, and return a pending payload (`ok: false` or `drive_pending: true` plus `resource_id`) the app can retry.
- [x] **Task 1.4:** Add action `retry_drive` for an existing document row owned by the resolved repair card. Re-call `universal-drive-upload` with the stored path. On success, set the `doc_*` flag.
- [x] **Task 1.5:** Narrow the broker document allow-list to the nine customer keys in the target contract. Remove `doc_tp_affidavit`.
- [x] **Task 1.6:** Add `supabase/config.toml` entries: `customer-portal-upload` `verify_jwt = false` (session token in the body, same as the function comment); `universal-drive-upload` `verify_jwt = true` so the anon key alone cannot invoke Drive offload. Confirm the deployed function matches before release.

### Phase 2: One customer catalog
- [x] **Task 2.1:** Make `mobile/src/lib/customer/customerClaimDocuments.ts` the only slot list: one entry per `doc_key` in the table above, with firm and optional conditions. Remove front/back slot ids.
- [x] **Task 2.2:** Stop exporting a second slot list from `mobile/src/app/(customer)/documents.tsx`. Point `claimDocumentProgress.ts` at the shared catalog.

### Phase 3: Documents tab uses the broker
- [x] **Task 3.1:** Wire camera, gallery, and PDF through `customerUploadBodyshopAsset` (`mobile/src/lib/api/customerBodyshopUploads.ts`). Extend that helper to surface `drive_url` and the pending/retry result from `complete_upload`.
- [x] **Task 3.2:** Load existing files with `customerListBodyshopAssets`. Show submitted only when `view_url` / `drive_url` is present. Show a retry action when the row exists and Drive is still pending.
- [x] **Task 3.3:** Replace uses the same `complete_upload` upsert. Remove is a local clear only until a server delete exists; do not pretend a local delete removed the workshop file. If the row exists on the server, keep showing it.
- [x] **Task 3.4:** Read claim mode and ownership from the repair card returned for the selected registration. Remove the phone toggles as the source of which slots are required.

### Phase 4: Home progress matches the server
- [x] **Task 4.1:** Change `loadClaimDocumentProgress` so `RemainingDocumentsCard` counts mandatory keys that have a Drive URL from `list_assets`. AsyncStorage may hold an in-flight local URI only. It must not increment `uploadedCount`.
- [x] **Task 4.2:** Home (`mobile/src/app/(customer)/index.tsx`) keeps using `RemainingDocumentsCard`. No second progress formula.

### Phase 5: Staff recovery alignment (after customer path is live)
- [x] **Task 5.1:** When staff bodyshop Drive sync fails, record it through the existing `pending_drive_uploads` path and retry with the same `resource_id`. Do not add a second uploader.
- [x] **Task 5.2:** Leave `doc_estimate` and `doc_survey_approval` on the staff screen. Add them to `BODYSHOP_DOC_KEYS` only if those staff uploads must offload too. Do not open them to the customer broker.

---

## Activity Tracker

> **Update this section in real-time as work progresses.**

### Legend
- ✅ COMPLETED
- 🔄 IN PROGRESS
- ⏳ PENDING
- ❌ BLOCKED

### Phase 1
```
✅ 1.1 | Upsert bodyshop document on complete_upload | Mobile + Platform | 2026-09-25 | 2026-09-25 | customer-portal-upload
✅ 1.2 | Service-role call to universal-drive-upload | Mobile + Platform | 2026-09-25 | 2026-09-25 | customer-portal-upload
✅ 1.3 | Flip doc_* flag only after drive_url | Mobile + Platform | 2026-09-25 | 2026-09-25 | flag stays false on pending
✅ 1.4 | retry_drive action | Mobile + Platform | 2026-09-25 | 2026-09-25 | customer-portal-upload
✅ 1.5 | Allow-list matches dump customer keys | Mobile + Platform | 2026-09-25 | 2026-09-25 | doc_tp_affidavit removed
✅ 1.6 | config.toml verify_jwt for both functions | Mobile + Platform | 2026-09-25 | 2026-09-25 | Deploy still required
```

### Phase 2
```
✅ 2.1 | Single doc_key catalog | Mobile | 2026-09-25 | 2026-09-25 | customerClaimDocuments.ts
✅ 2.2 | Progress helper uses that catalog | Mobile | 2026-09-25 | 2026-09-25 | claimDocumentProgress.ts
```

### Phase 3
```
✅ 3.1 | Documents tab calls customerUploadBodyshopAsset | Mobile | 2026-09-25 | 2026-09-25 | documents.tsx
✅ 3.2 | List assets; submitted means drive_url | Mobile | 2026-09-25 | 2026-09-25 | documents.tsx
✅ 3.3 | Replace via upsert; server row survives local remove | Mobile | 2026-09-25 | 2026-09-25 | no local delete
✅ 3.4 | Claim mode and ownership from repair card | Mobile | 2026-09-25 | 2026-09-25 | documents.tsx
```

### Phase 4
```
✅ 4.1 | Home card ignores AsyncStorage submitted count | Mobile | 2026-09-25 | 2026-09-25 | list_assets drive_url
✅ 4.2 | index.tsx keeps RemainingDocumentsCard only | Mobile | 2026-09-25 | 2026-09-25 | unchanged call site
```

### Phase 5
```
✅ 5.1 | Staff Drive failure uses pending_drive_uploads retry | Platform | 2026-09-25 | 2026-09-25 | one retry; function logs drive_failed
✅ 5.2 | Workshop-only keys stay off the customer allow-list | Platform | 2026-09-25 | 2026-09-25 | added to BODYSHOP_DOC_KEYS only
```

---

## Dependencies & Prerequisites

- [x] `universal-drive-upload` already implements `resource_type: 'bodyshop_document'` and writes `drive_url` / `drive_file_id` (DRIVE-001 and later bodyshop resource types).
- [x] `bodyshop_repair_card_documents` and the unique `(repair_card_id, doc_key)` index exist in `supabase/backups/full_metadata.sql`.
- [x] Customer session RPCs `customer_get_repair_card` and `customer_get_active_job` exist (MOBILE-011).
- [ ] Deployed `universal-drive-upload` accepts the service-role JWT (`verify_jwt = true`). Confirm before Phase 1 ships.
- [ ] Active bodyshop repair card for the test registration, with `dealer_code` resolvable the way `resolveContext` already does.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Drive call fails after the object is stored | Medium | Medium | Keep the row, leave `doc_*` false, return pending, retry with `retry_drive` |
| Second upload hits the unique index | High if insert remains | High | Upsert on `(repair_card_id, doc_key)` before any UI ships |
| `verify_jwt` left false on `universal-drive-upload` | Medium | High | Set it true in `config.toml` and confirm the deploy. Only the broker sends the service role |
| Front/back UI shipped against one row per key | High if catalog is not collapsed | Medium | Phase 2 before Phase 3 UI work |
| Repair-card flag marks a doc done with no Drive URL | Medium | High | Update the flag only after `drive_url` is saved |
| Customer session cannot resolve dealer code | Low | High | Keep the existing broker error. Do not invent a dealer code on the phone |

---

## Success Criteria

- ✅ Picking a claim document while logged in as a customer creates or updates one `bodyshop_repair_card_documents` row and that row has `drive_url` and `drive_file_id`.
- ✅ The repair-card boolean for that `doc_key` is true only after that URL exists.
- ✅ Replacing the same key updates the same row and replaces the Drive file.
- ✅ Documents tab and home card show the slot as submitted only when `list_assets` returns a Drive URL.
- ✅ A Drive failure does not show submitted and can be retried from the same screen.
- ✅ `doc_estimate`, `doc_survey_approval`, and `doc_tp_affidavit` cannot be uploaded from the customer broker.
- ✅ The customer app binary does not call `universal-drive-upload` and does not contain the service role key.

---

## Communication & Sign-Off

**Stakeholders:**
- [ ] Mobile: _______________ (Signature) (Date)
- [ ] Platform: _______________ (Signature) (Date)

---

## Notes & Lessons Learned

> Add notes here as work progresses.

### 2026-09-25 - Kickoff
- Customer Documents tab is local-only. The unused broker stops at Storage.
- Long-term path is the staff sequence, invoked inside `customer-portal-upload`, not a new bucket or a new Drive client.
- One file per `doc_key`. Front and back of DL and Aadhaar are one photo or one PDF.
- Phase 5 is staff recovery alignment. It does not block the customer path.

---

## Related Documentation

- [DRIVE-001](../../../../webversion/categories/drive/active/DRIVE-001_UNIVERSAL_DRIVE_UPLOAD_AND_STORAGE_OFFLOAD.md)
- [MOBILE-011](../../auth/active/MOBILE-011_CUSTOMER_STAFF_SINGLE_APP_PLAN.md)
- [Mobile index](../../../INDEX.md)
- [Mobile tracker](../../../IMPLEMENTATION_TRACKER.md)
- DB truth: `supabase/backups/full_metadata.sql`
- Broker: `supabase/functions/customer-portal-upload/index.ts`
- Drive function: `supabase/functions/universal-drive-upload/index.ts`
- Staff reference: `src/pages/BodyshopRepairPage.tsx`
- Customer screen: `mobile/src/app/(customer)/documents.tsx`

---

**Last Updated:** 2026-09-25 by implementation planning  
**Status:** 🟡 IN PROGRESS — code complete; deploy `customer-portal-upload` and `universal-drive-upload` before a customer can sync to Drive
