# VEHICLE-PICKUP-001 Vehicle Pickup Module Plan

**Plan ID:** VEHICLE-PICKUP-001  
**Created:** 2026-08-06  
**Priority:** HIGH  
**Owner:** Reception Team + Operations Team + Platform Team  
**Status:** Active (audit complete; implementation not started)  
**Authority source (DB):** `supabase/backups/full_metadata.sql`

---

## Executive Summary

Add a new **Vehicle Pickup** module (`vehicle_pickup`, route `/vehicle-pickup`) so that every Reception entry with `source = 'Driver Pickup'` automatically appears in a dedicated driver/coordinator queue. Drivers schedule pickups, complete a standard pre-pickup inspection workflow (photos, GPS, customer signature), hand the vehicle over at the workshop, and — once service work is ready — execute the corresponding **drop-off** workflow with full audit trail.

Today, `Driver Pickup` is a label on `service_reception_entries.source` with no operational workflow. Pickup intent is partially captured on `service_bookings` (`pickup_required`, `drop_required`, `pickup_address`, `driver_name`) but is not linked to Reception or to any task queue. This plan introduces a dedicated **`vehicle_pickup_tasks`** hub table and supporting event/photo tables, following established Techwheels patterns (RLS, module RBAC, `ApiResult` API layer, mobile driver UX, AutoDoc photo storage).

**Risk Level:** MEDIUM  
**Estimated Duration:** 15–20 working days (pickup + drop + mobile)  
**Rollback Strategy:** Disable module in `public.modules`; hide nav route; leave tables dormant. Reception `source` field behaviour unchanged.

---

## Objectives

1. Auto-create a pickup task whenever Reception creates/updates an entry with `source = 'Driver Pickup'`.
2. Provide a coordinator web module to view, filter, assign drivers, and monitor all pickup/drop tasks.
3. Provide a mobile-first driver workflow: schedule → inspect → sign → pickup → workshop handover → drop delivery.
4. Trigger drop-off workflow when service is ready for delivery (manual SA action in v1; invoice/JC automation in v2).
5. Maintain an immutable audit trail for every status transition, photo, and GPS capture.

---

## Authoritative Audit Baseline

> All DB facts below are verified against `supabase/backups/full_metadata.sql` (authoritative schema dump).

### Web module state (audited)

| Area | Current state | File |
|------|---------------|------|
| Reception module | Active; route `/reception`, module `reception` | `src/pages/ReceptionPage.tsx` |
| Source dropdown | `['Self', 'Driver Pickup', 'Walk-in', 'RSA']` — label only | `src/pages/ReceptionPage.tsx:20` |
| Source styling | Blue pill for `driver pickup` / `rsa` | `src/pages/ReceptionPage.tsx:286-291` |
| Service Booking | Has pickup fields + driver dropdown | `src/pages/ServiceBookingPage.tsx` |
| Telecalling | Creates bookings with `pickup_required`, `driver_name` | `src/pages/TelecallingPage.tsx`, `supabase/functions/telecalling/index.ts` |
| WhatsApp booking | Sets `pickup_required`, `pickup_address` | `supabase/functions/wa-webhook/index.ts` |
| Driver business role | `DRIVER` in `KNOWN_BUSINESS_ROLES` | `src/lib/businessRoles.ts:17` |
| App user role | `users.role` includes `'driver'` | `full_metadata.sql` → `users_role_check` |
| Vehicle Pickup module | **Does not exist** | — |
| GPS utilities | Available for web | `src/lib/gpsUtils.ts` |
| Photo capture (mobile) | AutoDoc pattern with GPS + storage | `mobile/src/app/job-cards/[id]/capture-photo.tsx`, `mobile/src/components/autodoc/StagePhotoSection.tsx` |
| Module routing contract | `ROUTE_MODULE_MAP` + `NAV_ITEMS` in App.tsx | `src/App.tsx`, `docs/shared/reference/MODULE_ROUTE_CONTRACT.md` |

### DB state (audited from `full_metadata.sql`)

#### `public.service_reception_entries` (line ~18842)

