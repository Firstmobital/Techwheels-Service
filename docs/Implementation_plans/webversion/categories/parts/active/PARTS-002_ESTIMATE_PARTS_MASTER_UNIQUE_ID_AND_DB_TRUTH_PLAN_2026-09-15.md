# PARTS-002: Estimate & Parts Master — Unique IDs and DB Truth

**Plan ID:** PARTS-002  
**Created:** 2026-09-15  
**Last Updated:** 2026-09-15  
**Priority:** HIGH  
**Owner:** Parts Team + Platform Team  
**Status:** In progress (Phases 0–2 + Make landed; Required/Optional + SA Create Estimate in progress)  
**Platform:** webversion  
**Category:** parts  
**Ledger:** DBL-0062 (catalogue, VERIFIED 2026-09-15). DBL-0063 (Make BS4/BS6, VERIFIED 2026-09-15). DBL-0065 (Required/Optional, VERIFIED 2026-09-15). DBL-0064 (SA estimate save table, VERIFIED 2026-09-15). DBL-0061 is Accounts Mechanical Gatepass, not this catalogue. Do not reuse `20260912120000` / DBL-0051.  
**Dump check:** `settings_service_parts_pricing` (with `make` and `requirement`) and `service_advisor_estimates` present in `supabase/backups/full_metadata.sql` after 2026-09-15 apply. Still **no** `service_parts_pricing`, **no** `customer_estimates`.  
**Depends on:** nothing for Phase 0. Phase 5 depends on Phase 0 (unique ids) and should wait for Phase 2 (DB catalogue).  
**Related:** Settings `#estimate-parts-master`; `/service-advisor` mechanical Create Estimate; existing customer-portal builder  
**Evidence:** `docs/Implementation_plans/webversion/categories/parts/evidence/PARTS-002_TEST_MATRIX.md`  
**Reference pages:** `/settings#estimate-parts-master`, `/service-advisor`

---

## Executive Summary

Settings **Estimate & Parts Master** looks like a live catalogue. It is not. It renders 926 rows from browser `localStorage` (`techwheels_custom_parts_pricing`) or bundled `src/data/parts_pricing.json`. Those rows reuse Excel serial numbers as `id` (42 duplicate ids). The filter count is correct (Altroz + CNG + First Service = 5 of 926), but `<tr key={item.id}>` collides, so Petrol (and leftover Harrier) rows stay on screen.

This plan ships unique catalogue rows, then a real global Settings master table (`settings_service_parts_pricing`) wired to Settings. JSON is seed/fallback only. Estimate Master does **not** show internal numeric ids.

**Make (locked 2026-09-15):** Distilled Water (and every item) can have the same or different price by Model, Fuel, Service Type, **and Make**. Make is a fifth identity field with dropdown **BS4** / **BS6** only. Existing 877 rows backfill as **BS6**. Do not store “Both”; Add Item may write the other Make as a second row. Do not auto-clone every row to BS4.

**Later (Phase 5):** on `/service-advisor`, every **mechanical** case gets **Create Estimate**. Required catalogue items for that Model + vehicle Fuel + Service Type + Make are added by default. **Add Item** lists remaining **Optional** items. Advisor can remove lines, then **Save** to `service_advisor_estimates`. Dedicated SA modal (not customer-portal Send). Do not use desk PV/EV as catalogue fuel.

**Risk Level:** MEDIUM  
**Estimated Duration:** Phase 0 same day; Phases 1–3 1–2 days after DBL-0062 apply; Phase 5 1 day after Phase 2  
**Rollback:** Phase 0 revert unique ids/keys. Phase 1 drop `settings_service_parts_pricing`. Phase 5 drop `service_advisor_estimates` and hide the SA button; existing file **Upload** stays. Do not apply the colliding seed `20260912120000_create_service_parts_pricing.sql`.

---

## Objectives

1. Stop CNG (and other fuel) filters from showing the wrong fuel’s rows.
2. Give every catalogue row one unique identity; Excel serials are not primary keys.
3. Make Settings and the estimate builder share one list. After Phase 2 that list is the database table, not JSON/localStorage.
4. Land the catalogue table in dump truth (`full_metadata.sql`) after DBL-0062 is verified.
5. Later: mechanical Service Advisor **Create Estimate** uses that same catalogue, locked to the case, with a real Save (not localStorage).

---

## Context & Background

