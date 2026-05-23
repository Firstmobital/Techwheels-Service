# Implementation Plan: DRIVE-001

**Plan ID:** DRIVE-001  
**Created:** 2026-05-23  
**Priority:** HIGH  
**Owner:** Techwheels Admin + Dev Team  

---

## Executive Summary

This plan introduces a universal Supabase Edge Function flow that offloads uploaded storage files to Google Drive, writes the generated Drive sharing URL into the target database URL column (for example `referencedoctype_url`), and then deletes the original object from Supabase Storage to minimize storage usage.

Google Drive foldering will use a single root folder (`Techwheels_Service`) with automatic subfolder creation by registration number. File names will follow a strict normalized format: `regno_doctype_date.ext`.

**Risk Level:** 🟡 MEDIUM  
**Estimated Duration:** 1-2 working days (implementation + validation + rollout)  
**Rollback Strategy:** Disable invocation trigger and keep existing Supabase storage retention behavior until fixes are applied.

---

## Objectives

1. Implement an Edge Function that uploads any incoming storage object to Google Drive.
2. Enforce Drive path strategy: `Techwheels_Service/<registration_no>/`.
3. Enforce Drive file naming strategy: `regno_doctype_date.ext`.
4. Update the configured DB URL column with the Drive share link.
5. Delete source files from Supabase Storage only after successful upload/link update.

---

## Context & Background

Current requirement is to avoid long-term Supabase Storage usage for uploaded documents by using Drive as the final document system of record. The existing pattern from another project already supports upload, URL writeback, and storage cleanup.

This plan adapts that behavior for Techwheels with a stricter naming/folder convention:
- Root folder is manually created once: `Techwheels_Service`
- Registration-specific folder is auto-created at runtime
- Files are normalized to `regno_doctype_date.ext`

---

## Proposed Contract

### Input (Event/Request Payload)
- `bucket_id`: source Supabase bucket
- `object_name`: source object path
- `metadata.db_table`: destination table
- `metadata.db_column`: destination URL column (for example `referencedoctype_url`)
- `metadata.db_pk_column`: primary key column (recommended `id`)
- `metadata.db_pk_value`: primary key value
- `metadata.registration_no`: required for folder + filename strategy
- `metadata.doc_type`: required for filename strategy
- `metadata.doc_date`: optional, defaults to current date (`YYYYMMDD`) when absent

### Output
- `ok`
- `link` (Drive URL)
- `drive_file_id`
- `db_update_error` (nullable)

---

## Implementation Tasks

### Phase 1: Design and Validation Rules
- [ ] **Task 1.1:** Finalize function name and deployment target (`universal-drive-upload`).
- [ ] **Task 1.2:** Add strict validation for `registration_no`, `doc_type`, and path-safe values.
- [ ] **Task 1.3:** Define normalization rules:
  - `registration_no`: uppercase, strip spaces/special chars where needed
  - `doc_type`: lowercase snake-case or kebab-safe token
  - `doc_date`: `YYYYMMDD`
- [ ] **Task 1.4:** Define final naming formatter: `${regno}_${doctype}_${date}.${ext}`.

### Phase 2: Google Drive Folder Strategy
- [ ] **Task 2.1:** Create root folder manually in Drive: `Techwheels_Service`.
- [ ] **Task 2.2:** Share root folder with service account email (Editor access).
- [ ] **Task 2.3:** Store root folder id in env (recommended key: `GDRIVE_TECHWHEELS_SERVICE_FOLDER_ID`).
- [ ] **Task 2.4:** Implement/verify helper to ensure `<registration_no>` subfolder exists under root.
- [ ] **Task 2.5:** Add in-memory folder id cache per invocation to reduce duplicate Drive lookups.

### Phase 3: Upload, Replace, and Linking
- [ ] **Task 3.1:** Download object from Supabase Storage by `bucket_id` + `object_name`.
- [ ] **Task 3.2:** Build normalized filename using metadata and original extension.
- [ ] **Task 3.3:** If DB already has Drive link, extract `fileId` and PATCH-replace content.
- [ ] **Task 3.4:** If no existing file or replace fails (404/403), create new Drive file.
- [ ] **Task 3.5:** Generate canonical sharing URL and update DB URL column.
- [ ] **Task 3.6:** Make file public only when explicitly configured (`MAKE_DRIVE_FILE_PUBLIC=true` or request flag).

### Phase 4: Cleanup, Logging, and Reliability
- [ ] **Task 4.1:** Log processing status to `pending_drive_uploads` (best-effort).
- [ ] **Task 4.2:** Delete source object from Supabase Storage only after successful upload attempt.
- [ ] **Task 4.3:** Preserve error context for DB update failures and return in response.
- [ ] **Task 4.4:** Add idempotency notes and retry-safe behavior for duplicate requests.