Relevant columns for this plan:

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint PK | Task FK target |
| `dealer_code` | text NOT NULL | RLS scope |
| `reg_number` | text NOT NULL | Vehicle identity |
| `model`, `owner_name`, `owner_phone` | text | Customer info |
| `source` | text NOT NULL | Constraint: non-blank only; **no enum** — `Driver Pickup` is a frontend constant |
| `sa_employee_code`, `sa_name`, `sa_display_name` | text | SA assignment |
| `jc_number`, `km_reading` | text / integer | Updated during/at pickup |
| `location`, `portal`, `branch`, `branch_label` | text | Filters |
| `invoice_done_at`, `invoice_done_by` | timestamptz / text | Drop trigger candidate (v2) |
| `created_by`, `created_at`, `updated_at` | | Audit |

Existing triggers/functions: `apply_sa_business_mapping_on_reception()`, `enforce_service_reception_sa_update()`, `delete_reception_entry_cascade()`.

RLS pattern: `service_reception_select_rbac` uses `has_module_view('reception')` + `dealer_code_in_scope(dealer_code)`.

#### `public.service_bookings` (line ~18419)

| Column | Type | Notes |
|--------|------|-------|
| `pickup_required` | boolean DEFAULT false | Pre-intake intent |
| `drop_required` | boolean DEFAULT false | Drop intent |
| `pickup_address` | text | Customer address |
| `driver_name` | text | Employee name string (not code) |
| `cre_name` | text | CRE who booked |
| `reg_number`, `customer_name`, `customer_phone` | text | Link key to reception |
| `status` | text DEFAULT 'New' | Includes `Arrived`, `Completed`, etc. |
| `jc_number` | text | Set on conversion |

No FK between `service_bookings` and `service_reception_entries` today. Linking is by `reg_number` + date proximity (see `ServiceBookingPage.tsx` `hasArrivedAtReception()`).

#### `public.employee_master` (line ~15741)

| Column | Notes |
|--------|-------|
| `employee_code`, `employee_name` | Driver identity |
| `role` | CSV business roles; `DRIVER` parsed via `employee_has_business_role()` |
| `location`, `department`, `fuel_type` | Scope filters |

#### `public.users` (line ~19706)

`role` CHECK: `admin | manager | staff | viewer | driver`.

#### `public.user_employee_links` (line ~19604)

Maps `user_id` → `employee_code` + `dealer_code`. Required for driver-scoped RLS (`user_has_employee_code()` pattern used on SA policies).

#### `public.modules` (line ~17365)

Columns: `id`, `name`, `label`, `description`, `icon`, `route`, `sort_order`, `is_active`, `nav_group`.  
**No `vehicle_pickup` row exists.**

#### `public.audit_logs` (line ~14239)

Columns: `actor_id`, `action`, `resource_type`, `resource_id`, `details` (jsonb), `timestamp`. Used for admin operations; pickup lifecycle gets its own event table.

#### Photo reference pattern: `public.bodyshop_intake_vehicle_photos` (line ~14750)

Reuse pattern: `storage_bucket` (default `autodoc`), `storage_path`, `drive_url`, `drive_file_id`, `uploaded_by`, dealer-scoped RLS, max-photo trigger guard.

### Gap summary

| Capability | Status |
|------------|--------|
| Reception `Driver Pickup` source | ✅ Label stored |
| Pickup task queue | ❌ Missing |
| Driver assignment on task | ❌ Missing (booking has name-only `driver_name`) |
| Pickup status machine | ❌ Missing |
| Pre-pickup inspection (photos/GPS/signature) | ❌ Missing |
| Workshop handover confirmation | ❌ Missing |
| Drop-off workflow | ❌ Missing |
| Service-ready → drop trigger | ❌ Missing |
| Pickup lifecycle audit | ❌ Missing |
| `vehicle_pickup` module + RBAC | ❌ Missing |

---

## Industry-Standard Workshop Workflow (Target Behaviour)

Most authorized service centers (Tata, Maruti, Hyundai, etc.) follow this lifecycle for pickup/drop logistics:

```
Customer request (telecalling / WhatsApp / walk-in)
        ↓
Pickup request logged (address, preferred slot, drop flag)
        ↓
Coordinator assigns driver
        ↓
Driver schedules slot with customer (call + confirm time)
        ↓
Driver en route → arrives at customer
        ↓
Pre-pickup inspection: 4-side photos, odometer, fuel level, visible damage
        ↓
Customer digital signature + GPS timestamp
        ↓
Vehicle transported to workshop
        ↓
Handover at gate / reception (KM confirmed, belongings checklist)
        ↓
Normal service workflow (SA → Floor → Technician)
        ↓
Service complete + invoice / delivery clearance
        ↓
[If drop required] Drop task auto-created
        ↓
Driver schedules drop → pre-drop inspection at workshop
        ↓
Driver delivers to customer → post-drop photos + signature + GPS
        ↓
Task closed; customer notified (WhatsApp/SMS)
```

