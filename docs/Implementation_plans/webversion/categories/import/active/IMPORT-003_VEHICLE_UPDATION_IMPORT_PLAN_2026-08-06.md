# IMPORT-003 Vehicle Updation Import Plan

## Metadata
- Plan ID: IMPORT-003
- Category: import
- Owner: Import Team + Platform Team
- Created: 2026-08-06
- Status: IP (In Progress) — Phases 1–4 implemented; migration apply + manual QA pending
- Last Updated: 2026-08-06 (implementation started; WhatsApp excluded)
- Authoritative DB baseline: `supabase/backups/full_metadata.sql`
- Related plans: `IMPORT-001` only (`OPS-UPDATION-001` is a separate system — **no integration**)

## Objective
Add a **Vehicle Updation** accordion on `/import` with **two portal-scoped upload slots** (Portal EV, Portal PV). Each upload **replaces all existing rows for that portal** with a fresh snapshot from the Tata Motors pending-updation export (~7k rows per file).

This plan stores the **master pending-updation vehicle list** for operational lookup and reporting only.

### Explicit non-goals (locked)
- **No WhatsApp integration** — do not call `wa-updation-reminder`, do not touch `updation_import_batches` / `updation_reminders`, do not add reminder triggers on Import upload. The existing `UpdationReminderPage` under WhatsApp Automations remains a standalone workflow if staff use it separately.

---

## Authoritative Database Audit (`full_metadata.sql`)

Audit date: 2026-08-06. Source: `supabase/backups/full_metadata.sql`.

### Finding 1 — No vehicle updation master table exists
- Grep for `vehicle_updation` in `full_metadata.sql`: **no matches**.
- There is **no** table today that persists the full EV/PV updation campaign sheet as queryable master data.

### Finding 2 — Three similarly named but distinct updation-related objects

| Object | Purpose | Scope | Import semantics | RLS |
|--------|---------|-------|------------------|-----|
| `public.updation_import_batches` | WA import batch audit (match counts) | Global | Append-only batch log | **None** (GRANT ALL to authenticated) |
| `public.updation_reminders` | WA reminder 1/2 tracking per chassis | Per batch | Append + status updates | **None** |
| `public.warranty_updation_claim_data` | Warranty claim settlement report | `(branch, portal)` × 4 slots | Upsert by `source_row_hash` | Enabled — `reports` module |

**Conclusion:** Do **not** reuse `warranty_updation_claim_data` (warranty claims ≠ Tata pending updation lists). Do **not** overload `updation_import_batches` / `updation_reminders` (those are WA automation artifacts, not a master vehicle list).

### Finding 3 — Closest import pattern: PNI / GRN (portal-scoped replace-all)

| Object | Replace key | Upload history table | Frontend |
|--------|-------------|----------------------|----------|
| `parts_not_invoiced_data` | `(dealer_code, branch_label)` | `parts_not_invoiced_uploads` | `PniGrnImportSection.tsx` |
| `grn_report_data` | `(portal, branch)` where branch = dealer code | `grn_upload_history` | `PniGrnImportSection.tsx` |

Both use:
1. Client-side **DELETE scoped to slot** then bulk INSERT (500-row chunks).
2. `upload_session_id` UUID per upload.
3. Typed columns for queryable fields.
4. RLS via `parts_orders` module (+ admin bypass).

**Conclusion:** Vehicle Updation should follow this **self-contained Import section** pattern, not the generic 4-branch `ImportCard` in `ImportPage.tsx`.

### Finding 4 — Canonical chassis / customer sources (for future lookups)

| Table | Key columns | Indexes relevant to updation |
|-------|-------------|------------------------------|
| `all_service_data` | `chassis_no` (unique), `vehicle_registration_number`, `contact_phones`, `model` | `idx_all_service_data_new_chassis_number_unique`, `idx_all_service_data_chassis_no_norm` |
| `vehicles` | `reg_number` PK, `vin`, `owner_phone` | Reg-based master registry |
| `service_reception_entries` | `reg_number`, `service_type` includes `'updation'` | Used when customer arrives for updation SR |