**Observed (2026-09-15, production `/settings#estimate-parts-master`):** Model Altroz, Fuel CNG, Service Type First Service. Badge `5 of 926`. Table still shows Altroz Petrol rows (Sunroof Greece id 6, Interior cleaning id 11, …) plus a Harrier Diesel leftover (id 110).

**Code truth:**

- `src/pages/SettingsPage.tsx` loads `getMasterPricingList()` and filters with exact `item.fuel === estFuelFilter`. Badge uses `filteredPricingItems.length`. Rows use `key={item.id}`.
- `src/lib/partsPricing.ts` never hits Settings from Supabase. Master is localStorage then JSON. `getPartsPricing()` queries `service_parts_pricing` with `ilike('%fuel%')` and falls back to JSON; Settings does not call it.
- `src/data/parts_pricing.json`: 926 rows, 884 unique ids, 42 duplicates (e.g. id 11 = Altroz Petrol Interior cleaning **and** Altroz CNG Distilled Water).
- Unapplied seed `supabase/migrations/20260912120000_create_service_parts_pricing.sql` inserts the same duplicate PKs and **reuses timestamp DBL-0051** (`20260912120000_sa_expected_invoice_amount_accounts_handoff.sql`). Do not apply it.

**DB truth:** `full_metadata.sql` has related-but-wrong tables (`estimate_rows`, `busy_parts`, `service_parts_consumption_data`, `ew_pricelist`, `autodoc_rate_*`). None feed this page. Pattern to copy: `settings_model_options` (GLOBAL catalog, Settings RLS).

---

## Locked rules

1. **One row, one id.** Database-generated `id`. Unique on normalized `(model, fuel, service_type, service_name, make)`. Excel serials are not PKs. Internal `id` is never shown on Estimate Master.
2. **One list.** Settings and the estimate builder share the same catalogue. After Phase 2 that catalogue is `settings_service_parts_pricing`.
3. **Unique React keys** on every render (`id` after remumber).
4. **Exact filters** after trim + case-normalize. No `ilike('%CNG%')`.
5. **Do not apply** `20260912120000_create_service_parts_pricing.sql`. Remove/supersede it from `supabase/migrations/` in Phase 1 so it cannot collide with DBL-0051.
6. **Org-wide catalog.** `dealer_code = GLOBAL` like Models. Settings-style RLS, not “allow read to all”.
7. **SA Create Estimate is Phase 5, not Phase 0.** Do not add the button until catalogue ids are unique. Prefer waiting for Phase 2 so SA does not inherit JSON/localStorage as master.
8. **Mechanical only** on `/service-advisor`. Same exclusion as today’s estimate column: no Bodyshop (Accident etc.), no Rusting. Do not add this button on `/accounts` (that page’s **Create Gatepass** is a different flow).
9. **Catalogue is always split: family Model + Fuel.** Table columns stay `model` (Altroz, Nexon, Punch, …) and `fuel` (Petrol, Diesel, CNG, EV). Do **not** store `Nexon EV` or `Punch CNG` in `model`. Settings `#models` combined names are parsed at the boundary.
10. **Estimate Master add/filter dropdowns:** Model = unique families parsed from `settings_model_options`. Fuel = Petrol / Diesel / CNG / EV. Make = BS4 / BS6. Service type = reception mechanical list **including Mini Paid Service**. Same lists on add-item and on the table filters.
11. **Do not split `settings_model_options` in this plan.** Reception/SA keep storing combined model strings. One shared parser: `Nexon EV` → model Nexon + fuel EV; `Punch CNG` → Punch + CNG; `Altroz` → Altroz + fuel from the fuel dropdown / vehicle. Aliases for messy spellings (`Xpres T Ev` → `Xpres T` + EV).
12. **Mini Paid Service is mechanical.** Add it to reception, SA, floor-incharge allowlists, SA tracker, and Estimate Master. Category = floor (same as Paid Service).
13. **Lock filters from the case (Phase 5).** Parse reception `model` into family+fuel hint; service type is the SA value. Vehicle fuel must agree with the parse (EV/CNG suffix) or come from `all_service_data.powertrain_type` for unsuffixed models. Desk PV/EV is never catalogue fuel. Make locks to BS4/BS6 when the vehicle has a known norm; otherwise advisor picks Make.
14. **SA Create Estimate uses a dedicated modal** (`ServiceAdvisorEstimateModal`). Do not send to `customer_estimates` or `post_feedback_bot_data`. Hide All-model/All-fuel pickers; lock Model + Fuel + Service Type; Make defaults BS6. **Required** lines prefill. **Add Item** is Optional-only for that vehicle combo.
15. **Save writes** `service_advisor_estimates` (DBL-0064). No localStorage master. No AutoDoc `estimate_rows`. Keep file Upload in v1.
16. **Out of scope:** PARTS-001, `busy_parts`, `estimate_rows`, inventory parts tables, AutoDoc rate cards, mobile estimate screens, Accounts Gatepass, rewriting Settings `#models` into two DB columns.
17. **Make is Bharat Stage, not manufacturer.** UI label **Make**. Values **BS4** and **BS6** only (CHECK). Same item name may exist for a different Make. Uniqueness is item + Model + Fuel + Make + Service Type. Add Item never clones the other Make. Existing seed rows backfill **BS6**. Do not auto-clone 877 rows to BS4 with guessed prices. EV still uses the same dropdown (default BS6) until a later value is requested.
18. **Required / Optional is a toggle, not identity.** One value at a time. Clicking the pill switches Required ↔ Optional. Existing 877 rows backfill Required so free-service packages prefill. Optional items never auto-add.