### Phase 5: Integration and Rollout
- [ ] **Task 5.1:** Wire upload caller so required metadata is always sent.
- [ ] **Task 5.2:** Add/update env vars in Supabase project secrets.
- [ ] **Task 5.3:** Deploy function and test with at least 5 document types.
- [ ] **Task 5.4:** Validate DB link persistence in `referencedoctype_url` and similar URL columns.
- [ ] **Task 5.5:** Confirm object removal from Supabase bucket for all success cases.

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
⏳ 1.1 | Finalize function naming/deployment target | Dev Team | - | - | Use universal-drive-upload
⏳ 1.2 | Add metadata/path validation | Dev Team | - | - | registration_no/doc_type mandatory
⏳ 1.3 | Freeze normalization rules | Dev Team | - | - | deterministic formatting
⏳ 1.4 | Implement filename formatter | Dev Team | - | - | regno_doctype_date.ext
```

### Phase 2
```
⏳ 2.1 | Create Drive root folder | Techwheels Admin | - | - | Techwheels_Service
⏳ 2.2 | Share folder with service account | Techwheels Admin | - | - | editor permission required
⏳ 2.3 | Configure root folder env var | Dev Team | - | - | GDRIVE_TECHWHEELS_SERVICE_FOLDER_ID
⏳ 2.4 | Ensure registration subfolder creation | Dev Team | - | - | folder-per-regno
⏳ 2.5 | Add folder cache | Dev Team | - | - | reduce API chatter
```

### Phase 3
```
⏳ 3.1 | Download source object from bucket | Dev Team | - | - | storage read
⏳ 3.2 | Build normalized filename | Dev Team | - | - | retain extension
⏳ 3.3 | PATCH replace by existing fileId | Dev Team | - | - | no duplicate files
⏳ 3.4 | Fallback create on replace failure | Dev Team | - | - | 404/403 fallback
⏳ 3.5 | Update DB URL column | Dev Team | - | - | referencedoctype_url target
⏳ 3.6 | Apply optional public permission | Dev Team | - | - | config-driven
```

### Phase 4
```
⏳ 4.1 | Insert pending_drive_uploads logs | Dev Team | - | - | best-effort only
⏳ 4.2 | Delete uploaded source object | Dev Team | - | - | storage offload objective
⏳ 4.3 | Return structured errors | Dev Team | - | - | db_update_error surface
⏳ 4.4 | Verify retry/idempotent behavior | Dev Team | - | - | safe on duplicate triggers
```

### Phase 5
```
⏳ 5.1 | Wire caller metadata contract | Frontend/API | - | - | include regno/doc/date
⏳ 5.2 | Configure Supabase secrets | Dev Team | - | - | Drive auth + folder ids
⏳ 5.3 | Deploy and run integration tests | Dev Team | - | - | multi-doc validation
⏳ 5.4 | Verify DB URL writeback | Dev Team | - | - | target column persisted
⏳ 5.5 | Verify storage cleanup | Dev Team | - | - | source removed on success
```

---

## Dependencies & Prerequisites

- [ ] Google Drive root folder created: `Techwheels_Service`
- [ ] Service account granted access to root folder
- [ ] Supabase function secrets configured:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
  - `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_BASE64`
  - `GDRIVE_TECHWHEELS_SERVICE_FOLDER_ID`
  - `GOOGLE_SHARED_DRIVE_ID` (if shared drive is used)
  - `MAKE_DRIVE_FILE_PUBLIC` (optional)
- [ ] Upload caller sends required metadata contract

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Invalid metadata causes wrong folder/name | Medium | High | Strict validation and reject incomplete payloads |
| Service account permissions misconfigured | Medium | High | Pre-flight check: read/create in root folder before go-live |
| Duplicate uploads due to retries | Medium | Medium | Reuse existing Drive fileId from DB and PATCH content |
| DB update fails after Drive upload | Low | Medium | Log `completed_with_db_error` and surface actionable error |
| Source cleanup fails and storage cost rises | Medium | Medium | Log cleanup errors and add periodic reconciliation job |

---

## Success Criteria

- ✅ Every uploaded file is moved to Drive under `Techwheels_Service/<registration_no>/`.
- ✅ Drive file naming is consistently `regno_doctype_date.ext`.
- ✅ DB URL column (for example `referencedoctype_url`) is updated with a valid Drive link.
- ✅ Source object is deleted from Supabase Storage after successful handling.
- ✅ Processing logs are available for operational troubleshooting.

---

## Communication & Sign-Off

**Stakeholders:**
- [ ] Product/Operations Owner: _______________ (Signature) (Date)
- [ ] Development Lead: _______________ (Signature) (Date)
- [ ] QA/Validation Owner: _______________ (Signature) (Date)

---

## Notes & Lessons Learned

### 2026-05-23 - Plan Kickoff
- Decided single Drive root folder strategy (`Techwheels_Service`) with registration-based subfolder model.
- Decided deterministic filename format (`regno_doctype_date.ext`) for easy retrieval and de-dup behavior.
- Agreed objective is storage offload from Supabase bucket after successful Drive handoff.

---

## Related Documentation

- [Implementation Plans Index](INDEX.md)
- [Project Handbook README](../Project_Handbook/README.md)
- [Supabase Migrations README](../../supabase/migrations/README.md)

---

**Last Updated:** 2026-05-23 by GitHub Copilot  
**Status:** 🔴 PENDING