The new master table stores phone/reg from the source sheet for operational lookup. No coupling to `wa-updation-reminder` or `all_service_data` matching is required for v1.

### Finding 5 — Import route RBAC
- `/import` gate: `ROUTE_MODULE_MAP['/import'] = ['job_cards']` (`src/App.tsx`).
- New tables should use **`job_cards`** module for select/insert/delete policies (same effective access as Import page), plus `is_admin()` bypass — mirroring GRN/PNI which use `parts_orders` for their report pages.

### Finding 6 — WA tables are unrelated to this import
- `updation_import_batches` / `updation_reminders` exist for WhatsApp automation only.
- **Do not read, write, or join** these tables from Vehicle Updation import code.

---

## Source File Contract (validated samples)

Samples: `EV UPDATION SHEET.xlsx`, `PV UPDATION SHEET.xlsx` (~7,028 data rows each, sheet `Sheet1`).

### Shared columns (both portals)
`UpdationCode`, `UpdationName`, `ChassisNo`, `Model`, `SellingDealerCode`, `SellingDealer`, `City`, `Region`, `Zone`, `PCRNo`, `Status`, `UpdationDealerCode`, `Code_Chassis_Concat`, `Type`, `Vehicle Number`, `Contact Number`

### Portal-specific differences

| Logical field | EV header | PV header |
|---------------|-----------|-----------|
| Updation type | `UpdationType` | *(absent)* |
| Campaign cost | `Unclaimed Campaign Cost` | `CampaignCost` |
| Snapshot noise cols | `As of 12-Jul-26`, `A161187` | `A72469` |
| Type values | `EV` | `ICE` |

### Validation rules (locked for v1)
1. **Required:** `ChassisNo` non-empty after trim; skip blank rows with count in summary.
2. **Portal guard:** EV slot rejects file if majority of `Type` ≠ `EV`; PV slot rejects if majority ≠ `ICE`.
3. **Sheet selection:** Default `Sheet1`; if multiple sheets, show picker (same as `UpdationReminderPage`).
4. **Dynamic columns:** Headers matching `/^As of /i` or `/^A\d+$/` → store in `source_row_data` only, not typed columns.
5. **Scope:** Store **all rows** from uploaded file (dealer-wide list). No geography filter in v1.

---

## Architecture Decision (locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| UX location | New accordion on `ImportPage` | User request; consistent with PNI/GRN |
| Slot count | **2** (Portal EV, Portal PV) | Sheets are portal-wide, not 4-branch |
| Merge mode | **Replace-all per portal** | User requirement; matches PNI/GRN |
| Data layer | New `vehicle_updation_data` + `vehicle_updation_uploads` | No suitable existing table |
| Column strategy | Typed business columns + `source_row_data jsonb` | Aligns with IMPORT-001 typed-ingestion guidance |
| Unique key | `(portal, chassis_no, updation_code)` | One row per campaign per chassis per portal |
| Atomicity | Server RPC `replace_vehicle_updation_portal` | Avoid partial state on ~7k row replace (PNI uses client delete+insert; RPC is safer at this row count) |
| WhatsApp / WA | **Excluded entirely** | Product sign-off: data import only; no `wa-updation-reminder` calls |

---

## Data Model (proposed)

### Migration file
`supabase/migrations/20260806170000_vehicle_updation_import.sql`

### Table: `public.vehicle_updation_data`