---

## Recommended table (Phase 1)

Mirror Models. Name locked: `public.settings_service_parts_pricing`. Do not reuse `service_parts_pricing` (tied to the unapplied colliding seed). Timestamp assigned at apply (next unused after `20260914160000` / DBL-0060).

| Column | Role |
|---|---|
| `id` | bigint identity PK |
| `dealer_code` | `GLOBAL` only (CHECK) |
| `service_type` | Reception/SA label (includes Mini Paid Service) |
| `model` | Family only (`Nexon`, `Punch`). Never `Nexon EV` / `Punch CNG` |
| `fuel` | `Petrol` / `Diesel` / `CNG` / `EV` |
| `make` | `BS4` / `BS6` only (Phase 1b / DBL-0063). Existing rows backfill `BS6`. |
| `service_name` | Not blank |
| `price` | numeric >= 0 |
| `labour` | numeric >= 0 |
| `requirement` | `Required` / `Optional` only (DBL-0065). Not part of unique identity. Existing rows backfill `Required`. Create Estimate prefills Required. Add Item lists Optional. |
| `is_active` | Soft-hide; keep history |
| `created_by` / `created_at` / `updated_at` | Same as Models |

Unique index on `lower(btrim(model)), lower(btrim(fuel)), lower(btrim(service_type)), lower(btrim(service_name)), lower(btrim(make))` where `is_active`. Lookup index `(model, service_type, fuel, make)`. Seed unique JSON rows; unique constraint must succeed. If a stray `service_parts_pricing` exists in an environment, leave it unused; sql_checks document absent-or-ignored.

`getPartsPricing()` will be pointed at this table in Phase 3.

---

## Phase 5 recommendation (SA Create Estimate — later)

**Do this after Phase 0 at minimum, after Phase 2 if possible.** Shipping Create Estimate on today’s duplicate-id JSON repeats the CNG/Petrol leak on the advisor desk.

Today `/service-advisor` mechanical rows only **Upload** a file (`estimate_storage_path`). **Create Estimate** already exists on Customer Portal admin (`CustomerPortalAdminModal` → `ServiceEstimateBuilderModal`), but that modal: filters JSON with All/All, does not filter service type, primary action is **Send**, hardcodes advisor/branch, and saves to localStorage plus a `customer_estimates` table that is **not** in `full_metadata.sql`.

SA list `fuel_type` is the **advisor desk** (PV/EV), not the car. Catalogue fuel stays Petrol / Diesel / CNG / EV. Using the list fuel for the modal would price an Altroz CNG as EV or Petrol. Reception has `model` and `service_type`; it has **no** vehicle-fuel column.

**Canonical names (locked 2026-09-15, revised same day):**

- **Service type** spelling follows reception/SA. Rewrite catalogue `First Service` → `First Free Service` (and Second/Third). **Mini Paid Service is mechanical** — add to reception + SA + floor allowlists, not catalogue-only.
- **Model + Fuel stay two fields** on Estimate Master and on `settings_service_parts_pricing`. This matches today’s JSON (`Nexon` + `EV`, `Punch` + `CNG`). Do not copy Settings `#models` combined labels into `model`.
- **Settings `#models` stays combined** (`Nexon EV`, `Punch CNG`, `Xpres T EV`) until a later Models-page plan. PARTS-002 **parses** those names for dropdowns and for SA Create Estimate.

Service type rewrite (catalogue → reception/SA):