**Standard inspection checkpoints (mandatory in most workshops):**

| Stage | Required captures |
|-------|-------------------|
| Pre-pickup | Front, rear, left, right, odometer, fuel gauge, existing damage |
| At pickup | Customer signature, GPS + timestamp, belongings noted |
| At workshop arrival | KM reading confirmation, handover to SA/Reception |
| Pre-drop | Invoice clearance, vehicle cleaned, documents ready |
| At drop | Delivery note signed, post-drop photos, GPS + timestamp |

This plan implements the above as configurable mandatory steps in the driver mobile wizard (v1: photos + GPS; signature optional until product sign-off).

---

## Architecture Decision

### Do not overload existing tables

| Table | Role | Why not extend |
|-------|------|----------------|
| `service_reception_entries` | Intake record + SA workflow | Already hub for SA/Floor/Bodyshop; adding 15+ workflow columns pollutes intake contract |
| `service_bookings` | Pre-intake CRM/booking | Captures intent only; no photo/GPS/status machine |

### New operational hub

```
service_reception_entries (source = 'Driver Pickup')
        ↓ [DB trigger on INSERT/UPDATE]
vehicle_pickup_tasks          ← owns lifecycle state
        ↓
vehicle_pickup_events           ← immutable audit (INSERT only)
        ↓
vehicle_pickup_photos           ← proof metadata (reuse autodoc bucket)
```

Optional link: `service_bookings.id` when a matching recent booking exists for the same `reg_number`.

---

## Data Contract

### Table: `public.vehicle_pickup_tasks`

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | bigint PK | auto | |
| `dealer_code` | text | yes | DEFAULT `my_dealer_code()`; RLS scope |
| `reception_entry_id` | bigint FK | yes | UNIQUE — one task per reception entry |
| `booking_id` | bigint FK | no | Link to `service_bookings.id` when matched |
| `reg_number` | text | yes | Denormalized from reception |
| `model` | text | no | |
| `owner_name`, `owner_phone` | text | no | |
| `pickup_address` | text | no | From booking or manual entry |
| `drop_address` | text | no | Default = pickup_address |
| `assigned_driver_code` | text | no | FK logical → `employee_master.employee_code` |
| `assigned_driver_name` | text | no | Denormalized display |
| `sa_employee_code` | text | no | From reception |
| `jc_number` | text | no | Synced from reception when set |
| `phase` | text | yes | `pickup` \| `at_workshop` \| `drop` \| `completed` \| `cancelled` |
| `pickup_status` | text | yes | See status machine below |
| `drop_status` | text | no | Null until drop phase starts |
| `drop_required` | boolean | yes | DEFAULT true for Driver Pickup; overridable |
| `scheduled_pickup_at` | timestamptz | no | Driver-scheduled slot |
| `scheduled_drop_at` | timestamptz | no | |
| `picked_up_at` | timestamptz | no | Actual pickup time |
| `arrived_at_workshop_at` | timestamptz | no | Gate handover |
| `service_ready_at` | timestamptz | no | SA marks ready for delivery |
| `service_ready_by` | text | no | |
| `dropped_at` | timestamptz | no | Actual drop time |
| `pickup_remark`, `drop_remark` | text | no | |
| `created_by` | text | yes | DEFAULT JWT email |
| `created_at`, `updated_at` | timestamptz | yes | |

**Constraints:**

- `reception_entry_id` UNIQUE
- `phase` CHECK against allowed values
- `pickup_status` / `drop_status` CHECK against allowed values per phase
- `reg_number` non-blank