```sql
CREATE TABLE public.vehicle_updation_data (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal                  TEXT NOT NULL CHECK (portal IN ('EV', 'PV')),
  updation_code           TEXT,
  updation_type           TEXT,           -- EV exports only
  updation_name           TEXT,
  chassis_no              TEXT NOT NULL,
  model                   TEXT,
  vehicle_number          TEXT,
  contact_number          TEXT,
  selling_dealer_code     TEXT,
  selling_dealer          TEXT,
  city                    TEXT,
  region                  TEXT,
  zone                    TEXT,
  pcr_no                  TEXT,
  status                  TEXT,
  updation_dealer_code    TEXT,
  code_chassis_concat     TEXT,
  campaign_cost           NUMERIC,
  fuel_type               TEXT,           -- from Type column: EV / ICE
  source_row_number       INTEGER,
  source_file_name        TEXT,
  upload_session_id       UUID NOT NULL,
  source_row_data         JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_updation_data_portal_chassis_code_key
    UNIQUE (portal, chassis_no, updation_code)
);

CREATE INDEX idx_vehicle_updation_portal ON public.vehicle_updation_data (portal);
CREATE INDEX idx_vehicle_updation_chassis_norm ON public.vehicle_updation_data (upper(btrim(chassis_no)));
CREATE INDEX idx_vehicle_updation_reg_norm ON public.vehicle_updation_data (upper(btrim(vehicle_number)));
CREATE INDEX idx_vehicle_updation_session ON public.vehicle_updation_data (upload_session_id);
CREATE INDEX idx_vehicle_updation_code ON public.vehicle_updation_data (updation_code);

CREATE TRIGGER trg_vehicle_updation_updated_at
  BEFORE UPDATE ON public.vehicle_updation_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

### Table: `public.vehicle_updation_uploads`

```sql
CREATE TABLE public.vehicle_updation_uploads (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal              TEXT NOT NULL CHECK (portal IN ('EV', 'PV')),
  upload_session_id   UUID NOT NULL UNIQUE,
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by_email   TEXT,
  file_name           TEXT,
  sheet_name          TEXT,
  row_count           INTEGER NOT NULL DEFAULT 0,
  skipped_blank_rows  INTEGER NOT NULL DEFAULT 0
);
```

### RPC: `public.replace_vehicle_updation_portal`

```sql
-- Signature (conceptual):
replace_vehicle_updation_portal(
  p_portal            text,
  p_upload_session_id uuid,
  p_file_name         text,
  p_sheet_name        text,
  p_uploaded_by_email text,
  p_rows              jsonb    -- array of mapped row objects
) RETURNS jsonb
-- Returns: { deleted_count, inserted_count, skipped_blank_rows, portal }
```

**Transaction steps:**
1. Validate `p_portal IN ('EV','PV')`.
2. `DELETE FROM vehicle_updation_data WHERE portal = p_portal`.
3. Insert `vehicle_updation_uploads` row.
4. Bulk insert from `p_rows` (server-side chunking, e.g. 500).
5. `RETURN` counts.

Properties: `SECURITY DEFINER`, `SET search_path = public`, `GRANT EXECUTE TO authenticated`.

### RLS policies (mirror GRN pattern, `job_cards` module)

```sql
ALTER TABLE vehicle_updation_data    ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_updation_uploads ENABLE ROW LEVEL SECURITY;

-- vehicle_updation_data
CREATE POLICY admin_all ON vehicle_updation_data
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY sel_rbac ON vehicle_updation_data
  FOR SELECT TO authenticated USING (is_admin() OR has_module_view('job_cards'));
CREATE POLICY ins_rbac ON vehicle_updation_data
  FOR INSERT TO authenticated WITH CHECK (is_admin() OR has_module_modify('job_cards'));
CREATE POLICY del_rbac ON vehicle_updation_data
  FOR DELETE TO authenticated USING (is_admin() OR has_module_delete('job_cards'));

-- vehicle_updation_uploads (insert + select only)
CREATE POLICY admin_all ON vehicle_updation_uploads
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY sel_rbac ON vehicle_updation_uploads
  FOR SELECT TO authenticated USING (is_admin() OR has_module_view('job_cards'));