| Today on Estimate Master | Official (reception / SA / floor) |
|---|---|
| First Service | First Free Service |
| Second Service | Second Free Service |
| Third Service | Third Free Service |
| Paid Service | Paid Service |
| PaidService (typo, 1 row) | Paid Service |
| Running Repairs | Running Repairs |
| Campaign | Campaign |
| E Breakdown | E Breakdown |
| Mini Paid Service | Mini Paid Service (add to mechanical lists) |

Accident / Rusting / PDI / Updation stay on SA; no estimate for Rusting.

**Split parser (Models / reception `model` → catalogue):**

| Combined name (Settings Models / SA) | Catalogue `model` | Catalogue `fuel` |
|---|---|---|
| Nexon EV, Curvv EV, Harrier EV, Punch EV, Tiago EV, Tigor EV, Xpres T EV | Nexon / Curvv / Harrier / Punch / Tiago / Tigor / Xpres T | EV |
| Punch CNG, Nexon CNG | Punch / Nexon | CNG |
| Nexon Petrol, Nexon Diesel | Nexon | Petrol / Diesel |
| Altroz, Hexa, Sierra, … (no suffix) | same family | from Fuel dropdown or vehicle powertrain (Petrol/Diesel/CNG/EV) |

Normalize spaces (`NexonEV` → `Nexon EV`, `NexonPetrol` → `Nexon Petrol`) before parse. Alias `Xpres T Ev` → `Xpres T` + EV.

Estimate Master **Model dropdown = unique families parsed from Settings `#models`**. Do not show combined names (`Nexon Petrol`) as models. Fuel is a separate dropdown. New `#models` rows appear as families immediately; catalogue items for that family+fuel are added later on Estimate Master. If a family exists only in the catalogue, add the combined names on `#models` (Nexon Petrol, Nexon Diesel, Nexon EV, Nexon CNG). Do not auto-clone catalogue items for a new model.

**Fuel** desk PV/EV is never the catalogue fuel.

**Save (v1):** upsert one row per `service_reception_entries.id` on `public.service_advisor_estimates` (DBL-0064). Items JSON + totals. Status `Saved`. Re-open loads that draft. File Upload remains until a follow-up counts this save toward `estimate_pending` (today that tile is `estimate_storage_path IS NULL`). Required catalogue rows for the locked Model+Fuel+Make+Service Type are prefilled. Add Item lists Optional rows not already on the estimate.

**Proposed table (DBL-0064, timestamp `20260915183000`):** `public.service_advisor_estimates` — `id` identity; `reception_entry_id` unique FK; snapshot `model` / `fuel` / `make` / `service_type` (split, same as catalogue); `items` jsonb; money columns; `status`; `created_by` / timestamps. RLS inherits parent reception visibility. Not `estimate_rows`.

---

## Implementation Tasks

### Phase 0: Stop ghost rows (no schema)

- [x] **0.1** Assign unique sequential `id` in `src/data/parts_pricing.json` (and bodyshop copy). Internal only — never shown on Estimate Master; never used as the visible serial. Landed count is **877** after dropping blank Campaign/E Breakdown placeholders and 3 duplicate identities.
- [x] **0.1b** Rewrite catalogue **service_type** to reception labels (`First Service` → `First Free Service`, `Second Service` → `Second Free Service`, `Third Service` → `Third Free Service`, `PaidService` → `Paid Service`). Keep Mini Paid Service as-is in the catalogue.
- [x] **0.1c** Keep catalogue **model** as family names + **fuel** as Petrol/Diesel/CNG/EV (already split). Do not rewrite model to `Nexon EV`.
- [x] **0.1d** Estimate Master add/edit/filter dropdowns: Model = families parsed from `listModelOptions()`; Fuel = Petrol/Diesel/CNG/EV; Service type = reception mechanical list including Mini Paid Service. Shared split helper.
- [x] **0.1e** Add **Mini Paid Service** to mechanical allowlists: reception, SA dropdown + floor set, SA tracker / payroll allowlist, Dashboard floor list, mobile floor-incharge, booking if it shares the list.
- [x] **0.2** On load, if localStorage still has duplicate ids, remumber in memory and ignore stale First Service caches.
- [x] **0.3** Settings + `EstimateMasterModal` list keys use unique identity (`model|fuel|service_type|service_name`). Numeric `#` / Excel `id` columns removed from the table.
- [x] **0.4** Exact fuel/model/service-type match in Settings, estimate helper, and JSON fallback. Stop `ilike('%fuel%')`.
- [ ] **0.5** Proof: Altroz + CNG + **First Free Service** shows only those CNG rows after deploy. Add Item cannot pick combined `Nexon EV` as model.