### Table: `public.vehicle_pickup_events` (immutable audit)

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint PK | |
| `task_id` | bigint FK | → `vehicle_pickup_tasks.id` |
| `dealer_code` | text | RLS scope |
| `event_type` | text | e.g. `status_change`, `driver_assigned`, `photo_uploaded`, `signature_captured` |
| `from_status`, `to_status` | text | For transitions |
| `actor_id` | uuid | `auth.uid()` |
| `actor_name` | text | Email or full_name |
| `gps_lat`, `gps_lng` | numeric | Optional location proof |
| `gps_address` | text | Reverse-geocoded (best effort) |
| `metadata` | jsonb | Odometer, fuel level, remarks, etc. |
| `created_at` | timestamptz | Immutable timestamp |

**Policy:** INSERT only for authenticated roles with modify access; no UPDATE/DELETE.

### Table: `public.vehicle_pickup_photos`

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint PK | |
| `task_id` | bigint FK | |
| `dealer_code` | text | RLS scope |
| `stage` | text | `pre_pickup`, `post_pickup`, `pre_drop`, `post_drop` |
| `photo_type` | text | `front`, `rear`, `left`, `right`, `odometer`, `fuel`, `damage`, `signature`, `other` |
| `storage_bucket` | text | DEFAULT `'autodoc'` |
| `storage_path` | text | |
| `drive_url`, `drive_file_id` | text | Via `universal-drive-upload` |
| `file_name`, `content_type`, `file_size_bytes` | | |
| `gps_lat`, `gps_lng`, `gps_address` | | Capture location |
| `captured_by` | text | |
| `captured_at` | timestamptz | |

**Constraint:** Max photos per task/stage enforced by trigger (recommend 20 per stage, matching bodyshop intake pattern).

### Status machines

**Pickup phase (`pickup_status`):**

```
pending_assignment → assigned → scheduled → en_route →
at_customer → inspection_done → picked_up →
in_transit → arrived_at_workshop
```

When `arrived_at_workshop`: set `phase = 'at_workshop'`.

**Drop phase (`drop_status`, starts when SA marks service ready):**

```
pending → assigned → scheduled → en_route →
at_workshop → inspection_done → in_transit →
at_customer → delivered → completed
```

When `delivered`: set `phase = 'completed'`.

**Cancellation:** `phase = 'cancelled'` only from coordinator/admin; writes cancel event; does not delete reception entry.

### Module seed

```sql
INSERT INTO public.modules (name, label, route, is_active, nav_group, sort_order)
VALUES ('vehicle_pickup', 'Vehicle Pickup', '/vehicle-pickup', true, 'operations', <TBD>);
```

---

## Trigger: Reception → Task Sync

### Function: `sync_vehicle_pickup_task_from_reception()`

Fire on `INSERT OR UPDATE OF source, reg_number, model, owner_name, owner_phone, sa_employee_code, km_reading, jc_number` on `service_reception_entries`.

| Condition | Action |
|-----------|--------|
| `lower(trim(source)) = 'driver pickup'` | UPSERT `vehicle_pickup_tasks` (set `reception_entry_id`, copy fields, `phase = 'pickup'`, `pickup_status = 'pending_assignment'`) |
| Source changed away from Driver Pickup | If task not past `picked_up`, set `phase = 'cancelled'` + event |
| Reception deleted | Cascade handled by FK or `delete_reception_entry_cascade` extension |

### Booking enrichment (same trigger or separate function)

On task create, look up most recent `service_bookings` row where:

- `norm_reg(reg_number)` matches reception reg
- `booking_date >= reception.created_at::date - 7 days`
- `pickup_required = true` OR `booking_source ILIKE '%driver pickup%'`

Copy: `booking_id`, `pickup_address`, `drop_required`, pre-fill `assigned_driver_name` → resolve to `employee_code` via `employee_master`.

---

## RBAC & Access Model

Follow patterns from `service_reception_entries` RLS and `RBAC-003` business roles.

| Role | Module permission | Access |
|------|-------------------|--------|
| Admin | `vehicle_pickup` view/modify/delete | All dealer-scoped tasks |
| Manager / Coordinator | view + modify | All tasks; assign drivers; override status |
| Reception / CRE | view (+ modify for assign in v1) | All tasks in dealer scope |
| Driver (`users.role = driver`) | view + modify | **Only** tasks where `assigned_driver_code = my_employee_code()` |
| Service Advisor | view | Tasks linked to their `sa_employee_code`; can mark service ready |
| Viewer | view | Read-only |

**RLS helpers (new or reuse):**

