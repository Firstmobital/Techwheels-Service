# PARTS-002 — Manual Test Matrix

**Plan:** `PARTS-002_ESTIMATE_PARTS_MASTER_UNIQUE_ID_AND_DB_TRUTH_PLAN_2026-09-15.md`  
**Status:** Phases 0–2 + Make (DBL-0063) landed. Confirm Settings UI after deploy; Phase 5 still later.  
**Surfaces:** `/settings#estimate-parts-master`, customer estimate builder, later `/service-advisor`.

| # | Phase | Case | Expected |
|---|---|---|---|
| 1 | 0 | Altroz + CNG + First Free Service | Exactly the Altroz CNG first-free rows. Fuel badge CNG. No Petrol, no Diesel, no Harrier. Service type label is **First Free Service**, not First Service. |
| 2 | 0 | Altroz + Petrol + First Free Service | Only Petrol first-free Altroz rows. No CNG Distilled Water (id collision pair). |
| 3 | 0 | Fuel All, then switch to CNG | Old Petrol `<tr>` nodes unmount. No leftover #6–13 or id 110. |
| 4 | 0 | Browser console on this table | No React duplicate-key warning. |
| 5 | 0 | Duplicate ids in JSON + localStorage after load | 926 unique `id` values. Stale localStorage remumbered. |
| 6 | 0 | Estimate builder: Altroz + CNG | Catalogue slice matches Settings CNG set; no Petrol prices for CNG picks. |
| 7 | 0 | Search by name with CNG selected | Search narrows inside CNG; does not reintroduce Petrol. |
| 8 | 1 | sql_checks after DBL-0062 | Table `settings_service_parts_pricing` present; **877** rows; 877 unique ids; unique index on normalized (model, fuel, service_type, service_name); `dealer_code=GLOBAL`; stray `service_parts_pricing` absent. **Passed 2026-09-15.** |
| 9 | 1 | Do not apply colliding seed | `20260912120000_create_service_parts_pricing.sql` is not in `supabase/migrations/` as an apply candidate. DBL-0051 timestamp untouched. |
| 10 | 2 | Edit a price in Settings, open the page in a second browser | New price visible without copying localStorage. |
| 11 | 2 | Add item with same model+fuel+service_type+service_name | Rejected by unique constraint / UI error. No second row. |
| 12 | 2 | Reset Defaults | Confirm prompt. Reseed from JSON into the table. Does not silently wipe. |
| 13 | 2 | Import Excel | Persist to table; ids remain unique; filters still exact. |
| 14 | 3 | `getPartsPricing('Altroz','CNG','First Service')` | Exact match only. No `ilike` Petrol leak. |
| 15 | 4 | PARTS-001 GGN / order-date, AutoDoc estimate_rows, busy_parts | Unchanged. |
| 16 | 5 | Mechanical SA row with model + service type | **Create Estimate** visible next to Upload. |
| 17 | 5 | Accident / Rusting / `/accounts` | No Create Estimate. Accounts **Create Gatepass** unchanged. |
| 18 | 5 | Altroz, vehicle CNG, SA type First Free Service | Modal catalogue is First Free Service + Altroz + CNG only. No Petrol. No All-fuel picker. No runtime rename. |
| 19 | 5 | SA row model `Nexon EV` | Modal locks model Nexon + fuel EV. Catalogue rows are family+fuel, not model=`Nexon EV`. |
| 20 | 5 | Add Distilled Water then Shampoo, Save, reopen in second browser | Both lines persist from DBL-0064. Not localStorage-only. |
| 21 | 5 | Service type blank | Button disabled or modal blocked until type is set. |
| 22 | 0 | Estimate Master Add Item | Model dropdown = families only (Nexon, Punch, Altroz…). Fuel dropdown = Petrol/Diesel/CNG/EV. No combined `Punch CNG` as a model option. |
| 23 | 0 | Mini Paid Service | In Estimate Master service-type filter and in reception/SA mechanical dropdowns. SA treats it as floor. |
| 24 | 1b | After DBL-0063, existing Distilled Water | Make badge **BS6**. Filter Make=BS4 shows 0 of those seed rows. |
| 25 | 1b | Add Distilled Water Altroz Petrol First Free Service BS4 | Allowed even if BS6 already exists. Unique error if same combo added twice. |
| 26 | 1b | Add with **Also create the other Make** | Two rows, BS4 and BS6, same prices. Filter Make=BS4 shows only BS4. |

**Phase 0 proof row (from JSON/DB after rename):** Altroz CNG First Free Service = 5 rows. Catalogue count is **877** (Excel 926 minus blank Campaign/E Breakdown placeholders and 3 duplicate identities). Estimate Master does not display internal ids. After DBL-0063 those 877 rows are **BS6**.