### Phase 1: Master table (DBL-0062)

- [x] **1.1** Ledger DBL-0062 applied. Timestamp `20260915153000`. Colliding seed removed from `supabase/migrations/`.
- [x] **1.2** Migration: table + GLOBAL check + unique index + lookup index + Settings-style RLS + GRANT.
- [x] **1.3** Seed unique JSON (**877** rows). Unique constraint succeeded.
- [x] **1.4** Paired `sql_checks` passed 2026-09-15 (877 rows, 877 unique ids, 0 duplicate identities, Altroz CNG First Free Service = 5, Mini Paid = 104, stray `service_parts_pricing` absent).
- [x] **1.5** After apply: `npm run db:backup:metadata` so dump truth includes the table.

### Phase 1b: Make BS4 / BS6 (DBL-0063)

- [x] **1b.1** Ledger DBL-0063. Timestamp after `20260915153000`. Add `make text not null` CHECK (`BS4`,`BS6`). Backfill existing 877 rows to **BS6**. Do not clone to BS4.
- [x] **1b.2** Replace unique index to include `make`. Lookup index includes `make`. Normalize trigger trims `make`.
- [x] **1b.3** Paired sql_checks: column present; only BS4/BS6; 877 rows still all BS6 after backfill; 0 duplicate identities including make.
- [x] **1b.4** Estimate Master: Make column, Make filter (`All`/`BS4`/`BS6`), Add/Edit required Make dropdown. Exact match. Same item + Model + Fuel + Make + Service Type is blocked (edit that row). Add Item does not clone the other Make.
- [x] **1b.5** JSON + `partsPricing` identity includes `make`. Import/export Excel has Make (default BS6 if missing).
- [x] **1b.6** Metadata dump refresh after apply.

### Phase 2: Settings reads/writes the table

- [x] **2.1** Load list from Supabase on Settings mount; add/edit/delete/import persist there.
- [x] **2.2** localStorage is no longer master when the table loads (stale cache dropped).
- [x] **2.3** Reset Defaults reseeds from JSON into the table after confirm; does not silently clobber.
- [x] **2.4** Catalogue helper `src/lib/partsPricing.ts` uses the same RLS pattern as Models (authenticated SELECT; Settings/admin writes).

### Phase 3: Estimate engine

- [ ] **3.1** `ServiceEstimateBuilderModal`, `getPartsPricing()`, `getServicePrice()` use the live list with exact filters.
- [ ] **3.2** Bodyshop copy stays in parity or imports the web helper — no second JSON truth.

### Phase 4: Evidence and promotion (catalogue)

- [ ] **4.1** Run `PARTS-002_TEST_MATRIX.md` Phase 0–3 cases.
- [ ] **4.2** Tracker stays active until Phase 5 is scheduled or explicitly deferred. CHANGE_LOG. Compact catalogue narrative only after promotion template is filled.

### Phase 1c: Required / Optional (DBL-0065)

- [x] **1c.1** Ledger DBL-0065. Timestamp `20260915180000`. Add `requirement text not null` CHECK (`Required`,`Optional`). Backfill existing 877 rows to **Required**. Not part of unique identity.
- [x] **1c.2** Estimate Master: Requirement column is a clickable toggle. Filter All/Required/Optional. Add/Edit toggle. Import/export Requirement.
- [x] **1c.3** Paired sql_checks authored. Apply on prod with DBL-0064.

### Phase 5: Service Advisor Create Estimate

- [x] **5.0** Split parser + Mini Paid already on SA.
- [x] **5.1** DBL-0064 table `service_advisor_estimates` + sql_checks. Timestamp `20260915183000`. Do not create `customer_estimates`.
- [x] **5.2** `/service-advisor` mechanical rows (including Mini Paid): **Create Estimate** next to Upload. Hidden for Bodyshop and Rusting. Require service type selected.
- [x] **5.3** Open `ServiceAdvisorEstimateModal` with split model + fuel + serviceType locked. Required items prefill. Add Item = Optional remaining.
- [x] **5.4** **Save** upserts DBL-0064 by `reception_entry_id`. Snapshot split model/fuel/make. Re-open restores lines.
- [x] **5.5** Keep file Upload. Do not change `estimate_pending` RPC in v1.
- [ ] **5.6** Test matrix Phase 5 after deploy (Altroz CNG First Free Service; Nexon EV row → Nexon + EV; Mini Paid Service on SA; Accounts unchanged).

