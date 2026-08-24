# PARTS-001 Service Advisor Parts — Order Date Guard + GGN Stock

**Plan ID:** PARTS-001  
**Created:** 2026-08-24  
**Priority:** HIGH  
**Owner:** Parts Team + Platform Team  
**Status:** 🟡 IN PROGRESS (spec locked; awaiting preview implementation)  
**Platform:** webversion  
**Category:** parts  
**Ledger:** DBL-0025 (PROPOSED)  
**Reference pages:** `/service-advisor` (Advisor + Admin), `/parts-spm` (SPM), `/import` → Parts Reports  
**DB authority:** `supabase/backups/full_metadata.sql`  
**Mockup:** `docs/Implementation_plans/webversion/categories/parts/evidence/PARTS-001_GGN_STOCK_MOCKUP.html`  
**Sheet audit:** `docs/Implementation_plans/webversion/categories/parts/evidence/PARTS-001_GGN_STOCK_SHEET_AUDIT_2026-08-24.md`

---

## Executive Summary

Two changes on the Service Advisor Parts module:

1. **Order Date guard** — do not attach an older Order Sheet row (same part, earlier vehicle) to a current request. `X` = request **Entry Date**. Valid only when `Order Date >= X`.
2. **GGN Stock** — new Parts Reports upload and a new column (not the existing local Stock column) showing **Available** / **Not Available** / **No Data** from Column P (`Free Stock`) of the GGN sheet.

**Risk Level:** 🟡 MEDIUM  
**Estimated Duration:** 4–6 working days  
**Rollback Strategy:** Hide GGN column; revert matcher to current candidate-then-reject behaviour; drop `ggn_stock_data` / new `parts_requests` columns. Existing Parts Order and Parts In Stock uploads stay untouched.  
**Deploy:** Preview only until explicit user approval. No production deploy in this plan until sign-off.

---

## Objectives

1. Filter Order Sheet rows with `Order Date < entry_date` **before** picking the winner; then apply latest valid row to Order No., Order Date, Order Status.
2. Add **GGN Stock** upload under Import → Parts Reports (`.xlsb` / `.xlsx` / `.xls`), replace-all, show file name + timestamp.
3. Show **GGN Stock** after Order Status on Admin, SPM, and Advisor views.
4. Auto-check when Parts Number + Registration + Parts Required are present; refresh on part/vehicle change and on new GGN upload. No Check Stock button.
5. Leave local Stock (`parts_qty` / `service_parts_stock_snapshot_data`) unchanged.

---

## Authoritative Audit (`full_metadata.sql`)

Audit date: 2026-08-24. Source: `supabase/backups/full_metadata.sql`.

### Finding 1 — `ggn_stock_data` does not exist

Grep for `ggn_stock` in `full_metadata.sql`: **no matches**. New table required. Do **not** reuse `service_parts_stock_snapshot_data` (dealer on-hand; `ck_parts_stock_non_negative` would reject GGN negatives; used by existing Stock column and Parts In Stock reports).

### Finding 2 — `parts_requests` (line ~22488)

Present and relevant:

| Column | Role for this plan |
|--------|--------------------|
| `entry_date` | **X** (locked by mockup) |
| `parts_number` | GGN + order match key |
| `parts_order_date` | Stored order date from matcher |
| `parts_order_number` | SPM **manual** override only (comment in metadata) |
| `matched_order_row_id` | Last attached order-sheet row |
| `parts_qty` | Local dealer stock — **do not use for GGN** |
| `parts_status` | Workflow status (Pending/Ordered/…) — distinct from Order Status label |

Missing (to add):

| Column | Purpose |
|--------|---------|
| `matched_order_number` | Auto Order No. from valid order row (`sap_order_number` then `crm_order_number`) |
| `matched_order_status_label` | Order Status display string (Dispatched / Invoiced / Challan / Confirmed / Order Pending) |
| `ggn_stock_status` | `Available` / `Not Available` / NULL = No Data |

### Finding 3 — Order matching today