- `has_module_view('vehicle_pickup')`
- `has_module_modify('vehicle_pickup')`
- `dealer_code_in_scope(dealer_code)`
- `user_has_employee_code(assigned_driver_code)` — driver row filter

**Driver login:** User must have `users.role = 'driver'` (or staff with DRIVER business role) + active `user_employee_links` row + `vehicle_pickup` module permission.

---

## Drop-Off Trigger Strategy

| Version | Trigger | Source |
|---------|---------|--------|
| **v1 (Phase 3)** | Manual **"Ready for Delivery"** button | Service Advisor page for linked reception entry |
| **v1 (Phase 3)** | Auto when `drop_required = true` on linked booking | Set on task create |
| **v2 (Phase 6)** | Auto when `service_reception_entries.invoice_done_at` IS NOT NULL | Reception invoice upload |
| **v2 (Phase 6)** | Auto when JC closed in `job_card_closed_data` | DMS sync |

v1 action sets: `service_ready_at`, `service_ready_by`, `phase = 'drop'`, `drop_status = 'pending'`, event logged.

---

## Implementation Plan

### Phase 1: Database and Security

- [ ] **Task 1.1:** Create migration `supabase/migrations/YYYYMMDD_vehicle_pickup_module.sql`.
- [ ] **Task 1.2:** Create tables `vehicle_pickup_tasks`, `vehicle_pickup_events`, `vehicle_pickup_photos` with constraints and indexes.
- [ ] **Task 1.3:** Add trigger `sync_vehicle_pickup_task_from_reception()` on `service_reception_entries`.
- [ ] **Task 1.4:** Add booking enrichment function (resolve driver name → employee_code).
- [ ] **Task 1.5:** Enable RLS; add SELECT/INSERT/UPDATE policies mirroring reception module patterns.
- [ ] **Task 1.6:** Add max-photo trigger guard (20 per task/stage).
- [ ] **Task 1.7:** Seed `public.modules` row for `vehicle_pickup`.
- [ ] **Task 1.8:** Extend `delete_reception_entry_cascade()` to clean up pickup task dependents + storage paths.
- [ ] **Task 1.9:** Add SQL checks file under `supabase/exec_success_migrations/sql_check/`.

### Phase 2: API Layer

- [ ] **Task 2.1:** Create `src/lib/api/vehiclePickup.ts` with typed interfaces and `ApiResult<T>` pattern.
- [ ] **Task 2.2:** Implement `listPickupTasks(filters)` — paginated, filter by phase/status/driver/date/dealer.
- [ ] **Task 2.3:** Implement `getPickupTask(id)` — task + events + photos.
- [ ] **Task 2.4:** Implement `assignDriver(taskId, employeeCode)`.
- [ ] **Task 2.5:** Implement `schedulePickup(taskId, datetime)` / `scheduleDrop(taskId, datetime)`.
- [ ] **Task 2.6:** Implement `transitionPickupStatus(taskId, newStatus, metadata)` with event insert.
- [ ] **Task 2.7:** Implement `transitionDropStatus(taskId, newStatus, metadata)`.
- [ ] **Task 2.8:** Implement `uploadPickupPhoto(taskId, stage, photoType, file)` — reuse autodoc bucket + `universal-drive-upload`.
- [ ] **Task 2.9:** Implement `markServiceReady(receptionEntryId)` — SA trigger for drop phase.
- [ ] **Task 2.10:** Implement `listDrivers()` — `employee_master` where `employee_has_business_role(role, 'DRIVER')`.
- [ ] **Task 2.11:** Export from `src/lib/api/index.ts`.

### Phase 3: Web Module UI (Coordinator)

- [ ] **Task 3.1:** Create `src/pages/VehiclePickupPage.tsx`.
- [ ] **Task 3.2:** Status summary bar: Pending, Assigned, Scheduled, En Route, Picked Up, At Workshop, Drop Pending, Delivered.
- [ ] **Task 3.3:** Two tabs: **Pickup Queue** and **Drop Queue**.
- [ ] **Task 3.4:** Task list: reg, model, customer, address, driver, status, scheduled time, actions.
- [ ] **Task 3.5:** Task detail drawer: timeline (events), photo gallery, assign driver, schedule, remarks.
- [ ] **Task 3.6:** Date range + location + portal filters (match Reception filter pattern).
- [ ] **Task 3.7:** Search by reg, model, customer phone, driver name.