---

## Activity Tracker

> **Update this section in real-time as work progresses.**

### Legend
- ✅ COMPLETED
- 🔄 IN PROGRESS
- ⏳ PENDING
- ❌ BLOCKED

```
✅ 0.1 | Unique JSON ids | Eng | 2026-09-15 | 2026-09-15 | 877 unique after dropping blanks/dupes
✅ 0.1b | Rename service types to reception labels | Eng | 2026-09-15 | 2026-09-15 | First Service → First Free Service
✅ 0.1c | Keep split model + fuel in catalogue | Eng | 2026-09-15 | 2026-09-15 | Do not store Nexon EV as model
✅ 0.1d | Dropdowns: parsed families + fuel enum + reception types | Eng | 2026-09-15 | 2026-09-15 |
✅ 0.1e | Mini Paid Service on mechanical lists | Eng | 2026-09-15 | 2026-09-15 | reception, SA, floor, tracker, mobile
✅ 0.2 | Remumber stale localStorage | Eng | 2026-09-15 | 2026-09-15 |
✅ 0.3 | Unique React keys; hide numeric ids | Eng | 2026-09-15 | 2026-09-15 | Settings + EstimateMasterModal
✅ 0.4 | Exact filter match; no ilike | Eng | 2026-09-15 | 2026-09-15 | web + bodyshop helpers
⏳ 0.5 | CNG-only proof on Settings after deploy | Eng | - | - | Altroz + CNG + First Free Service
✅ 1.1 | DBL-0062 migration timestamp | Eng | 2026-09-15 | 2026-09-15 | 20260915153000
✅ 1.2 | Table + RLS like Models | Eng | 2026-09-15 | 2026-09-15 | settings_service_parts_pricing
✅ 1.3 | Seed unique rows | Eng | 2026-09-15 | 2026-09-15 | 877
✅ 1.4 | Paired sql_checks | Eng | 2026-09-15 | 2026-09-15 | passed
✅ 1.5 | Metadata dump refresh | Eng | 2026-09-15 | 2026-09-15 | full_metadata.sql has settings_service_parts_pricing
✅ 1b.1 | DBL-0063 make column BS4/BS6 | Eng | 2026-09-15 | 2026-09-15 | Backfill existing to BS6
✅ 1b.2 | Unique index includes make | Eng | 2026-09-15 | 2026-09-15 |
✅ 1b.3 | sql_checks for make | Eng | 2026-09-15 | 2026-09-15 | 877 BS6, 0 BS4
✅ 1b.4 | Estimate Master Make UI | Eng | 2026-09-15 | 2026-09-15 | filter + add/edit + other-make
✅ 1b.5 | JSON + partsPricing make | Eng | 2026-09-15 | 2026-09-15 |
✅ 1b.6 | Metadata dump after DBL-0063 | Eng | 2026-09-15 | 2026-09-15 | make column in full_metadata.sql
✅ 2.1 | Settings CRUD from table | Eng | 2026-09-15 | 2026-09-15 |
✅ 2.2 | Stop localStorage as master | Eng | 2026-09-15 | 2026-09-15 |
✅ 2.3 | Reset Defaults confirm + reseed | Eng | 2026-09-15 | 2026-09-15 |
✅ 2.4 | Settings helper / RLS | Eng | 2026-09-15 | 2026-09-15 | Mirror Models
🔄 3.1 | Estimate builder live list | Eng | 2026-09-15 | - | getPartsPricing exact; builder UI later
✅ 3.2 | Bodyshop parity / one helper | Eng | 2026-09-15 | 2026-09-15 | exact filters + same JSON
⏳ 4.1 | Test matrix Phases 0–3 | Eng | - | - |
⏳ 4.2 | Catalogue promote when verified | Eng | - | - | Do not archive plan before Phase 5 decision
⏳ 5.0 | Confirm Phase 0 names match SA (no runtime map) | Eng + Parts | - | - | Split parser; Mini Paid mechanical
⏳ 1c.1 | DBL-0065 Required/Optional column | Eng | 2026-09-15 | - | Apply with 20260915180000
⏳ 5.1 | DBL-0064 service_advisor_estimates | Eng | 2026-09-15 | - | 20260915183000
🔄 5.2 | Create Estimate on mechanical SA rows | Eng | 2026-09-15 | - | Hidden Accident/Rusting
🔄 5.3 | Required prefill + Optional Add Item | Eng | 2026-09-15 | - | Dedicated SA modal
🔄 5.4 | Save to DBL-0064 | Eng | 2026-09-15 | - | No localStorage; no estimate_rows
✅ 5.5 | Keep file Upload in v1 | Eng | 2026-09-15 | 2026-09-15 | estimate_pending still file-based
⏳ 5.6 | Test matrix Phase 5 | Eng | - | - | After deploy
```