| Object | Behaviour | Gap |
|--------|-----------|-----|
| `parts-request-order-match` | Picks globally newest order per part, **then** rejects if date `< entry_date` | Filter **before** pick (mockup). Does not write Order No. |
| `parts-order-descriptions` | Global part-number → newest order. **No X filter.** | Advisor/Admin Order No. / Order Status still show old orders |
| SPM `loadOrderLookup` | Same global newest-order map | Same gap |

### Finding 4 — Import metadata

`import_metadata (table_name, last_updated_at)` exists. It has **no file-name column**. GGN file name + timestamp must live on `ggn_stock_data` (same value on every row after replace-all) and still upsert `import_metadata` for `ggn_stock_data` so the Import card timestamp matches other Parts Reports cards.

### Finding 5 — RLS patterns to copy

| Table | SELECT | INSERT/DELETE |
|-------|--------|----------------|
| `service_parts_stock_snapshot_data` | admin OR `parts_inventory` view | admin OR `parts_inventory` modify/delete |
| `service_parts_order_data` | admin OR `parts_orders` view + dealer scope | admin OR `parts_orders` modify/delete |
| `parts_requests` | owner advisor OR `parts_spm` view OR admin | writes via RPCs + admin bypass |

`ggn_stock_data` is a warehouse snapshot (no dealer_code). Use **Parts In Stock** RLS (`parts_inventory` + admin), not `parts_orders` dealer scope.

Upload permission (locked): whoever can already use `/import` **and** pass `ggn_stock_data` INSERT RLS (admin or `parts_inventory` modify). Advisor: no. SPM: only if that user already has Import/`parts_inventory` — **no new upload button on `/parts-spm`**.

---

## Locked Business Rules (v1)

| Rule | Value |
|------|-------|
| `X` | `parts_requests.entry_date` (mockup: “Entry Date of parts request”) |
| Valid order | `Order Date >= X` |
| Invalid order | `Order Date < X` → ignore; do not update Order No. / Date / Status |
| Order match key | Normalized part number (trim, collapse spaces, upper case) |
| Winner | Among valid rows: latest `order_date`, then `updated_at` |
| Display Order No. | `COALESCE(parts_order_number, matched_order_number)` — SPM override wins |
| Auto Order No. | `sap_order_number` then `crm_order_number`; matcher must not overwrite a non-null `parts_order_number` |
| GGN table | `public.ggn_stock_data` (new) |
| GGN match | Column A `Material` = `parts_number`, same normalization |
| GGN result | Column P `Free Stock` |
| Available | `Free Stock > 0` |
| Not Available | matched row with `Free Stock <= 0` (zero and negative) |
| No Data | no GGN upload, blank part number, or Material not in latest sheet |
| Duplicates | sample has none; if a file has duplicate Material, **sum** Free Stock then one row |
| Local Stock column | unchanged |
| GGN column placement | after Order Status, before Status (mockup) |
| Auto-check trigger | Parts Number + Registration + Parts Required all present |
| Refresh | part number change, vehicle/job details change, new GGN upload |
| Upload formats | `.xlsb`, `.xlsx`, `.xls` (sample is `.xlsb`) |
| Import semantics | replace-all latest sheet |
| Production | preview + approval first |

---

## Proposed Schema (DBL-0025)

### `public.ggn_stock_data` (new)

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint PK identity | |
| `part_number` | text NOT NULL | Normalized Material (A) |
| `part_description` | text | Material Description (C) |
| `plant` | text | Plnt (B), sample `4770` |
| `storage_location` | text | SLoc (D) |
| `free_stock` | numeric NOT NULL | Column P — **allow negatives** (no non-negative check) |
| `source_file_name` | text | Latest upload file name |
| `uploaded_at` | timestamptz NOT NULL | Same timestamp for all rows in a replace-all |
| `uploaded_by` | uuid | `auth.uid()` when available |
| `source_row_hash` | text NOT NULL | Dedup within a file |
| `created_at` / `updated_at` | timestamptz | |

Constraints/indexes:

- Unique `part_number` (one row per material after sum-on-duplicate).
- Index on `part_number`.
- RLS enabled: admin bypass + `parts_inventory` select/modify/delete (mirror snapshot table). Grant SELECT also to `parts_spm` view **or** rely on persisted `ggn_stock_status` on `parts_requests` so advisors never query this table.

**v1 read path (locked):** persist `ggn_stock_status` on `parts_requests`. Advisors/SPM/Admin read it from the request row (realtime already on `parts_requests`). Matcher/upload job writes it. Do not load 34k GGN rows in the browser.

### `public.parts_requests` (alter)

```text
matched_order_number text
matched_order_status_label text
ggn_stock_status text
  CHECK (ggn_stock_status IS NULL OR ggn_stock_status IN ('Available', 'Not Available'))
```

NULL `ggn_stock_status` = No Data. GGN-only updates must **not** flip `advisor_seen` (same rule as `parts_qty`).

### Import card

- New `CARDS` entry `tableName: 'ggn_stock_data'`, title **GGN Stock**, in `PARTS_REPORT_TABLES`.
- `PARTS_REPLACE_ALL_ON_IMPORT = true` already covers parts tables; include `ggn_stock_data`.
- Accept `.xlsb` on this card (and parser). SheetJS `xlsx@0.18.5` already reads the sample `.xlsb`.
- After success: show file name, IST timestamp, row count, available vs not-available counts (mockup).
- Upsert `import_metadata` for `ggn_stock_data`.

Do not copy the `.xlsb` into git.

---

## Implementation Tasks

### Phase 0: Spec lock — ✅ COMPLETED (2026-08-24)

- [x] User spec, sample file, mockup, role matrix, acceptance criteria.
- [x] `X` = `entry_date`; Available = `Free Stock > 0`.
- [x] Table name `ggn_stock_data`; DB authority `full_metadata.sql`.
- [x] Preview-first deploy gate.

### Phase 1: Order Date validation — ⏳ PENDING

- [ ] **1.1** `parts-request-order-match`: filter `order_date >= entry_date` **before** `isNewer`; persist `parts_order_date`, `matched_order_row_id`, `matched_order_number`, `matched_order_status_label`. Skip terminal statuses as today. Do not overwrite `parts_order_number`.
- [ ] **1.2** Advisor/Admin: stop using global `orderNumbers` / `orderStatuses` maps for those columns. Display from request fields (`COALESCE(parts_order_number, matched_order_number)`, `parts_order_date`, `matched_order_status_label`). Keep description lookup if still needed.
- [ ] **1.3** SPM `lookupOrderForPartNo`: filter candidates by that request’s `entry_date`.
- [ ] **1.4** Re-run match on part number / entry date change (`triggerPartsOrderMatch`).
- [ ] **1.5** Test: `< X` ignored; `= X` and `> X` accepted; latest valid wins; same part on two vehicles does not share an old order.

**Files:** `supabase/functions/parts-request-order-match/index.ts`, `supabase/functions/parts-order-descriptions/index.ts`, `src/components/PartsRequirementSection.tsx`, `src/pages/PartsSPMDashboardPage.tsx`, `src/lib/api/partsRequests.ts`.

### Phase 2: GGN upload — ⏳ PENDING

- [ ] **2.1** Migration + sql_checks for `ggn_stock_data`, `parts_requests` columns, RLS, unique `part_number`. Ledger DBL-0025. Apply only on preview/dev until Phase 4 approval.
- [ ] **2.2** Mapper: required Material + Free Stock by **header name**, fallback column P on the known 16-column template. Normalize part numbers. Sum duplicates. Keep negatives.
- [ ] **2.3** Import card **GGN Stock** under Parts Reports; `.xlsb,.xlsx,.xls`; replace-all; file name + timestamp + counts; fail closed on validation errors.
- [ ] **2.4** After successful upload, refresh `ggn_stock_status` on existing `parts_requests` (extend matcher or sibling function). Do not flip `advisor_seen`.

