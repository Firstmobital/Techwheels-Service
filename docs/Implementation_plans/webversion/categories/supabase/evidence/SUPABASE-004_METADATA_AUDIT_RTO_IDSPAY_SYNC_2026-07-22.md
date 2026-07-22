# SUPABASE-004 — Metadata Audit: `rto_idspay` → `all_service_data` Sync

**Audit date:** 2026-07-22  
**Authority:** `supabase/backups/full_metadata.sql`  
**Manifest:** `supabase/evidence/authoritative_metadata_manifest.json`  
**sha256:** `9fd90934d6c2541d47da3c77b412789012f95086267ea86df51a0e86cf75e68a`  
**Captured:** 2026-07-22T11:07:49Z  

---

## 1) Deployed state — `public.rto_idspay` (present)

Migration `20260722162000_create_rto_idspay.sql` is reflected in metadata.

| Item | Metadata fact |
|------|----------------|
| PK | `id` uuid |
| Lookup keys | `registration_no` (NOT NULL), `reg_no`, **`chassis`**, `engine` |
| Insurance source fields | `vehicle_insurance_company_name`, `vehicle_insurance_upto` (text), `vehicle_insurance_policy_number` |
| Indexes | UNIQUE `idx_rto_idspay_reg_no` on `lower(btrim(registration_no))`; `expires_at`, `cached_at` |
| **Missing index** | No expression index on `upper(btrim(chassis))` — optional for backfill at scale |
| Triggers | `trg_rto_idspay_updated_at` only (reuse `set_rto_cache_updated_at`) |
| **No sync trigger** | No function/trigger to `all_service_data` |

RLS: enabled; policies `rto_idspay_select/insert/update` + admin policies.  
Grants: `ALL` to anon/authenticated/service_role (same posture as `rto_cache` in dump).

---

## 2) Target — `public.all_service_data` (insurance + audit)

| Target column | Type | Present in dump |
|---------------|------|----------------|
| `chassis_no` | text | Yes |
| `vehicle_registration_number` | text | Yes |
| `last_insurance_comapny` | text | Yes (**spelling `comapny` — production typo, do not rename in this track**) |
| `last_insurance_expiry_date` | **date** | Yes |
| `last_insurance_policy_number` | text | Yes |
| `last_updated_at` | timestamptz | Yes |
| `updated_by_rtoids` | — | **Not present — migration required** |
| `updated_by_rtoids_at` | — | **Not present — migration required** |

Existing audit parallels: `updated_by_robot` / `_at`, `updated_by_closed_job` / `_at`, `updated_by_sale` / `_at`.

**Indexes for match (already exist):**

- `idx_all_service_data_chassis_no_norm` — `upper(btrim(chassis_no))`
- `idx_all_service_data_vrn_norm` — `upper(btrim(vehicle_registration_number))`
- UNIQUE `idx_all_service_data_new_chassis_number_unique` on `chassis_no` (raw)

---

## 3) `public.all_service_data_dynamic`

Subscribers use a **narrow** projection; insurance fields and `updated_by_*` (except robot) are **not** on `all_service_data_dynamic`.  
**Phase 5 scope:** update **`all_service_data` only**; no dynamic-table change unless a later requirement adds insurance to robot consumers.

---

## 4) Reusable functions (no new date parser required)

| Function | Use |
|----------|-----|
| `public.parse_all_service_date_text(text)` | Parse `vehicle_insurance_upto` → `last_insurance_expiry_date` (DD-MM-YYYY, DD/MM/YYYY, ISO) |
| `public.refresh_all_service_data_from_job_card_closed_data(text, text)` | **Pattern reference** — chassis-first match, VRN fallback, `SECURITY DEFINER`, single-target lateral pick |

Comment on job-card refresh: *"Match by chassis first, fallback by vehicle_registration_number."*

---

## 5) Gap summary (implementation required)

| # | Gap |
|---|-----|
| G1 | Add `updated_by_rtoids`, `updated_by_rtoids_at` to `all_service_data` |
| G2 | Create `refresh_all_service_data_from_rto_idspay(p_chassis text, p_registration text)` |
| G3 | Create `trg_refresh_all_service_data_from_rto_idspay()` + `AFTER INSERT OR UPDATE` on `rto_idspay` |
| G4 | Optional chunked backfill for existing `rto_idspay.verified = true` rows |
| G5 | `supabase/sql_checks/` + `DB_CHANGE_LEDGER` row before apply |

**Not in metadata (must not assume):** any existing `refresh_*rto_idspay*` symbol.

---

## 6) Field mapping (authoritative)

| `rto_idspay` source | `all_service_data` target |
|---------------------|---------------------------|
| `vehicle_insurance_company_name` | `last_insurance_comapny` |
| `vehicle_insurance_upto` | `last_insurance_expiry_date` via `parse_all_service_date_text` |
| `vehicle_insurance_policy_number` | `last_insurance_policy_number` |
| (on successful row update) | `updated_by_rtoids = true`, `updated_by_rtoids_at = now()` |
| (recommended) | `last_updated_at = now()` when insurance fields change |

Match keys from source row:

- `upper(btrim(chassis))` → `upper(btrim(chassis_no))`
- `upper(btrim(coalesce(reg_no, registration_no)))` → `upper(btrim(vehicle_registration_number))`

---

## 7) Risk notes

1. **Multiple `all_service_data` rows** per normalized VRN/chassis: job-card sync picks **one** row (latest `last_updated_at`); recommend same for IDSPay sync unless product requires update-all.
2. **Empty IDSPay insurance strings:** recommend do not overwrite existing target values with NULL/blank.
3. **Trigger recursion:** `rto_idspay` trigger updates `all_service_data` → fires `trg_sync_all_service_data_dynamic` on target (expected; no write back to `rto_idspay`).
4. **Edge function path:** `invoke-rc-provider` INSERT/UPDATE on `rto_idspay` will automatically fire DB trigger once Phase 5 is deployed (no Edge change required).