---

## Dependencies & Prerequisites

- [x] Confirm no existing plan owns this work (PARTS-001 is GGN stock / order-date guard).
- [x] Dump check: `settings_service_parts_pricing` was absent from `full_metadata.sql` before apply; DBL-0062 applied 2026-09-15.
- [x] DBL-0062 APPLIED (sql_checks passed; metadata dump refresh pending).
- [x] Phase 0 unique identity landed before seed.
- [x] Phase 1 seeded only after unique identity (877 rows; no duplicate PKs).
- [ ] Phase 5 not started until Phase 0 is done; preferred gate is Phase 2 (DB catalogue live).

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Stale localStorage keeps duplicate ids after JSON remumber | High | High — ghost rows return | Phase 0.2 remumber-on-load and rewrite storage |
| Someone applies colliding `20260912120000_create_service_parts_pricing.sql` | Medium | High — timestamp clash with DBL-0051; duplicate PK insert fails | Remove/supersede in Phase 1; never apply |
| Seed unique constraint fails | Low after Phase 0 | High | Remumber JSON first; sql_checks assert 926 unique ids |
| Two JSON copies (web vs bodyshop) drift | Medium | Medium | Phase 3 one helper or keep both in parity |
| “Allow read to all” RLS copied from broken seed | Medium | High | Copy Models Settings RLS only |
| Settings edit invisible in another browser | High today | Medium | Phase 2 DB master |
| SA Create Estimate uses desk fuel PV/EV | High if skipped | High — wrong price list | Parse Models/reception name; vehicle powertrain for unsuffixed |
| Combined `Nexon EV` stored as catalogue model | High if copied from #models | High — cannot filter Fuel independently | Keep split columns; parse at boundary |
| Mini Paid missing on SA/floor | High today | Medium — cannot estimate those jobs | 0.1e add to mechanical allowlists |
| Save to localStorage / missing `customer_estimates` | High if reused as-is | High — estimates vanish | DBL-0064 keyed by reception id |
| Create Estimate on Accounts or Bodyshop | Medium | Medium | Mechanical SA only; Accounts Gatepass untouched |
| Make stored as Both / missing on unique index | High if skipped | High — BS4 price overwrites BS6 | Fifth identity field; CHECK BS4/BS6; backfill BS6 only |

---

## Success Criteria

- [x] CNG filter never shows Petrol (and Diesel/EV never leak across fuel) — exact match + unique keys; confirm on deployed Settings.
- [x] Unique identity in JSON and in DB (877 rows; ids are internal only and not shown).
- [x] Altroz + CNG + First Free Service = exactly 5 rows in seed/sql_checks.
- [x] `full_metadata.sql` contains `settings_service_parts_pricing` after dump refresh.
- [x] Settings CRUD writes the table (localStorage is not master when DB loads).
- [x] PARTS-001 / AutoDoc `estimate_rows` / `busy_parts` unchanged.
- [x] React keys are unique identity strings; numeric `#` / Excel id removed from Estimate Master.
- [ ] Mechanical SA **Create Estimate** opens a modal filtered only to that case’s split Model + vehicle Fuel + Service Type.
- [ ] Advisor adds items by name one by one; **Save** persists; reopen shows the same lines in another browser.
- [ ] Bodyshop, Rusting, and `/accounts` do not get this button.
- [x] Estimate Master Add Item: Model dropdown has families only (`Nexon`, not `Nexon EV`); Fuel is a separate dropdown; Mini Paid Service is in the service-type list.
- [x] Estimate Master Make: filter All/BS4/BS6; Add/Edit required Make; same item name allowed across Makes; same item + Model + Fuel + Make + Service Type cannot be added twice.
- [x] Mini Paid Service is selectable on reception and SA and counts as mechanical/floor.

---

## Out of this plan

- PARTS-001 GGN stock / order-date guard
- AutoDoc `estimate_rows` and rate cards
- `busy_parts` and Parts Reports inventory tables
- Mobile estimate screens (follow-up if needed)
- Applying or repairing `service_parts_pricing` under the colliding timestamp
- `/accounts` Create Gatepass / invoice capture
- Replacing SA file Upload in v1
- Customer-portal Send / WhatsApp approval on the SA mechanical path (existing complaint builder stays as-is until a later split)
- Splitting Settings `#models` (`settings_model_options`) into two database columns — later plan; this plan only parses those names