**Files:** `src/pages/ImportPage.tsx`, `src/lib/partsGgnStockColumnMapper.ts` (new), `supabase/migrations/YYYYMMDDHHMMSS_ggn_stock_data.sql`, paired `supabase/sql_checks/…_checks.sql`.

### Phase 3: GGN column + auto check — ⏳ PENDING

- [ ] **3.1** `PartsRequestRow` + create/update RPCs: when Parts Number + Registration + Parts Required are saved, set `ggn_stock_status` from `ggn_stock_data`.
- [ ] **3.2** UI column **GGN Stock** after Order Status on Admin desktop table, Advisor cards, SPM dashboard. Badges: green Available, red Not Available, gray No Data. Do not remove existing Stock badge.
- [ ] **3.3** Auto-refresh on part number / vehicle detail change and after GGN upload (realtime on `parts_requests`).
- [ ] **3.4** Match mockup density; no extra Check Stock button.

**Files:** `PartsRequirementSection.tsx`, `PartsSPMDashboardPage.tsx`, `partsRequests.ts`, create/update advisor RPCs in `full_metadata.sql` (`parts_request_create`, `parts_request_update_advisor_fields`).

### Phase 4: Preview, QA, approval — ⏳ PENDING

- [ ] **4.1** Vercel preview only. **No production.**
- [ ] **4.2** Order Date QA (old / same-day / future).
- [ ] **4.3** GGN upload + Column P + Admin / SPM / Advisor visibility.
- [ ] **4.4** Regression: Parts Order, Parts In Stock, local Stock, SPM Order No. override, VOR (`order no` starts with `33`).
- [ ] **4.5** User approval on preview, then production + metadata backup.

---

## Activity Tracker

Legend: ✅ COMPLETED · 🔄 IN PROGRESS · ⏳ PENDING · ❌ BLOCKED

### Phase 0
```
✅ 0.1 | Spec + mockup + sample file + DB audit | Parts + Platform | 2026-08-24 | 2026-08-24 | Locked
```

### Phase 1
```
⏳ 1.1 | Filter-then-pick matcher + persist order no/label | Platform |  |  |
⏳ 1.2 | Advisor/Admin display from request row | Platform |  |  |
⏳ 1.3 | SPM lookup gated by entry_date | Platform |  |  |
⏳ 1.4 | Re-match on part number / entry date | Platform |  |  |
⏳ 1.5 | Order date test matrix | Parts + Platform |  |  |
```

### Phase 2
```
⏳ 2.1 | ggn_stock_data + parts_requests columns + RLS (DBL-0025) | Platform |  |  |
⏳ 2.2 | Column mapper Material + Free Stock | Platform |  |  |
⏳ 2.3 | Import card + .xlsb + metadata display | Platform |  |  |
⏳ 2.4 | Post-upload GGN refresh | Platform |  |  |
```

### Phase 3
```
⏳ 3.1 | Persist ggn_stock_status on create/update | Platform |  |  |
⏳ 3.2 | GGN Stock column Admin / SPM / Advisor | Platform |  |  |
⏳ 3.3 | Auto-check + realtime refresh | Platform |  |  |
⏳ 3.4 | Compact badges per mockup | Platform |  |  |
```

### Phase 4
```
⏳ 4.1 | Preview environment only | Platform |  |  |
⏳ 4.2 | Order date QA | Parts |  |  |
⏳ 4.3 | GGN upload + Column P QA | Parts |  |  |
⏳ 4.4 | Regression | Platform |  |  |
⏳ 4.5 | User approval then production | Parts + Platform |  |  | BLOCK production until signed
```

---

## Dependencies & Prerequisites