### Phase 4: App Integration (Web)

- [ ] **Task 4.1:** Add `vehicle_pickup` to `ModuleName` union in `src/App.tsx`.
- [ ] **Task 4.2:** Add route `/vehicle-pickup` to `AppRoute`, `ROUTE_MODULE_MAP`, protected route.
- [ ] **Task 4.3:** Add nav item `{ to: '/vehicle-pickup', label: 'Vehicle Pickup', icon: 'truck' }` — place after Reception.
- [ ] **Task 4.4:** Update `docs/shared/reference/MODULE_ROUTE_CONTRACT.md`.
- [ ] **Task 4.5:** Grant default permissions via Admin page documentation/runbook.

### Phase 5: Mobile Driver Workflow

- [ ] **Task 5.1:** Create `mobile/src/app/(tabs)/vehicle-pickup.tsx` — My Tasks list (assigned only).
- [ ] **Task 5.2:** Create `mobile/src/app/vehicle-pickup/[id]/workflow.tsx` — step wizard.
- [ ] **Task 5.3:** Pickup wizard steps: Schedule → Navigate → Pre-inspection photos → Signature → Confirm pickup → In transit → Workshop handover.
- [ ] **Task 5.4:** Drop wizard steps: Schedule → Pre-drop at workshop → In transit → At customer → Post-drop photos → Signature → Delivered.
- [ ] **Task 5.5:** Reuse `StagePhotoSection`, `capture-photo.tsx` patterns; integrate `gpsUtils` equivalent on mobile.
- [ ] **Task 5.6:** Add tab to mobile nav layout for users with `vehicle_pickup` permission + driver role.
- [ ] **Task 5.7:** Offline queue for photo uploads (reuse `mobile/src/lib/syncQueue.ts` if applicable).

### Phase 6: Cross-Module Integration

- [ ] **Task 6.1:** Reception — no form change required in v1 (DB trigger handles sync). Optional v2: show pickup address + drop required fields when source = Driver Pickup.
- [ ] **Task 6.2:** Service Advisor — add **"Ready for Delivery"** button when linked pickup task exists and `phase = 'at_workshop'`.
- [ ] **Task 6.3:** Service Booking — show pickup task status badge on booking detail when linked.
- [ ] **Task 6.4:** Dashboard — optional summary card for open pickup/drop counts (Phase 6+).

### Phase 7: Audit, Notifications & Reports

- [ ] **Task 7.1:** All status transitions write to `vehicle_pickup_events` (mandatory — no silent updates).
- [ ] **Task 7.2:** Admin/coordinator overrides write to `audit_logs` with `resource_type = 'vehicle_pickup_task'`.
- [ ] **Task 7.3:** WhatsApp notification on driver assigned + scheduled (reuse `send-transactional-email` / WA edge fn pattern) — Phase 7, optional.
- [ ] **Task 7.4:** Reports: Pickup TAT, Drop TAT, driver performance, SLA breaches — `/reports` sub-route (Phase 7+).
- [ ] **Task 7.5:** v2 auto-drop trigger on `invoice_done_at` — DB trigger or nightly job.

### Phase 8: Validation

- [ ] **Task 8.1:** Create reception entry with source Walk-in → no task created.
- [ ] **Task 8.2:** Create reception entry with source Driver Pickup → task auto-created with `pending_assignment`.
- [ ] **Task 8.3:** Assign driver → driver sees task on mobile; other drivers do not.
- [ ] **Task 8.4:** Complete pickup workflow → `phase = at_workshop`, photos + events present.
- [ ] **Task 8.5:** SA marks ready → drop phase starts.
- [ ] **Task 8.6:** Complete drop workflow → `phase = completed`.
- [ ] **Task 8.7:** Delete reception entry → cascade cleans task + storage paths.
- [ ] **Task 8.8:** Unauthorized user cannot access `/vehicle-pickup`.
- [ ] **Task 8.9:** Run project build; verify types and routes.
- [ ] **Task 8.10:** Publish evidence file under `docs/Implementation_plans/webversion/categories/reception/evidence/`.

---