---

## Communication & Sign-Off

**Stakeholders:**
- [ ] Parts / catalogue owner: _______________ (Date)
- [ ] Platform: _______________ (Date)
- [ ] Phase 0 production: _______________ (Date)
- [x] DBL-0062 apply: 2026-09-15 (psql prod; sql_checks passed)
- [ ] Phase 5 SA Create Estimate: _______________ (Date)
- [ ] DBL-0064 apply: _______________ (Date)

---

## Notes & Lessons Learned

### 2026-09-15 - Make BS4 / BS6

- Same item name (Distilled Water) can share or differ in price by Model, Fuel, Service Type, **and Make**.
- Locked: dropdown **Make** = BS4 / BS6 only. Unique identity includes `make`. Existing catalogue backfills **BS6**. Add Item may also create the other Make as a second row. Do not store Both. Do not auto-clone 877 rows to BS4.
- Ledger: DBL-0063. Implement on Estimate Master Add/Edit/filters before Phase 5.

### 2026-09-15 - Execute catalogue + hide serials

- User: numeric `#` / gray `1` under the part name are unused; columns/types may change; run SQL and make Estimate Master correct.
- Internal `id` stays as a DB identity PK only. Estimate Master table no longer shows `#` or `item.id`.
- Seed is **877** unique rows: renamed service types; split model+fuel; dropped 3 duplicate identities (Harrier Diesel Paid Balancing kept 600; two exact Nexon Mini Paid clones) and 46 blank Campaign/E Breakdown placeholders.
- DBL-0062 applied: `public.settings_service_parts_pricing`. sql_checks: 877/877 unique, Altroz CNG First Free Service = 5, Mini Paid = 104.
- Settings loads/writes that table. Mini Paid added to mechanical allowlists.

### 2026-09-15 - Kickoff

- Production screenshot: CNG selected, Petrol rows still painted; badge already 5 of 926.
- Root cause is duplicate React keys from Excel serials, plus Settings never reading a DB table.
- Decision: Phase 0 unique-row hotfix first, then `settings_service_parts_pricing` (not the colliding `service_parts_pricing` seed).
- Blocker for Phase 1: do not seed until JSON ids are unique.

### 2026-09-15 - SA Create Estimate (later)

- Ask: mechanical `/service-advisor` **Create Estimate** → modal from Settings catalogue by Model / Fuel / Service Type → add Item / Part Name one by one → **Save**.
- Recommendation locked: Phase 5 after unique catalogue; reuse `ServiceEstimateBuilderModal`; vehicle fuel not desk PV/EV; Save to `service_advisor_estimates` (DBL-0064); keep Upload; do not put the button on Accounts.

### 2026-09-15 - Canonical names = Service Advisor

- Estimate Master service types (`First Service`) did not match SA (`First Free Service`). Rewrite types in Phase 0. Mini Paid Service is mechanical (not catalogue-only).
- Models page stores combined names (`Nexon EV`, `Punch CNG`). Catalogue and Estimate Master stay **split** Model + Fuel. Parser at the boundary. Do not split `settings_model_options` in this plan.

---

## Related Documentation

- Evidence: `docs/Implementation_plans/webversion/categories/parts/evidence/PARTS-002_TEST_MATRIX.md`
- Ledger: `docs/shared/reference/DB_CHANGE_LEDGER.md` (DBL-0062 catalogue, DBL-0064 SA save)
- DB protocol: `docs/shared/reference/DB_CHANGE_PROTOCOL.md`
- Dump: `supabase/backups/full_metadata.sql`
- Pattern: `public.settings_model_options` / `src/lib/api/settings.ts`
- UI: `src/pages/SettingsPage.tsx` (`#estimate-parts-master`), `src/pages/ServiceAdvisorPage.tsx`
- Helpers: `src/lib/partsPricing.ts`, `bodyshop/src/lib/partsPricing.ts`
- Estimate: `src/components/ServiceEstimateBuilderModal.tsx`, `src/components/EstimateMasterModal.tsx`, `src/lib/estimates.ts`
- Do not apply: `supabase/migrations/20260912120000_create_service_parts_pricing.sql`

---

**Last Updated:** 2026-09-15 by Platform Team  
**Status:** 🔴 PENDING