- [x] Parts Order upload + `service_parts_order_data`.
- [x] `parts_requests` workflow (Advisor, Admin, SPM).
- [x] Sample GGN `.xlsb` audited.
- [x] Interactive mockup filed under evidence.
- [x] `full_metadata.sql` audit (no `ggn_stock_data` today).
- [ ] DBL-0025 migration applied on preview.
- [ ] Preview URL + user approval before production.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Global part-number lookup left in UI | High if 1.2 skipped | High — old orders still show | Display from request row after filter-then-pick |
| Reuse snapshot table for GGN | Medium | High — breaks Parts In Stock / non-negative check | New `ggn_stock_data`; allow negative `free_stock` |
| Map by letter P only | Medium | High | Header `Free Stock` first; column P fallback on known template |
| `.xlsb` rejected | High | High | Add accept + SheetJS parse (already proven on sample) |
| 34k-row replace-all timeout | Medium | Medium | Chunked insert like other Parts Reports |
| GGN update flips advisor badge | Medium | Low | Never set `advisor_seen=false` on GGN-only writes |
| Production before approval | Low | High | Phase 4 gate |

---

## Success Criteria

- [ ] Old orders cannot be matched when `Order Date < X`.
- [ ] Same-date and future-date orders are accepted.
- [ ] Order No., Date, Status update only from valid records.
- [ ] GGN Stock upload exists under Parts Reports.
- [ ] Excel (including `.xlsb`) processes successfully.
- [ ] Column P / Free Stock drives the result.
- [ ] GGN Stock visible on Admin, SPM, Advisor.
- [ ] Auto stock check when Parts Number + Registration + Parts Required are entered.
- [ ] Displays exactly **Available** or **Not Available** when matched; **No Data** otherwise.
- [ ] Existing Parts module behaviour unchanged.
- [ ] Preview approved before production.

---

## Role Visibility

| Feature | Admin | SPM | Advisor |
|---------|-------|-----|---------|
| View GGN Stock status | Yes | Yes | Yes |
| Upload GGN Stock | Yes, if Import + `parts_inventory` modify (or admin) | Only if that user already has Import/`parts_inventory`; no SPM-page upload | No |
| View Order No. / Date / Status | Yes | Yes | Yes |

---

## Deployment Gate

1. Implement on development/preview only.  
2. Share working preview (this HTML mockup is layout-only; working preview comes after Phases 1–3).  
3. Test Order Date: old / same-day / future.  
4. Test GGN upload and Column P.  
5. Test Admin, SPM, Advisor.  
6. User approval.  
7. Production only after explicit approval, then `npm run db:backup:metadata`.

---

## Related Documentation

- Mockup: `docs/Implementation_plans/webversion/categories/parts/evidence/PARTS-001_GGN_STOCK_MOCKUP.html`
- Sheet audit: `docs/Implementation_plans/webversion/categories/parts/evidence/PARTS-001_GGN_STOCK_SHEET_AUDIT_2026-08-24.md`
- Ledger: `docs/shared/reference/DB_CHANGE_LEDGER.md` (DBL-0025)
- Matcher: `supabase/functions/parts-request-order-match/index.ts`
- Advisor lookup: `supabase/functions/parts-order-descriptions/index.ts`
- UI: `src/components/PartsRequirementSection.tsx`, `src/pages/PartsSPMDashboardPage.tsx`, `src/pages/ServiceAdvisorPage.tsx`
- Import: `src/pages/ImportPage.tsx`
- Local stock (do not reuse): `src/lib/partsStockColumnMapper.ts`, `service_parts_stock_snapshot_data`

---

## Communication & Sign-Off

- [ ] Parts / SPM owner: _______________ (Date)
- [ ] Platform: _______________ (Date)
- [ ] Preview approved: _______________ (Date)
- [ ] Production deploy approved: _______________ (Date)

---

## Notes

### 2026-08-24 — Spec intake
User spec + sample `.xlsb`.

### 2026-08-24 — Mockup + DB audit
Mockup locks `X = entry_date`, Available = `Free Stock > 0`, table `ggn_stock_data`, column after Order Status, auto-check on Parts Number + Registration + Parts Required. `full_metadata.sql` confirms no GGN table; `parts_order_number` is SPM override only.

---

**Last Updated:** 2026-08-24  
**Status:** 🟡 IN PROGRESS (planning complete; implementation not started)