## Open Product Decisions (Sign-off Required Before Coding)

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Reception entry timing | A) Created before pickup (request) · B) Created after arrival | **A** — matches current user flow; KM updated at pickup inspection |
| 2 | Pickup address source | Reception form · Booking · Coordinator edit in Vehicle Pickup | **Booking first**, coordinator can override in module |
| 3 | Drop default | All Driver Pickup entries get drop · Only when `drop_required = true` | **`drop_required` from booking**; default true if no booking |
| 4 | Customer signature | Mandatory · Optional | **Mandatory** at pickup and drop (industry standard) |
| 5 | Driver platform v1 | Web only · Mobile-first | **Mobile-first** for drivers; web for coordinators |
| 6 | Nav placement | Main nav row · More modules overflow | **Main nav** after Reception (high daily use) |

---

## Files To Create

| File | Purpose |
|------|---------|
| `supabase/migrations/YYYYMMDD_vehicle_pickup_module.sql` | Schema, triggers, RLS, module seed |
| `supabase/exec_success_migrations/sql_check/YYYYMMDD_vehicle_pickup_checks.sql` | Post-migration verification |
| `src/lib/api/vehiclePickup.ts` | Typed API layer |
| `src/pages/VehiclePickupPage.tsx` | Coordinator web UI |
| `mobile/src/app/(tabs)/vehicle-pickup.tsx` | Driver task list |
| `mobile/src/app/vehicle-pickup/[id]/workflow.tsx` | Driver pickup/drop wizard |
| `mobile/src/lib/api/vehiclePickup.ts` | Mobile API mirror |
| `docs/Implementation_plans/webversion/categories/reception/evidence/VEHICLE-PICKUP-001_TEST_MATRIX.md` | QA matrix (Phase 8) |

## Files To Modify

| File | Change |
|------|--------|
| `src/App.tsx` | ModuleName, route, NAV_ITEMS, ROUTE_MODULE_MAP |
| `src/lib/api/index.ts` | Export vehiclePickup API |
| `src/pages/ServiceAdvisorPage.tsx` | "Ready for Delivery" action |
| `src/pages/ServiceBookingPage.tsx` | Pickup task status badge (optional v1) |
| `src/pages/ReceptionPage.tsx` | Optional: extra fields when source = Driver Pickup (v2) |
| `mobile/src/app/(tabs)/_layout.tsx` | Driver tab registration |
| `docs/shared/reference/MODULE_ROUTE_CONTRACT.md` | New module-route row |
| `supabase/backups/full_metadata.sql` | Regenerate after migration deploy |

## Files To Reuse (No Changes)

| File | Reuse for |
|------|-----------|
| `src/lib/gpsUtils.ts` | Web GPS capture |
| `src/lib/businessRoles.ts` | DRIVER role filtering |
| `supabase/functions/universal-drive-upload/index.ts` | Photo → Drive storage |
| `mobile/src/components/autodoc/StagePhotoSection.tsx` | Photo grid UI |
| `mobile/src/app/job-cards/[id]/capture-photo.tsx` | Camera + upload pattern |

---

## Execution Status

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 0 | Audit baseline (this document) | ✅ Complete |
| Phase 1 | Database and Security | ⬜ Not started |
| Phase 2 | API Layer | ⬜ Not started |
| Phase 3 | Web Module UI | ⬜ Not started |
| Phase 4 | App Integration | ⬜ Not started |
| Phase 5 | Mobile Driver Workflow | ⬜ Not started |
| Phase 6 | Cross-Module Integration | ⬜ Not started |
| Phase 7 | Audit, Notifications & Reports | ⬜ Not started |
| Phase 8 | Validation | ⬜ Not started |

---

## Related Plans

| Plan ID | Relationship |
|---------|--------------|
| RECEPTION-001 | Source table + intake trigger |
| RBAC-003 | DRIVER business role parsing |
| DRIVE-001 | Photo storage via universal-drive-upload |
| MODULE-ROUTE-001 | Route/RBAC contract |
| OPS-UPDATION-001 | WhatsApp notification pattern reference |

---

## Rollback Runbook

1. Set `public.modules.is_active = false` WHERE `name = 'vehicle_pickup'`.
2. Remove nav item from `src/App.tsx` (or feature-flag route).
3. Drop trigger `sync_vehicle_pickup_task_from_reception` to stop new task creation.
4. Tables can remain for data preservation; no impact on Reception if trigger is dropped.
5. Restore from migration down script if full rollback required (document in migration file).