CREATE POLICY ins_rbac ON vehicle_updation_uploads
  FOR INSERT TO authenticated WITH CHECK (is_admin() OR has_module_modify('job_cards'));
```

---

## Execution Progress

| Phase | Description | Status | Completed |
|-------|-------------|--------|-----------|
| 1 | Database and Security | **IP** | Migration + sql_checks written — **apply to Supabase pending** |
| 2 | Column mapper | **DN** | 2026-08-06 — `src/lib/vehicleUpdationColumnMapper.ts` |
| 3 | Frontend Import section | **DN** | 2026-08-06 — `VehicleUpdationImportSection.tsx` + `ImportPage.tsx` |
| 4 | Types and registry | **DN** | 2026-08-06 — `getTableColumns.ts` |
| 5 | Validation | **NS** | Blocked on migration apply + sample file upload QA |

---

## Implementation Plan

### Phase 1 — Database and Security — IP
**Deliverables:**
- [x] Migration `20260806170000_vehicle_updation_import.sql` (tables, indexes, trigger, RLS, RPC, grants)
- [x] SQL checks file `supabase/sql_checks/20260806170000_vehicle_updation_import_checks.sql`
- [ ] Apply to Supabase + verify checks
- [ ] Register in `docs/shared/reference/DB_CHANGE_LEDGER.md`

**Acceptance:**
- Both tables exist with constraints/indexes
- RPC returns `{ deleted_count, inserted_count, ... }` atomically
- Authenticated user with `job_cards` modify can insert/delete via RPC

### Phase 2 — Column mapper — DN
**File:** `src/lib/vehicleUpdationColumnMapper.ts`

- [x] Header alias resolver (reuse pattern from `UpdationReminderPage` + warranty mappers)
- [x] `mapVehicleUpdationHeaders(rawHeaders): MappedHeaders | ParseError[]`
- [x] `buildVehicleUpdationInsertRow(raw, portal, meta): RowPayload`
- [x] Cost parser (`Unclaimed Campaign Cost` / `CampaignCost`)
- [x] Phone normalizer (strip spaces, keep digits)
- [x] Dynamic column filter → `source_row_data`
- [x] Unit-free pure functions (testable)

### Phase 3 — Frontend Import section — DN
**Files:**
- `src/components/VehicleUpdationImportSection.tsx` *(new — mirror `PniGrnImportSection`)*
- `src/pages/ImportPage.tsx` *(wire accordion)*

**UX spec:**
- [x] Accordion title: **Vehicle Updation** (count badge: `2`)
- [x] Description + portal-scoped replace warning banner
- [x] Two slots: `VU_EV` (Portal EV), `VU_PV` (Portal PV)
- [x] Per slot: file picker, last upload chip, multi-sheet picker
- [x] Upload flow: parse → validate portal/type → call RPC → show success/error
- [x] Insert after `<PniGrnImportSection />`, before Warranty accordion

### Phase 4 — Types and registry — DN
- [x] Add table entries to `src/lib/getTableColumns.ts`
- [ ] Optional: include row count in Import page summary chip (query `vehicle_updation_data` count)

### Phase 5 — Validation — NS
**Manual test checklist:**
- [ ] Upload EV sample → ~7,028 rows in DB with `portal='EV'`; PV table empty or unchanged
- [ ] Upload PV sample → EV rows unchanged; PV has ~7,028 rows
- [ ] Re-upload EV with different file → old EV rows gone, new count matches file
- [ ] Wrong portal file in wrong slot → blocked with clear error (Type mismatch)
- [ ] File missing ChassisNo column → parse error before upload
- [ ] Non-admin without `job_cards` modify → upload denied by RLS/RPC
- [ ] `vehicle_updation_uploads` shows file name, timestamp, row count

**Automated:**
- [ ] `npx tsc --noEmit`
- [ ] `npm run build`

---

## Column Mapping Reference

| DB column | EV source header | PV source header | Notes |
|-----------|------------------|------------------|-------|
| `portal` | slot (`EV`) | slot (`PV`) | Not from file |
| `updation_code` | `UpdationCode` | `UpdationCode` | |
| `updation_type` | `UpdationType` | — | NULL for PV |
| `updation_name` | `UpdationName` | `UpdationName` | |
| `chassis_no` | `ChassisNo` | `ChassisNo` | Required |
| `model` | `Model` | `Model` | |
| `vehicle_number` | `Vehicle Number` | `Vehicle Number` | |
| `contact_number` | `Contact Number` | `Contact Number` | Store as text |
| `selling_dealer_code` | `SellingDealerCode` | `SellingDealerCode` | |
| `selling_dealer` | `SellingDealer` | `SellingDealer` | |
| `city` | `City` | `City` | |
| `region` | `Region` | `Region` | |
| `zone` | `Zone` | `Zone` | |
| `pcr_no` | `PCRNo` | `PCRNo` | |
| `status` | `Status` | `Status` | |
| `updation_dealer_code` | `UpdationDealerCode` | `UpdationDealerCode` | |
| `code_chassis_concat` | `Code_Chassis_Concat` | `Code_Chassis_Concat` | |
| `campaign_cost` | `Unclaimed Campaign Cost` | `CampaignCost` | Parse numeric |
| `fuel_type` | `Type` | `Type` | EV / ICE |
| `source_row_data` | all unmapped cols | all unmapped cols | incl. `As of *`, `A*` |

---

## Out of Scope

1. **All WhatsApp / reminder automation** (`wa-updation-reminder`, `updation_reminders`, `UpdationReminderPage` integration)
2. Reception auto-alert when reg/chassis matches pending updation list
3. Updation completion tracking (JC closed / PCR status sync)
4. Mobile import tab
5. Branch-level splits (Ajmer Road vs Sitapura) — data is portal-wide
6. Incremental upsert / merge — replace-all only

## Future Candidates (only if requested later — not planned now)

| ID | Feature | Depends on |
|----|---------|------------|
| IMPORT-003-P2A | Reception lookup RPC: `get_pending_updation_for_vehicle(reg/chassis)` | Phase 1 table |
| IMPORT-003-P2C | Updation pending report (counts by `updation_code`, contact coverage %) | Phase 1 table |

---

## Files To Create / Touch

| Layer | File | Action |
|-------|------|--------|
| DB | `supabase/migrations/20260806170000_vehicle_updation_import.sql` | Create |
| DB checks | `supabase/sql_checks/20260806170000_vehicle_updation_import_checks.sql` | Create |
| Mapper | `src/lib/vehicleUpdationColumnMapper.ts` | Create |
| UI | `src/components/VehicleUpdationImportSection.tsx` | Create |
| UI | `src/pages/ImportPage.tsx` | Wire section |
| Types | `src/lib/getTableColumns.ts` | Extend |
| Tracker | `docs/Implementation_plans/webversion/IMPLEMENTATION_TRACKER.md` | Add row |
| Ledger | `docs/shared/reference/DB_CHANGE_LEDGER.md` | Add after apply |

## Related Existing Files (read-only reference)

- `src/components/PniGrnImportSection.tsx` — replace-all UX pattern
- `src/pages/UpdationReminderPage.tsx` — header alias parsing for updation sheets
- `supabase/migrations/20260709220000_parts_not_invoiced_tables.sql` — typed table + uploads history
- `supabase/migrations/20260709180000_updation_reminders.sql` — WA automation (**unrelated; do not touch**)

---

## Next Actions
1. **Apply migration** `20260806170000_vehicle_updation_import.sql` in Supabase SQL editor (or CLI)
2. Run `supabase/sql_checks/20260806170000_vehicle_updation_import_checks.sql`
3. Manual QA on `/import` with EV + PV sample files
4. Register in `DB_CHANGE_LEDGER.md` after apply
5. Move plan to **RV** after QA sign-off
